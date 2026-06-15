import Foundation

/// Spaced-repetition scheduler: standard SM-2 (ADR 0002) with an exam-date compression layer
/// on top (ADR 0004).
///
/// SM-2 is the source of truth for a card's interval/ease; compression only bends the *effective*
/// `dueDate` toward the exam so reviews converge before it. SM-2 state is never overwritten by
/// compression, so a card degrades cleanly to plain SM-2 if the exam date is removed.
enum Scheduler {

    // MARK: Tunable compression constants (isolated for tuning against ReviewLog data — ADR 0004).

    /// Fraction of the remaining time-to-exam a *strong* card may wait before its next review.
    private static let strongSpacingFraction = 0.5
    /// Fraction for a *weak* card — smaller, so weak material is reviewed earlier and denser.
    private static let weakSpacingFraction = 0.15

    // MARK: Public API

    /// Apply a review to a card: update its SM-2 state, log it, and set the effective due date.
    ///
    /// - Parameters:
    ///   - card: the reviewed card (mutated in place).
    ///   - rating: how well the user recalled it.
    ///   - date: when the review happened (injectable for testing).
    ///   - examDate: the subject's exam date, if any — drives compression.
    ///   - subjectStrength: 0…1 from the subject's grade (1 = strong), or nil if unknown.
    static func apply(_ rating: ReviewRating,
                      to card: Card,
                      on date: Date = .now,
                      examDate: Date?,
                      subjectStrength: Double?) {
        updateSM2(card, quality: rating.quality)
        card.dueDate = effectiveDueDate(for: card,
                                        reviewedOn: date,
                                        examDate: examDate,
                                        subjectStrength: subjectStrength)
    }

    // MARK: SM-2

    /// Standard SM-2 update of interval, repetitions and ease factor for a 0–5 quality.
    private static func updateSM2(_ card: Card, quality q: Int) {
        if q < 3 {
            // Lapse: reset the repetition count and review again tomorrow.
            card.repetitions = 0
            card.intervalDays = 1
            card.lapses += 1
        } else {
            switch card.repetitions {
            case 0: card.intervalDays = 1
            case 1: card.intervalDays = 6
            default: card.intervalDays = Int((Double(card.intervalDays) * card.easeFactor).rounded())
            }
            card.repetitions += 1
        }

        // Ease factor update (clamped to the SM-2 minimum of 1.3).
        let qd = Double(q)
        let newEase = card.easeFactor + (0.1 - (5 - qd) * (0.08 + (5 - qd) * 0.02))
        card.easeFactor = max(1.3, newEase)
    }

    // MARK: Exam-date compression (ADR 0004)

    /// Derive the effective next-review date from the SM-2 interval, compressed toward the exam.
    private static func effectiveDueDate(for card: Card,
                                         reviewedOn date: Date,
                                         examDate: Date?,
                                         subjectStrength: Double?) -> Date {
        let cal = Calendar.current
        let plainDue = cal.date(byAdding: .day, value: card.intervalDays, to: date) ?? date

        // No exam date → plain SM-2, no compression.
        guard let examDate, examDate > date else { return plainDue }

        // Combine per-card mastery with the subject's grade strength (default neutral 0.5).
        let strength = combinedStrength(cardMastery: card.mastery, subjectStrength: subjectStrength)
        let fraction = weakSpacingFraction
            + (strongSpacingFraction - weakSpacingFraction) * strength

        let daysToExam = max(1, cal.dateComponents([.day], from: date, to: examDate).day ?? 1)
        let cappedInterval = max(1, Int((Double(daysToExam) * fraction).rounded()))
        let effectiveInterval = min(card.intervalDays, cappedInterval)

        let compressed = cal.date(byAdding: .day, value: effectiveInterval, to: date) ?? plainDue
        // Never schedule a review after the exam — late reviews are worthless.
        return min(compressed, examDate)
    }

    private static func combinedStrength(cardMastery: Double, subjectStrength: Double?) -> Double {
        guard let subjectStrength else { return cardMastery }
        return 0.5 * cardMastery + 0.5 * subjectStrength
    }
}
