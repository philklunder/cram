import Foundation

// MARK: - Generation boundary (ADR 0003)
//
// Generation (material → flashcards + quiz) is treated as a boundary from day one. The local-only
// v1 uses `StubGenerationService` (deterministic fixtures); a `RemoteGenerationService` calling the
// FastAPI backend will be swapped in later with no change to call sites. The Claude key never lives
// in the client.

/// A request to generate study content from a piece of material.
struct GenerationRequest {
    let kind: SourceKind
    let title: String
    /// Subject name, passed so generation can tailor topics. (Real impl also sends the material.)
    let subjectName: String
}

/// Plain (non-persisted) generated content, ready to be ingested into SwiftData.
struct GeneratedDeck {
    var sourceTitle: String
    var cards: [GeneratedCard]
    var questions: [GeneratedQuestion]
}

struct GeneratedCard {
    var front: String
    var back: String
    var topic: String
    var difficulty: Int
}

struct GeneratedQuestion {
    var prompt: String
    var kind: QuestionKind
    var topic: String
    var options: [String]
    var answerKey: String
}

/// Turns source material into flashcards and quiz questions.
protocol GenerationService {
    func generate(_ request: GenerationRequest) async throws -> GeneratedDeck
}
