import SwiftUI
import SwiftData

/// App root. When Supabase auth is configured, gates the app behind sign-in (the v0.5 backend
/// requires a Supabase JWT). When it isn't configured, the app runs unauthenticated on the offline
/// stub path — no login is shown, so local development needs no Supabase setup.
struct RootView: View {
    @Environment(AuthManager.self) private var auth

    var body: some View {
        if !auth.isConfigured {
            MainTabView()
        } else {
            switch auth.state {
            case .loading:
                ProgressView()
            case .signedOut:
                LoginView()
            case .signedIn:
                MainTabView()
            }
        }
    }
}

/// The signed-in app: studying happens per-subject, so the primary tab is the subjects list.
struct MainTabView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        TabView {
            SubjectsView()
                .tabItem { Label("Subjects", systemImage: "books.vertical") }
            ProgressOverviewView()
                .tabItem { Label("Progress", systemImage: "chart.bar.xaxis") }
        }
        // Initial sync (and a local-cache wipe if a different user signed in) when the signed-in
        // app appears; a foreground re-sync on each return to active.
        .task { await SyncService.shared.onSignedIn(context: context) }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { SyncService.shared.requestSync(context: context) }
        }
    }
}

#Preview {
    MainTabView()
        .modelContainer(PreviewData.container)
        .environment(AuthManager.shared)
}
