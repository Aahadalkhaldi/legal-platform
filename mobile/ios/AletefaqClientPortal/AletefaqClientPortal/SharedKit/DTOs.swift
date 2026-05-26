import Foundation

struct AuthSession: Codable {
    let accessToken: String
    let refreshToken: String
    let expiresIn: Int
    let tokenType: String
}

struct CurrentUserDTO: Decodable {
    let userId: UUID
    let email: String?
    let accountId: UUID
    let role: String
    let permissions: [String]
}

struct CaseSummaryDTO: Decodable, Identifiable {
    let id: UUID
    let caseNumber: String?
    let title: String
    let status: String
    let stage: String
    let courtName: String?
    let nextHearingAt: Date?
    let updatedAt: Date
}

struct ClientUpdateDTO: Decodable, Identifiable {
    let id: UUID
    let caseId: UUID
    let title: String
    let body: String
    let visibleToClient: Bool
    let createdAt: Date
}

struct CaseDetailDTO: Decodable, Identifiable {
    let id: UUID
    let title: String
    let caseNumber: String?
    let description: String?
    let status: String
    let stage: String
    let nextHearingAt: Date?
    let updatedAt: Date
}

struct DocumentDTO: Decodable, Identifiable {
    let id: UUID
    let title: String
    let documentType: String?
    let classification: String?
    let visibleToClient: Bool?
    let updatedAt: Date?
}

struct SignedURLDTO: Decodable {
    let signedUrl: URL
    let expiresInSeconds: Int
}

struct ClientDocumentSignedUploadRequest: Encodable {
    let uploadId: UUID
    let originalFileName: String
    let mimeType: String
    let sizeBytes: Int
}

struct ClientDocumentSignedUploadDTO: Decodable {
    let bucket: String
    let storagePath: String
    let signedUrl: URL
    let token: String
    let expiresInSeconds: Int
}

struct CompleteClientDocumentUploadRequest: Encodable {
    let uploadId: UUID
    let storagePath: String
    let originalFileName: String
    let mimeType: String
    let sizeBytes: Int
    let sha256Hash: String
    let title: String
    let documentType: String
}

struct ServiceRequestDTO: Decodable, Identifiable {
    let id: UUID
    let caseId: UUID?
    let clientUserId: UUID
    let assignedUserId: UUID?
    let serviceType: String
    let status: String
    let priority: String
    let title: String
    let description: String
    let preferredContactMethod: String?
    let preferredAt: Date?
    let resolvedAt: Date?
    let createdAt: Date
    let updatedAt: Date
}

struct CreateServiceRequestRequest: Encodable {
    let caseId: UUID?
    let serviceType: String
    let title: String
    let description: String
    let preferredContactMethod: String?
    let preferredAt: Date?
}

struct AppointmentDTO: Decodable, Identifiable {
    let id: UUID
    let caseId: UUID?
    let title: String
    let appointmentType: String
    let startsAt: Date
    let endsAt: Date?
    let location: String?
}

struct NotificationDTO: Decodable, Identifiable {
    let id: UUID
    let title: String
    let body: String?
    let targetType: String?
    let targetId: UUID?
    let readAt: Date?
    let createdAt: Date
}

struct RegisterDeviceRequest: Encodable {
    let platform = "ios"
    let token: String
    let deviceId: String
}

struct AssistantChatRequest: Encodable {
    let caseId: UUID?
    let message: String
}

struct AssistantChatResponse: Decodable {
    let answer: String
    let citations: [String]?
}
