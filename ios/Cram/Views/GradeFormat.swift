import Foundation

/// Formats a numeric grade for display according to its scale.
enum GradeFormat {
    static func string(_ value: Double, scale: GradingScale) -> String {
        switch scale {
        case .german, .swiss, .gpa:
            return String(format: "%.1f", value)
        case .percentage:
            return "\(Int(value.rounded()))%"
        case .letter:
            return letter(for: value)
        }
    }

    /// Maps a 0–4 GPA-like value to a letter grade.
    private static func letter(for value: Double) -> String {
        switch value {
        case 3.7...: "A"
        case 3.0..<3.7: "B"
        case 2.0..<3.0: "C"
        case 1.0..<2.0: "D"
        default: "F"
        }
    }
}
