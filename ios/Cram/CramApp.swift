import SwiftUI
import SwiftData

@main
struct CramApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
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
