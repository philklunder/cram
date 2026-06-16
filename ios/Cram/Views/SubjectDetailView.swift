import SwiftUI
import SwiftData

/// A subject's home: study now, its material, grades, and a quick readout of exam standing.
struct SubjectDetailView: View {
    @Environment(\.modelContext) private var context
    @Bindable var subject: Subject

    /// The generation boundary (ADR 0003) — a stub today, a backend client later.
    private let generator: GenerationService = StubGenerationService()

    @State private var isGenerating = false
    @State private var generationError: String?
    @State private var showingAddMaterial = false

    private var dueCards: [Card] { subject.cards.filter { $0.isDue() } }

    var body: some View {
        List {
            Section {
                NavigationLink {
                    StudySessionView(subject: subject)
                } label: {
                    Label(dueCards.isEmpty ? "Nothing due — review anyway"
                                           : "Study \(dueCards.count) due card\(dueCards.count == 1 ? "" : "s")",
                          systemImage: "play.circle")
                }
                .disabled(subject.cards.isEmpty)
            }

            Section("Exam") {
                if let days = subject.daysUntilExam {
                    LabeledContent("Days to exam", value: days >= 0 ? "\(days)" : "passed")
                } else {
                    LabeledContent("Exam", value: "no date set")
                }
                LabeledContent("Current grade",
                               value: subject.currentGrade.map {
                                   GradeFormat.string($0, scale: subject.gradingScale)
                               } ?? "—")
                if let target = subject.targetGrade {
                    LabeledContent("Target",
                                   value: GradeFormat.string(target, scale: subject.gradingScale))
                }
                NavigationLink {
                    GradesView(subject: subject)
                } label: {
                    Label("Grades (\(subject.grades.count))", systemImage: "graduationcap")
                }
            }

            Section("Material") {
                if subject.sources.isEmpty {
                    Text("No material yet.").foregroundStyle(.secondary)
                } else {
                    ForEach(subject.sources) { source in
                        Label {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(source.title)
                                Text(subtitle(for: source))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        } icon: {
                            Image(systemName: icon(for: source.kind))
                        }
                    }
                }
                Button {
                    showingAddMaterial = true
                } label: {
                    Label("Add material", systemImage: "plus")
                }
                .disabled(isGenerating)
                if isGenerating {
                    HStack {
                        ProgressView()
                        Text("Generating cards…").foregroundStyle(.secondary)
                    }
                }
            }

            Section("Cards") {
                LabeledContent("Total", value: "\(subject.cards.count)")
                LabeledContent("Due now", value: "\(dueCards.count)")
            }
        }
        .navigationTitle(subject.name)
        .sheet(isPresented: $showingAddMaterial) {
            AddMaterialView { captured in ingest(captured) }
        }
        .alert("Couldn't generate", isPresented: .constant(generationError != nil)) {
            Button("OK") { generationError = nil }
        } message: {
            Text(generationError ?? "")
        }
    }

    /// Run the (stubbed) generation for freshly captured material and persist the resulting deck,
    /// carrying the real title and stored filenames onto the `Source`. The generation call site is
    /// unchanged — `RemoteGenerationService` swaps in here later (v0.3) with no UI change.
    private func ingest(_ captured: CapturedMaterial) {
        isGenerating = true
        Task {
            defer { isGenerating = false }
            do {
                let request = GenerationRequest(
                    kind: captured.kind,
                    title: captured.title,
                    subjectName: subject.name)
                let deck = try await generator.generate(request)
                DeckIngest.ingest(deck,
                                  kind: captured.kind,
                                  title: captured.title,
                                  fileNames: captured.fileNames,
                                  into: subject,
                                  context: context)
            } catch {
                generationError = error.localizedDescription
            }
        }
    }

    private func subtitle(for source: Source) -> String {
        let when = source.addedAt.formatted(.relative(presentation: .named))
        guard !source.fileNames.isEmpty else { return "\(source.kind.label) · added \(when)" }
        let n = source.fileNames.count
        return "\(n) file\(n == 1 ? "" : "s") · \(source.kind.label) · added \(when)"
    }

    private func icon(for kind: SourceKind) -> String {
        switch kind {
        case .pdf: "doc.text"
        case .photo: "photo"
        case .web: "globe"
        case .youtube: "play.rectangle"
        case .audio: "waveform"
        }
    }
}

#Preview {
    NavigationStack {
        SubjectDetailView(subject: PreviewData.container.mainContext.firstSubject())
    }
    .modelContainer(PreviewData.container)
}
