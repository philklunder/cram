import Foundation

/// App-wide configuration resolved at runtime. Keeps environment-specific values (like the backend
/// address) out of the code and off the call sites.
///
/// The Claude key is **never** here — it lives server-side only (ADR 0003, ARCHITECTURE.md). This
/// only holds the backend's *base URL*; the backend is what talks to Claude.
enum AppConfig {

    /// Base URL of the Cram backend (the FastAPI generation service), or `nil` when none is
    /// configured — in which case the app uses the offline `StubGenerationService`.
    ///
    /// Resolution order:
    /// 1. The `CRAM_BACKEND_URL` environment variable (set it in the Run scheme during development,
    ///    e.g. `http://192.168.1.20:8000` pointing at the Windows backend on the LAN).
    /// 2. `overrideBaseURL` below, for a hardcoded local default.
    static var backendBaseURL: URL? {
        if let raw = ProcessInfo.processInfo.environment["CRAM_BACKEND_URL"]?
            .trimmingCharacters(in: .whitespacesAndNewlines),
           !raw.isEmpty,
           let url = URL(string: raw) {
            return url
        }
        return overrideBaseURL
    }

    /// Optional hardcoded backend URL for development. Leave `nil` to keep the app on stubbed
    /// generation until the backend exists (v0.3 lands on Windows).
    static let overrideBaseURL: URL? = nil

    /// Shared secret sent in the `X-Cram-Secret` header on every backend request, or `nil` when
    /// none is configured. The backend requires this whenever it is exposed beyond loopback
    /// (`CRAM_SHARED_SECRET` set + `--host 0.0.0.0`); without it, LAN/device requests are rejected.
    ///
    /// Resolved from the `CRAM_SHARED_SECRET` environment variable — set it in the Run scheme
    /// alongside `CRAM_BACKEND_URL`, and keep the value out of source (it is not the Claude key,
    /// which stays server-side only).
    static var sharedSecret: String? {
        guard let raw = ProcessInfo.processInfo.environment["CRAM_SHARED_SECRET"]?
            .trimmingCharacters(in: .whitespacesAndNewlines),
              !raw.isEmpty else {
            return nil
        }
        return raw
    }
}
