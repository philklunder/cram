import Foundation
import Observation
import Supabase

/// Owns the Supabase auth session for the whole app (ADR 0007: the backend verifies Supabase JWTs;
/// the client signs in with Supabase directly and sends `Authorization: Bearer <access-token>`).
///
/// The Supabase SDK persists the session in the **Keychain** and refreshes the access token
/// automatically, so this type only exposes the small surface the app needs: an observable auth
/// `state` for the UI, sign-in / sign-up / sign-out, and `validAccessToken()` for the networking
/// layer. The Claude key never lives here; the only material held is the user's token (Keychain,
/// via the SDK) and the public anon key (see `AppConfig`).
@MainActor
@Observable
final class AuthManager {

    /// Single app-wide instance. Built from `AppConfig`; when Supabase isn't configured the client
    /// is `nil` and the app runs unauthenticated on the offline stub path (no login shown).
    static let shared = AuthManager()

    enum State: Equatable {
        case loading
        case signedOut
        case signedIn(email: String?)
    }

    private(set) var state: State = .loading
    /// The signed-in user's Supabase id (UUID string), or `nil` when signed out. Used by the sync
    /// layer to namespace its delta cursors per user (see `SyncCursorStore`).
    private(set) var currentUserID: String?
    /// Last user-facing error from a sign-in / sign-up attempt, or `nil`.
    private(set) var lastError: String?
    /// True while a sign-in / sign-up call is in flight (drives the button spinner).
    private(set) var isBusy = false

    private let client: SupabaseClient?

    /// Whether Supabase is configured. When `false`, there is no auth gate and remote generation is
    /// disabled (the app falls back to stubbed generation).
    var isConfigured: Bool { client != nil }

    var isSignedIn: Bool {
        if case .signedIn = state { return true }
        return false
    }

    private init() {
        if let url = AppConfig.supabaseURL, let key = AppConfig.supabaseAnonKey {
            client = SupabaseClient(supabaseURL: url, supabaseKey: key)
        } else {
            client = nil
        }
    }

    /// Restore any persisted session at launch. Call once when the app appears.
    func bootstrap() async {
        guard let client else {
            state = .signedOut
            return
        }
        do {
            let session = try await client.auth.session
            currentUserID = session.user.id.uuidString
            state = .signedIn(email: session.user.email)
        } catch {
            // No stored session (or it could not be refreshed) — treat as signed out.
            currentUserID = nil
            state = .signedOut
        }
    }

    func signIn(email: String, password: String) async {
        guard let client else {
            lastError = "Sign-in is unavailable: Supabase is not configured."
            return
        }
        isBusy = true
        lastError = nil
        defer { isBusy = false }
        do {
            let session = try await client.auth.signIn(
                email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                password: password)
            currentUserID = session.user.id.uuidString
            state = .signedIn(email: session.user.email)
        } catch {
            lastError = Self.message(for: error)
        }
    }

    /// Create an account. If the project requires email confirmation, no session is returned yet —
    /// surface a message asking the user to confirm and then sign in.
    func signUp(email: String, password: String) async {
        guard let client else {
            lastError = "Sign-up is unavailable: Supabase is not configured."
            return
        }
        isBusy = true
        lastError = nil
        defer { isBusy = false }
        do {
            let response = try await client.auth.signUp(
                email: email.trimmingCharacters(in: .whitespacesAndNewlines),
                password: password)
            if let session = response.session {
                currentUserID = session.user.id.uuidString
                state = .signedIn(email: session.user.email)
            } else {
                lastError = "Account created. Check your email to confirm, then sign in."
            }
        } catch {
            lastError = Self.message(for: error)
        }
    }

    /// Clear the last user-facing error (e.g. when switching between sign-in and sign-up).
    func clearError() {
        lastError = nil
    }

    func signOut() async {
        guard let client else { return }
        do {
            try await client.auth.signOut()
        } catch {
            // The global revoke needs the network; if it fails, force a local-only sign-out so the
            // stored session is cleared and app state can't desync from the Keychain (O3).
            try? await client.auth.signOut(scope: .local)
        }
        // Drop per-user sync cursors so a later sign-in starts from a clean delta position.
        SyncCursorStore.resetAll()
        currentUserID = nil
        state = .signedOut
    }

    /// A fresh, valid access token (refreshed by the SDK as needed), or `nil` when signed out or
    /// unconfigured. Used by the networking layer to set the `Authorization: Bearer` header.
    func validAccessToken() async -> String? {
        guard let client else { return nil }
        return try? await client.auth.session.accessToken
    }

    /// Map SDK / network errors to a short, fixed, user-safe message (O4). We deliberately do **not**
    /// echo the upstream error text: it avoids leaking server/internal detail, and a single generic
    /// failure message for bad credentials / unknown account / already-registered prevents account
    /// enumeration. Only the connectivity case is distinguished, since it's actionable and safe.
    private static func message(for error: Error) -> String {
        if (error as? URLError) != nil {
            return "Couldn't reach the sign-in service. Check your connection and try again."
        }
        return "Couldn't sign you in. Check your email and password and try again."
    }
}
