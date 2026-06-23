import Foundation
import SwiftData

/// A periodic self-test generated from a source, grouping several questions.
@Model
final class Quiz {
    @Attribute(.unique) var id: UUID
    var title: String
    var createdAt: Date
    var subject: Subject?

    // Sync metadata (v0.5 Phase 5).
    var updatedAt: Date = Date()
    var deletedAt: Date?
    var needsSync: Bool = true

    @Relationship(deleteRule: .cascade, inverse: \Question.quiz)
    var questions: [Question] = []

    init(title: String, subject: Subject? = nil) {
        self.id = UUID()
        self.title = title
        self.createdAt = .now
        self.subject = subject
        self.updatedAt = .now
        self.needsSync = true
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

    // Sync metadata (v0.5 Phase 5).
    var updatedAt: Date = Date()
    var deletedAt: Date?
    var needsSync: Bool = true

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
        self.updatedAt = .now
        self.needsSync = true
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
    /// Short-answer feedback from the grader (ADR 0006). Empty for multiple choice. Matches the
    /// wire `feedback` field so the model already lines up with the backend before the v0.4 UI.
    var feedback: String = ""
    var gradedAt: Date
    var question: Question?

    // Sync metadata (v0.5 Phase 5). Attempts are append-only — insert + push once, never updated.
    var needsSync: Bool = true

    init(response: String,
         isCorrect: Bool,
         score: Double,
         feedback: String = "",
         question: Question? = nil) {
        self.id = UUID()
        self.response = response
        self.isCorrect = isCorrect
        self.score = score
        self.feedback = feedback
        self.gradedAt = .now
        self.question = question
        self.needsSync = true
    }
}
