import Foundation

public struct APIPage<T: Decodable>: Decodable {
    public struct Page: Decodable {
        public let nextCursor: String?
        public let limit: Int
    }

    public let data: [T]
    public let page: Page
}

public struct APIData<T: Decodable>: Decodable {
    public let data: T
    public let requestId: String?
}

public struct CurrentUserDTO: Decodable {
    public let userId: UUID
    public let email: String?
    public let accountId: UUID
    public let role: String
    public let permissions: [String]
}

public struct CaseSummaryDTO: Decodable, Identifiable {
    public let id: UUID
    public let caseNumber: String?
    public let title: String
    public let status: String
    public let stage: String
    public let courtName: String?
    public let nextHearingAt: Date?
    public let updatedAt: Date
}

public struct ClientUpdateDTO: Decodable, Identifiable {
    public let id: UUID
    public let caseId: UUID
    public let title: String
    public let body: String
    public let visibleToClient: Bool
    public let createdAt: Date
}

public struct RegisterDeviceRequest: Encodable {
    public let platform: String = "ios"
    public let token: String
    public let deviceId: String
}
