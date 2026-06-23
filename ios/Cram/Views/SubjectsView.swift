import SwiftUI
import SwiftData

/// The home tab: your subjects, each showing days-to-exam and current grade.
struct SubjectsView: View {
    @Environment(\.modelContext) private var context
    @Environment(AuthManager.self) private var auth
    @Query(sort: \Subject.createdAt) private var subjects: [Subject]
    @State private var showingAddSubject = false
    /// Observed (singleton) so the toolbar reflects sync progress / last-synced time.
    @State private var sync = SyncService.shared

    var body: some View {
        NavigationStack {
            Group {
                if subjects.isEmpty {
                    ContentUnavailableView(
                        "No subjects yet",
                        systemImage: "books.vertical",
                        description: Text("Add a subject and some material to start studying."))
                } else {
                    List {
                        ForEach(subjects) { subject in
                            NavigationLink {
                                SubjectDetailView(subject: subject)
                            } label: {
                                SubjectRow(subject: subject)
                            }
                        }
                        .onDelete(perform: deleteSubjects)
                    }
                    .refreshable { await sync.sync(context: context) }
                }
            }
            .navigationTitle("Subjects")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showingAddSubject = true } label: { Image(systemName: "plus") }
                }
                if auth.isConfigured {
                    ToolbarItem(placement: .topBarTrailing) {
                        SyncStatusBadge(sync: sync) {
                            Task { await sync.sync(context: context) }
                        }
                    }
                }
                if auth.isConfigured {
                    ToolbarItem(placement: .topBarLeading) {
                        Menu {
                            if case let .signedIn(email) = auth.state, let email {
                                Text(email)
                            }
                            Button(role: .destructive) {
                                Task { await auth.signOut() }
                            } label: {
                                Label("Sign Out", systemImage: "rectangle.portrait.and.arrow.right")
                            }
                        } label: {
                            Image(systemName: "person.crop.circle")
                        }
                    }
                }
            }
            .sheet(isPresented: $showingAddSubject) {
                AddSubjectView()
            }
        }
    }

    private func deleteSubjects(at offsets: IndexSet) {
        // Tombstone (not hard-delete) so the deletion propagates to the backend on the next sync.
        for index in offsets { subjects[index].softDelete() }
        sync.requestSync(context: context)
    }
}

/// Compact sync indicator for the toolbar: a spinner while syncing, a warning that retries on tap
/// when the last sync failed, and a quiet checkmark otherwise.
private struct SyncStatusBadge: View {
    let sync: SyncService
    let retry: () -> Void

    var body: some View {
        switch sync.state {
        case .syncing:
            ProgressView()
        case .error:
            Button(action: retry) {
                Image(systemName: "exclamationmark.arrow.triangle.2.circlepath")
                    .foregroundStyle(.orange)
            }
            .accessibilityLabel("Sync failed — tap to retry")
        case .idle:
            Button(action: retry) {
                Image(systemName: "checkmark.icloud").foregroundStyle(.secondary)
            }
            .accessibilityLabel("Synced — tap to sync now")
        }
    }
}

private struct SubjectRow: View {
    let subject: Subject

    private var dueCount: Int {
        subject.cards.filter { $0.isDue() }.count
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(subject.name).font(.headline)
            HStack(spacing: 12) {
                if let days = subject.daysUntilExam {
                    Label(days >= 0 ? "\(days)d to exam" : "exam passed",
                          systemImage: "calendar")
                }
                if let grade = subject.currentGrade {
                    Label(GradeFormat.string(grade, scale: subject.gradingScale),
                          systemImage: "graduationcap")
                }
                if dueCount > 0 {
                    Label("\(dueCount) due", systemImage: "rectangle.stack")
                        .foregroundStyle(.tint)
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}

#Preview {
    SubjectsView()
        .modelContainer(PreviewData.container)
        .environment(AuthManager.shared)
}
