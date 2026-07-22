import Foundation
import SwiftData

/// An in-memory container seeded with a sample subject + deck, for SwiftUI previews.
enum PreviewData {
    @MainActor static let container: ModelContainer = {
        let container = try! ModelContainer(
            for: Program.self, Semester.self, Subject.self, Exam.self, Source.self, Card.self, Quiz.self,
                 Question.self, Attempt.self, GradeEntry.self, ReviewLog.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true))

        let context = container.mainContext
        let program = Program(name: "Informatik EFZ", sortIndex: 0)
        context.insert(program)
        let term = Semester(name: "6. Semester 2026", sortIndex: 0)
        term.program = program
        context.insert(term)
        let subject = Subject(name: "Biology", gradingScale: .swiss, targetGrade: 5.0)
        subject.semester = term
        context.insert(subject)
        let midterm = Exam(title: "Midterm",
                           examDate: Calendar.current.date(byAdding: .day, value: 12, to: .now),
                           subject: subject)
        context.insert(midterm)
        context.insert(GradeEntry(title: "Midterm", kind: .exam, score: 5.3, weight: 0.4,
                                  subject: subject, examId: midterm.id))
        DeckIngest.ingest(StubGenerationService.biology, kind: .pdf,
                          into: subject, exam: midterm, context: context)
        return container
    }()
}

extension ModelContext {
    /// The first subject in the store — convenience for previews that need a `Subject` instance.
    func firstSubject() -> Subject {
        (try? fetch(FetchDescriptor<Subject>()))?.first ?? Subject(name: "Sample")
    }
}
