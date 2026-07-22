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
                ZStack {
                    CanvasBackground()
                    ProgressView().tint(Theme.brand)
                }
            case .signedOut:
                LoginView()
            case .signedIn:
                MainTabView()
            }
        }
    }
}

/// The signed-in app. Studying is per-subject, but the home is a **Today** overview that answers
/// "what should I do right now?"; Subjects and Progress round out the bottom tab bar.
struct MainTabView: View {
    @Environment(\.modelContext) private var context
    @Environment(\.scenePhase) private var scenePhase
    @Environment(AppRouter.self) private var router

    var body: some View {
        @Bindable var router = router
        TabView(selection: $router.selectedTab) {
            TodayView()
                .tabItem { Label("Today", systemImage: "sun.max.fill") }.tag(0)
            ProgramsRootView(face: .subjects)
                .tabItem { Label("Subjects", systemImage: "books.vertical.fill") }.tag(1)
            ProgramsRootView(face: .study)
                .tabItem { Label("Study", systemImage: "brain.head.profile") }.tag(2)
            ProgramsRootView(face: .grades)
                .tabItem { Label("Grades", systemImage: "chart.bar.fill") }.tag(3)
            CalendarView()
                .tabItem { Label("Calendar", systemImage: "calendar") }.tag(4)
        }
        .tint(Theme.brand)
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
