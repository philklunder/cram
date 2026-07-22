import Foundation
import SwiftData

/// A term the user groups subjects under (e.g. "6. Semester 2026"). **Local-only** — the backend has
/// no semester concept, so this never syncs; subjects and their grades still sync as before, and a
/// subject simply carries an optional on-device link to the semester it belongs to. Subjects with no
/// semester fall into an "Unassigned" bucket in the UI.
@Model
final class Semester {
    @Attribute(.unique) var id: UUID
    var name: String
    /// Manual order (lower = higher in the list). Newest term usually sits on top.
    var sortIndex: Int
    var createdAt: Date

    @Relationship(deleteRule: .nullify, inverse: \Subject.semester)
    var subjects: [Subject] = []

    /// The program this term belongs to. Local-only (see `Program`); `nil` = "Unassigned".
    var program: Program?

    init(name: String, sortIndex: Int = 0) {
        self.id = UUID()
        self.name = name
        self.sortIndex = sortIndex
        self.createdAt = .now
    }

    /// Live subjects in this term, newest first.
    var activeSubjects: [Subject] {
        subjects.filter { $0.deletedAt == nil }.sorted { $0.createdAt < $1.createdAt }
    }

    /// The scale used to read this term's average — the first graded subject's scale, else the
    /// user's default. (A term's subjects normally share one scale.)
    var scale: GradingScale {
        activeSubjects.first(where: { $0.currentGrade != nil })?.gradingScale ?? .preferredDefault
    }

    /// Unweighted mean of the graded subjects' current grades, or nil when nothing is graded yet.
    var average: Double? {
        let graded = activeSubjects.compactMap(\.currentGrade)
        guard !graded.isEmpty else { return nil }
        return graded.reduce(0, +) / Double(graded.count)
    }

    /// 0…1 recall mastery across this term's subjects, or nil when nothing is measured.
    var mastery: Double? {
        let m = activeSubjects.compactMap(\.readiness)
        return m.isEmpty ? nil : m.reduce(0, +) / Double(m.count)
    }

    /// Every live exam across this term's subjects (for the calendar / term overview).
    var exams: [Exam] {
        activeSubjects.flatMap(\.activeExams)
    }
}
