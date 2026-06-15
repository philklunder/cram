import Foundation
import SwiftData

/// One recorded card review. Kept for analytics and to enable tuning or a future migration to
/// FSRS without losing study history (see ADR 0002 / ADR 0004).
@Model
final class ReviewLog {
    @Attribute(.unique) var id: UUID
    var date: Date
    var ratingRaw: Int
    var card: Card?

    var rating: ReviewRating {
        get { ReviewRating(rawValue: ratingRaw) ?? .good }
        set { ratingRaw = newValue.rawValue }
    }

    init(rating: ReviewRating, date: Date = .now, card: Card? = nil) {
        self.id = UUID()
        self.ratingRaw = rating.rawValue
        self.date = date
        self.card = card
    }
}
