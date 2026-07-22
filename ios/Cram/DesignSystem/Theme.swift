import SwiftUI
import UIKit

/// The Cram **iOS** visual system, tuned to the *same* brand as the web app: cool-slate neutrals, a
/// lit canvas, and one confident **electric-violet "iris"** accent (`#6a2ff0`) — the exact tokens
/// from `web/DESIGN.md` / `globals.css`, so iOS and web read as one product. The mobile expression
/// leans into depth the web keeps flatter: a luminous violet canvas, layered soft shadows, a
/// gradient hero, and circular readiness gauges (the reference "smart-home" energy) — while colour
/// stays strictly on-brand.
///
/// The accent is two layers: `brand` is the solid iris used for text / icons / selection (AA on
/// neutrals); `brandGradient` is the iris sweep used only as a *fill* behind white ink (the hero,
/// the primary CTA, the sign-in mark) — echoing the electric blue-violet of the app icon.
///
/// Every token is a *dynamic* colour: one reference is correct in light and dark, both AA-checked.
/// Neutrals are cooled toward slate; dark is a deep violet-ink (`14 14 27`), never a neutral black.
enum Theme {

    // MARK: - Neutrals (cool slate ink / paper — the exact web token pairs)

    /// Page background. Light: slate-50; dark: deep violet-ink, darker than the surfaces.
    static let canvas     = dyn(0xF8FAFC, 0x0E0E1B)
    /// Card / raised surface. White on slate; a lifted violet-charcoal in dark so elevation reads.
    static let surface    = dyn(0xFFFFFF, 0x171729)
    /// Inset surface (fields, wells, tracks, secondary tiles).
    static let surface2   = dyn(0xF1F5F9, 0x202137)
    /// Primary text — slate-900 / near-white (≈16:1 and ≈13:1).
    static let ink        = dyn(0x0F172A, 0xE9E8F4)
    /// Secondary text (slate-700 / ≈9:1 and ≈).
    static let ink2       = dyn(0x334155, 0xC6C7D6)
    /// Tertiary text / captions (slate-500 / ≈6:1).
    static let muted      = dyn(0x64748B, 0x9EA0B6)
    /// Quaternary / decorative only (slate-400).
    static let subtle     = dyn(0x94A3B8, 0x80829C)
    /// Hairline rules / tracks — the crisp elevation tool (slate-200).
    static let line       = dyn(0xE2E8F0, 0x2E2E4A)
    /// Stronger hairline for hover/active/selected outlines (slate-300).
    static let lineStrong = dyn(0xCBD5E1, 0x3F4062)

    // MARK: - Accent ("iris")

    /// Electric violet — the **solid** accent (links, section actions, active tab, focus rings,
    /// selection, tinted icons). Iris `600` on light (AA 6.4:1 on white); lightens in dark to hold
    /// contrast on the near-black canvas.
    static let brand      = dyn(0x6A2FF0, 0xA78BFF)
    static let brandDeep  = dyn(0x591FD0, 0x977BFF)
    /// Text/icons on a `brand` or `brandGradient` fill — white in both modes.
    static let onBrand    = dyn(0xFFFFFF, 0xFFFFFF)
    /// A quiet iris wash for selected pills, active nav, tinted icon chips (brand-50 territory).
    static let brandSoft  = dyn(0x6A2FF0, 0.12, 0xA78BFF, 0.18)
    /// Iris focus ring.
    static let brandRing  = dyn(0x6A2FF0, 0.42, 0xA78BFF, 0.52)

    // MARK: - Gradient (the signature — fill behind white ink only)

    /// The three stops of the iris sweep: a bright violet, the brand `600`, and a deep blue-violet
    /// that nods to the app icon's electric blue. Fixed (same in both modes) so white ink stays AA.
    static let gradientStops: [Color] = [Color(hex: 0x8B5CFF), Color(hex: 0x6A2FF0), Color(hex: 0x531FCB)]

    /// The signature diagonal fill. Behind white `onBrand` ink only — the hero, the CTA, the sign-in mark.
    static var brandGradient: LinearGradient {
        LinearGradient(colors: gradientStops, startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    /// A solid vivid violet used where a flat brand *fill* is wanted (progress tracks, small chips).
    static let marker     = dyn(0x6A2FF0, 0x8B5CFF)
    /// Ink on a `marker` fill — white in both modes.
    static let onMarker   = dyn(0xFFFFFF, 0xFFFFFF)
    /// A translucent iris stroke laid behind an emphasised word on a neutral surface.
    static let markerSoft = dyn(0x6A2FF0, 0.18, 0xA78BFF, 0.24)

    // MARK: - Semantic (meaning, never decoration — always paired with a label)

    /// mastered / pass / on-track.
    static let success      = dyn(0x0E7C4A, 0x35C980)
    static let successSoft  = dyn(0x0E7C4A, 0.12, 0x35C980, 0.16)
    /// learning / catch-up / soon — a warm amber that only appears as a labelled status word.
    static let warning      = dyn(0xC2610A, 0xF3A64B)
    static let warningSoft  = dyn(0xC2610A, 0.12, 0xF3A64B, 0.16)
    /// shaky / fail / urgent.
    static let danger       = dyn(0xC62D2D, 0xF3706F)
    static let dangerSoft   = dyn(0xC62D2D, 0.12, 0xF3706F, 0.16)
}

// MARK: - Typography

extension Font {
    /// Editorial serif (New York) for the handful of display lines — the study-desk voice and the
    /// clearest break from the web's all-sans chrome, paired on a real contrast axis with the sans
    /// body and the rounded figures.
    static func serifDisplay(_ style: Font.TextStyle, _ weight: Font.Weight = .semibold) -> Font {
        .system(style, design: .serif).weight(weight)
    }

    /// SF Rounded, tabular — for **every** figure (counts, grades, %, day-counts) so numbers feel
    /// tallied by hand and never jitter as they change.
    static func figure(_ style: Font.TextStyle, _ weight: Font.Weight = .bold) -> Font {
        .system(style, design: .rounded).weight(weight).monospacedDigit()
    }
}

// MARK: - Spacing, radius scales

/// 4-pt spacing rhythm. Reach for these instead of ad-hoc numbers so vertical rhythm stays uniform.
enum Space {
    static let xxs: CGFloat = 4
    static let xs:  CGFloat = 8
    static let sm:  CGFloat = 12
    static let md:  CGFloat = 16
    static let lg:  CGFloat = 20
    static let xl:  CGFloat = 28
    static let xxl: CGFloat = 40
}

/// Corner-radius scale: controls/inputs → cards → large feature panels → pills. Soft and tactile.
enum Radius {
    static let sm:  CGFloat = 10
    static let md:  CGFloat = 14
    static let lg:  CGFloat = 20
    static let xl:  CGFloat = 28
}

extension View {
    /// The soft, layered cool-ink card shadow (a hairline rule does part of the work; this floats the
    /// card off the lit canvas). Mirrors the web `shadow-card-hover`.
    func cardShadow() -> some View {
        shadow(color: Color(hex: 0x0F172A).opacity(0.10), radius: 16, x: 0, y: 8)
            .shadow(color: Color(hex: 0x0F172A).opacity(0.05), radius: 2, x: 0, y: 1)
    }
    /// The brand-tinted lift for the gradient CTA / hero — lit, not dropped on black (web `shadow-brand-md`).
    func brandShadow() -> some View {
        shadow(color: Color(hex: 0x6A2FF0).opacity(0.40), radius: 20, x: 0, y: 10)
            .shadow(color: Color(hex: 0x6A2FF0).opacity(0.24), radius: 6, x: 0, y: 3)
    }
}

// MARK: - Colour helpers

/// Build a dynamic colour from a light and dark hex (0xRRGGBB), opaque.
func dyn(_ light: UInt, _ dark: UInt) -> Color {
    Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? uiColor(dark) : uiColor(light) })
}

/// Build a dynamic colour from light/dark hexes each with their own alpha.
func dyn(_ light: UInt, _ lightAlpha: CGFloat, _ dark: UInt, _ darkAlpha: CGFloat) -> Color {
    Color(uiColor: UIColor {
        $0.userInterfaceStyle == .dark ? uiColor(dark, darkAlpha) : uiColor(light, lightAlpha)
    })
}

private func uiColor(_ hex: UInt, _ alpha: CGFloat = 1) -> UIColor {
    UIColor(red:   CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8)  & 0xFF) / 255,
            blue:  CGFloat(hex & 0xFF)         / 255,
            alpha: alpha)
}

extension Color {
    /// Opaque colour from a single hex — for the per-subject palette definitions.
    init(hex: UInt) { self = Color(uiColor: uiColor(hex)) }
}
