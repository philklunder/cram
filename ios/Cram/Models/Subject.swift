import Foundation
import SwiftData

/// A course the user is studying for, with an optional exam date and a grading scale.
@Model
final class Subject {
    @Attribute(.unique) var id: UUID
    var name: String
    /// Legacy single exam date. The exam date lives on `Exam` now (a subject has many exams); this
    /// column is kept only so pre-exams local rows can be migrated into an `Exam` on first launch
    /// (see `ExamMigration`). Not synced anymore. Read `nextExam`/`daysUntilExam` instead.
    var examDate: Date?
    var gradingScaleRaw: String
    var targetGrade: Double?
    /// Manually entered current grade. If nil, callers fall back to the averaged grade entries.
    var manualCurrentGrade: Double?
    var createdAt: Date

    // Sync metadata (v0.5 Phase 5). Defaults inline so existing stores migrate lightly;
    // `needsSync = true` means pre-sync local rows are pushed on the first sync.
    var updatedAt: Date = Date()
    var deletedAt: Date?
    var needsSync: Bool = true

    @Relationship(deleteRule: .cascade, inverse: \Source.subject)
    var sources: [Source] = []

    @Relationship(deleteRule: .cascade, inverse: \Card.subject)
    var cards: [Card] = []

    @Relationship(deleteRule: .cascade, inverse: \Quiz.subject)
    var quizzes: [Quiz] = []

    @Relationship(deleteRule: .cascade, inverse: \GradeEntry.subject)
    var grades: [GradeEntry] = []

    @Relationship(deleteRule: .cascade, inverse: \Exam.subject)
    var exams: [Exam] = []

    /// The term this subject belongs to. Local-only (see `Semester`) — never synced. `nil` means the
    /// subject sits in the "Unassigned" bucket until the user files it under a semester.
    var semester: Semester?

    var gradingScale: GradingScale {
        get { GradingScale(rawValue: gradingScaleRaw) ?? .german }
        set { gradingScaleRaw = newValue.rawValue }
    }

    init(name: String,
         examDate: Date? = nil,
         gradingScale: GradingScale = .german,
         targetGrade: Double? = nil) {
        self.id = UUID()
        self.name = name
        self.examDate = examDate
        self.gradingScaleRaw = gradingScale.rawValue
        self.targetGrade = targetGrade
        self.manualCurrentGrade = nil
        self.createdAt = .now
        self.updatedAt = .now
        self.needsSync = true
    }

    /// Live (non-deleted) exams, soonest first.
    var activeExams: [Exam] {
        exams.filter { $0.deletedAt == nil }
            .sorted { ($0.examDate ?? .distantFuture) < ($1.examDate ?? .distantFuture) }
    }

    /// Exams still ahead of (or on) today — the ones you'd revise for.
    var upcomingExams: [Exam] {
        activeExams.filter { ($0.daysUntilExam ?? Int.max) >= 0 }
    }

    /// Exams whose date has passed — the "Past exams" bucket.
    var pastExams: [Exam] {
        activeExams.filter { ($0.daysUntilExam ?? Int.max) < 0 }
    }

    /// The soonest upcoming exam — drives the subject's headline countdown.
    var nextExam: Exam? { upcomingExams.first }

    /// Whole days until the soonest upcoming exam, or nil if none is scheduled. Falls back to the
    /// legacy `examDate` for rows not yet migrated into an `Exam`.
    var daysUntilExam: Int? {
        if let d = nextExam?.daysUntilExam { return d }
        guard let examDate else { return nil }
        let cal = Calendar.current
        return cal.dateComponents([.day],
                                  from: cal.startOfDay(for: .now),
                                  to: cal.startOfDay(for: examDate)).day
    }

    /// The current grade: the manual value if set, otherwise the weighted average of entries.
    var currentGrade: Double? {
        if let manualCurrentGrade { return manualCurrentGrade }
        let weighted = grades.filter { $0.weight > 0 }
        guard !weighted.isEmpty else { return nil }
        let totalWeight = weighted.reduce(0) { $0 + $1.weight }
        guard totalWeight > 0 else { return nil }
        return weighted.reduce(0) { $0 + $1.score * $1.weight } / totalWeight
    }

    /// 0…1 strength derived from the current grade (1 = strong), or nil if no grade yet.
    var gradeStrength: Double? {
        guard let currentGrade else { return nil }
        return gradingScale.strength(for: currentGrade)
    }
}
