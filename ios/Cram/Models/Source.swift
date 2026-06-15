import Foundation
import SwiftData

/// A piece of ingested study material that a deck was generated from.
@Model
final class Source {
    @Attribute(.unique) var id: UUID
    var kindRaw: String
    var title: String
    var addedAt: Date
    var subject: Subject?

    var kind: SourceKind {
        get { SourceKind(rawValue: kindRaw) ?? .pdf }
        set { kindRaw = newValue.rawValue }
    }

    init(kind: SourceKind, title: String, subject: Subject? = nil) {
        self.id = UUID()
        self.kindRaw = kind.rawValue
        self.title = title
        self.addedAt = .now
        self.subject = subject
    }
}
