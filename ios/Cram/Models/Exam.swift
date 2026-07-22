import Foundation
import SwiftData

/// An assessment within a subject — a Midterm, a Final, a chapter test — that groups the cards and
/// the quiz made for it. A subject holds many exams; **the exam carries the date** (the countdown and
/// SM-2 exam-compression are per-exam, not per-subject, since migration 0006 moved the date off
/// `Subject`). Cards and quizzes reference their exam by a *nullable* link (`deleteRule: .nullify`):
/// a card outlives its exam and falls back to the subject's unsorted "General" bucket rather than
/// being deleted. Mirrors the backend `exams` table so both clients push the same contract.
@Model
final class Exam {
    @Attribute(.unique) var id: UUID
    var title: String
    /// Optional target date driving the countdown + exam compression.
    var examDate: Date?
    var createdAt: Date
    var subject: Subject?

    // Sync metadata (v0.5 Phase 5), matching every other syncable model.
    var updatedAt: Date = Date()
    var deletedAt: Date?
    var needsSync: Bool = true

    @Relationship(deleteRule: .nullify, inverse: \Card.exam)
    var cards: [Card] = []

    @Relationship(deleteRule: .nullify, inverse: \Quiz.exam)
    var quizzes: [Quiz] = []

    init(title: String, examDate: Date? = nil, subject: Subject? = nil) {
        self.id = UUID()
        self.title = title
        self.examDate = examDate
        self.createdAt = .now
        self.subject = subject
        self.updatedAt = .now
        self.needsSync = true
    }

    /// Whole days from now until the exam, or nil if no date is set.
    var daysUntilExam: Int? {
        guard let examDate else { return nil }
        let cal = Calendar.current
        return cal.dateComponents([.day],
                                  from: cal.startOfDay(for: .now),
                                  to: cal.startOfDay(for: examDate)).day
    }

    /// Cards due for review right now, scoped to this exam.
    var dueCount: Int { cards.lazy.filter { $0.deletedAt == nil && $0.isDue() }.count }

    /// 0…1 readiness from this exam's deck mastery, or nil when there's nothing to measure.
    var readiness: Double? {
        let live = cards.filter { $0.deletedAt == nil }
        guard !live.isEmpty else { return nil }
        return live.reduce(0) { $0 + $1.mastery } / Double(live.count)
    }

    /// The exam's recorded result grade, if one has been entered (the grade whose `examId` is this
    /// exam). Entering it is what "finishes" the exam → it drops into the subject's Past exams.
    var isPast: Bool {
        if let examDate, examDate < Calendar.current.startOfDay(for: .now) { return true }
        return false
    }
}
