import SwiftUI
import SwiftData

// MARK: - Per-subject grades

/// Record and review a subject's marks, grouped under the exam each one belongs to. A subject-level
/// average sits on top; adding a mark to an exam is what "finishes" it.
struct SubjectGradesView: View {
    @Environment(\.modelContext) private var context
    @Bindable var subject: Subject
    @State private var addingTo: Exam?

    private func entries(for exam: Exam) -> [GradeEntry] {
        subject.grades.filter { $0.examId == exam.id && $0.deletedAt == nil }.sorted { $0.date > $1.date }
    }

    var body: some View {
        List {
            Section {
                HStack {
                    standing("Current",
                             subject.currentGrade.map { GradeFormat.string($0, scale: subject.gradingScale) } ?? "—",
                             passing: subject.currentGrade.map { subject.gradingScale.isPassing($0) })
                    Divider().frame(height: 40)
                    standing("Target",
                             subject.targetGrade.map { GradeFormat.string($0, scale: subject.gradingScale) } ?? "—",
                             passing: nil)
                }
                .listRowBackground(Theme.surface)
            } header: { Text("Standing").foregroundStyle(Theme.ink2) }

            if subject.activeExams.isEmpty {
                Section {
                    Text("Add an exam to this subject, then record its mark here.")
                        .font(.subheadline).foregroundStyle(Theme.ink2)
                        .listRowBackground(Theme.surface)
                }
            }

            ForEach(subject.activeExams) { exam in
                Section {
                    ForEach(entries(for: exam)) { entry in
                        GradeEntryRow(entry: entry, scale: subject.gradingScale)
                            .listRowBackground(Theme.surface)
                    }
                    .onDelete { deleteEntries($0, for: exam) }
                    Button { addingTo = exam } label: {
                        Label("Add mark", systemImage: "plus").font(.subheadline)
                    }
                    .listRowBackground(Theme.surface)
                } header: {
                    HStack {
                        Text(exam.title).foregroundStyle(Theme.ink2)
                        Spacer()
                        if let grade = exam.recordedGrade {
                            Text(GradeFormat.string(grade, scale: subject.gradingScale))
                                .font(.figure(.caption))
                                .foregroundStyle(subject.gradingScale.isPassing(grade) ? Theme.success : Theme.danger)
                        }
                    }
                }
            }
        }
        .scrollContentBackground(.hidden)
        .background(CanvasBackground())
        .navigationTitle("Grades")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $addingTo) { exam in
            AddGradeView(subject: subject, exam: exam)
        }
    }

    private func standing(_ label: String, _ value: String, passing: Bool?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased()).font(.caption2.weight(.bold)).tracking(0.5).foregroundStyle(Theme.muted)
            Text(value).font(.figure(.title)).foregroundStyle(passing == false ? Theme.danger : Theme.ink)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func deleteEntries(_ offsets: IndexSet, for exam: Exam) {
        let list = entries(for: exam)
        for index in offsets { list[index].softDelete() }
        SyncService.shared.requestSync(context: context)
    }
}

private struct GradeEntryRow: View {
    let entry: GradeEntry
    let scale: GradingScale
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.title).font(.subheadline.weight(.medium)).foregroundStyle(Theme.ink).lineLimit(1)
                Text("\(entry.kind.label) · \(Int(entry.weight * 100))% · \(entry.date.formatted(.dateTime.day().month().year()))")
                    .font(.caption).foregroundStyle(Theme.ink2)
            }
            Spacer()
            Text(GradeFormat.string(entry.score, scale: scale))
                .font(.figure(.body))
                .foregroundStyle(scale.isPassing(entry.score) ? Theme.success : Theme.danger)
        }
    }
}

// MARK: - Add a mark

/// Modal for recording a mark against an exam.
private struct AddGradeView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    let subject: Subject
    let exam: Exam

    @State private var title = ""
    @State private var kind: GradeKind = .exam
    @State private var score = ""
    @State private var weightPercent = 100.0

    private var parsedScore: Double? { Double(score.replacingOccurrences(of: ",", with: ".")) }

    var body: some View {
        NavigationStack {
            Form {
                Section("Mark") {
                    TextField("Title", text: $title)
                    Picker("Kind", selection: $kind) {
                        ForEach(GradeKind.allCases) { Text($0.label).tag($0) }
                    }
                    TextField("Score (\(subject.gradingScale.label))", text: $score)
                        .keyboardType(.decimalPad)
                }
                Section("Weight") {
                    Slider(value: $weightPercent, in: 0...100, step: 5) { Text("Weight") }
                        minimumValueLabel: { Text("0%") } maximumValueLabel: { Text("100%") }
                    Text("\(Int(weightPercent))% of the subject grade")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Mark · \(exam.title)")
            .navigationBarTitleDisplayMode(.inline)
            .tint(Theme.brand)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }.disabled(parsedScore == nil)
                }
            }
        }
    }

    private func save() {
        guard let parsedScore else { return }
        let name = title.trimmingCharacters(in: .whitespaces)
        let entry = GradeEntry(title: name.isEmpty ? exam.title : name,
                               kind: kind, score: parsedScore, weight: weightPercent / 100,
                               subject: subject, examId: exam.id)
        context.insert(entry)
        SyncService.shared.requestSync(context: context)
        dismiss()
    }
}

#Preview {
    NavigationStack {
        SubjectGradesView(subject: PreviewData.container.mainContext.firstSubject())
    }
    .modelContainer(PreviewData.container)
}
