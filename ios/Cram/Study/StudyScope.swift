import Foundation
import SwiftData

/// What a study or quiz session runs over: one **exam's** deck, or a subject's untagged **General**
/// bucket (cards/quizzes with no exam). Keeps every study surface — the hub, review, flashcards,
/// quiz — reading the same scoped slice of content so nothing leaks across exams.
struct StudyScope: Identifiable, Hashable {
    let subject: Subject
    /// nil ⇒ the subject's "General" bucket (untagged cards).
    let exam: Exam?

    var id: String { exam.map { "exam-\($0.id)" } ?? "general-\(subject.id)" }
    var title: String { exam?.title ?? "General" }
    var examDate: Date? { exam?.examDate }

    /// Live cards in scope.
    var cards: [Card] {
        let base = exam?.cards ?? subject.cards.filter { $0.exam == nil }
        return base.filter { $0.deletedAt == nil }
    }
    var dueCards: [Card] { cards.filter { $0.isDue() } }

    /// The quiz for this scope (the first live one), and its live questions.
    var quiz: Quiz? {
        let base = exam?.quizzes ?? subject.quizzes.filter { $0.exam == nil }
        return base.first { $0.deletedAt == nil }
    }
    var questions: [Question] { (quiz?.questions ?? []).filter { $0.deletedAt == nil } }

    var readiness: Double? {
        let c = cards
        guard !c.isEmpty else { return nil }
        return c.reduce(0) { $0 + $1.mastery } / Double(c.count)
    }
    var verdict: ReadinessVerdict { .of(readiness) }

    static func == (lhs: StudyScope, rhs: StudyScope) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

extension Subject {
    /// Every study scope in this subject: one per exam, plus a "General" scope when there are
    /// untagged cards. This is what the Study tab and the subject screen list.
    var studyScopes: [StudyScope] {
        var scopes = activeExams.map { StudyScope(subject: self, exam: $0) }
        let hasUntagged = cards.contains { $0.exam == nil && $0.deletedAt == nil }
        if hasUntagged { scopes.append(StudyScope(subject: self, exam: nil)) }
        return scopes
    }
}

// MARK: - Grades

extension Exam {
    /// The grade recorded against this exam — the weighted average of the subject's grade entries
    /// whose `examId` points here — or nil if none has been entered yet.
    var recordedGrade: Double? {
        let entries = (subject?.grades ?? []).filter { $0.examId == id && $0.deletedAt == nil && $0.weight > 0 }
        let total = entries.reduce(0) { $0 + $1.weight }
        guard total > 0 else { return nil }
        return entries.reduce(0) { $0 + $1.score * $1.weight } / total
    }
}

enum Grades {
    /// The average grade across all subjects that have one, in the dominant grading scale. Returns
    /// the numeric mean plus the scale it's expressed in, or nil when no subject has a grade. Only
    /// subjects sharing the most common scale are averaged, so scales never get mixed nonsensically.
    static func overall(_ subjects: [Subject]) -> (value: Double, scale: GradingScale)? {
        let graded = subjects.filter { $0.deletedAt == nil && $0.currentGrade != nil }
        guard !graded.isEmpty else { return nil }
        // Pick the most common scale among graded subjects.
        let scale = Dictionary(grouping: graded, by: \.gradingScale)
            .max { $0.value.count < $1.value.count }!.key
        let onScale = graded.filter { $0.gradingScale == scale }
        let values = onScale.compactMap(\.currentGrade)
        guard !values.isEmpty else { return nil }
        return (values.reduce(0, +) / Double(values.count), scale)
    }
}
