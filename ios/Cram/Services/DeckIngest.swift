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
                       context: ModelContext) -> Source {
        let serverProvided = deck.sourceId != nil

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
                            source: source)
            if let id = c.serverId { card.id = id }
            context.insert(card)
            if serverProvided { card.needsSync = false }
        }

        if !deck.questions.isEmpty {
            let quiz = Quiz(title: deck.sourceTitle, subject: subject)
            if let id = deck.quizId { quiz.id = id }
            context.insert(quiz)
            if serverProvided { quiz.needsSync = false }
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
