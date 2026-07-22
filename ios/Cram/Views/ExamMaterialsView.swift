import SwiftUI
import SwiftData

/// The **Subjects-tab** exam screen: your knowledge **progress** on this exam and its **materials**.
/// You add material here (Cram generates the deck), but *studying* — Review / Flashcards / Quiz —
/// lives only on the Study tab, so the primary action jumps you there.
struct ExamMaterialsView: View {
    @Environment(\.modelContext) private var context
    @Environment(AppRouter.self) private var router
    let scope: StudyScope

    private let generator: GenerationService = GenerationServiceFactory.make()
    @State private var isGenerating = false
    @State private var generationError: String?
    @State private var showingAddMaterial = false

    private var exam: Exam? { scope.exam }
    private var cards: [Card] { scope.cards }
    private var questions: [Question] { scope.questions }
    private var sources: [Source] {
        var seen = Set<UUID>(), out: [Source] = []
        for case let s? in cards.map(\.source) where seen.insert(s.id).inserted { out.append(s) }
        return out
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.lg) {
                progressCard
                material
                if let exam { studyButton(exam) }
            }
            .padding(Space.md)
        }
        .background(CanvasBackground())
        .navigationTitle(scope.title)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showingAddMaterial) {
            AddMaterialView { captured in ingest(captured) }
        }
        .alert("Couldn't generate", isPresented: .constant(generationError != nil)) {
            Button("OK") { generationError = nil }
        } message: { Text(generationError ?? "") }
    }

    // MARK: - Progress

    private var progressCard: some View {
        Panel {
            VStack(alignment: .leading, spacing: Space.md) {
                HStack(spacing: Space.sm) {
                    MonogramTile(subject: scope.subject, size: 46)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(scope.subject.name).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink2)
                        if let exam { CountdownPill(days: exam.daysUntilExam) }
                        else { Badge(text: "General deck", tone: .neutral) }
                    }
                    Spacer()
                    ReadinessRing(value: scope.readiness, verdict: scope.verdict, size: 62)
                }

                HStack(spacing: Space.sm) {
                    miniStat("\(cards.count)", "Cards")
                    miniStat("\(scope.dueCards.count)", "Due", tone: scope.dueCards.isEmpty ? Theme.ink : Theme.brand)
                    miniStat("\(questions.count)", "Quiz Qs")
                }

                Label(cards.isEmpty ? "No material yet — add some below to build the deck."
                                    : "\(scope.verdict.label) · \(Int((scope.readiness ?? 0) * 100))% mastered",
                      systemImage: cards.isEmpty ? "tray" : "checkmark.seal.fill")
                    .font(.caption).foregroundStyle(cards.isEmpty ? Theme.muted : scope.verdict.color)
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

    // MARK: - Material

    private var material: some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            SectionHeader(title: "Material")
            Panel {
                VStack(alignment: .leading, spacing: Space.sm) {
                    if sources.isEmpty {
                        Text("Add a PDF or photo and Cram generates this exam's cards and quiz from it.")
                            .font(.subheadline).foregroundStyle(Theme.ink2)
                            .fixedSize(horizontal: false, vertical: true)
                    } else {
                        ForEach(sources) { source in
                            HStack(spacing: Space.sm) {
                                Image(systemName: icon(for: source.kind))
                                    .font(.body).foregroundStyle(Theme.brand)
                                    .frame(width: 34, height: 34)
                                    .background(Theme.brandSoft, in: RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(source.title).font(.subheadline.weight(.medium))
                                        .foregroundStyle(Theme.ink).lineLimit(1)
                                    Text(source.kind.label).font(.caption).foregroundStyle(Theme.ink2)
                                }
                                Spacer()
                            }
                        }
                    }
                    if isGenerating {
                        HStack(spacing: Space.xs) {
                            ProgressView().tint(Theme.brand)
                            Text("Generating cards…").font(.subheadline).foregroundStyle(Theme.ink2)
                        }
                    }
                    Button { showingAddMaterial = true } label: { Label("Add material", systemImage: "plus") }
                        .buttonStyle(SecondaryButtonStyle())
                        .disabled(isGenerating || exam == nil)
                        .padding(.top, Space.xxs)
                    if exam == nil {
                        Text("Generation targets an exam. Add material from one of this subject's exams.")
                            .font(.caption).foregroundStyle(Theme.muted)
                    }
                }
            }
        }
    }

    private func studyButton(_ exam: Exam) -> some View {
        Button {
            router.study(exam)
        } label: {
            Label(cards.isEmpty ? "Add material to study" : "Study this exam", systemImage: "play.fill")
        }
        .buttonStyle(PrimaryButtonStyle())
        .disabled(cards.isEmpty)
    }

    private func icon(for kind: SourceKind) -> String {
        switch kind {
        case .pdf: "doc.text.fill"
        case .photo: "photo.fill"
        case .web: "globe"
        case .youtube: "play.rectangle.fill"
        case .audio: "waveform"
        }
    }

    // MARK: - Generation

    private func ingest(_ captured: CapturedMaterial) {
        guard let exam else { return }
        isGenerating = true
        Task {
            defer { isGenerating = false }
            do {
                let request = GenerationRequest(
                    kind: captured.kind,
                    title: captured.title,
                    subjectName: scope.subject.name,
                    fileURLs: captured.fileNames.map { SourceStore.shared.url(for: $0) })
                let deck = try await generator.generate(request)
                DeckIngest.ingest(deck, kind: captured.kind, title: captured.title,
                                  fileNames: captured.fileNames,
                                  into: scope.subject, exam: exam, context: context)
                SyncService.shared.requestSync(context: context)
            } catch {
                generationError = error.localizedDescription
            }
        }
    }
}
