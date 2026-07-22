import SwiftUI
import SwiftData

/// A quiz over one `StudyScope`. Multiple-choice is graded instantly on-device; written answers go
/// to the grader (Claude when signed in, an on-device keyword check offline — see `QuizGraderFactory`).
/// Every answer is recorded as an `Attempt` and synced.
struct QuizView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    let scope: StudyScope

    private let grader: AnswerGrader = QuizGraderFactory.make()

    @State private var questions: [Question] = []
    @State private var index = 0
    @State private var response = ""
    @State private var selected: String?
    @State private var result: AnswerGrade?
    @State private var isGrading = false
    @State private var correctCount = 0
    @FocusState private var writing: Bool

    private var current: Question? { questions.indices.contains(index) ? questions[index] : nil }
    private var answered: Bool { result != nil }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.lg) {
                if let q = current {
                    progressHeader
                    prompt(q)
                    switch q.kind {
                    case .multipleChoice: choices(q)
                    case .shortAnswer:    written(q)
                    }
                    if let result { feedback(result, question: q) }
                    if answered { nextButton }
                } else {
                    completion
                }
            }
            .padding(Space.md)
        }
        .background(CanvasBackground())
        .navigationTitle("Quiz")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { questions = scope.questions }
    }

    // MARK: - Pieces

    private var progressHeader: some View {
        VStack(spacing: Space.xs) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.surface2)
                    Capsule().fill(Theme.marker)
                        .frame(width: max(4, geo.size.width * (questions.isEmpty ? 0 : Double(index) / Double(questions.count))))
                }
            }
            .frame(height: 8)
            HStack {
                Text("\(index + 1) of \(questions.count)")
                    .font(.figure(.caption, .semibold)).foregroundStyle(Theme.ink2)
                Spacer()
                Text("\(correctCount) correct")
                    .font(.figure(.caption, .regular)).foregroundStyle(Theme.muted)
            }
        }
    }

    private func prompt(_ q: Question) -> some View {
        Panel {
            VStack(alignment: .leading, spacing: 8) {
                Text(q.topic.uppercased()).font(.caption2.weight(.bold)).tracking(0.6)
                    .foregroundStyle(Theme.brand)
                Text(q.prompt).font(.title3.weight(.semibold)).foregroundStyle(Theme.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    // Multiple choice — tap to answer, correct/incorrect revealed immediately.
    private func choices(_ q: Question) -> some View {
        VStack(spacing: Space.xs) {
            ForEach(q.options, id: \.self) { option in
                Button { pick(option, for: q) } label: {
                    HStack {
                        Text(option).font(.subheadline.weight(.medium)).foregroundStyle(Theme.ink)
                            .multilineTextAlignment(.leading)
                        Spacer()
                        if answered {
                            if option == q.answerKey {
                                Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.success)
                            } else if option == selected {
                                Image(systemName: "xmark.circle.fill").foregroundStyle(Theme.danger)
                            }
                        }
                    }
                    .padding(Space.sm)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(optionFill(option, q), in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
                        .strokeBorder(optionStroke(option, q), lineWidth: 1))
                }
                .buttonStyle(PressableCardStyle())
                .disabled(answered)
            }
        }
    }

    private func optionFill(_ option: String, _ q: Question) -> Color {
        guard answered else { return Theme.surface }
        if option == q.answerKey { return Theme.successSoft }
        if option == selected { return Theme.dangerSoft }
        return Theme.surface
    }
    private func optionStroke(_ option: String, _ q: Question) -> Color {
        guard answered else { return Theme.line }
        if option == q.answerKey { return Theme.success.opacity(0.4) }
        if option == selected { return Theme.danger.opacity(0.4) }
        return Theme.line
    }

    // Short answer — write, then Check (async grade).
    private func written(_ q: Question) -> some View {
        VStack(spacing: Space.sm) {
            TextField("Your answer…", text: $response, axis: .vertical)
                .lineLimit(3...6)
                .focused($writing)
                .disabled(answered)
                .padding(Space.sm)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Radius.md, style: .continuous).strokeBorder(Theme.line, lineWidth: 1))
            if !answered {
                Button {
                    writing = false
                    Task { await check(q) }
                } label: {
                    if isGrading { ProgressView().tint(Theme.onMarker) }
                    else { Text("Check answer") }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(isGrading || response.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
    }

    private func feedback(_ grade: AnswerGrade, question q: Question) -> some View {
        let tone: BadgeTone = grade.isCorrect ? .success : (grade.score >= 0.4 ? .warning : .danger)
        return Panel {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Badge(text: grade.isCorrect ? "Correct" : (grade.score >= 0.4 ? "Partly right" : "Not quite"),
                          tone: tone, systemImage: grade.isCorrect ? "checkmark" : "xmark")
                    Spacer()
                    Text("\(Int((grade.score * 100).rounded()))%")
                        .font(.figure(.subheadline)).foregroundStyle(Theme.ink2)
                }
                if q.kind == .shortAnswer, !grade.feedback.isEmpty {
                    Text(grade.feedback).font(.subheadline).foregroundStyle(Theme.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    private var nextButton: some View {
        Button { advance() } label: {
            Label(index + 1 >= questions.count ? "Finish" : "Next question",
                  systemImage: index + 1 >= questions.count ? "checkmark" : "arrow.right")
        }
        .buttonStyle(PrimaryButtonStyle())
    }

    private var completion: some View {
        EmptyStateView(
            title: questions.isEmpty ? "No questions yet" : "Quiz complete",
            message: questions.isEmpty
                ? "Add material to this exam to generate a quiz."
                : "You got \(correctCount) of \(questions.count) right.",
            systemImage: "checklist",
            actionTitle: "Done") { dismiss() }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Grading

    private func pick(_ option: String, for q: Question) {
        selected = option
        let correct = option == q.answerKey
        let grade = AnswerGrade(isCorrect: correct, score: correct ? 1 : 0, feedback: "")
        result = grade
        if correct { correctCount += 1 }
        record(grade, response: option, for: q)
    }

    private func check(_ q: Question) async {
        isGrading = true
        let text = response.trimmingCharacters(in: .whitespacesAndNewlines)
        let grade = await grader.grade(prompt: q.prompt, modelAnswer: q.answerKey,
                                       response: text, topic: q.topic)
        isGrading = false
        result = grade
        if grade.isCorrect { correctCount += 1 }
        record(grade, response: text, for: q)
    }

    private func record(_ grade: AnswerGrade, response: String, for q: Question) {
        context.insert(Attempt(response: response, isCorrect: grade.isCorrect,
                               score: grade.score, feedback: grade.feedback, question: q))
        SyncService.shared.requestSync(context: context)
    }

    private func advance() {
        withAnimation(.snappy) {
            index += 1
            response = ""
            selected = nil
            result = nil
        }
    }
}

#Preview {
    NavigationStack {
        let subject = PreviewData.container.mainContext.firstSubject()
        QuizView(scope: subject.studyScopes.first ?? StudyScope(subject: subject, exam: nil))
    }
    .modelContainer(PreviewData.container)
}
