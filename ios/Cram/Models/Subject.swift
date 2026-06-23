import Foundation
import SwiftData

/// A course the user is studying for, with an optional exam date and a grading scale.
@Model
final class Subject {
    @Attribute(.unique) var id: UUID
    var name: String
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

    /// Whole days from now until the exam, or nil if no exam date is set.
    var daysUntilExam: Int? {
        guard let examDate else { return nil }
        let cal = Calendar.current
        let start = cal.startOfDay(for: .now)
        let end = cal.startOfDay(for: examDate)
        return cal.dateComponents([.day], from: start, to: end).day
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
