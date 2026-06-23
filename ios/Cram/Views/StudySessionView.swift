import SwiftUI
import SwiftData

/// A flashcard review session: flip a card, rate recall, and the scheduler reschedules it.
struct StudySessionView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    let subject: Subject

    @State private var queue: [Card] = []
    @State private var index = 0
    @State private var showingBack = false
    @State private var reviewedCount = 0

    private var current: Card? { queue.indices.contains(index) ? queue[index] : nil }

    var body: some View {
        VStack(spacing: 24) {
            if let card = current {
                ProgressView(value: Double(index), total: Double(queue.count))
                    .padding(.horizontal)

                Spacer()

                CardFace(card: card, showingBack: showingBack)
                    .onTapGesture { withAnimation { showingBack.toggle() } }

                Spacer()

                if showingBack {
                    ratingButtons(for: card)
                } else {
                    Button {
                        withAnimation { showingBack = true }
                    } label: {
                        Text("Show answer").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .padding(.horizontal)
                }
            } else {
                ContentUnavailableView(
                    reviewedCount > 0 ? "Session complete" : "Nothing to review",
                    systemImage: reviewedCount > 0 ? "checkmark.circle" : "tray",
                    description: Text(reviewedCount > 0
                                      ? "You reviewed \(reviewedCount) card\(reviewedCount == 1 ? "" : "s")."
                                      : "Add material to this subject to generate cards."))
            }
        }
        .padding(.vertical)
        .navigationTitle("Study")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear(perform: buildQueue)
    }

    private func ratingButtons(for card: Card) -> some View {
        HStack(spacing: 10) {
            ForEach(ReviewRating.allCases) { rating in
                Button {
                    rate(card, rating)
                } label: {
                    Text(rating.label).frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(color(for: rating))
            }
        }
        .controlSize(.large)
        .padding(.horizontal)
    }

    private func buildQueue() {
        // Due cards first; if none are due, fall back to the full deck so review is always possible.
        let due = subject.cards.filter { $0.isDue() }.sorted { $0.dueDate < $1.dueDate }
        queue = due.isEmpty ? subject.cards.sorted { $0.dueDate < $1.dueDate } : due
        index = 0
        showingBack = false
        reviewedCount = 0
    }

    private func rate(_ card: Card, _ rating: ReviewRating) {
        Scheduler.apply(rating,
                        to: card,
                        examDate: subject.examDate,
                        subjectStrength: subject.gradeStrength)
        card.touch()   // SM-2 state changed → mark the card for the next push
        context.insert(ReviewLog(rating: rating, card: card))
        reviewedCount += 1
        SyncService.shared.requestSync(context: context)
        withAnimation {
            showingBack = false
            index += 1
        }
    }

    private func color(for rating: ReviewRating) -> Color {
        switch rating {
        case .again: .red
        case .hard: .orange
        case .good: .green
        case .easy: .blue
        }
    }
}

/// One side of a flashcard.
private struct CardFace: View {
    let card: Card
    let showingBack: Bool

    var body: some View {
        VStack(spacing: 16) {
            Text(card.topic.uppercased())
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
            Text(showingBack ? card.back : card.front)
                .font(.title3)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
        }
        .padding(28)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 20))
        .overlay(alignment: .bottom) {
            if !showingBack {
                Text("Tap to flip").font(.caption2).foregroundStyle(.secondary).padding(8)
            }
        }
        .padding(.horizontal)
    }
}

#Preview {
    NavigationStack {
        StudySessionView(subject: PreviewData.container.mainContext.firstSubject())
    }
    .modelContainer(PreviewData.container)
}
