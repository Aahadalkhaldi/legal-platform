import SwiftUI
import UniformTypeIdentifiers

@MainActor
final class CaseDetailModel: ObservableObject {
    @Published var detail: CaseDetailDTO?
    @Published var updates: [ClientUpdateDTO] = []
    @Published var documents: [DocumentDTO] = []
    @Published var errorMessage: String?
    @Published var documentURL: URL?
    @Published var isUploadingDocument = false

    private let caseId: UUID
    private let repository: CasesRepository
    private let documentsRepository: DocumentsRepository

    init(caseId: UUID, repository: CasesRepository, documentsRepository: DocumentsRepository) {
        self.caseId = caseId
        self.repository = repository
        self.documentsRepository = documentsRepository
    }

    func load() async {
        do {
            async let detailResponse = repository.caseDetail(id: caseId)
            async let updatesResponse = repository.clientUpdates(caseId: caseId)
            async let documentsResponse = documentsRepository.listDocuments(caseId: caseId)
            detail = try await detailResponse.data
            updates = try await updatesResponse.data
            documents = try await documentsResponse.data
        } catch {
            errorMessage = "Unable to load case details."
        }
    }

    func openDocument(_ document: DocumentDTO) async {
        do {
            documentURL = try await documentsRepository.signedURL(documentId: document.id).data.signedUrl
        } catch {
            errorMessage = "Unable to open document."
        }
    }

    func uploadDocument(fileURL: URL) async {
        guard let mimeType = mimeType(for: fileURL) else {
            errorMessage = "Unsupported document type."
            return
        }

        isUploadingDocument = true
        defer { isUploadingDocument = false }

        do {
            _ = try await documentsRepository.uploadClientDocument(caseId: caseId, fileURL: fileURL, mimeType: mimeType)
            await load()
        } catch {
            errorMessage = "Unable to upload document."
        }
    }

    private func mimeType(for url: URL) -> String? {
        guard let type = UTType(filenameExtension: url.pathExtension) else {
            return nil
        }

        if type.conforms(to: .pdf) { return "application/pdf" }
        if type.conforms(to: .png) { return "image/png" }
        if type.conforms(to: .jpeg) { return "image/jpeg" }
        if type.conforms(to: UTType(filenameExtension: "doc") ?? .data) { return "application/msword" }
        if type.conforms(to: UTType(filenameExtension: "docx") ?? .data) {
            return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        }

        return nil
    }
}

struct CaseDetailView: View {
    @StateObject private var model: CaseDetailModel
    @Environment(\.openURL) private var openURL
    @State private var isImportingDocument = false

    init(caseId: UUID, repository: CasesRepository, documentsRepository: DocumentsRepository) {
        _model = StateObject(wrappedValue: CaseDetailModel(caseId: caseId, repository: repository, documentsRepository: documentsRepository))
    }

    var body: some View {
        List {
            if let detail = model.detail {
                Section("Overview") {
                    LabeledContent("Status", value: detail.status.capitalized)
                    LabeledContent("Stage", value: detail.stage.capitalized)
                    if let caseNumber = detail.caseNumber {
                        LabeledContent("Case number", value: caseNumber)
                    }
                    if let description = detail.description {
                        Text(description)
                    }
                }
            }

            Section("Client updates") {
                if model.updates.isEmpty {
                    Text("No visible updates yet.").foregroundStyle(.secondary)
                } else {
                    ForEach(model.updates) { update in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(update.title).font(.headline)
                            Text(update.body).font(.body)
                            Text(update.createdAt.formatted(date: .abbreviated, time: .shortened))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }

            Section("Documents") {
                if model.isUploadingDocument {
                    ProgressView("Uploading document")
                }

                if model.documents.isEmpty {
                    Text("No shared documents yet.").foregroundStyle(.secondary)
                } else {
                    ForEach(model.documents) { document in
                        Button {
                            Task { await model.openDocument(document) }
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(document.title)
                                    Text(document.documentType ?? "Document")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Image(systemName: "doc.text")
                            }
                        }
                    }
                }
            }

            if let errorMessage = model.errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            }
        }
        .navigationTitle(model.detail?.title ?? "Case")
        .toolbar {
            Button {
                isImportingDocument = true
            } label: {
                Label("Upload Document", systemImage: "square.and.arrow.up")
            }
        }
        .fileImporter(
            isPresented: $isImportingDocument,
            allowedContentTypes: [.pdf, .png, .jpeg, UTType(filenameExtension: "doc") ?? .data, UTType(filenameExtension: "docx") ?? .data],
            allowsMultipleSelection: false
        ) { result in
            if case let .success(urls) = result, let url = urls.first {
                Task { await model.uploadDocument(fileURL: url) }
            }
        }
        .task { await model.load() }
        .refreshable { await model.load() }
        .onChange(of: model.documentURL) { url in
            guard let url else { return }
            openURL(url)
        }
    }
}
