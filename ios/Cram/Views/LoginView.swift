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
    @ScaledMetric(relativeTo: .largeTitle) private var iconSize: CGFloat = 34

    private enum Field { case email, password }

    private var actionLabel: String { mode == .signIn ? "Sign In" : "Create Account" }
    private var canSubmit: Bool {
        !auth.isBusy && email.contains("@") && password.count >= 6
    }

    var body: some View {
        GeometryReader { proxy in
            ScrollView {
                VStack(spacing: Space.xl) {
                    header
                    form
                    if let error = auth.lastError {
                        errorBanner(error)
                    }
                    actions
                }
                .padding(.horizontal, Space.xl)
                .padding(.vertical, Space.xxl)
                .frame(maxWidth: 480)
                .frame(maxWidth: .infinity, minHeight: proxy.size.height)
                .animation(.snappy, value: auth.lastError)
                .animation(.snappy, value: mode)
            }
            .scrollBounceBehavior(.basedOnSize)
            .scrollDismissesKeyboard(.interactively)
        }
        .background(CanvasBackground())
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: Space.md) {
            AppLogoMark(size: iconSize * 2)
                .accessibilityHidden(true)
            Text("Cram")
                .font(.serifDisplay(.largeTitle, .bold)).tracking(-0.5)
                .foregroundStyle(Theme.ink)
            Text("Sign in to generate and sync your study material.")
                .font(.subheadline)
                .foregroundStyle(Theme.ink2)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    // MARK: - Form

    private var form: some View {
        VStack(spacing: Space.sm) {
            fieldRow(icon: "envelope.fill") {
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

            fieldRow(icon: "lock.fill") {
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

    /// A filled, rounded input row with a leading glyph and a brand focus ring.
    private func fieldRow<Content: View>(
        icon: String,
        @ViewBuilder content: () -> Content,
        isActive: () -> Bool
    ) -> some View {
        let active = isActive()
        return HStack(spacing: Space.sm) {
            Image(systemName: icon)
                .foregroundStyle(active ? AnyShapeStyle(Theme.brand) : AnyShapeStyle(Theme.muted))
                .frame(width: 22)
                .accessibilityHidden(true)
            content()
                .foregroundStyle(Theme.ink)
        }
        .font(.body)
        .padding(.horizontal, Space.md)
        .padding(.vertical, 15)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
                .strokeBorder(active ? Theme.brand : Theme.line, lineWidth: active ? 1.5 : 1)
        )
        .animation(.snappy(duration: 0.15), value: active)
    }

    // MARK: - Error

    private func errorBanner(_ message: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: Space.xs) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(Theme.danger)
                .accessibilityHidden(true)
            Text(message)
                .font(.footnote)
                .foregroundStyle(Theme.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(Space.sm)
        .background(Theme.dangerSoft, in: RoundedRectangle(cornerRadius: Radius.sm, style: .continuous))
        .transition(.opacity.combined(with: .move(edge: .top)))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Error: \(message)")
    }

    // MARK: - Actions

    private var actions: some View {
        VStack(spacing: Space.md) {
            Button(action: submit) {
                ZStack {
                    // Keep the button height stable whether or not the spinner is showing.
                    Text(actionLabel).opacity(auth.isBusy ? 0 : 1)
                    if auth.isBusy {
                        ProgressView().tint(Theme.onBrand)
                    }
                }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(!canSubmit)
            .accessibilityLabel(actionLabel)
            .accessibilityHint(auth.isBusy ? "Working" : "")

            orDivider

            Button {
                Task { await auth.signInWithGoogle() }
            } label: {
                HStack(spacing: Space.sm) {
                    GoogleGlyph(size: 18)
                    Text("Continue with Google")
                }
            }
            .buttonStyle(SecondaryButtonStyle())
            .disabled(auth.isBusy)
            .accessibilityLabel("Continue with Google")

            Button {
                auth.clearError()
                mode = (mode == .signIn) ? .signUp : .signIn
            } label: {
                Text(mode == .signIn
                     ? "Don't have an account? Sign up"
                     : "Already have an account? Sign in")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Theme.brand)
            }
            .disabled(auth.isBusy)
        }
    }

    private var orDivider: some View {
        HStack(spacing: Space.sm) {
            Rectangle().fill(Theme.line).frame(height: 1)
            Text("or").font(.caption.weight(.medium)).foregroundStyle(Theme.muted)
            Rectangle().fill(Theme.line).frame(height: 1)
        }
        .padding(.vertical, Space.xxs)
        .accessibilityHidden(true)
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

/// The Google "G", drawn with SwiftUI so it needs no bundled asset: four brand-coloured arcs plus the
/// blue cross-bar.
private struct GoogleGlyph: View {
    var size: CGFloat = 18

    var body: some View {
        Canvas { ctx, sz in
            let lineWidth = sz.width * 0.26
            let center = CGPoint(x: sz.width / 2, y: sz.height / 2)
            let radius = (sz.width - lineWidth) / 2

            func arc(_ start: Double, _ end: Double, _ hex: UInt) {
                var path = Path()
                path.addArc(center: center, radius: radius,
                            startAngle: .degrees(start), endAngle: .degrees(end), clockwise: false)
                ctx.stroke(path, with: .color(Color(hex: hex)),
                           style: StrokeStyle(lineWidth: lineWidth, lineCap: .butt))
            }
            // 0° = 3 o'clock, angles increase clockwise (y-down).
            arc(-63, 26, 0x4285F4)   // blue — right
            arc(26, 135, 0x34A853)   // green — bottom / lower-left
            arc(135, 207, 0xFBBC05)  // yellow — left
            arc(207, 297, 0xEA4335)  // red — top

            // Blue cross-bar: from the centre out to the right edge at the vertical middle.
            let bar = CGRect(x: center.x - lineWidth * 0.1, y: center.y - lineWidth / 2,
                             width: radius + lineWidth / 2, height: lineWidth)
            ctx.fill(Path(bar), with: .color(Color(hex: 0x4285F4)))
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}
