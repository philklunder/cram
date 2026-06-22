import Foundation

/// Real generation (ADR 0003): uploads captured material to the Cram backend's `/v1/generate`
/// endpoint and decodes the returned deck. The backend makes the Claude call — the key never lives
/// in the client. Conforms to `GenerationService`, so it drops in behind the protocol with no change
/// to call sites; `GenerationServiceFactory` chooses it when a backend URL is configured.
///
/// Wire contract: see `docs/adr/0005-generation-api-contract.md`.
struct RemoteGenerationService: GenerationService {

    let baseURL: URL
    /// Supplies a fresh Supabase access token (the SDK refreshes it as needed) sent as
    /// `Authorization: Bearer <jwt>` — the v0.5 backend verifies it against Supabase's JWKS
    /// (ADR 0007/0008). Returns `nil` when the user isn't signed in, in which case generation fails
    /// with `.unauthenticated` before any request is sent. (Replaced the retired `X-Cram-Secret`.)
    var accessToken: @Sendable () async -> String? = { nil }
    var session: URLSession = .shared
    /// Generation involves a Claude call over potentially large material — allow generous time.
    var timeout: TimeInterval = 120

    func generate(_ request: GenerationRequest) async throws -> GeneratedDeck {
        // Never transmit the bearer token over cleartext (loopback excepted for local dev). ATS
        // already blocks http by default; this fails closed even if an ATS exception is added.
        guard Self.isSecureTransport(baseURL) else {
            throw GenerationError.insecureTransport
        }
        guard let token = await accessToken(), !token.isEmpty else {
            throw GenerationError.unauthenticated
        }

        let endpoint = baseURL.appendingPathComponent("v1/generate")
        var urlRequest = URLRequest(url: endpoint)
        urlRequest.httpMethod = "POST"
        urlRequest.timeoutInterval = timeout

        let boundary = "CramBoundary-\(UUID().uuidString)"
        urlRequest.setValue("multipart/form-data; boundary=\(boundary)",
                            forHTTPHeaderField: "Content-Type")
        urlRequest.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        urlRequest.httpBody = try makeBody(for: request, boundary: boundary)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: urlRequest)
        } catch {
            throw GenerationError.transport(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw GenerationError.invalidResponse
        }
        if http.statusCode == 401 {
            throw GenerationError.unauthenticated
        }
        guard (200..<300).contains(http.statusCode) else {
            throw GenerationError.server(status: http.statusCode,
                                         message: Self.serverMessage(from: data))
        }

        do {
            return try JSONDecoder().decode(DeckDTO.self, from: data).toDeck()
        } catch {
            throw GenerationError.decoding(error)
        }
    }

    // MARK: - Multipart body

    /// Builds a `multipart/form-data` body: the text fields, then one file part per uploaded URL.
    private func makeBody(for request: GenerationRequest, boundary: String) throws -> Data {
        var body = Data()

        func appendField(_ name: String, _ value: String) {
            body.appendString("--\(boundary)\r\n")
            body.appendString("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n")
            body.appendString("\(value)\r\n")
        }

        appendField("subject_name", request.subjectName)
        appendField("title", request.title)
        appendField("kind", request.kind.rawValue)

        for url in request.fileURLs {
            let fileData: Data
            do {
                fileData = try Data(contentsOf: url)
            } catch {
                throw GenerationError.fileUnreadable(url, error)
            }
            let filename = url.lastPathComponent
            body.appendString("--\(boundary)\r\n")
            body.appendString(
                "Content-Disposition: form-data; name=\"files\"; filename=\"\(filename)\"\r\n")
            body.appendString("Content-Type: \(Self.mimeType(for: url))\r\n\r\n")
            body.append(fileData)
            body.appendString("\r\n")
        }

        body.appendString("--\(boundary)--\r\n")
        return body
    }

    /// HTTPS is required for sending the access token; `http` is tolerated only for loopback hosts
    /// (a developer running the backend locally), never for a remote address.
    private static func isSecureTransport(_ url: URL) -> Bool {
        if url.scheme?.lowercased() == "https" { return true }
        let host = url.host?.lowercased()
        return host == "localhost" || host == "127.0.0.1" || host == "::1"
    }

    private static func mimeType(for url: URL) -> String {
        switch url.pathExtension.lowercased() {
        case "pdf": "application/pdf"
        case "png": "image/png"
        case "heic": "image/heic"
        case "jpg", "jpeg": "image/jpeg"
        default: "application/octet-stream"
        }
    }

    /// Best-effort extraction of a human message from an error response body.
    private static func serverMessage(from data: Data) -> String? {
        guard !data.isEmpty else { return nil }
        if let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            // FastAPI uses `detail`; our handlers may use `error`.
            if let detail = obj["detail"] as? String { return detail }
            if let error = obj["error"] as? String { return error }
        }
        return String(data: data, encoding: .utf8)
    }
}

// MARK: - Errors

enum GenerationError: LocalizedError {
    case transport(Error)
    case invalidResponse
    case unauthenticated
    case insecureTransport
    case server(status: Int, message: String?)
    case decoding(Error)
    case fileUnreadable(URL, Error)

    var errorDescription: String? {
        switch self {
        case .transport:
            "Couldn't reach the generation service. Check your connection and the backend address."
        case .invalidResponse:
            "The generation service returned an unexpected response."
        case .unauthenticated:
            "Please sign in again to generate cards."
        case .insecureTransport:
            "The backend address must use HTTPS. Update the server URL and try again."
        case .server(let status, let message):
            if let message, !message.isEmpty { "Generation failed (\(status)): \(message)" }
            else { "Generation failed with status \(status)." }
        case .decoding:
            "The generated deck couldn't be read — the response format didn't match."
        case .fileUnreadable(let url, _):
            "Couldn't read \(url.lastPathComponent) to upload."
        }
    }
}

// MARK: - Wire DTOs (decode → domain)

/// The JSON the backend returns. Mapped to `GeneratedDeck` so the wire shape stays an internal
/// detail of this service. snake_case on the wire (FastAPI convention) → camelCase here.
private struct DeckDTO: Decodable {
    let sourceTitle: String
    let cards: [CardDTO]
    let questions: [QuestionDTO]

    enum CodingKeys: String, CodingKey {
        case sourceTitle = "source_title"
        case cards, questions
    }

    func toDeck() -> GeneratedDeck {
        GeneratedDeck(sourceTitle: sourceTitle,
                      cards: cards.map { $0.toCard() },
                      questions: questions.map { $0.toQuestion() })
    }
}

private struct CardDTO: Decodable {
    let front: String
    let back: String
    let topic: String
    let difficulty: Int

    func toCard() -> GeneratedCard {
        GeneratedCard(front: front, back: back, topic: topic, difficulty: difficulty)
    }
}

private struct QuestionDTO: Decodable {
    let prompt: String
    let kind: String
    let topic: String
    let options: [String]
    let answerKey: String

    enum CodingKeys: String, CodingKey {
        case prompt, kind, topic, options
        case answerKey = "answer_key"
    }

    func toQuestion() -> GeneratedQuestion {
        // Map the wire `kind` to the domain enum; default to a sensible kind if the backend sends
        // something unknown (multiple-choice when options are present, else short-answer).
        let resolved = QuestionKind(rawValue: kind) ?? (options.isEmpty ? .shortAnswer : .multipleChoice)
        return GeneratedQuestion(prompt: prompt,
                                 kind: resolved,
                                 topic: topic,
                                 options: options,
                                 answerKey: answerKey)
    }
}

private extension Data {
    mutating func appendString(_ string: String) {
        if let data = string.data(using: .utf8) { append(data) }
    }
}
