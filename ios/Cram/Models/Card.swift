import Foundation
import SwiftData

/// A flashcard with SM-2 spaced-repetition state.
///
/// The SM-2 state (`easeFactor`, `intervalDays`, `repetitions`, `lapses`) is the canonical
/// source of truth, updated only by the scheduler's SM-2 step. `dueDate` is the *effective*
/// next-review date, which may be compressed toward the subject's exam date (see ADR 0004).
@Model
final class Card {
    @Attribute(.unique) var id: UUID
    var front: String
    var back: String
    var topic: String
    /// Author-estimated difficulty, 1 (easy) … 5 (hard).
    var difficulty: Int
    var createdAt: Date

    // SM-2 canonical state.
    var easeFactor: Double
    var intervalDays: Int
    var repetitions: Int
    var lapses: Int
    /// Effective next-review date (may be exam-compressed). Surfaced when `dueDate <= now`.
    var dueDate: Date

    var subject: Subject?
    var source: Source?

    // Sync metadata (v0.5 Phase 5). The SM-2 state above is what changes on review; bump
    // `updatedAt` / `needsSync` via `touch()` whenever the scheduler rewrites it.
    var updatedAt: Date = Date()
    var deletedAt: Date?
    var needsSync: Bool = true

    @Relationship(deleteRule: .cascade, inverse: \ReviewLog.card)
    var reviewLogs: [ReviewLog] = []

    init(front: String,
         back: String,
         topic: String,
         difficulty: Int = 3,
         subject: Subject? = nil,
         source: Source? = nil) {
        self.id = UUID()
        self.front = front
        self.back = back
        self.topic = topic
        self.difficulty = min(max(difficulty, 1), 5)
        self.createdAt = .now
        self.easeFactor = 2.5      // SM-2 default
        self.intervalDays = 0
        self.repetitions = 0
        self.lapses = 0
        self.dueDate = .now        // brand-new cards are due immediately
        self.subject = subject
        self.source = source
        self.updatedAt = .now
        self.needsSync = true
    }

    /// Whether this card is due for review at the given moment.
    func isDue(asOf date: Date = .now) -> Bool { dueDate <= date }

    /// 0…1 mastery estimate from SM-2 state (1 = well known), for scheduling weight & progress.
    var mastery: Double {
        // Ease ranges ~1.3…2.5+; combine with repetition count for a rough strength signal.
        let easeComponent = min(max((easeFactor - 1.3) / (2.5 - 1.3), 0), 1)
        let repComponent = min(Double(repetitions) / 5.0, 1)
        return 0.5 * easeComponent + 0.5 * repComponent
    }
}
