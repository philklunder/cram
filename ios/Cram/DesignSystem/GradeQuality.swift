import SwiftUI

/// The reference app's core signal: a grade's **quality colour** on a green→yellow→orange→red ramp,
/// read through the subject's own scale (so it's correct whether higher-is-better like Swiss or
/// lower-is-better like German). This encodes real data (how good the mark is), so unlike a
/// decorative side-stripe it earns the leading colour rail on each row.
enum GradeQuality {
    /// Colour for a `score` interpreted on `scale`.
    static func color(_ score: Double, scale: GradingScale) -> Color {
        color(strength: scale.strength(for: score))
    }

    /// Colour for a 0…1 strength (1 = best). `nil` strength → a neutral grey (ungraded).
    static func color(strength: Double?) -> Color {
        guard let s = strength else { return Theme.subtle }
        switch s {
        case 0.78...:    return Color(hex: 0x16A34A) // green — strong
        case 0.60..<0.78: return Color(hex: 0x84CC16) // lime — solid
        case 0.45..<0.60: return Color(hex: 0xF59E0B) // amber — borderline
        case 0.30..<0.45: return Color(hex: 0xF97316) // orange — shaky
        default:          return Color(hex: 0xEF4444) // red — failing
        }
    }
}

/// The slim rounded colour rail placed at the leading edge of a grade row — the reference's quality
/// bar. Fixed-width, full-height of its row.
struct GradeRail: View {
    let color: Color
    var height: CGFloat = 40
    var body: some View {
        RoundedRectangle(cornerRadius: 3, style: .continuous)
            .fill(color)
            .frame(width: 5, height: height)
    }
}

/// A right-aligned grade readout in the rounded tabular figure face, tinted by quality. Shows an em
/// dash when ungraded.
struct GradeValue: View {
    let score: Double?
    let scale: GradingScale
    var font: Font = .figure(.title3, .semibold)

    var body: some View {
        if let score {
            Text(GradeFormat.string(score, scale: scale))
                .font(font)
                .foregroundStyle(GradeQuality.color(score, scale: scale))
        } else {
            Text("—").font(font).foregroundStyle(Theme.muted)
        }
    }
}
