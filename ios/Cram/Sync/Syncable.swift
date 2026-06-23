import Foundation

/// Sync abstractions for the delta-sync layer (v0.5 Phase 5).
///
/// Two row shapes match the backend contract (ADR 0007 §4/§5):
/// - `SyncableModel` — mutable, syncable rows (Subject, Source, Card, Quiz, Question, GradeEntry).
///   They carry `updatedAt` (last local change), a `deletedAt` tombstone, and a `needsSync` flag.
/// - `AppendOnlyModel` — insert-only event rows (ReviewLog, Attempt). They are pushed once and never
///   updated or deleted, so they only need `needsSync`.
///
/// All local writes go through `touch()` / `softDelete()` so the engine can find pending changes
/// and so deletions propagate as tombstones rather than vanishing silently.
protocol SyncableModel: AnyObject {
    var id: UUID { get }
    var updatedAt: Date { get set }
    var deletedAt: Date? { get set }
    var needsSync: Bool { get set }
}

extension SyncableModel {
    /// Mark this row as locally changed: bump `updatedAt` and flag it for the next push.
    func touch() {
        updatedAt = .now
        needsSync = true
    }

    /// Tombstone this row instead of hard-deleting it, so the deletion is pushed to the backend
    /// (DELETE → soft-delete) and propagates to other devices on pull. The engine hard-deletes the
    /// local row only after the server confirms the delete.
    func softDelete() {
        deletedAt = .now
        needsSync = true
    }

    var isTombstoned: Bool { deletedAt != nil }
}

/// Insert-only rows (append-only logs). Marked `needsSync` on creation and cleared once pushed.
protocol AppendOnlyModel: AnyObject {
    var id: UUID { get }
    var needsSync: Bool { get set }
}
