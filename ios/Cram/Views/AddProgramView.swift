import SwiftUI
import SwiftData

/// Modal for creating a program (top of the hierarchy). Local-only (see `Program`). New programs
/// sort to the top.
struct AddProgramView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    var topSortIndex: Int = 0
    /// When editing an existing program, its name is prefilled and Save renames it.
    var editing: Program? = nil

    @State private var name = ""
    @State private var loaded = false

    private var trimmed: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $name)
                } header: {
                    Text("Program")
                } footer: {
                    Text("What you're doing or where you study. Add semesters under it next.")
                }
            }
            .navigationTitle(editing == nil ? "New Program" : "Edit Program")
            .navigationBarTitleDisplayMode(.inline)
            .tint(Theme.brand)
            .onAppear { if !loaded, let editing { loaded = true; name = editing.name } }
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
        } else {
            context.insert(Program(name: trimmed, sortIndex: topSortIndex - 1))
        }
        dismiss()
    }
}
