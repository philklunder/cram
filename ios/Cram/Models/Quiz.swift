import Foundation
import SwiftData

/// A periodic self-test generated from a source, grouping several questions.
@Model
final class Quiz {
    @Attribute(.unique) var id: UUID
    var title: String
    var createdAt: Date
    var subject: Subject?

    @Relationship(deleteRule: .cascade, inverse: \Question.quiz)
    var questions: [Question] = []

    init(title: String, subject: Subject? = nil) {
        self.id = UUID()
        self.title = title
        self.createdAt = .now
        self.subject = subject
    }
}

/// One quiz question. Short-answer responses are graded by Claude (server-side).
@Model
final class Question {
    @Attribute(.unique) var id: UUID
    var prompt: String
    var kindRaw: String
    var topic: String
    /// For multiple choice: the answer options. Empty for short answer.
    var options: [String]
    /// The correct answer (an option, or the model answer for short answer).
    var answerKey: String
    var quiz: Quiz?

    @Relationship(deleteRule: .cascade, inverse: \Attempt.question)
    var attempts: [Attempt] = []

    var kind: QuestionKind {
        get { QuestionKind(rawValue: kindRaw) ?? .shortAnswer }
        set { kindRaw = newValue.rawValue }
    }

    init(prompt: String,
         kind: QuestionKind,
         topic: String,
         options: [String] = [],
         answerKey: String,
         quiz: Quiz? = nil) {
        self.id = UUID()
        self.prompt = prompt
        self.kindRaw = kind.rawValue
        self.topic = topic
        self.options = options
        self.answerKey = answerKey
        self.quiz = quiz
    }
}

/// A single answer the user gave to a question, with its grade.
@Model
final class Attempt {
    @Attribute(.unique) var id: UUID
    var response: String
    var isCorrect: Bool
    /// 0…1 partial-credit score (1 for a correct multiple-choice answer).
    var score: Double
    var gradedAt: Date
    var question: Question?

    init(response: String,
         isCorrect: Bool,
         score: Double,
         question: Question? = nil) {
        self.id = UUID()
        self.response = response
        self.isCorrect = isCorrect
        self.score = score
        self.gradedAt = .now
        self.question = question
    }
}
