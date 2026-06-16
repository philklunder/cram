import SwiftUI
import PhotosUI
import UniformTypeIdentifiers
import UIKit

/// The result of a capture: what was captured, a display title, and the stored filenames
/// (already written into `SourceStore`). Handed back to the caller to run generation + ingest.
struct CapturedMaterial {
    let kind: SourceKind
    let title: String
    let fileNames: [String]
}

/// The real capture flow (v0.2): pick a PDF, take photos, or choose pages from the library.
/// Generation is still stubbed — this view only captures and persists the raw material, then hands
/// a `CapturedMaterial` back so the caller can run the (stubbed) `GenerationService`.
struct AddMaterialView: View {
    var onCapture: (CapturedMaterial) -> Void
    @Environment(\.dismiss) private var dismiss

    /// Captured photo pages, kept in memory until the user taps Generate.
    @State private var pages: [UIImage] = []
    /// A chosen PDF: its display name and the filename it was copied to in `SourceStore`.
    @State private var pdfName: String?
    @State private var pdfFileName: String?

    @State private var showingPDFImporter = false
    @State private var showingCamera = false
    @State private var librarySelection: [PhotosPickerItem] = []
    @State private var errorMessage: String?
    @State private var committed = false

    /// A source is either a PDF or a set of photos, not both — keep the choice unambiguous.
    private var cameraAvailable: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }
    private var hasContent: Bool { pdfFileName != nil || !pages.isEmpty }

    var body: some View {
        NavigationStack {
            Form {
                Section("PDF / slides") {
                    if let pdfName {
                        Label(pdfName, systemImage: "doc.text")
                        Button("Remove PDF", role: .destructive) { clearPDF() }
                    } else {
                        Button { showingPDFImporter = true } label: {
                            Label("Choose PDF…", systemImage: "doc.badge.plus")
                        }
                        .disabled(!pages.isEmpty)
                    }
                }

                Section("Photos") {
                    if !pages.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(Array(pages.enumerated()), id: \.offset) { idx, img in
                                    Image(uiImage: img)
                                        .resizable()
                                        .scaledToFill()
                                        .frame(width: 64, height: 64)
                                        .clipShape(RoundedRectangle(cornerRadius: 8))
                                        .overlay(alignment: .topTrailing) {
                                            Button { pages.remove(at: idx) } label: {
                                                Image(systemName: "xmark.circle.fill")
                                                    .symbolRenderingMode(.palette)
                                                    .foregroundStyle(.white, .black.opacity(0.5))
                                            }
                                            .padding(2)
                                        }
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    }
                    Button { showingCamera = true } label: {
                        Label("Take Photo", systemImage: "camera")
                    }
                    .disabled(pdfFileName != nil || !cameraAvailable)
                    PhotosPicker(selection: $librarySelection, matching: .images) {
                        Label("Choose from Library", systemImage: "photo.on.rectangle")
                    }
                    .disabled(pdfFileName != nil)
                    if !cameraAvailable {
                        Text("Camera isn't available on this device.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Add material")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Generate") { save() }.disabled(!hasContent)
                }
            }
            .fileImporter(isPresented: $showingPDFImporter,
                          allowedContentTypes: [.pdf]) { handlePDF($0) }
            .fullScreenCover(isPresented: $showingCamera) {
                CameraPicker { pages.append($0) }
                    .ignoresSafeArea()
            }
            .onChange(of: librarySelection) { _, items in loadLibrary(items) }
            .onDisappear {
                // Drop a copied-but-uncommitted PDF so cancelling doesn't orphan a file.
                if !committed, let pdfFileName { SourceStore.shared.delete(pdfFileName) }
            }
            .alert("Couldn't add material", isPresented: .constant(errorMessage != nil)) {
                Button("OK") { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }

    // MARK: - Capture handlers

    private func handlePDF(_ result: Result<URL, Error>) {
        switch result {
        case .success(let url):
            clearPDF()   // drop any previously chosen PDF's file before importing the new one
            pages = []
            do {
                let stored = try SourceStore.shared.importFile(at: url)
                pdfFileName = stored
                pdfName = url.lastPathComponent
            } catch {
                errorMessage = error.localizedDescription
            }
        case .failure(let error):
            errorMessage = error.localizedDescription
        }
    }

    private func loadLibrary(_ items: [PhotosPickerItem]) {
        guard !items.isEmpty else { return }
        clearPDF()
        Task {
            for item in items {
                if let data = try? await item.loadTransferable(type: Data.self),
                   let image = UIImage(data: data) {
                    pages.append(image)
                }
            }
            librarySelection = []
        }
    }

    private func clearPDF() {
        if let pdfFileName { SourceStore.shared.delete(pdfFileName) }
        pdfFileName = nil
        pdfName = nil
    }

    private func save() {
        do {
            let captured: CapturedMaterial
            if let pdfFileName, let pdfName {
                captured = CapturedMaterial(kind: .pdf, title: pdfName, fileNames: [pdfFileName])
            } else {
                var names: [String] = []
                do {
                    for image in pages {
                        guard let data = image.jpegData(compressionQuality: 0.8) else { continue }
                        names.append(try SourceStore.shared.writeData(data, ext: "jpg"))
                    }
                } catch {
                    names.forEach { SourceStore.shared.delete($0) }  // don't leak partial pages
                    throw error
                }
                let title = pages.count == 1 ? "Photo note" : "Photo notes (\(pages.count) pages)"
                captured = CapturedMaterial(kind: .photo, title: title, fileNames: names)
            }
            committed = true
            onCapture(captured)
            dismiss()
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#Preview {
    AddMaterialView { _ in }
}
