import Foundation
import SwiftData

/// Persists a `GeneratedDeck` into SwiftData: creates the `Source`, the `Card`s (each due
/// immediately), and a `Quiz` of the generated questions, all attached to the subject.
///
/// When the deck came from the backend it carries the **server row ids** (`subjectId`/`sourceId`/
/// `quizId` + per-card / per-question ids). In that case the ingested rows adopt those ids and are
/// marked already-synced (`needsSync = false`), so the next delta pull recognises them instead of
/// creating duplicates (the backend persists generated decks under the caller — ADR 0007 §6). For
/// the offline stub the ids are `nil`, so rows keep their fresh local ids and sync as new.
enum DeckIngest {

    @discardableResult
    static func ingest(_ deck: GeneratedDeck,
                       kind: SourceKind,
                       title: String? = nil,
                       fileNames: [String] = [],
                       into subject: Subject,
                       exam: Exam? = nil,
                       context: ModelContext) -> Source {
        let serverProvided = deck.sourceId != nil
        // Cards/quizzes are tagged to their exam on the client (the /v1/generate endpoint doesn't
        // take one). When the deck was server-persisted we normally leave those rows already-synced,
        // but if we're attaching an exam the new `exam_id` still needs to be pushed as an update —
        // so keep `needsSync` set whenever an exam is assigned.
        let markChildrenSynced = serverProvided && exam == nil

        let source = Source(kind: kind,
                            title: title ?? deck.sourceTitle,
                            fileNames: fileNames,
                            subject: subject)
        if let id = deck.sourceId { source.id = id }
        context.insert(source)

        for c in deck.cards {
            let card = Card(front: c.front,
                            back: c.back,
                            topic: c.topic,
                            difficulty: c.difficulty,
                            subject: subject,
                            source: source,
                            exam: exam)
            if let id = c.serverId { card.id = id }
            context.insert(card)
            if markChildrenSynced { card.needsSync = false }
        }

        if !deck.questions.isEmpty {
            let quiz = Quiz(title: deck.sourceTitle, subject: subject, exam: exam)
            if let id = deck.quizId { quiz.id = id }
            context.insert(quiz)
            if markChildrenSynced { quiz.needsSync = false }
            for q in deck.questions {
                let question = Question(prompt: q.prompt,
                                        kind: q.kind,
                                        topic: q.topic,
                                        options: q.options,
                                        answerKey: q.answerKey,
                                        quiz: quiz)
                if let id = q.serverId { question.id = id }
                context.insert(question)
                if serverProvided { question.needsSync = false }
            }
        }

        if serverProvided {
            // The source row is server-owned too; don't re-push it.
            source.needsSync = false
        }

        return source
    }
}
