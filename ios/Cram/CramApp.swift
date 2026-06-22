import SwiftUI
import SwiftData

@main
struct CramApp: App {
    /// App-wide Supabase auth state (see `AuthManager`). Injected into the environment so any view
    /// can read the session; `bootstrap()` restores a persisted session at launch.
    @State private var auth = AuthManager.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(auth)
                .task { await auth.bootstrap() }
        }
        .modelContainer(for: [
            Subject.self,
            Source.self,
            Card.self,
            Quiz.self,
            Question.self,
            Attempt.self,
            GradeEntry.self,
            ReviewLog.self,
        ])
    }
}
