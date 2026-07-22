import SwiftUI
import SwiftData

/// App-level navigation coordinator. Its main job: let the **Subjects** tab hand a study session over
/// to the **Study** tab (studying only happens there). Injected into the environment by `CramApp`.
@MainActor
@Observable
final class AppRouter {
    /// Selected bottom-tab index. Study is tab index 2 (see `MainTabView`).
    var selectedTab: Int = 0
    /// When set, the Study tab deep-links to this exam's study hub, then clears it.
    var pendingStudyExam: Exam?

    static let studyTabIndex = 2

    /// Jump to the Study tab and open this exam's study hub.
    func study(_ exam: Exam) {
        pendingStudyExam = exam
        selectedTab = Self.studyTabIndex
    }
}
