import SwiftUI
import SwiftData

/// Modal for adding **or editing** an exam. Creating from inside a subject only asks for the exam's
/// own fields (title + date) — you're already in the right place. Editing also lets you **move** the
/// exam to another subject via a Program → Semester → Subject cascade (its cards/quizzes move with it).
struct AddExamView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Query(sort: \Program.sortIndex) private var programs: [Program]
    @Query(sort: \Semester.sortIndex) private var semesters: [Semester]
    @Query(filter: #Predicate<Subject> { $0.deletedAt == nil }, sort: \Subject.createdAt)
    private var subjects: [Subject]

    let subject: Subject
    /// When editing an existing exam, its fields are prefilled and Save mutates it in place.
    var editing: Exam? = nil

    @State private var title = ""
    @State private var hasDate = true
    @State private var date = Calendar.current.date(byAdding: .day, value: 14, to: .now) ?? .now
    @State private var selectedProgram: Program?
    @State private var selectedSemester: Semester?
    @State private var selectedSubject: Subject?
    @State private var loaded = false

    private var trimmed: String { title.trimmingCharacters(in: .whitespacesAndNewlines) }
    /// The move pickers appear only when editing; creating is always contextual to `subject`.
    private var showParents: Bool { editing != nil }
    private var semesterOptions: [Semester] { semesters.filter { $0.program == selectedProgram } }
    private var subjectOptions: [Subject] { subjects.filter { $0.semester == selectedSemester } }
    private var canSave: Bool { !trimmed.isEmpty && (editing == nil || selectedSubject != nil) }

    var body: some View {
        NavigationStack {
            Form {
                Section("Exam") {
                    TextField("Title", text: $title)
                }
                Section {
                    Toggle("Has a date", isOn: $hasDate)
                    if hasDate {
                        DatePicker("Exam date", selection: $date, displayedComponents: .date)
                    }
                } header: {
                    Text("Date")
                } footer: {
                    Text("The date drives the countdown and paces reviews to finish before it.")
                }
                if showParents {
                    Section("Subject") {
                        Picker("Program", selection: $selectedProgram) {
                            Text("No program").tag(Program?.none)
                            ForEach(programs) { p in Text(p.name).tag(Program?.some(p)) }
                        }
                        Picker("Semester", selection: $selectedSemester) {
                            Text("Unassigned").tag(Semester?.none)
                            ForEach(semesterOptions) { term in Text(term.name).tag(Semester?.some(term)) }
                        }
                        Picker("Subject", selection: $selectedSubject) {
                            Text("Choose…").tag(Subject?.none)
                            ForEach(subjectOptions) { subj in Text(subj.name).tag(Subject?.some(subj)) }
                        }
                    }
                }
            }
            .navigationTitle(editing == nil ? "New Exam" : "Edit Exam")
            .navigationBarTitleDisplayMode(.inline)
            .tint(Theme.brand)
            .onAppear(perform: load)
            .onChange(of: selectedProgram) { _, _ in
                if selectedSemester?.program != selectedProgram { selectedSemester = nil; selectedSubject = nil }
            }
            .onChange(of: selectedSemester) { _, _ in
                if selectedSubject?.semester != selectedSemester { selectedSubject = nil }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }.disabled(!canSave)
                }
            }
        }
    }

    private func load() {
        guard !loaded else { return }
        loaded = true
        guard let editing else { return }
        title = editing.title
        if let d = editing.examDate { hasDate = true; date = d } else { hasDate = false }
        selectedSubject = editing.subject
        selectedSemester = editing.subject?.semester
        selectedProgram = editing.subject?.semester?.program
    }

    private func save() {
        if let editing {
            editing.title = trimmed
            editing.examDate = hasDate ? date : nil
            // Move to another subject if changed — carry its material along.
            if let target = selectedSubject, target != editing.subject {
                editing.subject = target
                for card in editing.cards where card.deletedAt == nil { card.subject = target; card.touch() }
                for quiz in editing.quizzes where quiz.deletedAt == nil { quiz.subject = target; quiz.touch() }
            }
            editing.touch()
        } else {
            context.insert(Exam(title: trimmed, examDate: hasDate ? date : nil, subject: subject))
        }
        SyncService.shared.requestSync(context: context)
        dismiss()
    }
}

#Preview {
    AddExamView(subject: PreviewData.container.mainContext.firstSubject())
        .modelContainer(PreviewData.container)
}
