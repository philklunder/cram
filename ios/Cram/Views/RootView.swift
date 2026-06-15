import SwiftUI
import SwiftData

/// Top-level tabs. Studying happens per-subject, so the primary tab is the subjects list.
struct RootView: View {
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
    RootView()
        .modelContainer(PreviewData.container)
}
