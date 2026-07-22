import Foundation
import SwiftData

/// The top of the hierarchy: what you're doing / where you study (e.g. "Informatik EFZ", a Gymnasium).
/// **Local-only** like `Semester` — never synced; a semester carries an optional on-device link to
/// its program. Semesters with no program fall into an "Unassigned" bucket in the UI.
@Model
final class Program {
    @Attribute(.unique) var id: UUID
    var name: String
    var sortIndex: Int
    var createdAt: Date

    @Relationship(deleteRule: .nullify, inverse: \Semester.program)
    var semesters: [Semester] = []

    init(name: String, sortIndex: Int = 0) {
        self.id = UUID()
        self.name = name
        self.sortIndex = sortIndex
        self.createdAt = .now
    }

    /// This program's semesters, in manual order (newest first when sortIndex ascends from the top).
    var activeSemesters: [Semester] {
        semesters.sorted { $0.sortIndex < $1.sortIndex }
    }

    /// Every subject across the program's semesters.
    var allSubjects: [Subject] {
        activeSemesters.flatMap(\.activeSubjects)
    }

    /// The scale used to read the program's average (first graded subject's, else the default).
    var scale: GradingScale {
        allSubjects.first(where: { $0.currentGrade != nil })?.gradingScale ?? .preferredDefault
    }

    /// Mean of the graded subjects' current grades, or nil when nothing is graded.
    var average: Double? {
        let g = allSubjects.compactMap(\.currentGrade)
        return g.isEmpty ? nil : g.reduce(0, +) / Double(g.count)
    }

    /// 0…1 recall mastery across the program's subjects, or nil when there's nothing measured.
    var mastery: Double? {
        let m = allSubjects.compactMap(\.readiness)
        return m.isEmpty ? nil : m.reduce(0, +) / Double(m.count)
    }
}
