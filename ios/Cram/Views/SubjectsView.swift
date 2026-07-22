import SwiftUI

/// A subject's study subtitle: due cards, else exam count. Shared by the hierarchy rows.
func studySubtitle(_ subject: Subject) -> String {
    let due = subject.dueCount
    if due > 0 { return "\(due) card\(due == 1 ? "" : "s") due" }
    let exams = subject.activeExams.count
    return "\(exams) exam\(exams == 1 ? "" : "s")"
}

/// Compact sync indicator for the toolbar: a spinner while syncing, a warning that retries on tap
/// when the last sync failed, and a quiet checkmark otherwise.
struct SyncStatusBadge: View {
    let sync: SyncService
    let retry: () -> Void

    var body: some View {
        switch sync.state {
        case .syncing:
            ProgressView()
        case .error:
            Button(action: retry) {
                Image(systemName: "exclamationmark.arrow.triangle.2.circlepath")
                    .foregroundStyle(Theme.warning)
            }
            .accessibilityLabel("Sync failed — tap to retry")
        case .idle:
            Button(action: retry) {
                Image(systemName: "checkmark.icloud").foregroundStyle(Theme.muted)
            }
            .accessibilityLabel("Synced — tap to sync now")
        }
    }
}
