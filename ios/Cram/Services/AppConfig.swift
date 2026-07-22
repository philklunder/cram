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

    /// Hardcoded Supabase config so the app is authenticated on **every** launch, not just when run
    /// from Xcode. Run-scheme env vars are only injected by the debugger; a standalone launch (tapping
    /// the installed app icon) has none, which would otherwise drop the app into the offline stub path.
    /// Both values are non-secret — the anon (publishable) key is designed to ship in clients and is
    /// already committed in `Cram.xcscheme`. The Run-scheme env vars above still override these.
    static let supabaseURLFallback: URL? = URL(string: "https://ckrjthwgcvtytdxfyjhr.supabase.co")
    static let supabaseAnonKeyFallback: String? =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrcmp0aHdnY3Z0eXRkeGZ5amhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE3MTMyOTgsImV4cCI6MjA5NzI4OTI5OH0.S7oiiyT0fMUBU8ioVRPdUUrd1kKkHXbaKbGwJhHfsxo"

    /// The deep link the Google OAuth web flow returns to. Its scheme is handled internally by
    /// `ASWebAuthenticationSession` (no `Info.plist` URL-scheme registration required). For sign-in to
    /// complete, add this exact URL under **Supabase → Authentication → URL Configuration → Redirect
    /// URLs**, and keep the Google provider enabled there.
    static let oauthRedirectURL = URL(string: "com.philippklunder.cram://login-callback")
}
