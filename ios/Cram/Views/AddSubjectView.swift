import SwiftUI
import SwiftData

/// Modal form for creating a subject, with an optional exam date and grading scale.
struct AddSubjectView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var hasExam = true
    @State private var examDate = Calendar.current.date(byAdding: .day, value: 14, to: .now) ?? .now
    @State private var scale: GradingScale = .german
    @State private var hasTarget = false
    @State private var targetGrade = ""

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Subject") {
                    TextField("Name (e.g. Biology)", text: $name)
                }
                Section("Exam") {
                    Toggle("Has an exam date", isOn: $hasExam)
                    if hasExam {
                        DatePicker("Exam date", selection: $examDate, displayedComponents: .date)
                    }
                }
                Section("Grading") {
                    Picker("Scale", selection: $scale) {
                        ForEach(GradingScale.allCases) { Text($0.label).tag($0) }
                    }
                    Toggle("Set a target grade", isOn: $hasTarget)
                    if hasTarget {
                        TextField("Target (e.g. 1.7)", text: $targetGrade)
                            .keyboardType(.decimalPad)
                    }
                }
            }
            .navigationTitle("New Subject")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }.disabled(trimmedName.isEmpty)
                }
            }
        }
    }

    private func save() {
        let subject = Subject(
            name: trimmedName,
            examDate: hasExam ? examDate : nil,
            gradingScale: scale,
            targetGrade: hasTarget ? Double(targetGrade.replacingOccurrences(of: ",", with: ".")) : nil)
        context.insert(subject)
        SyncService.shared.requestSync(context: context)
        dismiss()
    }
}

#Preview {
    AddSubjectView()
        .modelContainer(PreviewData.container)
}
