import SwiftUI
import SwiftData

/// The **Subjects-tab** subject leaf: focused on your **knowledge progress**. An identity header with
/// overall mastery, then the exams — each showing how much you've mastered and whether it has material
/// to learn. Tapping an exam opens its materials/progress; studying happens on the Study tab. Grades
/// live on the Grades tab.
struct SubjectDetailView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss
    @Bindable var subject: Subject

    @State private var showingAddExam = false
    @State private var showingEditSubject = false
    @State private var editingExam: Exam?

    private var upcoming: [Exam] { subject.upcomingExams }
    private var past: [Exam] { subject.pastExams }
    private var dueTotal: Int { subject.dueCount }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.lg) {
                header
                examsSection
            }
            .padding(Space.md)
        }
        .background(CanvasBackground())
        .navigationTitle(subject.name)
        .navigationBarTitleDisplayMode(.inline)
        .task { SyncService.shared.requestSync(context: context) }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { showingAddExam = true } label: { Image(systemName: "plus") }
                    .tint(Theme.brand)
            }
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button { showingEditSubject = true } label: { Label("Edit subject", systemImage: "pencil") }
                    Button(role: .destructive) { deleteSubject() } label: { Label("Delete subject", systemImage: "trash") }
                } label: { Image(systemName: "ellipsis.circle") }
                .tint(Theme.brand)
            }
        }
        .sheet(isPresented: $showingAddExam) { AddExamView(subject: subject) }
        .sheet(isPresented: $showingEditSubject) { AddSubjectView(editing: subject) }
        .sheet(item: $editingExam) { AddExamView(subject: subject, editing: $0) }
    }

    private func deleteSubject() {
        subject.softDelete()
        SyncService.shared.requestSync(context: context)
        dismiss()
    }

    // MARK: - Header (progress)

    private var header: some View {
        Panel {
            VStack(alignment: .leading, spacing: Space.md) {
                HStack(spacing: Space.sm) {
                    MonogramTile(subject: subject, size: 52)
                    VStack(alignment: .leading, spacing: 5) {
                        Text(subject.name).font(.title3.weight(.bold)).tracking(-0.3)
                            .foregroundStyle(Theme.ink).lineLimit(2)
                        if let next = subject.nextExam {
                            CountdownPill(days: next.daysUntilExam)
                        } else {
                            Badge(text: "No upcoming exam", tone: .neutral, systemImage: "calendar")
                        }
                    }
                    Spacer()
                    ReadinessRing(value: subject.readiness, verdict: subject.verdict, size: 64)
                }
                HStack(spacing: Space.sm) {
                    miniStat("\(subject.activeExams.count)", "Exams")
                    miniStat("\(dueTotal)", "Due", tone: dueTotal == 0 ? Theme.ink : Theme.brand)
                    miniStat(subject.readiness.map { "\(Int($0 * 100))%" } ?? "—", "Mastered")
                }
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

    // MARK: - Exams

    private var examsSection: some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            SectionHeader(title: "Exams", actionTitle: "Add") { showingAddExam = true }
            if subject.activeExams.isEmpty {
                Panel {
                    VStack(alignment: .leading, spacing: Space.xs) {
                        Text("No exams yet").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink)
                        Text("Add an exam, then add material to it and Cram generates the cards and quiz to study.")
                            .font(.caption).foregroundStyle(Theme.ink2)
                            .fixedSize(horizontal: false, vertical: true)
                        Button { showingAddExam = true } label: { Label("Add an exam", systemImage: "plus") }
                            .buttonStyle(SecondaryButtonStyle())
                            .padding(.top, Space.xxs)
                    }
                }
            } else {
                VStack(spacing: Space.xs) {
                    ForEach(upcoming) { exam in examLink(exam) }
                }
                if !past.isEmpty {
                    Text("Past exams").font(.caption.weight(.semibold)).foregroundStyle(Theme.muted)
                        .padding(.top, Space.xs)
                    VStack(spacing: Space.xs) {
                        ForEach(past) { exam in examLink(exam) }
                    }
                }
            }
        }
    }

    private func examLink(_ exam: Exam) -> some View {
        NavigationLink {
            ExamMaterialsView(scope: StudyScope(subject: subject, exam: exam))
        } label: {
            ExamProgressRow(exam: exam)
        }
        .buttonStyle(PressableCardStyle())
        .contextMenu {
            Button { editingExam = exam } label: { Label("Edit exam", systemImage: "pencil") }
            Button(role: .destructive) { delete(exam) } label: { Label("Delete exam", systemImage: "trash") }
        }
    }

    private func delete(_ exam: Exam) {
        exam.softDelete()
        SyncService.shared.requestSync(context: context)
    }
}

/// A subject-detail exam row focused on progress: mastery ring, and whether it has material to learn.
private struct ExamProgressRow: View {
    let exam: Exam

    private var cardCount: Int { exam.cards.filter { $0.deletedAt == nil }.count }
    private var hasMaterial: Bool { cardCount > 0 }

    var body: some View {
        Panel(padding: Space.sm) {
            HStack(spacing: Space.sm) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(exam.title).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.ink).lineLimit(1)
                    HStack(spacing: 6) {
                        if hasMaterial {
                            Badge(text: "\(cardCount) card\(cardCount == 1 ? "" : "s")", tone: .neutral, systemImage: "rectangle.stack.fill")
                        } else {
                            Badge(text: "No material", tone: .warning, systemImage: "tray")
                        }
                        CountdownPill(days: exam.daysUntilExam)
                    }
                }
                Spacer(minLength: Space.xs)
                ReadinessRing(value: exam.readiness, verdict: exam.verdict, size: 46, lineWidth: 5)
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Theme.muted)
            }
        }
    }
}

#Preview {
    NavigationStack {
        SubjectDetailView(subject: PreviewData.container.mainContext.firstSubject())
    }
    .modelContainer(PreviewData.container)
    .environment(AppRouter())
}
