import Foundation

/// App-wide configuration resolved at runtime. Keeps environment-specific values (like the backend
/// address and the Supabase project handle) out of the code and off the call sites.
///
/// The Claude key is **never** here — it lives server-side only (ADR 0003, ARCHITECTURE.md). The
/// only auth material the client holds is Supabase's **anon (publishable) key**, which is designed
/// to ship in clients; the user's access token is obtained at sign-in and stored by the Supabase
/// SDK in the Keychain (see `AuthManager`).
enum AppConfig {

    /// Base URL of the Cram backend (the FastAPI service), or `nil` when none is configured — in
    /// which case the app uses the offline `StubGenerationService`.
    ///
    /// Resolution order:
    /// 1. The `CRAM_BACKEND_URL` environment variable (set it in the Run scheme to point elsewhere,
    ///    e.g. a LAN dev backend `http://192.168.1.20:8000`).
    /// 2. `overrideBaseURL` below — defaults to the live Railway deployment.
    static var backendBaseURL: URL? {
        if let raw = ProcessInfo.processInfo.environment["CRAM_BACKEND_URL"]?
            .trimmingCharacters(in: .whitespacesAndNewlines),
           !raw.isEmpty,
           let url = URL(string: raw) {
            return url
        }
        return overrideBaseURL
    }

    /// Default backend URL: the live v0.5 deployment on Railway (public; already in the README).
    /// Set `CRAM_BACKEND_URL` to override, or change this to `nil` to force the offline stub path.
    static let overrideBaseURL: URL? = URL(string: "https://cram.up.railway.app")

    // MARK: - Supabase

    /// The Supabase project URL (e.g. `https://abcd.supabase.co`), or `nil` when unconfigured.
    /// Resolved from the `SUPABASE_URL` environment variable (set it in the Run scheme), with an
    /// optional hardcoded fallback below. When `nil`, the app runs unauthenticated on the offline
    /// stub path — no login is shown.
    static var supabaseURL: URL? {
        if let raw = ProcessInfo.processInfo.environment["SUPABASE_URL"]?
            .trimmingCharacters(in: .whitespacesAndNewlines),
           !raw.isEmpty,
           let url = URL(string: raw) {
            return url
        }
        return supabaseURLFallback
    }

    /// The Supabase **anon (publishable) key**, or `nil` when unconfigured. This key is intended to
    /// ship in clients (it grants only what your RLS policies allow); it is *not* the Claude key and
    /// *not* the service-role key. Resolved from `SUPABASE_ANON_KEY` with an optional fallback below.
    static var supabaseAnonKey: String? {
        if let raw = ProcessInfo.processInfo.environment["SUPABASE_ANON_KEY"]?
            .trimmingCharacters(in: .whitespacesAndNewlines),
           !raw.isEmpty {
            return raw
        }
        return supabaseAnonKeyFallback
    }

    /// Optional hardcoded Supabase config for convenience. Leave `nil` to require the Run-scheme
    /// env vars. (Both values are non-secret and may be committed if you prefer a zero-setup build.)
    static let supabaseURLFallback: URL? = nil
    static let supabaseAnonKeyFallback: String? = nil

    /// The deep link the Google OAuth web flow returns to. Its scheme is handled internally by
    /// `ASWebAuthenticationSession` (no `Info.plist` URL-scheme registration required). For sign-in to
    /// complete, add this exact URL under **Supabase → Authentication → URL Configuration → Redirect
    /// URLs**, and keep the Google provider enabled there.
    static let oauthRedirectURL = URL(string: "com.philippklunder.cram://login-callback")
}
