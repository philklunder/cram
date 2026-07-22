import SwiftUI

/// Per-subject colour identity — the *quiet* signal a learner navigates by (`DESIGN.md`).
///
/// A subject's id maps deterministically to one of ten curated families. The footprint is kept
/// small on purpose: a gradient monogram tile or a dot identifies the subject; the surrounding card
/// stays neutral, and readiness bars fill from the *semantic* verdict colour — never `solid` — so
/// subject accent and meaning never collide.
struct SubjectPalette: Hashable {
    /// Dot / thin rail / monogram base.
    let solid: Color
    /// The two ends of the monogram-tile gradient (mid → deep, so white initials read AA).
    let gradient: [Color]

    /// A soft tint of the subject colour for a faint fill behind the identity chip.
    var tint: Color { solid.opacity(0.14) }

    private init(_ solid: UInt, _ from: UInt, _ to: UInt) {
        self.solid = Color(hex: solid)
        self.gradient = [Color(hex: from), Color(hex: to)]
    }

    /// Ten curated families, tuned bluer/greener/warmer so adjacent subjects stay distinct and none
    /// collides with the brand iris (app chrome) or the semantic green/amber/red.
    static let families: [SubjectPalette] = [
        SubjectPalette(0x7C3AED, 0x8B5CF6, 0x6D28D9), // violet
        SubjectPalette(0x2563EB, 0x3B82F6, 0x1D4ED8), // blue
        SubjectPalette(0x0891B2, 0x22D3EE, 0x0E7490), // cyan
        SubjectPalette(0x0D9488, 0x2DD4BF, 0x0F766E), // teal
        SubjectPalette(0x16A34A, 0x4ADE80, 0x15803D), // green
        SubjectPalette(0x65A30D, 0xA3E635, 0x4D7C0F), // lime
        SubjectPalette(0xD97706, 0xFBBF24, 0xB45309), // amber
        SubjectPalette(0xEA580C, 0xFB923C, 0xC2410C), // orange
        SubjectPalette(0xE11D48, 0xFB7185, 0xBE123C), // rose
        SubjectPalette(0xC026D3, 0xE879F9, 0xA21CAF), // fuchsia
    ]

    /// Deterministic pick — a stable byte hash of the UUID (NOT `hashValue`, which is seeded per
    /// process and would re-colour a subject on every launch).
    static func forSubject(_ id: UUID) -> SubjectPalette {
        var hash: UInt64 = 5381
        withUnsafeBytes(of: id.uuid) { bytes in
            for byte in bytes { hash = (hash &* 33) ^ UInt64(byte) }
        }
        return families[Int(hash % UInt64(families.count))]
    }
}

extension Subject {
    var palette: SubjectPalette { SubjectPalette.forSubject(id) }

    /// One or two uppercased initials for the monogram tile.
    var monogram: String {
        let words = name.split(whereSeparator: { $0 == " " || $0 == "-" })
        let letters = words.prefix(2).compactMap { $0.first }
        let initials = String(letters).uppercased()
        return initials.isEmpty ? "?" : initials
    }
}

/// The identity tile: a subject's monogram on its colour family, rendered as a **printed index
/// label** rather than the web's glossy diagonal gradient — a near-solid ink fill with just a hair of
/// top-down shading and a crisp inner keyline, so it reads like a tab stuck on a folder. The one
/// place a subject's colour appears at full strength.
struct MonogramTile: View {
    let subject: Subject
    var size: CGFloat = 44

    private var radius: CGFloat { size * 0.26 }

    var body: some View {
        RoundedRectangle(cornerRadius: radius, style: .continuous)
            .fill(
                LinearGradient(colors: [subject.palette.gradient[0], subject.palette.gradient[1]],
                               startPoint: .top, endPoint: .bottom)
            )
            .frame(width: size, height: size)
            .overlay(
                Text(subject.monogram)
                    .font(.system(size: size * 0.42, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.12), radius: 0.5, y: 0.5)
            )
            .overlay(
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(.black.opacity(0.10), lineWidth: 0.75)
            )
            .overlay(alignment: .top) {
                // A thin lighter keyline along the top edge — the printed-label sheen.
                RoundedRectangle(cornerRadius: radius, style: .continuous)
                    .strokeBorder(.white.opacity(0.22), lineWidth: 0.75)
            }
            .accessibilityHidden(true)
    }
}
