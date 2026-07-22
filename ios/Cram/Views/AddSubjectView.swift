import SwiftUI
import SwiftData

/// Modal form for creating **or editing** a subject, with a grading scale and optional target.
struct AddSubjectView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Query(sort: \Program.sortIndex) private var programs: [Program]
    @Query(sort: \Semester.sortIndex) private var semesters: [Semester]

    @State private var name = ""
    // Seeds from the Profile default; the user can still change it per subject here.
    @State private var scale: GradingScale = .preferredDefault
    @State private var hasTarget = false
    @State private var targetGrade = ""
    @State private var selectedProgram: Program?
    @State private var semester: Semester?
    @State private var loaded = false

    /// Show the Program → Semester pickers when placing freely (top-level create) or editing (to move
    /// it); hide them when creating inside a semester you're already in.
    private var showParents: Bool { editing != nil || preselectedSemester == nil }
    /// Semesters filtered to the chosen program (the cascade).
    private var semesterOptions: [Semester] { semesters.filter { $0.program == selectedProgram } }

    /// When created from inside a semester, that term is preselected.
    var preselectedSemester: Semester? = nil
    /// When editing an existing subject, its fields are prefilled and Save mutates it in place.
    var editing: Subject? = nil

    private var trimmedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name)
                } header: {
                    Text("Subject")
                } footer: {
                    Text("Add exams to this subject next — each exam holds its own cards and quiz.")
                }
                if showParents {
                    Section("Place") {
                        Picker("Program", selection: $selectedProgram) {
                            Text("No program").tag(Program?.none)
                            ForEach(programs) { p in Text(p.name).tag(Program?.some(p)) }
                        }
                        Picker("Semester", selection: $semester) {
                            Text("Unassigned").tag(Semester?.none)
                            ForEach(semesterOptions) { term in
                                Text(term.name).tag(Semester?.some(term))
                            }
                        }
                    }
                }
                Section("Grading") {
                    Picker("Scale", selection: $scale) {
                        ForEach(GradingScale.allCases) { Text($0.label).tag($0) }
                    }
                    Toggle("Set a target grade", isOn: $hasTarget)
                    if hasTarget {
                        TextField("Target", text: $targetGrade)
                            .keyboardType(.decimalPad)
                    }
                }
            }
            .navigationTitle(editing == nil ? "New Subject" : "Edit Subject")
            .navigationBarTitleDisplayMode(.inline)
            .tint(Theme.brand)
            .onAppear(perform: load)
            // Cascade: changing the program clears a semester that no longer belongs to it.
            .onChange(of: selectedProgram) { _, _ in
                if semester?.program != selectedProgram { semester = nil }
            }
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

    private func load() {
        guard !loaded else { return }
        loaded = true
        if let editing {
            name = editing.name
            scale = editing.gradingScale
            semester = editing.semester
            selectedProgram = editing.semester?.program
            if let target = editing.targetGrade {
                hasTarget = true
                targetGrade = target == target.rounded() ? String(Int(target)) : String(target)
            }
        } else {
            semester = preselectedSemester
            selectedProgram = preselectedSemester?.program
        }
    }

    private func save() {
        let target = hasTarget ? Double(targetGrade.replacingOccurrences(of: ",", with: ".")) : nil
        if let editing {
            editing.name = trimmedName
            editing.gradingScale = scale
            editing.targetGrade = target
            editing.semester = semester
            editing.touch()
        } else {
            let subject = Subject(name: trimmedName, gradingScale: scale, targetGrade: target)
            subject.semester = semester
            context.insert(subject)
        }
        SyncService.shared.requestSync(context: context)
        dismiss()
    }
}

#Preview {
    AddSubjectView()
        .modelContainer(PreviewData.container)
}
