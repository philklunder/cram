import Foundation

/// Errors surfaced by the sync HTTP layer. Mirrors `RemoteGenerationService`'s posture: HTTPS is
/// required for the bearer token, 401 is distinguished (so the engine can stop cleanly), and server
/// bodies are not echoed verbatim into anything user-facing beyond a short message.
enum SyncError: LocalizedError {
    case unauthenticated
    case insecureTransport
    case transport(Error)
    case invalidResponse
    /// The backend's per-minute rate limit was hit (ADR 0009). Carries the server's `Retry-After`
    /// (seconds) so the engine can back off and resume rather than surface a hard failure.
    case rateLimited(retryAfter: TimeInterval)
    case server(status: Int, message: String?)
    case decoding(Error)

    var errorDescription: String? {
        switch self {
        case .unauthenticated: "Please sign in again to sync."
        case .insecureTransport: "The backend address must use HTTPS."
        case .transport: "Couldn't reach the sync service. Check your connection."
        case .invalidResponse: "The sync service returned an unexpected response."
        case .rateLimited: "Syncing was throttled; it will resume automatically."
        case .server(let status, let message):
            if let message, !message.isEmpty { "Sync failed (\(status)): \(message)" }
            else { "Sync failed with status \(status)." }
        case .decoding: "A synced record couldn't be read — the response format didn't match."
        }
    }
}

/// Thin JSON client for the per-user CRUD + delta-sync API (`/v1/<resource>`), mirroring the
/// hardening of `RemoteGenerationService`: HTTPS-only bearer, 401 handling, generic error masking.
struct CramAPIClient {

    let baseURL: URL
    /// Supplies a fresh Supabase access token (the SDK refreshes it) for `Authorization: Bearer`.
    var accessToken: @Sendable () async -> String? = { nil }
    var session: URLSession = .shared
    var timeout: TimeInterval = 30

    private let decoder = SyncCoding.makeDecoder()
    private let encoder = SyncCoding.makeEncoder()

    // MARK: - Operations

    /// Delta pull: `GET /v1/<resource>?since=<cursor>&limit=<n>` → a page of changed rows.
    func pull<T: Decodable>(
        _ type: T.Type, resource: String, since: String?, limit: Int
    ) async throws -> DeltaPage<T> {
        var components = URLComponents(
            url: baseURL.appendingPathComponent("v1/\(resource)"),
            resolvingAgainstBaseURL: false)!
        var query = [URLQueryItem(name: "limit", value: String(limit))]
        if let since { query.append(URLQueryItem(name: "since", value: since)) }
        components.queryItems = query

        var request = URLRequest(url: components.url!)
        request.httpMethod = "GET"
        let data = try await send(request)
        do { return try decoder.decode(DeltaPage<T>.self, from: data) }
        catch { throw SyncError.decoding(error) }
    }

    /// Idempotent push: `POST /v1/<resource>/batch` upserts (sync tables) or inserts (append-only).
    @discardableResult
    func pushBatch<P: Encodable, R: Decodable>(
        _ resultType: R.Type, resource: String, items: [P]
    ) async throws -> DeltaPage<R> {
        var request = URLRequest(url: baseURL.appendingPathComponent("v1/\(resource)/batch"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        do { request.httpBody = try encoder.encode(BatchUpsert(items: items)) }
        catch { throw SyncError.decoding(error) }
        let data = try await send(request)
        do { return try decoder.decode(DeltaPage<R>.self, from: data) }
        catch { throw SyncError.decoding(error) }
    }

    /// Soft-delete a row: `DELETE /v1/<resource>/<id>`. A 404 is treated as success — the row is
    /// already gone server-side, which is the state we want.
    func delete(resource: String, id: UUID) async throws {
        var request = URLRequest(
            url: baseURL.appendingPathComponent("v1/\(resource)/\(id.uuidString)"))
        request.httpMethod = "DELETE"
        _ = try await send(request, okStatuses: 200..<300, extraOK: [404])
    }

    // MARK: - Transport

    private func send(
        _ base: URLRequest, okStatuses: Range<Int> = 200..<300, extraOK: Set<Int> = []
    ) async throws -> Data {
        guard Self.isSecureTransport(baseURL) else { throw SyncError.insecureTransport }
        guard let token = await accessToken(), !token.isEmpty else {
            throw SyncError.unauthenticated
        }

        var request = base
        request.timeoutInterval = timeout
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let data: Data
        let response: URLResponse
        do { (data, response) = try await session.data(for: request) }
        catch { throw SyncError.transport(error) }

        guard let http = response as? HTTPURLResponse else { throw SyncError.invalidResponse }
        if http.statusCode == 401 { throw SyncError.unauthenticated }
        if http.statusCode == 429 {
            let retryAfter = http.value(forHTTPHeaderField: "Retry-After")
                .flatMap { TimeInterval($0) } ?? 30
            throw SyncError.rateLimited(retryAfter: retryAfter)
        }
        if extraOK.contains(http.statusCode) { return data }
        guard okStatuses.contains(http.statusCode) else {
            throw SyncError.server(status: http.statusCode, message: Self.message(from: data))
        }
        return data
    }

    /// HTTPS required for the bearer token; plain `http` tolerated only for loopback dev hosts.
    private static func isSecureTransport(_ url: URL) -> Bool {
        if url.scheme?.lowercased() == "https" { return true }
        let host = url.host?.lowercased()
        return host == "localhost" || host == "127.0.0.1" || host == "::1"
    }

    private static func message(from data: Data) -> String? {
        guard !data.isEmpty,
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return nil }
        return (obj["detail"] as? String) ?? (obj["error"] as? String)
    }
}
