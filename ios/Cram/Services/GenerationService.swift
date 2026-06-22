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
    /// Subject name, passed so generation can tailor topics.
    let subjectName: String
    /// On-disk URLs of the captured material to upload (PDF or photo pages). The stub ignores
    /// these; `RemoteGenerationService` uploads them. Empty for fixture-only / preview paths.
    let fileURLs: [URL]

    init(kind: SourceKind, title: String, subjectName: String, fileURLs: [URL] = []) {
        self.kind = kind
        self.title = title
        self.subjectName = subjectName
        self.fileURLs = fileURLs
    }
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

/// Resolves which `GenerationService` the app uses, honoring ADR 0003's "swap behind the protocol"
/// goal. The real `RemoteGenerationService` is used only when **both** a backend URL is configured
/// (`AppConfig.backendBaseURL`) **and** Supabase auth is configured (`AuthManager.isConfigured`) —
/// the v0.5 backend requires a Supabase JWT, so without auth there is nothing useful to call.
/// Otherwise we fall back to the offline `StubGenerationService`. Call sites stay identical.
@MainActor
enum GenerationServiceFactory {
    static func make() -> GenerationService {
        if let baseURL = AppConfig.backendBaseURL, AuthManager.shared.isConfigured {
            return RemoteGenerationService(
                baseURL: baseURL,
                accessToken: { await AuthManager.shared.validAccessToken() })
        }
        return StubGenerationService()
    }
}
