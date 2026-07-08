import Foundation
import Observation
import SwiftData

/// Offline-first delta-sync engine (v0.5 Phase 5).
///
/// Local writes always succeed immediately; this engine reconciles them with the backend in the
/// background. **Conflict policy is last-writer-wins**: `push()` sends pending local changes first,
/// then `pull()` applies remote changes authoritatively (skipping a row only when an un-pushed local
/// edit is newer). Sync is best-effort — every failure is caught and surfaced as `.error`, never
/// thrown into the UI, and the next trigger retries.
///
/// All work runs on the main actor because it touches a `ModelContext`; the network `await`s simply
/// suspend. Resources are processed parent→child so foreign-key relinking always finds its parent.
@MainActor
@Observable
final class SyncService {

    static let shared = SyncService()

    enum State: Equatable {
        case idle
        case syncing
        case error(String)
    }

    private(set) var state: State = .idle
    private(set) var lastSyncedAt: Date?

    /// Guards against overlapping runs and backs the debounced `requestSync`.
    private var isRunning = false
    private var debounceTask: Task<Void, Never>?

    /// Minimum spacing between *automatic* (trigger-driven) syncs. Each sync fans out one request
    /// per resource, and triggers fire on launch/foreground/open/write — so without this a burst of
    /// triggers would hammer the backend's per-minute rate limit (ADR 0009). Manual pull-to-refresh
    /// and the launch sync bypass it.
    private let minAutoInterval: TimeInterval = 15
    /// True while a trigger is waiting to be serviced (set by `requestSync`, cleared when it runs).
    /// Ensures a throttled request is still honoured later instead of being dropped.
    private var autoSyncPending = false

    private init() {}

    private static let lastUserKey = "cram.lastSyncedUserID"

    // MARK: - Lifecycle

    /// Call when the signed-in app appears. If a *different* user is now signed in, the local cache
    /// belongs to someone else — wipe it and reset cursors so a fresh `since=nil` pull rebuilds from
    /// scratch. Then run an initial sync. No-op when unauthenticated (the offline stub path).
    func onSignedIn(context: ModelContext) async {
        guard let userID = AuthManager.shared.currentUserID else { return }
        let previous = UserDefaults.standard.string(forKey: Self.lastUserKey)
        if let previous, previous != userID {
            wipeLocal(context: context)
            SyncCursorStore.resetAll()
        }
        UserDefaults.standard.set(userID, forKey: Self.lastUserKey)
        await sync(context: context)
    }

    /// Delete every locally cached row (used on a user switch). Cascades handle children, but every
    /// type is cleared explicitly so nothing is left dangling.
    private func wipeLocal(context: ModelContext) {
        try? context.delete(model: ReviewLog.self)
        try? context.delete(model: Attempt.self)
        try? context.delete(model: Card.self)
        try? context.delete(model: Question.self)
        try? context.delete(model: Quiz.self)
        try? context.delete(model: Source.self)
        try? context.delete(model: GradeEntry.self)
        try? context.delete(model: Subject.self)
        try? context.save()
    }

    // MARK: - Triggers

    /// Coalesced trigger for post-write / foreground / open nudges. A short debounce collapses a
    /// burst of edits into one run; the throttle (`minAutoInterval`) then caps how often automatic
    /// syncs fire so trigger storms don't trip the backend rate limit. A pending request is never
    /// dropped — if throttled, it's deferred to the end of the window.
    func requestSync(context: ModelContext) {
        autoSyncPending = true
        scheduleAutoSync(context: context, after: .seconds(2))
    }

    private func scheduleAutoSync(context: ModelContext, after delay: Duration) {
        debounceTask?.cancel()
        debounceTask = Task { [weak self] in
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled else { return }
            await self?.runAutoSyncIfDue(context: context)
        }
    }

    private func runAutoSyncIfDue(context: ModelContext) async {
        guard autoSyncPending, !isRunning else { return }
        if let last = lastSyncedAt {
            let elapsed = Date.now.timeIntervalSince(last)
            if elapsed < minAutoInterval {
                // Too soon since the last sync — defer (don't drop) until the window opens.
                scheduleAutoSync(context: context, after: .seconds(minAutoInterval - elapsed))
                return
            }
        }
        autoSyncPending = false
        await sync(context: context)
    }

    /// Run a full push-then-pull cycle. No-ops when unconfigured / signed out / already running.
    func sync(context: ModelContext) async {
        guard !isRunning else { return }
        guard let baseURL = AppConfig.backendBaseURL,
              AuthManager.shared.isSignedIn,
              let userID = AuthManager.shared.currentUserID
        else { return }

        isRunning = true
        state = .syncing
        defer { isRunning = false }

        let client = CramAPIClient(
            baseURL: baseURL,
            accessToken: { await AuthManager.shared.validAccessToken() })
        let cursors = SyncCursorStore(userId: userID)

        do {
            try await push(client: client, context: context)
            try await pull(client: client, cursors: cursors, context: context)
            lastSyncedAt = .now
            state = .idle
        } catch let SyncError.rateLimited(retryAfter) {
            // Throttled by the backend: not a real failure. The partial push is idempotent and the
            // cursor pull resumes cleanly, so back off quietly and retry after the server's window.
            state = .idle
            autoSyncPending = true
            scheduleAutoSync(context: context, after: .seconds(min(max(retryAfter, 1), 60) + 0.5))
        } catch {
            state = .error((error as? LocalizedError)?.errorDescription
                           ?? "Sync failed. It will retry automatically.")
        }
    }

    // MARK: - Push (local → server)

    private func push(client: CramAPIClient, context: ModelContext) async throws {
        // Parent→child so an upserted child's foreign key always resolves server-side.
        try await pushSyncable(
            Subject.self, resource: "subjects", client: client, context: context,
            dto: { SubjectPushDTO(id: $0.id, name: $0.name, examDate: $0.examDate,
                                  gradingScale: $0.gradingScale, targetGrade: $0.targetGrade,
                                  currentGrade: $0.manualCurrentGrade) })
        try await pushSyncable(
            Source.self, resource: "sources", client: client, context: context,
            dto: { SourcePushDTO(id: $0.id, subjectId: $0.subject?.id ?? UUID(), kind: $0.kind,
                                 title: $0.title, addedAt: $0.addedAt, storagePaths: $0.fileNames) },
            skip: { $0.subject == nil })
        try await pushSyncable(
            Quiz.self, resource: "quizzes", client: client, context: context,
            dto: { QuizPushDTO(id: $0.id, subjectId: $0.subject?.id ?? UUID(), title: $0.title) },
            skip: { $0.subject == nil })
        try await pushSyncable(
            Question.self, resource: "questions", client: client, context: context,
            dto: { QuestionPushDTO(id: $0.id, quizId: $0.quiz?.id ?? UUID(), prompt: $0.prompt,
                                   kind: $0.kind, topic: $0.topic, options: $0.options,
                                   answerKey: $0.answerKey) },
            skip: { $0.quiz == nil })
        try await pushSyncable(
            Card.self, resource: "cards", client: client, context: context,
            dto: { CardPushDTO(id: $0.id, subjectId: $0.subject?.id ?? UUID(), sourceId: $0.source?.id,
                               front: $0.front, back: $0.back, topic: $0.topic,
                               difficulty: $0.difficulty, easeFactor: $0.easeFactor,
                               intervalDays: $0.intervalDays, repetitions: $0.repetitions,
                               lapses: $0.lapses, dueDate: $0.dueDate) },
            skip: { $0.subject == nil })
        try await pushSyncable(
            GradeEntry.self, resource: "grade-entries", client: client, context: context,
            dto: { GradeEntryPushDTO(id: $0.id, subjectId: $0.subject?.id ?? UUID(), examId: $0.examId,
                                     title: $0.title, kind: $0.kind, score: $0.score, weight: $0.weight,
                                     date: $0.date) },
            skip: { $0.subject == nil })

        // Append-only logs: insert-only, no tombstones.
        try await pushAppend(
            ReviewLog.self, resource: "review-logs", client: client, context: context,
            dto: { log in log.card.map { ReviewLogPushDTO(id: log.id, cardId: $0.id,
                                                          reviewedAt: log.date, rating: log.ratingRaw) } })
        try await pushAppend(
            Attempt.self, resource: "attempts", client: client, context: context,
            dto: { a in a.question.map { AttemptPushDTO(id: a.id, questionId: $0.id,
                                                        response: a.response, isCorrect: a.isCorrect,
                                                        score: a.score, feedback: a.feedback,
                                                        gradedAt: a.gradedAt) } })
    }

    /// Push pending edits + deletes for one syncable resource. Live dirty rows are upserted via
    /// `/batch`; tombstoned rows are `DELETE`d and then hard-removed locally.
    private func pushSyncable<M: PersistentModel & SyncableModel, P: Encodable>(
        _ type: M.Type, resource: String, client: CramAPIClient, context: ModelContext,
        dto: (M) -> P, skip: (M) -> Bool = { _ in false }
    ) async throws {
        // Fetch all rows and filter in memory: `needsSync` is a protocol requirement, and
        // `#Predicate` only reliably compiles over a concrete model's stored-property keypath.
        let pending = try context.fetch(FetchDescriptor<M>()).filter { $0.needsSync }
        guard !pending.isEmpty else { return }

        let live = pending.filter { $0.deletedAt == nil && !skip($0) }
        let tombstoned = pending.filter { $0.deletedAt != nil }

        if !live.isEmpty {
            try await client.pushBatch(EmptyDecodable.self, resource: resource,
                                       items: live.map(dto))
            for row in live { row.needsSync = false }
        }
        for row in tombstoned {
            try await client.delete(resource: resource, id: row.id)
            context.delete(row)
        }
        try context.save()
    }

    /// Push pending append-only rows. `dto` returns nil for a row whose parent isn't set yet (it will
    /// be retried on the next sync once the parent exists).
    private func pushAppend<M: PersistentModel & AppendOnlyModel, P: Encodable>(
        _ type: M.Type, resource: String, client: CramAPIClient, context: ModelContext,
        dto: (M) -> P?
    ) async throws {
        let pending = try context.fetch(FetchDescriptor<M>()).filter { $0.needsSync }
        let ready = pending.compactMap { row -> (M, P)? in dto(row).map { (row, $0) } }
        guard !ready.isEmpty else { return }

        try await client.pushBatch(EmptyDecodable.self, resource: resource,
                                   items: ready.map(\.1))
        for (row, _) in ready { row.needsSync = false }
        try context.save()
    }

    // MARK: - Pull (server → local)

    private func pull(
        client: CramAPIClient, cursors: SyncCursorStore, context: ModelContext
    ) async throws {
        try await pullPages(SubjectReadDTO.self, resource: "subjects",
                            client: client, cursors: cursors, context: context, apply: applySubject)
        try await pullPages(SourceReadDTO.self, resource: "sources",
                            client: client, cursors: cursors, context: context, apply: applySource)
        try await pullPages(QuizReadDTO.self, resource: "quizzes",
                            client: client, cursors: cursors, context: context, apply: applyQuiz)
        try await pullPages(QuestionReadDTO.self, resource: "questions",
                            client: client, cursors: cursors, context: context, apply: applyQuestion)
        try await pullPages(CardReadDTO.self, resource: "cards",
                            client: client, cursors: cursors, context: context, apply: applyCard)
        try await pullPages(GradeEntryReadDTO.self, resource: "grade-entries",
                            client: client, cursors: cursors, context: context, apply: applyGradeEntry)
        try await pullPages(ReviewLogReadDTO.self, resource: "review-logs",
                            client: client, cursors: cursors, context: context, apply: applyReviewLog)
        try await pullPages(AttemptReadDTO.self, resource: "attempts",
                            client: client, cursors: cursors, context: context, apply: applyAttempt)
    }

    private func pullPages<T: Decodable>(
        _ type: T.Type, resource: String, client: CramAPIClient, cursors: SyncCursorStore,
        context: ModelContext, apply: (T, ModelContext) -> Void
    ) async throws {
        repeat {
            let since = cursors.cursor(for: resource)
            let page = try await client.pull(T.self, resource: resource, since: since, limit: 500)
            for item in page.items { apply(item, context) }
            cursors.setCursor(page.nextCursor, for: resource)
            try context.save()
            if !page.hasMore { break }
        } while true
    }

    // MARK: - Apply (one remote row → local store), with last-writer-wins

    /// Decide whether to overwrite a local syncable row with a remote one. Skip only when the local
    /// row has an un-pushed edit at least as new as the remote (it'll win on the next push).
    private func shouldApply<M: SyncableModel>(_ local: M?, remoteUpdatedAt: Date) -> Bool {
        guard let local else { return true }
        if local.needsSync && local.updatedAt >= remoteUpdatedAt { return false }
        return true
    }

    private func applySubject(_ dto: SubjectReadDTO, _ context: ModelContext) {
        let existing = subject(dto.id, context)
        if dto.deletedAt != nil { existing.map(context.delete); return }
        guard shouldApply(existing, remoteUpdatedAt: dto.updatedAt) else { return }
        let row = existing ?? insert(Subject(name: dto.name), context)
        row.name = dto.name
        row.examDate = dto.examDate
        row.gradingScaleRaw = dto.gradingScale.rawValue
        row.targetGrade = dto.targetGrade
        row.manualCurrentGrade = dto.currentGrade
        markSynced(row, id: dto.id, updatedAt: dto.updatedAt)
    }

    private func applySource(_ dto: SourceReadDTO, _ context: ModelContext) {
        let existing = source(dto.id, context)
        if dto.deletedAt != nil { existing.map(context.delete); return }
        guard shouldApply(existing, remoteUpdatedAt: dto.updatedAt) else { return }
        let row = existing ?? insert(Source(kind: dto.kind, title: dto.title), context)
        row.kindRaw = dto.kind.rawValue
        row.title = dto.title
        row.addedAt = dto.addedAt
        row.fileNames = dto.storagePaths
        row.subject = subject(dto.subjectId, context)
        markSynced(row, id: dto.id, updatedAt: dto.updatedAt)
    }

    private func applyQuiz(_ dto: QuizReadDTO, _ context: ModelContext) {
        let existing = quiz(dto.id, context)
        if dto.deletedAt != nil { existing.map(context.delete); return }
        guard shouldApply(existing, remoteUpdatedAt: dto.updatedAt) else { return }
        let row = existing ?? insert(Quiz(title: dto.title), context)
        row.title = dto.title
        row.subject = subject(dto.subjectId, context)
        markSynced(row, id: dto.id, updatedAt: dto.updatedAt)
    }

    private func applyQuestion(_ dto: QuestionReadDTO, _ context: ModelContext) {
        let existing = question(dto.id, context)
        if dto.deletedAt != nil { existing.map(context.delete); return }
        guard shouldApply(existing, remoteUpdatedAt: dto.updatedAt) else { return }
        let row = existing ?? insert(
            Question(prompt: dto.prompt, kind: dto.kind, topic: dto.topic,
                     options: dto.options, answerKey: dto.answerKey), context)
        row.prompt = dto.prompt
        row.kindRaw = dto.kind.rawValue
        row.topic = dto.topic
        row.options = dto.options
        row.answerKey = dto.answerKey
        row.quiz = quiz(dto.quizId, context)
        markSynced(row, id: dto.id, updatedAt: dto.updatedAt)
    }

    private func applyCard(_ dto: CardReadDTO, _ context: ModelContext) {
        let existing = card(dto.id, context)
        if dto.deletedAt != nil { existing.map(context.delete); return }
        guard shouldApply(existing, remoteUpdatedAt: dto.updatedAt) else { return }
        let row = existing ?? insert(
            Card(front: dto.front, back: dto.back, topic: dto.topic, difficulty: dto.difficulty),
            context)
        row.front = dto.front
        row.back = dto.back
        row.topic = dto.topic
        row.difficulty = dto.difficulty
        row.easeFactor = dto.easeFactor
        row.intervalDays = dto.intervalDays
        row.repetitions = dto.repetitions
        row.lapses = dto.lapses
        row.dueDate = dto.dueDate
        row.subject = subject(dto.subjectId, context)
        row.source = dto.sourceId.flatMap { source($0, context) }
        markSynced(row, id: dto.id, updatedAt: dto.updatedAt)
    }

    private func applyGradeEntry(_ dto: GradeEntryReadDTO, _ context: ModelContext) {
        let existing = gradeEntry(dto.id, context)
        if dto.deletedAt != nil { existing.map(context.delete); return }
        guard shouldApply(existing, remoteUpdatedAt: dto.updatedAt) else { return }
        let row = existing ?? insert(
            GradeEntry(title: dto.title, kind: dto.kind, score: dto.score, weight: dto.weight,
                       date: dto.date), context)
        row.title = dto.title
        row.kindRaw = dto.kind.rawValue
        row.score = dto.score
        row.weight = dto.weight
        row.date = dto.date
        row.examId = dto.examId
        row.subject = subject(dto.subjectId, context)
        markSynced(row, id: dto.id, updatedAt: dto.updatedAt)
    }

    private func applyReviewLog(_ dto: ReviewLogReadDTO, _ context: ModelContext) {
        guard reviewLog(dto.id, context) == nil else { return }  // append-only: never updated
        let row = insert(ReviewLog(rating: ReviewRating(rawValue: dto.rating) ?? .good,
                                   date: dto.reviewedAt), context)
        row.id = dto.id
        row.card = card(dto.cardId, context)
        row.needsSync = false
    }

    private func applyAttempt(_ dto: AttemptReadDTO, _ context: ModelContext) {
        guard attempt(dto.id, context) == nil else { return }  // append-only: never updated
        let row = insert(Attempt(response: dto.response, isCorrect: dto.isCorrect, score: dto.score,
                                 feedback: dto.feedback), context)
        row.id = dto.id
        row.gradedAt = dto.gradedAt
        row.question = question(dto.questionId, context)
        row.needsSync = false
    }

    // MARK: - Small helpers

    /// Insert a freshly built row and return it. The row's own initializer set `needsSync = true`;
    /// callers that came from a pull immediately clear it via `markSynced`.
    private func insert<M: PersistentModel>(_ row: M, _ context: ModelContext) -> M {
        context.insert(row)
        return row
    }

    /// Stamp an applied syncable row with the server id + timestamp and clear the dirty flag.
    private func markSynced<M: SyncableModel>(_ row: M, id: UUID, updatedAt: Date) {
        setID(row, id)
        row.updatedAt = updatedAt
        row.deletedAt = nil
        row.needsSync = false
    }

    /// Set the (otherwise read-only in the protocol) `id`. Each model exposes a settable `id`.
    private func setID(_ row: any SyncableModel, _ id: UUID) {
        switch row {
        case let r as Subject: r.id = id
        case let r as Source: r.id = id
        case let r as Card: r.id = id
        case let r as Quiz: r.id = id
        case let r as Question: r.id = id
        case let r as GradeEntry: r.id = id
        default: break
        }
    }

    // Per-type fetch-by-id. Explicit (not generic) because `#Predicate` resolves the `id` keypath on
    // a concrete model type.
    private func subject(_ id: UUID, _ c: ModelContext) -> Subject? {
        try? c.fetch(FetchDescriptor<Subject>(predicate: #Predicate { $0.id == id })).first
    }
    private func source(_ id: UUID, _ c: ModelContext) -> Source? {
        try? c.fetch(FetchDescriptor<Source>(predicate: #Predicate { $0.id == id })).first
    }
    private func card(_ id: UUID, _ c: ModelContext) -> Card? {
        try? c.fetch(FetchDescriptor<Card>(predicate: #Predicate { $0.id == id })).first
    }
    private func quiz(_ id: UUID, _ c: ModelContext) -> Quiz? {
        try? c.fetch(FetchDescriptor<Quiz>(predicate: #Predicate { $0.id == id })).first
    }
    private func question(_ id: UUID, _ c: ModelContext) -> Question? {
        try? c.fetch(FetchDescriptor<Question>(predicate: #Predicate { $0.id == id })).first
    }
    private func gradeEntry(_ id: UUID, _ c: ModelContext) -> GradeEntry? {
        try? c.fetch(FetchDescriptor<GradeEntry>(predicate: #Predicate { $0.id == id })).first
    }
    private func reviewLog(_ id: UUID, _ c: ModelContext) -> ReviewLog? {
        try? c.fetch(FetchDescriptor<ReviewLog>(predicate: #Predicate { $0.id == id })).first
    }
    private func attempt(_ id: UUID, _ c: ModelContext) -> Attempt? {
        try? c.fetch(FetchDescriptor<Attempt>(predicate: #Predicate { $0.id == id })).first
    }
}

/// The batch endpoints echo the upserted rows back; we don't need them, so decode into nothing.
private struct EmptyDecodable: Decodable {}
