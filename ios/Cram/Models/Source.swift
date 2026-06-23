import Foundation
import SwiftData

/// A piece of ingested study material that a deck was generated from.
@Model
final class Source {
    @Attribute(.unique) var id: UUID
    var kindRaw: String
    var title: String
    var addedAt: Date
    /// Relative filenames of the captured raw material, stored on disk by `SourceStore`.
    /// A PDF is a single entry; photo notes may span several pages. Empty for fixture-only sources.
    var fileNames: [String]
    var subject: Subject?

    // Sync metadata (v0.5 Phase 5). `fileNames` maps to the wire `storage_paths`; the raw
    // file bytes themselves are not synced (see plan — Storage upload/download is deferred).
    var updatedAt: Date = Date()
    var deletedAt: Date?
    var needsSync: Bool = true

    var kind: SourceKind {
        get { SourceKind(rawValue: kindRaw) ?? .pdf }
        set { kindRaw = newValue.rawValue }
    }

    init(kind: SourceKind, title: String, fileNames: [String] = [], subject: Subject? = nil) {
        self.id = UUID()
        self.kindRaw = kind.rawValue
        self.title = title
        self.addedAt = .now
        self.fileNames = fileNames
        self.subject = subject
        self.updatedAt = .now
        self.needsSync = true
    }

    /// On-disk URLs of the captured files, resolved against the source store.
    var fileURLs: [URL] { fileNames.map { SourceStore.shared.url(for: $0) } }
}
