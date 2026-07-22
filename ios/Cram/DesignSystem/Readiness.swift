import SwiftUI

/// A subject's exam-readiness verdict — the app's one-word answer to "how am I doing here?".
///
/// Mirrors the web's semantic model: green = mastered / on-track, amber = learning, red = shaky,
/// and `untested` is a first-class state (a subject with no cards is *not* 0% — it's simply unmeasured).
enum ReadinessVerdict {
    case untested
    case shaky
    case learning
    case onTrack
    case mastered

    var label: String {
        switch self {
        case .untested: "Untested"
        case .shaky:    "Shaky"
        case .learning: "Learning"
        case .onTrack:  "On track"
        case .mastered: "Mastered"
        }
    }

    /// The semantic colour — the same colour that fills the readiness bar (never the subject accent).
    var color: Color {
        switch self {
        case .untested: Theme.muted
        case .shaky:    Theme.danger
        case .learning: Theme.warning
        case .onTrack, .mastered: Theme.success
        }
    }

    var softColor: Color {
        switch self {
        case .untested: Theme.surface2
        case .shaky:    Theme.dangerSoft
        case .learning: Theme.warningSoft
        case .onTrack, .mastered: Theme.successSoft
        }
    }

    /// Map a 0…1 readiness value (or `nil` = nothing measured) to a verdict. The single source of the
    /// thresholds, shared by `Subject`, `Exam`, and any study scope.
    static func of(_ readiness: Double?) -> ReadinessVerdict {
        guard let r = readiness else { return .untested }
        switch r {
        case ..<0.35: return .shaky
        case ..<0.60: return .learning
        case ..<0.80: return .onTrack
        default:      return .mastered
        }
    }
}

extension Exam {
    /// The exam deck's verdict, from its card mastery.
    var verdict: ReadinessVerdict { .of(readiness) }
}

extension Subject {
    /// 0…1 readiness from the deck's average SM-2 mastery, or `nil` when there is nothing to measure.
    /// Deliberately card-only on iOS — it never fabricates a quiz-accuracy signal the client doesn't track.
    var readiness: Double? {
        guard !cards.isEmpty else { return nil }
        return cards.reduce(0) { $0 + $1.mastery } / Double(cards.count)
    }

    var verdict: ReadinessVerdict {
        guard let r = readiness else { return .untested }
        switch r {
        case ..<0.35: return .shaky
        case ..<0.60: return .learning
        case ..<0.80: return .onTrack
        default:      return .mastered
        }
    }

    /// Count of cards due for review right now.
    var dueCount: Int { cards.lazy.filter { $0.isDue() }.count }
}
