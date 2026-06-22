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
    var body: some View {
        TabView {
            SubjectsView()
                .tabItem { Label("Subjects", systemImage: "books.vertical") }
            ProgressOverviewView()
                .tabItem { Label("Progress", systemImage: "chart.bar.xaxis") }
        }
    }
}

#Preview {
    MainTabView()
        .modelContainer(PreviewData.container)
        .environment(AuthManager.shared)
}
