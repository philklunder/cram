import SwiftUI
import SwiftData

/// How a study session behaves.
enum StudyMode {
    /// SM-2 spaced repetition: due cards first, rate recall, progress + schedule update.
    case review
    /// Free browsing: flip through the whole deck to learn, no rating, no scheduling.
    case flashcards

    var title: String { self == .review ? "Review" : "Flashcards" }
}

/// A study session over one `StudyScope` (an exam's deck, or the General bucket). In **review** mode
/// it's SM-2 — flip, rate, reschedule, log progress. In **flashcards** mode it's a calm flip-through
/// of the whole deck with no scoring.
struct StudySessionView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    let scope: StudyScope
    var mode: StudyMode = .review

    @State private var queue: [Card] = []
    @State private var index = 0
    @State private var showingBack = false
    @State private var reviewedCount = 0

    private var current: Card? { queue.indices.contains(index) ? queue[index] : nil }
    private var progress: Double { queue.isEmpty ? 0 : Double(index) / Double(queue.count) }

    var body: some View {
        VStack(spacing: Space.lg) {
            if let card = current {
                progressHeader
                Spacer(minLength: 0)
                FlipCard(card: card, showingBack: showingBack)
                    .onTapGesture { flip() }
                    .padding(.horizontal, Space.xs)
                Spacer(minLength: 0)
                controls(for: card)
            } else {
                completionState
            }
        }
        .padding(Space.md)
        .background(CanvasBackground())
        .navigationTitle(mode.title)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear(perform: buildQueue)
    }

    // MARK: - Header

    private var progressHeader: some View {
        VStack(spacing: Space.xs) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.surface2)
                    Capsule().fill(Theme.marker)
                        .frame(width: max(4, geo.size.width * progress))
                        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: progress)
                }
            }
            .frame(height: 8)
            HStack {
                Text("\(index + 1) of \(queue.count)")
                    .font(.figure(.caption, .semibold)).foregroundStyle(Theme.ink2)
                Spacer()
                if mode == .review, reviewedCount > 0 {
                    Text("\(reviewedCount) reviewed")
                        .font(.figure(.caption, .regular)).foregroundStyle(Theme.muted)
                }
            }
        }
    }

    // MARK: - Controls

    @ViewBuilder
    private func controls(for card: Card) -> some View {
        if !showingBack {
            Button { flip() } label: { Label("Show answer", systemImage: "eye.fill") }
                .buttonStyle(PrimaryButtonStyle())
        } else if mode == .review {
            ratingButtons(for: card)
        } else {
            Button { advance() } label: {
                Label(index + 1 >= queue.count ? "Finish" : "Next card",
                      systemImage: index + 1 >= queue.count ? "checkmark" : "arrow.right")
            }
            .buttonStyle(PrimaryButtonStyle())
        }
    }

    private func ratingButtons(for card: Card) -> some View {
        VStack(spacing: Space.xs) {
            Text("How well did you recall it?")
                .font(.caption).foregroundStyle(Theme.ink2)
            HStack(spacing: Space.xs) {
                ForEach(ReviewRating.allCases) { rating in
                    Button { rate(card, rating) } label: {
                        Text(rating.label)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(color(for: rating))
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 13)
                            .background(soft(for: rating),
                                        in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
                                    .strokeBorder(color(for: rating).opacity(0.25), lineWidth: 1))
                    }
                    .buttonStyle(PressableCardStyle())
                }
            }
        }
    }

    // MARK: - Completion

    private var completionState: some View {
        EmptyStateView(
            title: (mode == .review ? reviewedCount > 0 : !queue.isEmpty) ? "All done" : "Nothing to study",
            message: mode == .review
                ? (reviewedCount > 0 ? "You reviewed \(reviewedCount) card\(reviewedCount == 1 ? "" : "s"). Nice work."
                                     : "Add material to this exam to generate cards.")
                : (queue.isEmpty ? "Add material to this exam to generate cards."
                                 : "You flipped through the whole deck."),
            systemImage: "checkmark.circle.fill",
            actionTitle: "Done") { dismiss() }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Logic

    private func flip() { withAnimation(.spring(response: 0.45, dampingFraction: 0.8)) { showingBack.toggle() } }

    private func buildQueue() {
        switch mode {
        case .review:
            let due = scope.dueCards.sorted { $0.dueDate < $1.dueDate }
            queue = due.isEmpty ? scope.cards.sorted { $0.dueDate < $1.dueDate } : due
        case .flashcards:
            queue = scope.cards.sorted { $0.createdAt < $1.createdAt }
        }
        index = 0
        showingBack = false
        reviewedCount = 0
    }

    private func advance() {
        withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
            showingBack = false
            index += 1
        }
    }

    private func rate(_ card: Card, _ rating: ReviewRating) {
        Scheduler.apply(rating, to: card,
                        examDate: scope.examDate,
                        subjectStrength: scope.subject.gradeStrength)
        card.touch()
        context.insert(ReviewLog(rating: rating, card: card))
        reviewedCount += 1
        SyncService.shared.requestSync(context: context)
        advance()
    }

    private func color(for rating: ReviewRating) -> Color {
        switch rating {
        case .again: Theme.danger
        case .hard:  Theme.warning
        case .good:  Theme.success
        case .easy:  Theme.brand
        }
    }
    private func soft(for rating: ReviewRating) -> Color {
        switch rating {
        case .again: Theme.dangerSoft
        case .hard:  Theme.warningSoft
        case .good:  Theme.successSoft
        case .easy:  Theme.brandSoft
        }
    }
}

/// A flip card: front (prompt) and back (answer) faces sharing one surface, with a real 3D flip.
private struct FlipCard: View {
    let card: Card
    let showingBack: Bool

    var body: some View {
        ZStack {
            face(text: card.front, hint: "Tap to reveal answer")
                .opacity(showingBack ? 0 : 1)
                .accessibilityHidden(showingBack)
            face(text: card.back, hint: nil)
                .opacity(showingBack ? 1 : 0)
                .rotation3DEffect(.degrees(180), axis: (x: 0, y: 1, z: 0))
                .accessibilityHidden(!showingBack)
        }
        .rotation3DEffect(.degrees(showingBack ? 180 : 0), axis: (x: 0, y: 1, z: 0))
    }

    private func face(text: String, hint: String?) -> some View {
        VStack(spacing: Space.md) {
            Text(card.topic.uppercased())
                .font(.caption2.weight(.bold)).tracking(0.6)
                .foregroundStyle(Theme.brand)
            Spacer(minLength: 0)
            Text(text)
                .font(.title3.weight(.medium))
                .multilineTextAlignment(.center)
                .foregroundStyle(Theme.ink)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            if let hint {
                Label(hint, systemImage: "hand.tap.fill")
                    .font(.caption2).foregroundStyle(Theme.muted)
            } else {
                Color.clear.frame(height: 14)
            }
        }
        .padding(Space.xl)
        .frame(maxWidth: .infinity, minHeight: 300)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: Radius.xl, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Radius.xl, style: .continuous).strokeBorder(Theme.line, lineWidth: 1))
        .cardShadow()
    }
}

#Preview {
    NavigationStack {
        let subject = PreviewData.container.mainContext.firstSubject()
        StudySessionView(scope: subject.studyScopes.first ?? StudyScope(subject: subject, exam: nil))
    }
    .modelContainer(PreviewData.container)
}
