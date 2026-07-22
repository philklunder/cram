import SwiftUI

/// The account & preferences sheet, reached from the avatar on Today. A gradient identity banner up
/// top (the reference's profile card), then the two things the user asked to control: which grading
/// scale new subjects use, and signing out.
struct ProfileView: View {
    @Environment(AuthManager.self) private var auth
    @Environment(\.dismiss) private var dismiss

    /// The default grading scale new subjects adopt. Stored so `GradingScale.preferredDefault` (read
    /// by `AddSubjectView`) picks it up. Non-destructive: existing subjects keep their own scale.
    @AppStorage(GradingScale.defaultStorageKey) private var defaultScaleRaw = GradingScale.german.rawValue

    private var email: String? {
        if case let .signedIn(email) = auth.state { return email }
        return nil
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Space.lg) {
                    banner
                    gradingSection
                    if auth.isConfigured { accountSection }
                    footer
                }
                .padding(Space.md)
            }
            .background(CanvasBackground())
            .navigationTitle("Profile")
            .toolbarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }.foregroundStyle(Theme.brand)
                }
            }
        }
    }

    // MARK: - Banner

    private var banner: some View {
        GradientHeroCard {
            HStack(spacing: Space.md) {
                Image(systemName: "person.fill")
                    .font(.system(size: 26, weight: .semibold))
                    .foregroundStyle(Theme.brand)
                    .frame(width: 60, height: 60)
                    .background(.white, in: Circle())
                VStack(alignment: .leading, spacing: 4) {
                    Text(email.map(displayName) ?? "Your account")
                        .font(.serifDisplay(.title2, .semibold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    Text(email ?? "Studying offline on this device")
                        .font(.footnote)
                        .foregroundStyle(.white.opacity(0.85))
                        .lineLimit(1)
                }
                Spacer(minLength: 0)
            }
        }
    }

    /// A friendly name from the email's local part ("ada.lovelace@…" → "Ada Lovelace").
    private func displayName(_ email: String) -> String {
        let local = email.split(separator: "@").first.map(String.init) ?? email
        return local
            .split(whereSeparator: { $0 == "." || $0 == "_" || $0 == "-" })
            .map { $0.capitalized }
            .joined(separator: " ")
    }

    // MARK: - Grading

    private var gradingSection: some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            SectionHeader(title: "Grading")
            Panel {
                VStack(alignment: .leading, spacing: Space.xs) {
                    Text("The scale new subjects use by default. Subjects you've already added keep their own scale.")
                        .font(.footnote)
                        .foregroundStyle(Theme.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.bottom, Space.xxs)

                    ForEach(Array(GradingScale.allCases.enumerated()), id: \.element) { index, scale in
                        if index > 0 {
                            Divider().overlay(Theme.line)
                        }
                        scaleRow(scale)
                    }
                }
            }
        }
    }

    private func scaleRow(_ scale: GradingScale) -> some View {
        let selected = defaultScaleRaw == scale.rawValue
        return Button {
            defaultScaleRaw = scale.rawValue
        } label: {
            HStack(spacing: Space.sm) {
                Text(scale.label)
                    .font(.body)
                    .foregroundStyle(Theme.ink)
                Spacer()
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .font(.body)
                    .foregroundStyle(selected ? AnyShapeStyle(Theme.brand) : AnyShapeStyle(Theme.muted))
                    .contentTransition(.symbolEffect(.replace))
            }
            .contentShape(Rectangle())
            .padding(.vertical, Space.xs)
        }
        .buttonStyle(PressableCardStyle())
        .accessibilityAddTraits(selected ? [.isSelected] : [])
        .accessibilityLabel(scale.label)
    }

    // MARK: - Account

    private var accountSection: some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            SectionHeader(title: "Account")
            Button(role: .destructive) {
                Task {
                    await auth.signOut()
                    dismiss()
                }
            } label: {
                HStack(spacing: Space.xs) {
                    Image(systemName: "rectangle.portrait.and.arrow.right")
                    Text("Sign Out")
                }
                .font(.body.weight(.semibold))
                .foregroundStyle(Theme.danger)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 15)
                .background(Theme.dangerSoft, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
            }
            .disabled(auth.isBusy)
        }
    }

    // MARK: - Footer

    private var footer: some View {
        Text("Cram")
            .font(.serifDisplay(.footnote, .semibold))
            .foregroundStyle(Theme.muted)
            .frame(maxWidth: .infinity)
            .padding(.top, Space.sm)
    }
}

#Preview {
    ProfileView()
        .environment(AuthManager.shared)
}
