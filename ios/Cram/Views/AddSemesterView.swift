import SwiftUI
import SwiftData

/// Modal for creating **or editing** a term. Local-only (see `Semester`) — no sync.
struct AddSemesterView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Query(sort: \Program.sortIndex) private var programs: [Program]
    /// The sort index to give the new term (usually one below the current top so it lands first).
    var topSortIndex: Int = 0
    var preselectedProgram: Program? = nil
    /// When editing an existing term, its fields are prefilled and Save mutates it in place.
    var editing: Semester? = nil

    @State private var name = ""
    @State private var program: Program?
    @State private var loaded = false

    private var trimmed: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name)
                } header: {
                    Text("Semester")
                } footer: {
                    Text("Group your subjects by term. You can file subjects under it next.")
                }
                // Shown when placing freely (top-level create) or editing (to move it); hidden when
                // creating inside a program you're already in.
                if !programs.isEmpty, editing != nil || preselectedProgram == nil {
                    Section("Program") {
                        Picker("Program", selection: $program) {
                            Text("Unassigned").tag(Program?.none)
                            ForEach(programs) { p in Text(p.name).tag(Program?.some(p)) }
                        }
                    }
                }
            }
            .onAppear {
                guard !loaded else { return }
                loaded = true
                if let editing { name = editing.name; program = editing.program }
                else { program = preselectedProgram }
            }
            .navigationTitle(editing == nil ? "New Semester" : "Edit Semester")
            .navigationBarTitleDisplayMode(.inline)
            .tint(Theme.brand)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }.disabled(trimmed.isEmpty)
                }
            }
        }
    }

    private func save() {
        if let editing {
            editing.name = trimmed
            editing.program = program
        } else {
            let term = Semester(name: trimmed, sortIndex: topSortIndex - 1)
            term.program = program
            context.insert(term)
        }
        dismiss()
    }
}
