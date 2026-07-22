import SwiftUI
import SwiftData

/// A cross-subject readout of study progress and exam readiness.
struct ProgressOverviewView: View {
    @Query(filter: #Predicate<Subject> { $0.deletedAt == nil }, sort: \Subject.createdAt)
    private var subjects: [Subject]

    private var allCards: [Card] { subjects.flatMap(\.cards) }
    private var masteredCount: Int { allCards.lazy.filter { $0.mastery >= 0.8 }.count }
    private var dueCount: Int { allCards.lazy.filter { $0.isDue() }.count }

    var body: some View {
        NavigationStack {
            Group {
                if subjects.isEmpty {
                    EmptyStateView(
                        title: "Nothing to show yet",
                        message: "Add subjects and study to see your readiness and mastery build up here.",
                        systemImage: "chart.bar.xaxis")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: Space.lg) {
                            kpiStrip
                            VStack(alignment: .leading, spacing: Space.sm) {
                                SectionHeader(title: "By subject")
                                VStack(spacing: Space.sm) {
                                    ForEach(subjects) { subject in
                                        NavigationLink {
                                            SubjectDetailView(subject: subject)
                                        } label: {
                                            ProgressSubjectCard(subject: subject)
                                        }
                                        .buttonStyle(PressableCardStyle())
                                    }
                                }
                            }
                        }
                        .padding(Space.md)
                    }
                }
            }
            .background(CanvasBackground())
            .navigationTitle("Progress")
        }
    }

    private var kpiStrip: some View {
        HStack(spacing: Space.sm) {
            StatTile(value: "\(allCards.count)", label: "Total cards", systemImage: "rectangle.stack.fill")
            StatTile(value: "\(masteredCount)", label: "Mastered",
                     systemImage: "checkmark.seal.fill", tone: Theme.success)
            StatTile(value: "\(dueCount)", label: "Due now",
                     systemImage: "clock.fill", tone: dueCount > 0 ? Theme.brand : Theme.ink)
        }
    }
}

/// A per-subject performance card: readiness plus a mastery/due footer.
private struct ProgressSubjectCard: View {
    let subject: Subject

    private var mastered: Int { subject.cards.lazy.filter { $0.mastery >= 0.8 }.count }

    var body: some View {
        Panel {
            VStack(alignment: .leading, spacing: Space.sm) {
                HStack(spacing: Space.sm) {
                    MonogramTile(subject: subject, size: 40)
                    Text(subject.name)
                        .font(.headline).tracking(-0.2).foregroundStyle(Theme.ink).lineLimit(1)
                    Spacer()
                    if let days = subject.daysUntilExam, days >= 0 {
                        Text("\(days)d")
                            .font(.caption.weight(.semibold).monospacedDigit())
                            .foregroundStyle(days <= 7 ? Theme.danger : Theme.ink2)
                    }
                }
                if subject.cards.isEmpty {
                    Text("No cards yet").font(.caption).foregroundStyle(Theme.muted)
                } else {
                    ReadinessBar(value: subject.readiness, verdict: subject.verdict)
                    HStack(spacing: Space.md) {
                        footStat("\(subject.cards.count)", "cards")
                        footStat("\(mastered)", "mastered")
                        if subject.dueCount > 0 { footStat("\(subject.dueCount)", "due", tone: Theme.brand) }
                    }
                }
            }
        }
    }

    private func footStat(_ value: String, _ label: String, tone: Color = Theme.ink2) -> some View {
        HStack(spacing: 4) {
            Text(value).font(.caption.weight(.bold).monospacedDigit()).foregroundStyle(tone)
            Text(label).font(.caption).foregroundStyle(Theme.muted)
        }
    }
}

#Preview {
    ProgressOverviewView()
        .modelContainer(PreviewData.container)
}
