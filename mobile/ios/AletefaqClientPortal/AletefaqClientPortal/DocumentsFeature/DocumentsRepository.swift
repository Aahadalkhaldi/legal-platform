import Foundation
import CryptoKit

protocol DocumentsRepository {
    func listDocuments(caseId: UUID) async throws -> APIData<[DocumentDTO]>
    func signedURL(documentId: UUID) async throws -> APIData<SignedURLDTO>
    func uploadClientDocument(caseId: UUID, fileURL: URL, mimeType: String) async throws -> APIData<DocumentDTO>
}

final class RemoteDocumentsRepository: DocumentsRepository {
    private let apiClient: LegalAPIClient
    private let urlSession: URLSession

    init(apiClient: LegalAPIClient, urlSession: URLSession = .shared) {
        self.apiClient = apiClient
        self.urlSession = urlSession
    }

    func listDocuments(caseId: UUID) async throws -> APIData<[DocumentDTO]> {
        try await apiClient.send("/api/v1/cases/\(caseId.uuidString)/documents")
    }

    func signedURL(documentId: UUID) async throws -> APIData<SignedURLDTO> {
        try await apiClient.send("/api/v1/documents/\(documentId.uuidString)/signed-url")
    }

    func uploadClientDocument(caseId: UUID, fileURL: URL, mimeType: String) async throws -> APIData<DocumentDTO> {
        let accessGranted = fileURL.startAccessingSecurityScopedResource()
        defer {
            if accessGranted {
                fileURL.stopAccessingSecurityScopedResource()
            }
        }

        let data = try Data(contentsOf: fileURL)
        let uploadId = UUID()
        let originalFileName = fileURL.lastPathComponent

        let signedUploadRequest = ClientDocumentSignedUploadRequest(
            uploadId: uploadId,
            originalFileName: originalFileName,
            mimeType: mimeType,
            sizeBytes: data.count
        )

        let signedUpload: APIData<ClientDocumentSignedUploadDTO> = try await apiClient.send(
            "/api/v1/cases/\(caseId.uuidString)/documents/signed-upload",
            method: "POST",
            body: signedUploadRequest
        )

        try await upload(data: data, to: signedUpload.data.signedUrl, mimeType: mimeType)

        let completeRequest = CompleteClientDocumentUploadRequest(
            uploadId: uploadId,
            storagePath: signedUpload.data.storagePath,
            originalFileName: originalFileName,
            mimeType: mimeType,
            sizeBytes: data.count,
            sha256Hash: SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined(),
            title: originalFileName,
            documentType: "client_upload"
        )

        return try await apiClient.send(
            "/api/v1/cases/\(caseId.uuidString)/documents/complete-upload",
            method: "POST",
            body: completeRequest
        )
    }

    private func upload(data: Data, to signedUrl: URL, mimeType: String) async throws {
        var request = URLRequest(url: signedUrl)
        request.httpMethod = "PUT"
        request.setValue(mimeType, forHTTPHeaderField: "Content-Type")
        request.setValue("max-age=3600", forHTTPHeaderField: "Cache-Control")
        request.setValue("false", forHTTPHeaderField: "x-upsert")

        let (_, response) = try await urlSession.upload(for: request, from: data)
        guard let httpResponse = response as? HTTPURLResponse, (200..<300).contains(httpResponse.statusCode) else {
            throw URLError(.cannotUploadFile)
        }
    }
}
