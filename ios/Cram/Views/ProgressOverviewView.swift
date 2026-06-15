import SwiftUI
import SwiftData

/// A cross-subject readout of study progress and exam readiness.
struct ProgressOverviewView: View {
    @Query(sort: \Subject.createdAt) private var subjects: [Subject]

    var body: some View {
        NavigationStack {
            Group {
                if subjects.isEmpty {
                    ContentUnavailableView(
                        "Nothing to show yet",
                        systemImage: "chart.bar.xaxis",
                        description: Text("Add subjects and study to see progress here."))
                } else {
                    List(subjects) { subject in
                        SubjectProgressRow(subject: subject)
                    }
                }
            }
            .navigationTitle("Progress")
        }
    }
}

private struct SubjectProgressRow: View {
    let subject: Subject

    private var cards: [Card] { subject.cards }
    private var avgMastery: Double {
        guard !cards.isEmpty else { return 0 }
        return cards.reduce(0) { $0 + $1.mastery } / Double(cards.count)
    }
    private var dueCount: Int { cards.filter { $0.isDue() }.count }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(subject.name).font(.headline)
                Spacer()
                if let days = subject.daysUntilExam, days >= 0 {
                    Text("\(days)d to exam").font(.caption).foregroundStyle(.secondary)
                }
            }
            if cards.isEmpty {
                Text("No cards yet").font(.caption).foregroundStyle(.secondary)
            } else {
                ProgressView(value: avgMastery) {
                    Text("Mastery \(Int(avgMastery * 100))%").font(.caption)
                }
                HStack(spacing: 12) {
                    Label("\(cards.count) cards", systemImage: "rectangle.stack")
                    if dueCount > 0 {
                        Label("\(dueCount) due", systemImage: "clock").foregroundStyle(.tint)
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }
}

#Preview {
    ProgressOverviewView()
        .modelContainer(PreviewData.container)
}
