import Foundation

/// Deterministic, offline stand-in for real generation (ADR 0003). Returns hand-authored sample
/// decks so the full study loop — SRS, grades, progress — is buildable and demoable without any
/// Claude call. Swapped for `RemoteGenerationService` once the backend exists.
struct StubGenerationService: GenerationService {

    /// Small artificial delay so the UI exercises its loading state like the real call will.
    var simulatedDelay: Duration = .milliseconds(600)

    func generate(_ request: GenerationRequest) async throws -> GeneratedDeck {
        try? await Task.sleep(for: simulatedDelay)
        let deck = Self.fixture(for: request.subjectName)
        return GeneratedDeck(sourceTitle: request.title,
                             cards: deck.cards,
                             questions: deck.questions)
    }

    // MARK: Fixtures

    /// Pick a themed fixture by subject name, falling back to a generic biology deck.
    private static func fixture(for subjectName: String) -> GeneratedDeck {
        let lowered = subjectName.lowercased()
        if lowered.contains("histor") { return history }
        if lowered.contains("math") || lowered.contains("mathe") { return math }
        return biology
    }

    static let biology = GeneratedDeck(
        sourceTitle: "Cell Biology — sample",
        cards: [
            GeneratedCard(front: "What is the powerhouse of the cell?",
                          back: "The mitochondrion — it produces ATP via cellular respiration.",
                          topic: "Cell organelles", difficulty: 2),
            GeneratedCard(front: "What process do plants use to convert light into chemical energy?",
                          back: "Photosynthesis, occurring in the chloroplasts.",
                          topic: "Photosynthesis", difficulty: 2),
            GeneratedCard(front: "Define osmosis.",
                          back: "The net movement of water across a semipermeable membrane from low to high solute concentration.",
                          topic: "Transport", difficulty: 3),
            GeneratedCard(front: "What molecule carries genetic information?",
                          back: "DNA (deoxyribonucleic acid).",
                          topic: "Genetics", difficulty: 1),
        ],
        questions: [
            GeneratedQuestion(prompt: "Which organelle is responsible for protein synthesis?",
                              kind: .multipleChoice, topic: "Cell organelles",
                              options: ["Ribosome", "Lysosome", "Golgi apparatus", "Vacuole"],
                              answerKey: "Ribosome"),
            GeneratedQuestion(prompt: "In one sentence, explain why mitochondria are important.",
                              kind: .shortAnswer, topic: "Cell organelles",
                              options: [],
                              answerKey: "They generate most of the cell's ATP through cellular respiration."),
        ])

    static let history = GeneratedDeck(
        sourceTitle: "Cold War — sample",
        cards: [
            GeneratedCard(front: "In what year did the Berlin Wall fall?",
                          back: "1989.", topic: "Cold War", difficulty: 1),
            GeneratedCard(front: "What was the Marshall Plan?",
                          back: "A US program (1948) giving economic aid to rebuild Western Europe after WWII.",
                          topic: "Post-war recovery", difficulty: 3),
        ],
        questions: [
            GeneratedQuestion(prompt: "The Cuban Missile Crisis occurred in which year?",
                              kind: .multipleChoice, topic: "Cold War",
                              options: ["1959", "1962", "1968", "1972"],
                              answerKey: "1962"),
        ])

    static let math = GeneratedDeck(
        sourceTitle: "Calculus — sample",
        cards: [
            GeneratedCard(front: "What is the derivative of sin(x)?",
                          back: "cos(x).", topic: "Derivatives", difficulty: 2),
            GeneratedCard(front: "State the power rule.",
                          back: "d/dx[xⁿ] = n·xⁿ⁻¹.", topic: "Derivatives", difficulty: 2),
        ],
        questions: [
            GeneratedQuestion(prompt: "What is the integral of 2x dx?",
                              kind: .shortAnswer, topic: "Integrals",
                              options: [],
                              answerKey: "x² + C"),
        ])
}
