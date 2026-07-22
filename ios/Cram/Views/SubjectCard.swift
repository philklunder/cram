import SwiftUI

/// The shared subject identity card — used on Today, Subjects, and Progress. Purely visual (the
/// caller wraps it in whatever navigation is appropriate for the surface).
///
/// Quiet per-subject colour (the monogram tile) sits beside neutral text; the readiness bar fills
/// from the *semantic* verdict colour, keeping identity and meaning cleanly separated.
struct SubjectCard: View {
    let subject: Subject
    /// Show the recall-readiness bar (Today keeps it; a dense grid can drop it).
    var showReadiness: Bool = true

    private var due: Int { subject.dueCount }

    var body: some View {
        Panel {
            HStack(alignment: .center, spacing: Space.md) {
                MonogramTile(subject: subject, size: 52)

                VStack(alignment: .leading, spacing: 7) {
                    Text(subject.name)
                        .font(.headline)
                        .tracking(-0.2)
                        .foregroundStyle(Theme.ink)
                        .lineLimit(1)
                    HStack(spacing: 6) {
                        CountdownPill(days: subject.daysUntilExam)
                        if due > 0 {
                            Badge(text: "\(due) due", tone: .brand, systemImage: "rectangle.stack.fill")
                        }
                    }
                    Text(subject.verdict.label)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(subject.verdict.color)
                }

                Spacer(minLength: Space.xs)

                if showReadiness {
                    VStack(spacing: 6) {
                        ReadinessRing(value: subject.readiness, verdict: subject.verdict, size: 58)
                        if let grade = subject.currentGrade {
                            Text(GradeFormat.string(grade, scale: subject.gradingScale))
                                .font(.figure(.caption, .semibold))
                                .foregroundStyle(subject.gradingScale.isPassing(grade) ? Theme.success : Theme.danger)
                        }
                    }
                } else if let grade = subject.currentGrade {
                    GradeChip(score: grade, scale: subject.gradingScale)
                }
            }
        }
    }
}

/// A compact current-grade readout whose tint tracks pass/fail on the subject's scale.
struct GradeChip: View {
    let score: Double
    let scale: GradingScale

    var body: some View {
        let passing = scale.isPassing(score)
        VStack(spacing: 1) {
            Text(GradeFormat.string(score, scale: scale))
                .font(.figure(.callout))
                .foregroundStyle(passing ? Theme.success : Theme.danger)
            Text("grade")
                .font(.system(size: 9, weight: .semibold))
                .textCase(.uppercase)
                .foregroundStyle(Theme.muted)
        }
        .frame(minWidth: 44)
        .padding(.vertical, 6)
        .padding(.horizontal, Space.xs)
        .background(passing ? Theme.successSoft : Theme.dangerSoft,
                    in: RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
    }
}
