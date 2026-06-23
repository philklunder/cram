import Foundation
import SwiftData

/// A real-world mark the user recorded for a subject. Feeds prioritization and difficulty
/// calibration so Claude and the scheduler know how the user is actually doing (see PRODUCT-SPEC §6).
@Model
final class GradeEntry {
    @Attribute(.unique) var id: UUID
    var title: String
    var kindRaw: String
    /// The score, interpreted by the subject's `gradingScale`.
    var score: Double
    /// Relative weight when averaging into the subject's current grade (e.g. 0.3 for 30%).
    var weight: Double
    var date: Date
    var subject: Subject?

    // Sync metadata (v0.5 Phase 5).
    var updatedAt: Date = Date()
    var deletedAt: Date?
    var needsSync: Bool = true

    var kind: GradeKind {
        get { GradeKind(rawValue: kindRaw) ?? .exam }
        set { kindRaw = newValue.rawValue }
    }

    init(title: String,
         kind: GradeKind,
         score: Double,
         weight: Double = 1,
         date: Date = .now,
         subject: Subject? = nil) {
        self.id = UUID()
        self.title = title
        self.kindRaw = kind.rawValue
        self.score = score
        self.weight = weight
        self.date = date
        self.subject = subject
        self.updatedAt = .now
        self.needsSync = true
    }
}
