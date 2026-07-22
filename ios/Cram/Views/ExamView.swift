import SwiftUI
import SwiftData

/// The **Study-tab** exam hub — the only place you actually study. Shows the exam's countdown and
/// readiness, and the three ways to study (Review · Flashcards · Quiz). Adding material and tracking
/// progress live on the Subjects tab (see `ExamMaterialsView`).
struct ExamView: View {
    let scope: StudyScope

    private var exam: Exam? { scope.exam }
    private var cards: [Card] { scope.cards }
    private var due: [Card] { scope.dueCards }
    private var questions: [Question] { scope.questions }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.lg) {
                header
                if cards.isEmpty {
                    emptyHint
                } else {
                    modes
                }
            }
            .padding(Space.md)
        }
        .background(CanvasBackground())
        .navigationTitle(scope.title)
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Header

    private var header: some View {
        Panel {
            VStack(alignment: .leading, spacing: Space.sm) {
                HStack(spacing: Space.sm) {
                    MonogramTile(subject: scope.subject, size: 44)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(scope.subject.name).font(.subheadline.weight(.semibold))
                            .foregroundStyle(Theme.ink2)
                        if let exam { CountdownPill(days: exam.daysUntilExam) }
                        else { Badge(text: "General deck", tone: .neutral) }
                    }
                    Spacer()
                    ReadinessRing(value: scope.readiness, verdict: scope.verdict, size: 56)
                }
                if !cards.isEmpty {
                    HStack(spacing: Space.sm) {
                        miniStat("\(cards.count)", "Cards")
                        miniStat("\(due.count)", "Due", tone: due.isEmpty ? Theme.ink : Theme.brand)
                        miniStat("\(questions.count)", "Quiz Qs")
                    }
                }
            }
        }
    }

    private func miniStat(_ value: String, _ label: String, tone: Color = Theme.ink) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.figure(.headline)).foregroundStyle(tone)
            Text(label).font(.caption2).foregroundStyle(Theme.ink2)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, Space.xs)
        .background(Theme.surface2, in: RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
    }

    // MARK: - Study modes

    private var modes: some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            SectionHeader(title: "Study")
            VStack(spacing: Space.xs) {
                NavigationLink {
                    StudySessionView(scope: scope, mode: .review)
                } label: {
                    ModeRow(icon: "arrow.triangle.2.circlepath", title: "Review",
                            subtitle: due.isEmpty ? "Nothing due — review anyway"
                                                  : "\(due.count) card\(due.count == 1 ? "" : "s") due · updates progress",
                            tint: Theme.brand)
                }
                .buttonStyle(PressableCardStyle())

                NavigationLink {
                    StudySessionView(scope: scope, mode: .flashcards)
                } label: {
                    ModeRow(icon: "rectangle.stack", title: "Flashcards",
                            subtitle: "Flip through all \(cards.count) card\(cards.count == 1 ? "" : "s")",
                            tint: Theme.success)
                }
                .buttonStyle(PressableCardStyle())

                NavigationLink {
                    QuizView(scope: scope)
                } label: {
                    ModeRow(icon: "checklist", title: "Quiz",
                            subtitle: questions.isEmpty ? "No questions yet"
                                                        : "\(questions.count) question\(questions.count == 1 ? "" : "s") · AI-checked",
                            tint: Theme.warning)
                }
                .buttonStyle(PressableCardStyle())
                .disabled(questions.isEmpty)
                .opacity(questions.isEmpty ? 0.5 : 1)
            }
        }
    }

    private var emptyHint: some View {
        EmptyStateView(
            title: "No material yet",
            message: "Add material to this exam in the Subjects tab and Cram builds the cards and quiz to study here.",
            systemImage: "tray")
        .frame(maxWidth: .infinity)
        .padding(.top, Space.lg)
    }
}

/// A large tappable study-mode row: icon chip, title, one-line status.
private struct ModeRow: View {
    let icon: String
    let title: String
    let subtitle: String
    let tint: Color

    var body: some View {
        HStack(spacing: Space.sm) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(tint)
                .frame(width: 44, height: 44)
                .background(tint.opacity(0.14), in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.headline).foregroundStyle(Theme.ink)
                Text(subtitle).font(.caption).foregroundStyle(Theme.ink2)
            }
            Spacer()
            Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Theme.muted)
        }
        .padding(Space.sm)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Theme.line, lineWidth: 1))
    }
}

#Preview {
    NavigationStack {
        let subject = PreviewData.container.mainContext.firstSubject()
        ExamView(scope: subject.studyScopes.first ?? StudyScope(subject: subject, exam: nil))
    }
    .modelContainer(PreviewData.container)
}
