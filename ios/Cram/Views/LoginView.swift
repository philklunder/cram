import SwiftUI

/// Sign-in / sign-up against Supabase (ADR 0007). On success the SDK stores the session in the
/// Keychain and `AuthManager` flips `state` to `.signedIn`, which swaps `RootView` to the app.
struct LoginView: View {
    @Environment(AuthManager.self) private var auth

    private enum Mode { case signIn, signUp }
    @State private var mode: Mode = .signIn
    @State private var email = ""
    @State private var password = ""
    @FocusState private var focused: Field?

    /// Scales the hero glyph with the user's Dynamic Type setting.
    @ScaledMetric(relativeTo: .largeTitle) private var iconSize: CGFloat = 52

    private enum Field { case email, password }

    private var actionLabel: String { mode == .signIn ? "Sign In" : "Create Account" }
    private var canSubmit: Bool {
        !auth.isBusy && email.contains("@") && password.count >= 6
    }

    var body: some View {
        GeometryReader { proxy in
            ScrollView {
                VStack(spacing: 28) {
                    header
                    form
                    if let error = auth.lastError {
                        errorBanner(error)
                    }
                    actions
                }
                .padding(.horizontal, 28)
                .padding(.vertical, 36)
                .frame(maxWidth: 480)
                .frame(maxWidth: .infinity, minHeight: proxy.size.height)
                .animation(.snappy, value: auth.lastError)
                .animation(.snappy, value: mode)
            }
            .scrollBounceBehavior(.basedOnSize)
            .scrollDismissesKeyboard(.interactively)
        }
        .background(Color(.systemGroupedBackground))
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: 12) {
            Image(systemName: "graduationcap.fill")
                .font(.system(size: iconSize))
                .foregroundStyle(.tint)
                .accessibilityHidden(true)
            Text("Cram")
                .font(.largeTitle.bold())
            Text("Sign in to generate and sync your study material.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    // MARK: - Form

    private var form: some View {
        VStack(spacing: 14) {
            fieldRow(icon: "envelope") {
                TextField("Email", text: $email)
                    .textContentType(.emailAddress)
                    .keyboardType(.emailAddress)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focused, equals: .email)
                    .submitLabel(.next)
                    .onSubmit { focused = .password }
                    .accessibilityLabel("Email")
            } isActive: { focused == .email }

            fieldRow(icon: "lock") {
                SecureField("Password", text: $password)
                    .textContentType(mode == .signIn ? .password : .newPassword)
                    .focused($focused, equals: .password)
                    .submitLabel(.go)
                    .onSubmit(submit)
                    .accessibilityLabel("Password")
                    .accessibilityHint("At least 6 characters")
            } isActive: { focused == .password }
        }
    }

    /// A filled, rounded input row with a leading glyph and an accent focus ring — a modern but
    /// native iOS look that reads more clearly than a bare bordered text field.
    private func fieldRow<Content: View>(
        icon: String,
        @ViewBuilder content: () -> Content,
        isActive: () -> Bool
    ) -> some View {
        let active = isActive()
        return HStack(spacing: 12) {
            Image(systemName: icon)
                .foregroundStyle(active ? AnyShapeStyle(.tint) : AnyShapeStyle(.secondary))
                .frame(width: 22)
                .accessibilityHidden(true)
            content()
        }
        .font(.body)
        .padding(.horizontal, 14)
        .padding(.vertical, 13)
        .background(Color(.secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .strokeBorder(active ? Color.accentColor : Color(.separator),
                              lineWidth: active ? 1.5 : 0.5)
        )
        .animation(.snappy(duration: 0.15), value: active)
    }

    // MARK: - Error

    private func errorBanner(_ message: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
                .accessibilityHidden(true)
            Text(message)
                .font(.footnote)
                .foregroundStyle(.primary)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(12)
        .background(Color.orange.opacity(0.12),
                    in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .transition(.opacity.combined(with: .move(edge: .top)))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Error: \(message)")
    }

    // MARK: - Actions

    private var actions: some View {
        VStack(spacing: 16) {
            Button(action: submit) {
                ZStack {
                    // Keep the button height stable whether or not the spinner is showing.
                    Text(actionLabel).opacity(auth.isBusy ? 0 : 1)
                    if auth.isBusy {
                        ProgressView().tint(.white)
                    }
                }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(!canSubmit)
            .accessibilityLabel(actionLabel)
            .accessibilityHint(auth.isBusy ? "Working" : "")

            Button {
                auth.clearError()
                mode = (mode == .signIn) ? .signUp : .signIn
            } label: {
                Text(mode == .signIn
                     ? "Don't have an account? Sign up"
                     : "Already have an account? Sign in")
                    .font(.subheadline)
            }
            .disabled(auth.isBusy)
        }
    }

    private func submit() {
        guard canSubmit else { return }
        focused = nil
        Task {
            switch mode {
            case .signIn: await auth.signIn(email: email, password: password)
            case .signUp: await auth.signUp(email: email, password: password)
            }
        }
    }
}
