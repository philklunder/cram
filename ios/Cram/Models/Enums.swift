import Foundation

/// The kind of source material a deck was generated from.
enum SourceKind: String, Codable, CaseIterable, Identifiable {
    case pdf
    case photo
    // v2+: web, youtube, audio
    case web
    case youtube
    case audio

    var id: String { rawValue }

    var label: String {
        switch self {
        case .pdf: "PDF / slides"
        case .photo: "Photo"
        case .web: "Web article"
        case .youtube: "YouTube"
        case .audio: "Lecture audio"
        }
    }

    /// Inputs supported in v1 (PDFs and photos share one ingestion path).
    static var v1Cases: [SourceKind] { [.pdf, .photo] }
}

/// How a quiz question is answered and graded.
enum QuestionKind: String, Codable, CaseIterable, Identifiable {
    case multipleChoice
    case shortAnswer

    var id: String { rawValue }

    var label: String {
        switch self {
        case .multipleChoice: "Multiple choice"
        case .shortAnswer: "Short answer"
        }
    }
}

/// What a recorded grade refers to.
enum GradeKind: String, Codable, CaseIterable, Identifiable {
    case exam
    case test
    case assignment
    case overall

    var id: String { rawValue }

    var label: String {
        switch self {
        case .exam: "Exam"
        case .test: "Test"
        case .assignment: "Assignment"
        case .overall: "Overall"
        }
    }
}

/// The scale used to interpret grade scores. Defaults to the German 1.0–6.0 scale.
enum GradingScale: String, Codable, CaseIterable, Identifiable {
    case german      // 1.0 (best) … 6.0 (worst); pass ≤ 4.0
    case swiss       // 6.0 (best) … 1.0 (worst); pass ≥ 4.0 — the inverse of the German scale
    case percentage  // 0 … 100 (higher is better)
    case letter      // A … F (stored as a numeric GPA-like value)
    case gpa         // 0.0 … 4.0 (higher is better)

    var id: String { rawValue }

    var label: String {
        switch self {
        case .german: "German (1.0–6.0)"
        case .swiss: "Swiss (6.0–1.0)"
        case .percentage: "Percentage"
        case .letter: "Letter (A–F)"
        case .gpa: "GPA (0–4)"
        }
    }

    /// Whether a *lower* numeric score is better (true only for the German scale).
    var lowerIsBetter: Bool { self == .german }

    /// The valid numeric range for entered scores on this scale.
    var range: ClosedRange<Double> {
        switch self {
        case .german, .swiss: 1.0...6.0
        case .percentage: 0...100
        case .letter, .gpa: 0...4.0
        }
    }

    /// The minimum score that counts as a pass (compared via `lowerIsBetter`).
    /// Swiss: 4.0 ("genügend") and above passes. German: 4.0 ("ausreichend") and below passes.
    var passMark: Double {
        switch self {
        case .german, .swiss: 4.0
        case .percentage: 50
        case .letter, .gpa: 1.0   // a D (1.0) or better is a pass
        }
    }

    /// Whether a given score is a passing grade on this scale.
    func isPassing(_ score: Double) -> Bool {
        lowerIsBetter ? score <= passMark : score >= passMark
    }

    /// Normalize a score to 0…1 where 1 = best. Used to compare across subjects.
    func strength(for score: Double) -> Double {
        let r = range
        let clamped = min(max(score, r.lowerBound), r.upperBound)
        let t = (clamped - r.lowerBound) / (r.upperBound - r.lowerBound)
        return lowerIsBetter ? 1 - t : t
    }
}

extension GradingScale {
    /// `UserDefaults`/`@AppStorage` key backing the user's chosen default scale for new subjects.
    static let defaultStorageKey = "defaultGradingScale"

    /// The scale a newly created subject adopts — the user's Profile preference, else German.
    static var preferredDefault: GradingScale {
        UserDefaults.standard.string(forKey: defaultStorageKey).flatMap(GradingScale.init) ?? .german
    }
}

/// How well the user recalled a card during review — maps to an SM-2 quality (0–5).
enum ReviewRating: Int, Codable, CaseIterable, Identifiable {
    case again = 1   // didn't remember
    case hard = 3    // remembered with difficulty
    case good = 4    // remembered
    case easy = 5    // effortless

    var id: Int { rawValue }

    var label: String {
        switch self {
        case .again: "Again"
        case .hard: "Hard"
        case .good: "Good"
        case .easy: "Easy"
        }
    }

    /// The SM-2 response quality (0–5).
    var quality: Int { rawValue }
}
