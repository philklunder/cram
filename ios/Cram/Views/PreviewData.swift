import Foundation
import SwiftData

/// An in-memory container seeded with a sample subject + deck, for SwiftUI previews.
enum PreviewData {
    @MainActor static let container: ModelContainer = {
        let container = try! ModelContainer(
            for: Subject.self, Source.self, Card.self, Quiz.self,
                 Question.self, Attempt.self, GradeEntry.self, ReviewLog.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true))

        let context = container.mainContext
        let subject = Subject(name: "Biology",
                              examDate: Calendar.current.date(byAdding: .day, value: 12, to: .now),
                              gradingScale: .german,
                              targetGrade: 1.7)
        context.insert(subject)
        context.insert(GradeEntry(title: "Midterm", kind: .exam, score: 2.7, weight: 0.4,
                                  subject: subject))
        DeckIngest.ingest(StubGenerationService.biology, kind: .pdf, into: subject, context: context)
        return container
    }()
}

extension ModelContext {
    /// The first subject in the store — convenience for previews that need a `Subject` instance.
    func firstSubject() -> Subject {
        (try? fetch(FetchDescriptor<Subject>()))?.first ?? Subject(name: "Sample")
    }
}
