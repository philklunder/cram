import Foundation

// Wire schemas for the CRUD + delta-sync API (mirrors `backend/app/api_schemas.py`).
//
// snake_case on the wire (FastAPI) ↔ camelCase here, handled by `.convert*SnakeCase` on the shared
// coders below — so most DTOs need no `CodingKeys`. Enum *values* (e.g. "multipleChoice") already
// match the iOS raw values, so the existing `SourceKind`/`QuestionKind`/`GradeKind`/`GradingScale`
// enums decode/encode directly.

// MARK: - Envelopes

/// A delta-pull page (ADR 0007 §5). `nextCursor` is the resume point; loop while `hasMore`.
struct DeltaPage<T: Decodable>: Decodable {
    let items: [T]
    let nextCursor: String?
    let hasMore: Bool
}

/// Push payload: a batch of rows to upsert (sync tables) or insert (append-only logs).
struct BatchUpsert<T: Encodable>: Encodable {
    let items: [T]
}

// MARK: - Shared coders

enum SyncCoding {
    /// Tries the ISO-8601 shapes Postgres/Pydantic emit: with fractional seconds (microseconds) and
    /// without, with an offset or a trailing `Z`. ISO8601DateFormatter is lenient about the number of
    /// fractional digits in practice; a POSIX `DateFormatter` is the final fallback.
    static func decodeDate(_ value: String) -> Date? {
        if let d = isoFractional.date(from: value) { return d }
        if let d = isoPlain.date(from: value) { return d }
        if let d = posixFallback.date(from: value) { return d }
        return nil
    }

    static let isoFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    static let isoPlain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    static let posixFallback: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSSSSxxxxx"
        return f
    }()

    static func makeDecoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        d.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            guard let date = decodeDate(raw) else {
                throw DecodingError.dataCorruptedError(
                    in: container, debugDescription: "Unparseable date: \(raw)")
            }
            return date
        }
        return d
    }

    static func makeEncoder() -> JSONEncoder {
        let e = JSONEncoder()
        e.keyEncodingStrategy = .convertToSnakeCase
        // Always send fractional-second ISO-8601 with a trailing Z; Pydantic accepts it.
        e.dateEncodingStrategy = .custom { date, encoder in
            var container = encoder.singleValueContainer()
            try container.encode(isoFractional.string(from: date))
        }
        return e
    }
}

// MARK: - Subjects

struct SubjectReadDTO: Decodable {
    let id: UUID
    let createdAt: Date
    let updatedAt: Date
    let deletedAt: Date?
    let name: String
    let gradingScale: GradingScale
    let targetGrade: Double?
    let currentGrade: Double?
}

struct SubjectPushDTO: Encodable {
    let id: UUID
    let name: String
    let gradingScale: GradingScale
    let targetGrade: Double?
    let currentGrade: Double?
}

// MARK: - Exams

struct ExamReadDTO: Decodable {
    let id: UUID
    let createdAt: Date
    let updatedAt: Date
    let deletedAt: Date?
    let subjectId: UUID
    let title: String
    let examDate: Date?
}

struct ExamPushDTO: Encodable {
    let id: UUID
    let subjectId: UUID
    let title: String
    let examDate: Date?
}

// MARK: - Sources

struct SourceReadDTO: Decodable {
    let id: UUID
    let createdAt: Date
    let updatedAt: Date
    let deletedAt: Date?
    let subjectId: UUID
    let kind: SourceKind
    let title: String
    let addedAt: Date
    let storagePaths: [String]
}

struct SourcePushDTO: Encodable {
    let id: UUID
    let subjectId: UUID
    let kind: SourceKind
    let title: String
    let addedAt: Date
    let storagePaths: [String]
}

// MARK: - Cards

struct CardReadDTO: Decodable {
    let id: UUID
    let createdAt: Date
    let updatedAt: Date
    let deletedAt: Date?
    let subjectId: UUID
    let examId: UUID?
    let sourceId: UUID?
    let front: String
    let back: String
    let topic: String
    let difficulty: Int
    let easeFactor: Double
    let intervalDays: Int
    let repetitions: Int
    let lapses: Int
    let dueDate: Date
}

struct CardPushDTO: Encodable {
    let id: UUID
    let subjectId: UUID
    let examId: UUID?
    let sourceId: UUID?
    let front: String
    let back: String
    let topic: String
    let difficulty: Int
    let easeFactor: Double
    let intervalDays: Int
    let repetitions: Int
    let lapses: Int
    let dueDate: Date
}

// MARK: - Quizzes

struct QuizReadDTO: Decodable {
    let id: UUID
    let createdAt: Date
    let updatedAt: Date
    let deletedAt: Date?
    let subjectId: UUID
    let examId: UUID?
    let title: String
}

struct QuizPushDTO: Encodable {
    let id: UUID
    let subjectId: UUID
    let examId: UUID?
    let title: String
}

// MARK: - Questions

struct QuestionReadDTO: Decodable {
    let id: UUID
    let createdAt: Date
    let updatedAt: Date
    let deletedAt: Date?
    let quizId: UUID
    let prompt: String
    let kind: QuestionKind
    let topic: String
    let options: [String]
    let answerKey: String
}

struct QuestionPushDTO: Encodable {
    let id: UUID
    let quizId: UUID
    let prompt: String
    let kind: QuestionKind
    let topic: String
    let options: [String]
    let answerKey: String
}

// MARK: - Grade entries

struct GradeEntryReadDTO: Decodable {
    let id: UUID
    let createdAt: Date
    let updatedAt: Date
    let deletedAt: Date?
    let subjectId: UUID
    let examId: UUID?
    let title: String
    let kind: GradeKind
    let score: Double
    let weight: Double
    let date: Date
}

struct GradeEntryPushDTO: Encodable {
    let id: UUID
    let subjectId: UUID
    let examId: UUID?
    let title: String
    let kind: GradeKind
    let score: Double
    let weight: Double
    let date: Date
}

// MARK: - Attempts (append-only)

struct AttemptReadDTO: Decodable {
    let id: UUID
    let createdAt: Date
    let questionId: UUID
    let response: String
    let isCorrect: Bool
    let score: Double
    let feedback: String
    let gradedAt: Date
}

struct AttemptPushDTO: Encodable {
    let id: UUID
    let questionId: UUID
    let response: String
    let isCorrect: Bool
    let score: Double
    let feedback: String
    let gradedAt: Date
}

// MARK: - Review logs (append-only)

struct ReviewLogReadDTO: Decodable {
    let id: UUID
    let createdAt: Date
    let cardId: UUID
    let reviewedAt: Date
    let rating: Int
}

struct ReviewLogPushDTO: Encodable {
    let id: UUID
    let cardId: UUID
    let reviewedAt: Date
    let rating: Int
}
