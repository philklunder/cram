import Foundation
import SwiftData

/// Persists a `GeneratedDeck` into SwiftData: creates the `Source`, the `Card`s (each due
/// immediately), and a `Quiz` of the generated questions, all attached to the subject.
enum DeckIngest {

    @discardableResult
    static func ingest(_ deck: GeneratedDeck,
                       kind: SourceKind,
                       into subject: Subject,
                       context: ModelContext) -> Source {
        let source = Source(kind: kind, title: deck.sourceTitle, subject: subject)
        context.insert(source)

        for c in deck.cards {
            let card = Card(front: c.front,
                            back: c.back,
                            topic: c.topic,
                            difficulty: c.difficulty,
                            subject: subject,
                            source: source)
            context.insert(card)
        }

        if !deck.questions.isEmpty {
            let quiz = Quiz(title: deck.sourceTitle, subject: subject)
            context.insert(quiz)
            for q in deck.questions {
                let question = Question(prompt: q.prompt,
                                        kind: q.kind,
                                        topic: q.topic,
                                        options: q.options,
                                        answerKey: q.answerKey,
                                        quiz: quiz)
                context.insert(question)
            }
        }

        return source
    }
}
