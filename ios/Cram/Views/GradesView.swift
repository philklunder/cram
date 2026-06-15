import SwiftUI
import SwiftData

/// Record and review real grades for a subject (see PRODUCT-SPEC §6).
struct GradesView: View {
    @Environment(\.modelContext) private var context
    @Bindable var subject: Subject
    @State private var showingAdd = false

    var body: some View {
        List {
            Section {
                LabeledContent("Current",
                               value: subject.currentGrade.map {
                                   GradeFormat.string($0, scale: subject.gradingScale)
                               } ?? "—")
                if let target = subject.targetGrade {
                    LabeledContent("Target",
                                   value: GradeFormat.string(target, scale: subject.gradingScale))
                }
            } footer: {
                Text("Cram uses your grades to focus study time on weaker subjects and to pace toward your target.")
            }

            Section("Entries") {
                if subject.grades.isEmpty {
                    Text("No grades recorded yet.").foregroundStyle(.secondary)
                } else {
                    ForEach(subject.grades.sorted { $0.date > $1.date }) { entry in
                        VStack(alignment: .leading, spacing: 2) {
                            HStack {
                                Text(entry.title).font(.headline)
                                Spacer()
                                Text(GradeFormat.string(entry.score, scale: subject.gradingScale))
                                    .font(.body.monospacedDigit())
                            }
                            HStack(spacing: 8) {
                                Text(entry.kind.label)
                                Text("·")
                                Text("\(Int(entry.weight * 100))%")
                                Text("·")
                                Text(entry.date, format: .dateTime.day().month().year())
                            }
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        }
                    }
                    .onDelete(perform: deleteEntries)
                }
            }
        }
        .navigationTitle("Grades")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showingAdd = true } label: { Image(systemName: "plus") }
            }
        }
        .sheet(isPresented: $showingAdd) {
            AddGradeView(subject: subject)
        }
    }

    private func deleteEntries(at offsets: IndexSet) {
        let sorted = subject.grades.sorted { $0.date > $1.date }
        for index in offsets { context.delete(sorted[index]) }
    }
}

/// Modal form for adding a grade entry.
private struct AddGradeView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    let subject: Subject

    @State private var title = ""
    @State private var kind: GradeKind = .exam
    @State private var score = ""
    @State private var weightPercent = 100.0

    private var parsedScore: Double? {
        Double(score.replacingOccurrences(of: ",", with: "."))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Grade") {
                    TextField("Title (e.g. Midterm)", text: $title)
                    Picker("Kind", selection: $kind) {
                        ForEach(GradeKind.allCases) { Text($0.label).tag($0) }
                    }
                    TextField("Score (\(subject.gradingScale.label))", text: $score)
                        .keyboardType(.decimalPad)
                }
                Section("Weight") {
                    Slider(value: $weightPercent, in: 0...100, step: 5) {
                        Text("Weight")
                    } minimumValueLabel: { Text("0%") } maximumValueLabel: { Text("100%") }
                    Text("\(Int(weightPercent))% of the subject grade")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("New Grade")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty || parsedScore == nil)
                }
            }
        }
    }

    private func save() {
        guard let parsedScore else { return }
        let entry = GradeEntry(title: title.trimmingCharacters(in: .whitespaces),
                               kind: kind,
                               score: parsedScore,
                               weight: weightPercent / 100,
                               subject: subject)
        context.insert(entry)
        dismiss()
    }
}

#Preview {
    NavigationStack {
        GradesView(subject: PreviewData.container.mainContext.firstSubject())
    }
    .modelContainer(PreviewData.container)
}
