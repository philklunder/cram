import SwiftUI
import SwiftData

/// Which tab's purpose a hierarchy screen serves. The drill-down (Program → Semester → Subject) is
/// shared; the **face** decides what each row emphasises and where a subject leads.
enum StudyFace {
    case subjects   // knowledge progress; create structure + materials; studying redirects to Study
    case grades     // grade quality + averages; create structure + record marks
    case study      // the only place to run Review / Flashcards / Quiz

    var title: String {
        switch self {
        case .subjects: "Subjects"
        case .grades:   "Grades"
        case .study:    "Study"
        }
    }
    /// Structure (program/semester/subject) can be created from Subjects and Grades, not Study.
    var canCreate: Bool { self != .study }
}

/// The leading rail colour for a row on a given face: grade quality on Grades, recall verdict elsewhere.
func railColor(_ face: StudyFace, grade: Double?, scale: GradingScale, mastery: Double?) -> Color {
    switch face {
    case .grades: return GradeQuality.color(strength: grade.map { scale.strength(for: $0) })
    case .subjects, .study: return ReadinessVerdict.of(mastery).color
    }
}

/// The trailing metric for a row: a grade (Grades), a mastery ring (Subjects), or due/verdict (Study).
struct FaceMetric: View {
    let face: StudyFace
    var grade: Double? = nil
    var scale: GradingScale = .preferredDefault
    var mastery: Double? = nil
    var due: Int = 0

    var body: some View {
        switch face {
        case .grades:
            GradeValue(score: grade, scale: scale, font: .figure(.headline, .semibold))
        case .subjects:
            ReadinessRing(value: mastery, verdict: .of(mastery), size: 46, lineWidth: 5)
        case .study:
            if due > 0 {
                Badge(text: "\(due) due", tone: .brand, systemImage: "rectangle.stack.fill")
            } else {
                Text(ReadinessVerdict.of(mastery).label)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(ReadinessVerdict.of(mastery).color)
            }
        }
    }
}

/// A generic hierarchy row: leading quality rail, optional monogram, title + subtitle, trailing metric.
struct HierarchyRow<Trailing: View>: View {
    let rail: Color
    var monogram: Subject? = nil
    let title: String
    let subtitle: String
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        Panel(padding: Space.sm) {
            HStack(spacing: Space.sm) {
                GradeRail(color: rail, height: monogram == nil ? 40 : 44)
                if let monogram { MonogramTile(subject: monogram, size: 40) }
                VStack(alignment: .leading, spacing: 3) {
                    Text(title).font(monogram == nil ? .headline : .subheadline.weight(.semibold))
                        .tracking(-0.2).foregroundStyle(Theme.ink).lineLimit(1)
                    Text(subtitle).font(.caption).foregroundStyle(Theme.ink2)
                }
                Spacer(minLength: Space.xs)
                trailing()
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Theme.muted)
            }
        }
    }
}

// MARK: - Root (tab entry)

/// The tab root for Subjects / Grades / Study: the list of programs, plus loose "No program" semesters
/// and "Unassigned" subjects so nothing is ever stranded.
struct ProgramsRootView: View {
    @Environment(\.modelContext) private var context
    @Environment(AuthManager.self) private var auth
    @Environment(AppRouter.self) private var router
    let face: StudyFace

    @Query(sort: \Program.sortIndex) private var programs: [Program]
    @Query(sort: \Semester.sortIndex) private var semesters: [Semester]
    @Query(filter: #Predicate<Subject> { $0.deletedAt == nil }, sort: \Subject.createdAt)
    private var subjects: [Subject]

    @State private var addKind: AddKind?
    @State private var sync = SyncService.shared
    @State private var studyPath: [Exam] = []
    @State private var editingProgram: Program?
    @State private var editingSemester: Semester?
    @State private var editingSubject: Subject?

    private var looseSemesters: [Semester] { semesters.filter { $0.program == nil } }
    private var looseSubjects: [Subject] { subjects.filter { $0.semester == nil } }
    private var isEmpty: Bool { programs.isEmpty && semesters.isEmpty && subjects.isEmpty }
    private var overall: (value: Double, scale: GradingScale)? { Grades.overall(subjects) }

    var body: some View {
        NavigationStack(path: $studyPath) {
            Group {
                if isEmpty {
                    emptyState
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: Space.sm) {
                            ForEach(programs) { program in
                                NavigationLink { ProgramDetailView(program: program, face: face) } label: {
                                    programRow(program)
                                }
                                .buttonStyle(PressableCardStyle())
                                .contextMenu {
                                    if face.canCreate {
                                        editButton { editingProgram = program }
                                        deleteButton { context.delete(program) }
                                    }
                                }
                            }

                            if !looseSemesters.isEmpty {
                                SectionHeader(title: programs.isEmpty ? "Semesters" : "No program").padding(.top, Space.xs)
                                ForEach(looseSemesters) { term in
                                    NavigationLink { SemesterDetailView(semester: term, face: face) } label: {
                                        semesterRow(term)
                                    }
                                    .buttonStyle(PressableCardStyle())
                                    .contextMenu {
                                        if face.canCreate {
                                            editButton { editingSemester = term }
                                            deleteButton { context.delete(term) }
                                        }
                                    }
                                }
                            }

                            if !looseSubjects.isEmpty {
                                SectionHeader(title: "Unassigned").padding(.top, Space.xs)
                                ForEach(looseSubjects) { subject in
                                    subjectLink(subject)
                                }
                            }

                            if face == .grades, let overall {
                                AverageBar(value: overall.value, scale: overall.scale, label: "Overall average")
                                    .padding(.top, Space.md)
                            }
                        }
                        .padding(Space.md)
                    }
                    .refreshable { await sync.sync(context: context) }
                }
            }
            .navigationDestination(for: Exam.self) { exam in
                if let subject = exam.subject { ExamView(scope: StudyScope(subject: subject, exam: exam)) }
            }
            .background(CanvasBackground())
            .navigationTitle(face.title)
            .toolbar { toolbar }
            .sheet(item: $addKind) { kind in kind.sheet(topProgram: programs.map(\.sortIndex).min() ?? 0,
                                                          topSemester: semesters.map(\.sortIndex).min() ?? 0) }
            .sheet(item: $editingProgram) { AddProgramView(editing: $0) }
            .sheet(item: $editingSemester) { AddSemesterView(editing: $0) }
            .sheet(item: $editingSubject) { AddSubjectView(editing: $0) }
        }
        .onChange(of: router.pendingStudyExam) { _, exam in
            guard face == .study, let exam else { return }
            studyPath = [exam]
            router.pendingStudyExam = nil
        }
    }

    // MARK: Rows

    private func programRow(_ program: Program) -> some View {
        HierarchyRow(rail: railColor(face, grade: program.average, scale: program.scale, mastery: program.mastery),
                     title: program.name,
                     subtitle: "\(program.activeSemesters.count) semester\(program.activeSemesters.count == 1 ? "" : "s")") {
            FaceMetric(face: face, grade: program.average, scale: program.scale, mastery: program.mastery,
                       due: program.allSubjects.reduce(0) { $0 + $1.dueCount })
        }
    }
    private func semesterRow(_ term: Semester) -> some View {
        HierarchyRow(rail: railColor(face, grade: term.average, scale: term.scale, mastery: term.mastery),
                     title: term.name,
                     subtitle: "\(term.activeSubjects.count) subject\(term.activeSubjects.count == 1 ? "" : "s")") {
            FaceMetric(face: face, grade: term.average, scale: term.scale, mastery: term.mastery,
                       due: term.activeSubjects.reduce(0) { $0 + $1.dueCount })
        }
    }

    @ViewBuilder private func subjectLink(_ subject: Subject) -> some View {
        NavigationLink { subjectLeaf(subject, face: face) } label: {
            SubjectHierarchyRow(subject: subject, face: face)
        }
        .buttonStyle(PressableCardStyle())
        .contextMenu {
            if face.canCreate {
                editButton { editingSubject = subject }
                deleteButton { subject.softDelete(); sync.requestSync(context: context) }
            }
        }
    }

    // MARK: Chrome

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        if face.canCreate {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button { addKind = .program } label: { Label("New Program", systemImage: "graduationcap") }
                    Button { addKind = .semester(nil) } label: { Label("New Semester", systemImage: "calendar") }
                    Button { addKind = .subject(nil) } label: { Label("New Subject", systemImage: "book.closed") }
                } label: { Image(systemName: "plus") }
                .tint(Theme.brand)
            }
        }
        if auth.isConfigured {
            ToolbarItem(placement: .topBarTrailing) {
                SyncStatusBadge(sync: sync) { Task { await sync.sync(context: context) } }
            }
        }
    }

    private var emptyState: some View {
        EmptyStateView(
            title: face == .grades ? "No grades yet" : face == .study ? "Nothing to study yet" : "No subjects yet",
            message: face == .study
                ? "Add a program, subjects and material in the Subjects tab, then study them here."
                : "Start with a program, then add semesters and subjects under it.",
            systemImage: face == .grades ? "chart.bar.fill" : face == .study ? "brain.head.profile" : "books.vertical.fill",
            actionTitle: face.canCreate ? "New program" : nil) { addKind = .program }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// A subject row that adapts its subtitle/metric to the face (progress vs grade vs study).
struct SubjectHierarchyRow: View {
    let subject: Subject
    let face: StudyFace

    var body: some View {
        HierarchyRow(rail: railColor(face, grade: subject.currentGrade, scale: subject.gradingScale, mastery: subject.readiness),
                     monogram: subject,
                     title: subject.name,
                     subtitle: subtitle) {
            FaceMetric(face: face, grade: subject.currentGrade, scale: subject.gradingScale,
                       mastery: subject.readiness, due: subject.dueCount)
        }
    }

    private var subtitle: String {
        switch face {
        case .grades:
            let n = subject.grades.filter { $0.deletedAt == nil }.count
            return "\(n) mark\(n == 1 ? "" : "s") recorded"
        case .subjects:
            let exams = subject.activeExams.count
            let withMat = subject.activeExams.filter { !$0.cards.filter { $0.deletedAt == nil }.isEmpty }.count
            if exams == 0 { return "No exams yet" }
            return "\(withMat)/\(exams) exam\(exams == 1 ? "" : "s") with material"
        case .study:
            return studySubtitle(subject)
        }
    }
}

/// Route a subject to its leaf screen for the given face.
@ViewBuilder
func subjectLeaf(_ subject: Subject, face: StudyFace) -> some View {
    switch face {
    case .subjects: SubjectDetailView(subject: subject)
    case .grades:   SubjectGradesView(subject: subject)
    case .study:    SubjectStudyView(subject: subject)
    }
}

// MARK: - Program detail (semesters)

struct ProgramDetailView: View {
    @Environment(\.modelContext) private var context
    let program: Program
    let face: StudyFace
    @State private var addingSemester = false
    @State private var editingSemester: Semester?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.sm) {
                if program.activeSemesters.isEmpty {
                    Panel {
                        Text("No semesters yet. Add one to file your subjects under it.")
                            .font(.subheadline).foregroundStyle(Theme.ink2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                } else {
                    ForEach(program.activeSemesters) { term in
                        NavigationLink { SemesterDetailView(semester: term, face: face) } label: {
                            HierarchyRow(rail: railColor(face, grade: term.average, scale: term.scale, mastery: term.mastery),
                                         title: term.name,
                                         subtitle: "\(term.activeSubjects.count) subject\(term.activeSubjects.count == 1 ? "" : "s")") {
                                FaceMetric(face: face, grade: term.average, scale: term.scale, mastery: term.mastery,
                                           due: term.activeSubjects.reduce(0) { $0 + $1.dueCount })
                            }
                        }
                        .buttonStyle(PressableCardStyle())
                        .contextMenu {
                            if face.canCreate {
                                editButton { editingSemester = term }
                                deleteButton { context.delete(term) }
                            }
                        }
                    }
                    if face == .grades, let avg = program.average {
                        AverageBar(value: avg, scale: program.scale).padding(.top, Space.md)
                    }
                }
            }
            .padding(Space.md)
        }
        .background(CanvasBackground())
        .navigationTitle(program.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if face.canCreate {
                ToolbarItem(placement: .primaryAction) {
                    Button { addingSemester = true } label: { Image(systemName: "plus") }.tint(Theme.brand)
                }
            }
        }
        .sheet(isPresented: $addingSemester) {
            AddSemesterView(topSortIndex: program.semesters.map(\.sortIndex).min() ?? 0, preselectedProgram: program)
        }
        .sheet(item: $editingSemester) { AddSemesterView(editing: $0) }
    }
}

// MARK: - Semester detail (subjects)

struct SemesterDetailView: View {
    @Environment(\.modelContext) private var context
    let semester: Semester
    let face: StudyFace
    @State private var addingSubject = false
    @State private var editingSubject: Subject?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.sm) {
                if semester.activeSubjects.isEmpty {
                    Panel {
                        VStack(alignment: .leading, spacing: Space.xs) {
                            Text("No subjects yet").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
                            Text("Add a subject to this semester.").font(.caption).foregroundStyle(Theme.ink2)
                            if face.canCreate {
                                Button { addingSubject = true } label: { Label("Add a subject", systemImage: "plus") }
                                    .buttonStyle(SecondaryButtonStyle()).padding(.top, Space.xxs)
                            }
                        }
                    }
                } else {
                    ForEach(semester.activeSubjects) { subject in
                        NavigationLink { subjectLeaf(subject, face: face) } label: {
                            SubjectHierarchyRow(subject: subject, face: face)
                        }
                        .buttonStyle(PressableCardStyle())
                        .contextMenu {
                            if face.canCreate {
                                editButton { editingSubject = subject }
                                deleteButton { deleteSubject(subject) }
                            }
                        }
                    }
                    if face == .grades, let avg = semester.average {
                        AverageBar(value: avg, scale: semester.scale).padding(.top, Space.md)
                    }
                }
            }
            .padding(Space.md)
        }
        .background(CanvasBackground())
        .navigationTitle(semester.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if face.canCreate {
                ToolbarItem(placement: .primaryAction) {
                    Button { addingSubject = true } label: { Image(systemName: "plus") }.tint(Theme.brand)
                }
            }
        }
        .sheet(isPresented: $addingSubject) { AddSubjectView(preselectedSemester: semester) }
        .sheet(item: $editingSubject) { AddSubjectView(editing: $0) }
    }

    private func deleteSubject(_ subject: Subject) {
        subject.softDelete()
        SyncService.shared.requestSync(context: context)
    }
}

// MARK: - Study leaf (subject → exams → study hub)

/// The Study-tab subject leaf: the subject's study scopes (each exam's deck + a General bucket),
/// opening the study hub where Review / Flashcards / Quiz live.
struct SubjectStudyView: View {
    let subject: Subject

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.sm) {
                if subject.studyScopes.isEmpty {
                    EmptyStateView(
                        title: "Nothing to study",
                        message: "This subject has no material yet. Add exams and material to it in the Subjects tab.",
                        systemImage: "brain.head.profile")
                    .frame(maxWidth: .infinity)
                    .padding(.top, Space.xl)
                } else {
                    ForEach(subject.studyScopes) { scope in
                        NavigationLink { ExamView(scope: scope) } label: {
                            HierarchyRow(rail: ReadinessVerdict.of(scope.readiness).color,
                                         title: scope.title,
                                         subtitle: scope.dueCards.isEmpty ? "\(scope.cards.count) card\(scope.cards.count == 1 ? "" : "s")"
                                                                          : "\(scope.dueCards.count) due now") {
                                FaceMetric(face: .study, mastery: scope.readiness, due: scope.dueCards.count)
                            }
                        }
                        .buttonStyle(PressableCardStyle())
                    }
                }
            }
            .padding(Space.md)
        }
        .background(CanvasBackground())
        .navigationTitle(subject.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Add sheet routing

private enum AddKind: Identifiable {
    case program
    case semester(Program?)
    case subject(Semester?)

    var id: String {
        switch self {
        case .program: "program"
        case .semester: "semester"
        case .subject: "subject"
        }
    }

    @ViewBuilder func sheet(topProgram: Int, topSemester: Int) -> some View {
        switch self {
        case .program: AddProgramView(topSortIndex: topProgram)
        case .semester(let p): AddSemesterView(topSortIndex: topSemester, preselectedProgram: p)
        case .subject(let s): AddSubjectView(preselectedSemester: s)
        }
    }
}

@ViewBuilder
private func deleteButton(_ action: @escaping () -> Void) -> some View {
    Button(role: .destructive, action: action) { Label("Delete", systemImage: "trash") }
}

@ViewBuilder
private func editButton(_ action: @escaping () -> Void) -> some View {
    Button(action: action) { Label("Edit", systemImage: "pencil") }
}
