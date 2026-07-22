import Foundation

/// The outcome of grading one answer: correctness, a 0…1 partial-credit score, and a short note.
struct AnswerGrade {
    let isCorrect: Bool
    let score: Double
    let feedback: String
}

/// Grades a single short-answer response. Multiple-choice is graded on-device by exact match and
/// never goes through here.
protocol AnswerGrader {
    func grade(prompt: String, modelAnswer: String, response: String, topic: String) async -> AnswerGrade
}

/// Chooses the grader like `GenerationServiceFactory`: Claude via the backend when a URL + auth are
/// configured, otherwise the on-device grader. Both return an `AnswerGrade`; the caller records the
/// `Attempt` locally and syncs it, so `/v1/grade` is called *without* a `question_id` (no double
/// persist).
@MainActor
enum QuizGraderFactory {
    static func make() -> AnswerGrader {
        if let baseURL = AppConfig.backendBaseURL, AuthManager.shared.isConfigured {
            return RemoteAnswerGrader(
                baseURL: baseURL,
                accessToken: { await AuthManager.shared.validAccessToken() })
        }
        return LocalAnswerGrader()
    }
}

// MARK: - On-device grader

/// A pragmatic offline grader: how much of the model answer's meaningful vocabulary the response
/// covers. Not as good as Claude, but honest and instant — used when signed out. Labels itself so
/// the user knows it was checked locally.
struct LocalAnswerGrader: AnswerGrader {
    func grade(prompt: String, modelAnswer: String, response: String, topic: String) async -> AnswerGrade {
        let keywords = Self.keywords(modelAnswer)
        let given = Set(Self.keywords(response))
        guard !keywords.isEmpty, !given.isEmpty else {
            return AnswerGrade(isCorrect: false, score: 0,
                               feedback: "Checked on device — couldn't find much to match. Model answer: \(modelAnswer)")
        }
        let hits = Set(keywords).filter { given.contains($0) }.count
        let score = min(1, Double(hits) / Double(Set(keywords).count))
        let correct = score >= 0.5
        let note = correct
            ? "Looks right — checked on device."
            : "Checked on device. Model answer: \(modelAnswer)"
        return AnswerGrade(isCorrect: correct, score: score, feedback: note)
    }

    /// Lowercased, de-punctuated content words (drops very short words and common stop-words).
    static func keywords(_ text: String) -> [String] {
        let stop: Set<String> = ["the","a","an","of","to","and","or","is","are","in","on","for",
                                 "it","its","with","that","this","as","by","be","at","from","into",
                                 "than","then","they","their","was","were","which","most"]
        return text.lowercased()
            .components(separatedBy: CharacterSet.alphanumerics.inverted)
            .filter { $0.count >= 3 && !stop.contains($0) }
    }
}

// MARK: - Backend grader

/// Calls `POST /v1/grade` (ADR 0006). On any failure it degrades to the on-device grader rather than
/// blocking the quiz — a network hiccup shouldn't strand the user mid-session.
struct RemoteAnswerGrader: AnswerGrader {
    let baseURL: URL
    var accessToken: @Sendable () async -> String? = { nil }
    var session: URLSession = .shared
    var timeout: TimeInterval = 45

    func grade(prompt: String, modelAnswer: String, response: String, topic: String) async -> AnswerGrade {
        do {
            return try await callBackend(prompt: prompt, modelAnswer: modelAnswer,
                                         response: response, topic: topic)
        } catch {
            return await LocalAnswerGrader().grade(prompt: prompt, modelAnswer: modelAnswer,
                                                   response: response, topic: topic)
        }
    }

    private func callBackend(prompt: String, modelAnswer: String,
                             response: String, topic: String) async throws -> AnswerGrade {
        guard baseURL.scheme?.lowercased() == "https"
                || baseURL.host == "localhost" || baseURL.host == "127.0.0.1" else {
            throw GenerationError.insecureTransport
        }
        guard let token = await accessToken(), !token.isEmpty else {
            throw GenerationError.unauthenticated
        }
        var request = URLRequest(url: baseURL.appendingPathComponent("v1/grade"))
        request.httpMethod = "POST"
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode(
            GradeRequestDTO(prompt: prompt, modelAnswer: modelAnswer, response: response, topic: topic))

        let (data, resp) = try await session.data(for: request)
        guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw GenerationError.invalidResponse
        }
        let result = try JSONDecoder().decode(GradeResultDTO.self, from: data)
        return AnswerGrade(isCorrect: result.isCorrect,
                           score: min(1, max(0, result.score)),
                           feedback: result.feedback)
    }
}

// snake_case on the wire (mirrors backend `GradeRequest` / `GradeResult`).
private struct GradeRequestDTO: Encodable {
    let prompt: String
    let modelAnswer: String
    let response: String
    let topic: String
    enum CodingKeys: String, CodingKey {
        case prompt, response, topic
        case modelAnswer = "model_answer"
    }
}

private struct GradeResultDTO: Decodable {
    let score: Double
    let feedback: String
    let isCorrect: Bool
    enum CodingKeys: String, CodingKey {
        case score, feedback
        case isCorrect = "is_correct"
    }
}
