import Foundation

/// Per-`(user, resource)` delta cursor persistence (ADR 0007 §5). Cursors are opaque tokens scoped
/// to a user, so they live under a user-keyed `UserDefaults` namespace and are cleared on sign-out
/// or when a different user signs in (so a fresh `since=nil` pull rebuilds the local cache).
struct SyncCursorStore {

    let userId: String
    private let defaults = UserDefaults.standard

    private static let prefix = "cram.syncCursor."

    private func key(_ resource: String) -> String { "\(Self.prefix)\(userId).\(resource)" }

    func cursor(for resource: String) -> String? { defaults.string(forKey: key(resource)) }

    func setCursor(_ cursor: String?, for resource: String) {
        let k = key(resource)
        if let cursor { defaults.set(cursor, forKey: k) } else { defaults.removeObject(forKey: k) }
    }

    /// Drop every stored cursor for every user (called on sign-out / user change).
    static func resetAll() {
        let defaults = UserDefaults.standard
        for k in defaults.dictionaryRepresentation().keys where k.hasPrefix(prefix) {
            defaults.removeObject(forKey: k)
        }
    }
}
