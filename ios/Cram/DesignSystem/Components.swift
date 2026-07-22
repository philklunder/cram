import SwiftUI

// MARK: - Canvas

/// The app canvas: cool slate (deep violet-ink in dark), lit by **two fixed violet glows** — a bright
/// wash off the top-right corner and a low ambient pool bottom-left — exactly as the web body does, so
/// even the near-black dark canvas reads as *lit* rather than flat. This is what stops the app feeling
/// boxy: the surfaces float on light, not on grey.
struct CanvasBackground: View {
    @Environment(\.colorScheme) private var scheme

    private var topOpacity: Double { scheme == .dark ? 0.22 : 0.12 }
    private var bottomOpacity: Double { scheme == .dark ? 0.16 : 0.07 }

    var body: some View {
        Theme.canvas
            .overlay {
                GeometryReader { geo in
                    let d = max(geo.size.width, geo.size.height)
                    ZStack {
                        RadialGradient(
                            colors: [Color(hex: 0x7C4DFF).opacity(topOpacity), .clear],
                            center: .init(x: 0.92, y: -0.02), startRadius: 0, endRadius: d * 0.95)
                        RadialGradient(
                            colors: [Color(hex: 0x6A2FF0).opacity(bottomOpacity), .clear],
                            center: .init(x: 0.02, y: 1.05), startRadius: 0, endRadius: d * 0.85)
                    }
                }
                .allowsHitTesting(false)
            }
            .ignoresSafeArea()
    }
}

// MARK: - App-icon mark

/// Renders the real Cram app icon (the blue-violet calendar+check) as a clean rounded mark: scaled up
/// a hair and clipped so the source PNG's white margin is cropped and the corners are ours. Used as
/// the sign-in / profile brand mark instead of a generic SF Symbol.
struct AppLogoMark: View {
    var size: CGFloat = 76
    var body: some View {
        Image("AppLogo")
            .resizable()
            .interpolation(.high)
            .scaledToFill()
            .frame(width: size, height: size)
            .scaleEffect(1.1)
            .clipShape(RoundedRectangle(cornerRadius: size * 0.235, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: size * 0.235, style: .continuous)
                    .strokeBorder(.white.opacity(0.14), lineWidth: 1)
            )
            .shadow(color: Color(hex: 0x6A2FF0).opacity(0.34), radius: size * 0.22, x: 0, y: size * 0.12)
            .accessibilityLabel("Cram")
    }
}

// MARK: - Readiness ring

/// A circular recall-readiness gauge — the reference's signature dial, brought on-brand. The ring
/// fills from the *semantic* verdict colour (green/amber/red), with the figure tallied in the centre
/// and a first-class `Untested` state (an empty track, not a false 0%).
struct ReadinessRing: View {
    let value: Double?
    let verdict: ReadinessVerdict
    var size: CGFloat = 58
    var lineWidth: CGFloat = 6

    var body: some View {
        ZStack {
            Circle().stroke(Theme.surface2, lineWidth: lineWidth)
            if let value {
                Circle()
                    .trim(from: 0, to: max(0.001, value))
                    .stroke(verdict.color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                VStack(spacing: -1) {
                    Text("\(Int((value * 100).rounded()))")
                        .font(.figure(.subheadline, .bold))
                        .foregroundStyle(Theme.ink)
                    Text("%")
                        .font(.system(size: size * 0.14, weight: .bold, design: .rounded))
                        .foregroundStyle(Theme.muted)
                }
            } else {
                Image(systemName: "questionmark")
                    .font(.system(size: size * 0.3, weight: .semibold))
                    .foregroundStyle(Theme.subtle)
            }
        }
        .frame(width: size, height: size)
        .animation(.spring(response: 0.5, dampingFraction: 0.8), value: value)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(value == nil ? "Readiness untested"
                            : "Readiness \(Int((value! * 100).rounded())) percent, \(verdict.label)")
    }
}

// MARK: - Gradient hero

/// The signature surface of the app: a rounded card drenched in the violet→magenta sweep, carrying
/// white ink. Used for the single most important thing on a screen (Today's next exam, a sign-in
/// banner) — never stacked, never more than one per screen, so the gradient stays an event.
struct GradientHeroCard<Content: View>: View {
    var padding: CGFloat = Space.lg
    var radius: CGFloat = Radius.xl
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.brandGradient, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(Color.white.opacity(0.12), lineWidth: 1)
            )
            .brandShadow()
    }
}

/// A translucent white pill for labels that sit *on* the gradient hero (a countdown, a tag). Reads on
/// the violet without borrowing a semantic colour that would clash with the sweep.
struct HeroPill: View {
    let text: String
    var systemImage: String? = nil

    var body: some View {
        HStack(spacing: 5) {
            if let systemImage { Image(systemName: systemImage).font(.caption2.weight(.bold)) }
            Text(text)
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(.white)
        .padding(.horizontal, Space.sm)
        .padding(.vertical, 6)
        .background(Color.white.opacity(0.18), in: Capsule())
    }
}

// MARK: - Panel

/// The base surface card: a padded surface where a crisp 1px hairline rule does the elevation work
/// and a whisper-soft warm shadow lifts it a hair off the paper. Flatter and tighter than the web's.
struct Panel<Content: View>: View {
    var padding: CGFloat = Space.md
    var radius: CGFloat = Radius.lg
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.surface, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(Theme.line, lineWidth: 1)
            )
            .cardShadow()
    }
}

// MARK: - Marker highlight

/// Lays a translucent highlighter stroke behind a word or number — the app's one signature flourish,
/// used sparingly (the workload keyword, a due count) so amber never becomes decoration.
struct MarkerHighlight: ViewModifier {
    var horizontal: CGFloat = 5
    func body(content: Content) -> some View {
        content
            .padding(.horizontal, horizontal)
            .padding(.vertical, 1)
            .background(
                RoundedRectangle(cornerRadius: 5, style: .continuous)
                    .fill(Theme.markerSoft)
            )
    }
}

extension View {
    /// Highlight a keyword with the marker swipe. Use on at most one phrase per screen.
    func markerHighlight(horizontal: CGFloat = 5) -> some View {
        modifier(MarkerHighlight(horizontal: horizontal))
    }
}

// MARK: - Badge

enum BadgeTone {
    case neutral, brand, success, warning, danger

    var fg: Color {
        switch self {
        case .neutral: Theme.ink2
        case .brand:   Theme.brand
        case .success: Theme.success
        case .warning: Theme.warning
        case .danger:  Theme.danger
        }
    }
    var bg: Color {
        switch self {
        case .neutral: Theme.surface2
        case .brand:   Theme.brandSoft
        case .success: Theme.successSoft
        case .warning: Theme.warningSoft
        case .danger:  Theme.dangerSoft
        }
    }
}

/// A small capsule label. Colour always rides with a word — never colour alone.
struct Badge: View {
    let text: String
    var tone: BadgeTone = .neutral
    var systemImage: String? = nil

    var body: some View {
        HStack(spacing: 4) {
            if let systemImage { Image(systemName: systemImage).font(.caption2.weight(.bold)) }
            Text(text)
        }
        .font(.caption2.weight(.semibold))
        .padding(.horizontal, Space.xs)
        .padding(.vertical, 3)
        .foregroundStyle(tone.fg)
        .background(tone.bg, in: Capsule())
    }
}

/// An exam countdown pill whose urgency colour is derived from days remaining.
struct CountdownPill: View {
    let days: Int?

    private var tone: BadgeTone {
        guard let days else { return .neutral }
        if days < 0 { return .neutral }
        if days <= 3 { return .danger }
        if days <= 7 { return .warning }
        return .neutral
    }
    private var text: String {
        guard let days else { return "No exam date" }
        if days < 0 { return "Exam passed" }
        if days == 0 { return "Exam today" }
        return "\(days)d to exam"
    }

    var body: some View {
        Badge(text: text, tone: tone, systemImage: "calendar")
    }
}

// MARK: - Readiness bar

/// A slim readiness track filled by the semantic verdict colour (green/amber/red), with an
/// `Untested` empty state. Figures use the rounded tabular face so they don't jitter.
struct ReadinessBar: View {
    let value: Double?
    let verdict: ReadinessVerdict
    var showLabel: Bool = true

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if showLabel {
                HStack {
                    Text(verdict.label)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(verdict.color)
                    Spacer()
                    if let value {
                        Text("\(Int((value * 100).rounded()))%")
                            .font(.figure(.caption, .semibold))
                            .foregroundStyle(Theme.ink2)
                    }
                }
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.surface2)
                    Capsule()
                        .fill(verdict.color)
                        .frame(width: max(6, geo.size.width * CGFloat(value ?? 0)))
                }
            }
            .frame(height: 7)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(value == nil ? "Readiness untested"
                            : "Readiness \(Int((value! * 100).rounded())) percent, \(verdict.label)")
    }
}

// MARK: - Stat tile (KPI)

/// A single figure with a caption, in an inset tile — the atom of the KPI strips. The figure sits in
/// SF Rounded so the numbers feel tallied by hand.
struct StatTile: View {
    let value: String
    let label: String
    var systemImage: String? = nil
    var tone: Color = Theme.ink

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let systemImage {
                Image(systemName: systemImage)
                    .font(.caption).foregroundStyle(tone.opacity(0.9))
            }
            Text(value)
                .font(.figure(.title2))
                .foregroundStyle(tone)
                .lineLimit(1).minimumScaleFactor(0.7)
            Text(label)
                .font(.caption).foregroundStyle(Theme.ink2)
                .lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(Space.sm)
        .background(Theme.surface2, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
    }
}

// MARK: - Section header

/// A screen-section label with an optional trailing action, in the app's tight heading style.
struct SectionHeader: View {
    let title: String
    var actionTitle: String? = nil
    var action: (() -> Void)? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .font(.headline)
                .tracking(-0.2)
                .foregroundStyle(Theme.ink)
            Spacer()
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.brand)
            }
        }
    }
}

// MARK: - Empty state

struct EmptyStateView: View {
    let title: String
    let message: String
    var systemImage: String = "sparkles"
    var actionTitle: String? = nil
    var action: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: Space.md) {
            Image(systemName: systemImage)
                .font(.system(size: 30, weight: .medium))
                .foregroundStyle(Theme.brand)
                .frame(width: 68, height: 68)
                .background(Theme.brandSoft, in: Circle())
            VStack(spacing: 6) {
                Text(title).font(.serifDisplay(.title3, .semibold)).foregroundStyle(Theme.ink)
                Text(message)
                    .font(.subheadline).foregroundStyle(Theme.ink2)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .buttonStyle(PrimaryButtonStyle())
                    .frame(maxWidth: 260)
                    .padding(.top, Space.xxs)
                    .padding(.horizontal, Space.xl)
            }
        }
        .frame(maxWidth: 340)
        .padding(Space.xl)
    }
}

// MARK: - Button styles

/// The one primary CTA: the signature violet→magenta gradient carrying white ink, with a soft press
/// squish and a grounded violet lift — the "Log In" button of the reference, everywhere it counts.
struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View { Content(configuration: configuration) }

    private struct Content: View {
        @Environment(\.isEnabled) private var isEnabled
        let configuration: Configuration
        var body: some View {
            configuration.label
                .font(.body.weight(.semibold))
                .foregroundStyle(Theme.onBrand)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 15)
                .background(Theme.brandGradient, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                .brandShadow()
                .opacity(isEnabled ? 1 : 0.45)
                .scaleEffect(configuration.isPressed ? 0.97 : 1)
                .animation(.spring(response: 0.3, dampingFraction: 0.7), value: configuration.isPressed)
        }
    }
}

/// The CTA that sits *on* the gradient hero: an inverted button — a white fill carrying violet ink —
/// so the primary action stays the brightest thing on an already-vivid card.
struct OnGradientButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View { Content(configuration: configuration) }

    private struct Content: View {
        @Environment(\.isEnabled) private var isEnabled
        let configuration: Configuration
        var body: some View {
            configuration.label
                .font(.body.weight(.semibold))
                // Fixed deep violet: the fill is always white, so the ink must not lighten in dark mode.
                .foregroundStyle(Color(hex: 0x5A1FD1))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 15)
                .background(.white, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                .shadow(color: Color(hex: 0x2A1E52).opacity(0.18), radius: 10, x: 0, y: 4)
                .opacity(isEnabled ? 1 : 0.5)
                .scaleEffect(configuration.isPressed ? 0.97 : 1)
                .animation(.spring(response: 0.3, dampingFraction: 0.7), value: configuration.isPressed)
        }
    }
}

/// A quiet, bordered secondary action on the neutral surface.
struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View { Content(configuration: configuration) }

    private struct Content: View {
        @Environment(\.isEnabled) private var isEnabled
        let configuration: Configuration
        var body: some View {
            configuration.label
                .font(.body.weight(.semibold))
                .foregroundStyle(Theme.ink)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 15)
                .background(Theme.surface, in: RoundedRectangle(cornerRadius: Radius.md, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: Radius.md, style: .continuous)
                        .strokeBorder(Theme.lineStrong, lineWidth: 1)
                )
                .opacity(isEnabled ? 1 : 0.45)
                .scaleEffect(configuration.isPressed ? 0.97 : 1)
                .animation(.spring(response: 0.3, dampingFraction: 0.7), value: configuration.isPressed)
        }
    }
}

/// A tappable surface (whole-card taps): a subtle press-down scale with no layout shift.
struct PressableCardStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .animation(.spring(response: 0.3, dampingFraction: 0.72), value: configuration.isPressed)
    }
}
