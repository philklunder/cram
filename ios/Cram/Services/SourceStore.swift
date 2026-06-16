import Foundation

/// Stores captured raw material (PDFs, photo pages) on disk, outside SwiftData. SwiftData persists
/// only the relative filenames (see `Source.fileNames`); the bytes live in `<App Support>/Sources`.
///
/// v0.2 keeps the files local; once the backend exists (v0.3+) these are what gets uploaded for
/// real generation. Until then they're captured and persisted so the capture UX is genuinely real.
struct SourceStore {
    static let shared = SourceStore()

    /// Root directory: `<Application Support>/Sources`, created on first write.
    private var root: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("Sources", isDirectory: true)
    }

    private func ensureRoot() throws {
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    }

    /// Resolve a stored filename to its on-disk URL.
    func url(for fileName: String) -> URL { root.appendingPathComponent(fileName) }

    /// Copy a security-scoped imported file (e.g. a picked PDF) into the store.
    /// Returns the relative filename to persist on the `Source`.
    func importFile(at source: URL) throws -> String {
        try ensureRoot()
        let scoped = source.startAccessingSecurityScopedResource()
        defer { if scoped { source.stopAccessingSecurityScopedResource() } }
        let ext = source.pathExtension.isEmpty ? "dat" : source.pathExtension
        let fileName = "\(UUID().uuidString).\(ext)"
        try FileManager.default.copyItem(at: source, to: url(for: fileName))
        return fileName
    }

    /// Write raw data (e.g. a captured photo as JPEG) into the store.
    /// Returns the relative filename to persist on the `Source`.
    func writeData(_ data: Data, ext: String) throws -> String {
        try ensureRoot()
        let fileName = "\(UUID().uuidString).\(ext)"
        try data.write(to: url(for: fileName), options: .atomic)
        return fileName
    }

    /// Remove a stored file (used when a pending capture is cancelled). No-op if it's already gone.
    func delete(_ fileName: String) {
        let target = url(for: fileName)
        if FileManager.default.fileExists(atPath: target.path) {
            try? FileManager.default.removeItem(at: target)
        }
    }
}
