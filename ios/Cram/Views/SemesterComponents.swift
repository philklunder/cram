import SwiftUI

/// A semester row (used by both the Grades and Subjects drill-downs): the quality rail, the term name
/// and subject count, and its average. The caller wraps it in the navigation appropriate to the tab.
struct SemesterCard: View {
    let semester: Semester

    private var count: Int { semester.activeSubjects.count }

    var body: some View {
        Panel(padding: Space.sm) {
            HStack(spacing: Space.sm) {
                GradeRail(color: GradeQuality.color(strength: semester.average.map { semester.scale.strength(for: $0) }))
                VStack(alignment: .leading, spacing: 3) {
                    Text(semester.name).font(.headline).tracking(-0.2)
                        .foregroundStyle(Theme.ink).lineLimit(1)
                    Text("\(count) subject\(count == 1 ? "" : "s")")
                        .font(.caption).foregroundStyle(Theme.ink2)
                }
                Spacer(minLength: Space.xs)
                GradeValue(score: semester.average, scale: semester.scale)
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Theme.muted)
            }
        }
    }
}

/// A subject row within a semester: quality rail, monogram, name, exam count, and current grade.
struct SemesterSubjectRow: View {
    let subject: Subject
    /// A trailing hint line under the name (e.g. exam count, or due-cards for the study drill-down).
    var subtitle: String

    var body: some View {
        Panel(padding: Space.sm) {
            HStack(spacing: Space.sm) {
                GradeRail(color: GradeQuality.color(strength: subject.gradeStrength))
                MonogramTile(subject: subject, size: 40)
                VStack(alignment: .leading, spacing: 3) {
                    Text(subject.name).font(.subheadline.weight(.semibold))
                        .foregroundStyle(Theme.ink).lineLimit(1)
                    Text(subtitle).font(.caption).foregroundStyle(Theme.ink2)
                }
                Spacer(minLength: Space.xs)
                GradeValue(score: subject.currentGrade, scale: subject.gradingScale,
                           font: .figure(.headline, .semibold))
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Theme.muted)
            }
        }
    }
}

/// The pinned "Average" bar the reference shows at the bottom of every list.
struct AverageBar: View {
    let value: Double?
    let scale: GradingScale
    var label: String = "Average"

    var body: some View {
        HStack(spacing: Space.xs) {
            Text(label).font(.subheadline.weight(.medium)).foregroundStyle(Theme.ink2)
            Spacer()
            GradeValue(score: value, scale: scale, font: .figure(.title3, .bold))
        }
        .padding(.horizontal, Space.md)
        .padding(.vertical, Space.sm)
        .background(Theme.surface, in: Capsule())
        .overlay(Capsule().strokeBorder(Theme.line, lineWidth: 1))
        .cardShadow()
    }
}
