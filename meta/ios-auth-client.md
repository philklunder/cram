# iOS Auth Client (Supabase JWT)

> Cross-references ADR 0007/0008 and [auth-security-posture.md](auth-security-posture.md), which cover
> the *server* side (backend-mediated JWT verification, ES256/JWKS, fail-closed defaults). This file
> is the "why" for the *client* side: how the iOS app obtains and sends the token. The backend
> contract is frozen; this is the matching client decision (v0.5 Phase 5 groundwork, 2026-06-22).

## Decisions
- **The iOS client authenticates directly with Supabase via the official `supabase-swift` SDK**
  (SPM, resolved 2.48.0, pinned `upToNextMajorVersion` from 2.0.0). It signs in and sends the
  resulting access token as `Authorization: Bearer <jwt>`; the backend verifies it against Supabase
  JWKS. The retired `X-Cram-Secret` shared-secret header is **removed** from the client.
- **The SDK owns token storage and refresh.** No custom `localStorage`/`AuthClient.Configuration`
  override — the SDK's default **Keychain**-backed, auto-refreshing session is kept as-is.
- **The access token is never cached in app code.** `AuthManager` exposes only an observable `state`
  (which holds the user's email, not the token); the JWT is fetched on demand via
  `validAccessToken()` and handed to the networking layer per request.
- **A single app-wide `AuthManager.shared`**, built from `AppConfig`. When Supabase is **not**
  configured the wrapped client is `nil`: no login gate is shown and the app runs on the offline
  stub-generation path. When it **is** configured, `RootView` gates the app behind sign-in.
- **Remote generation requires both a backend URL and configured auth.** `GenerationServiceFactory`
  picks `RemoteGenerationService` only when both are present, else `StubGenerationService`.
- **Config resolves from the Run-scheme environment first, then committed non-secret fallbacks**
  (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, optional `CRAM_BACKEND_URL`), mirroring the existing
  `CRAM_BACKEND_URL` pattern. As of 2026-07-22 the `AppConfig` Supabase fallbacks are **populated**
  (project URL + anon key) rather than `nil`: Xcode injects scheme env vars only when it launches the
  app, so a standalone launch (installed app icon, no debugger) would otherwise get `nil` config and
  fall into the offline stub path. `backendBaseURL` defaults to the live Railway deployment.
- **Client-side security hardening (2026-06-22 review):**
  - **HTTPS-only bearer.** The token is refused over cleartext — `generate()` fails closed with
    `.insecureTransport` unless the backend URL is HTTPS (loopback `http` allowed for local dev).
  - **Sign-out can't desync.** A failed global revoke falls back to `signOut(scope: .local)` so the
    Keychain session is always cleared.
  - **Enumeration-safe errors.** Auth failures map to fixed, generic messages (no upstream text
    echoed); only the connectivity case is distinguished.
- **Google OAuth on iOS (2026-07-22), matching the web's Google sign-in.** `AuthManager.signInWithGoogle()`
  uses the SDK's `signInWithOAuth(provider: .google, redirectTo:configure:)`, which drives an
  `ASWebAuthenticationSession` (PKCE) and lands the same `.signedIn` state as email sign-in. The login
  screen gains a "Continue with Google" button (works for both sign-in and sign-up). Key choices:
  - **No `Info.plist` URL scheme.** `ASWebAuthenticationSession` handles the callback via its
    `callbackURLScheme` (derived from `redirectTo`), so the deep link needs no `CFBundleURLTypes`
    registration — important because the project uses `GENERATE_INFOPLIST_FILE = YES` (no physical plist).
  - **Redirect URL** = `AppConfig.oauthRedirectURL` (`com.philippklunder.cram://login-callback`); it must
    be added to **Supabase → Auth → URL Configuration → Redirect URLs** (owner/dashboard step, like the web).
  - **User cancellation is not an error** — `CancellationError` / `ASWebAuthenticationSessionError.canceledLogin`
    are swallowed; other failures map to a generic OAuth message (same enumeration-safe posture).

## Reasoning
- **SDK over hand-rolled REST:** token refresh, session persistence, and Keychain handling are
  fiddly and security-sensitive to own by hand. The SDK is the documented happy path and removes
  ~150 lines of bespoke auth code. Cost accepted: the project's first external SPM dependency (it
  had kept a dependency-free, hand-written `.xcodeproj`), and pbxproj edits to wire the package.
  Supply-chain surface is reputable (official Supabase org; Apple swift-crypto/asn1/http-types;
  Point-Free helpers).
- **Token fetched per request, never stored by us:** minimises the exposure window and keeps the
  refresh logic entirely inside the SDK, which is the source of truth for validity.
- **Auth gate only when configured:** preserves the long-standing "app works on stubs with zero
  backend setup" developer experience, while making the prod-wired path require a real sign-in.
- **HTTPS-only token transmission:** ATS already blocks `http` by default, but attaching the bearer
  regardless of scheme means a future ATS exception (LAN dev) could leak the JWT in cleartext.
  Failing closed removes that footgun; loopback is excepted because it never leaves the device.
- **Generic auth errors:** distinct messages for "wrong password" vs "no such account" vs "already
  registered" enable account enumeration; a single message also avoids leaking server/internal detail.

## Implications
- The app now needs a real Supabase user + project URL + anon key to do remote generation; the
  end-to-end test (capture → Generate → real cards) must run signed-in against Railway.
- `Package.resolved` must be committed so the resolved dependency graph is pinned/reproducible.
- The same `AuthManager.validAccessToken()` token provider is the seam for v0.4 (`RemoteGradingService`
  → `/v1/grade`) and v0.5 Phase 5 (delta-sync) — both reuse it with no new auth work.
- The **anon (publishable) key only** ever ships in the client; a `service_role` key would bypass
  RLS catastrophically. This is enforced by convention + doc warnings, not by code.
- **Resolved (2026-07-22):** the non-env config source for device-installed / standalone builds is a
  **committed non-secret default** for URL + anon key in `AppConfig` (scheme env vars are absent when
  the app is launched from the home screen rather than by Xcode). The anon key is safe to commit; a
  `service_role` key would not be. A `.xcconfig` remains an option if per-environment builds are
  needed later.

## Open questions
- Should the app handle Supabase **email confirmation** in-flow (currently sign-up with confirmation
  enabled just shows "check your email, then sign in")? Decide alongside onboarding (v1.0).
- Offline UX for an **expired/unrefreshable session** mid-session (v0.5 Phase 5): queue vs. block.

## Last updated
2026-07-22
