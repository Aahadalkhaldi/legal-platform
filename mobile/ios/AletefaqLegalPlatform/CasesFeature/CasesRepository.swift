import Foundation

public protocol CasesRepository {
    func listCases(cursor: String?, updatedAfter: Date?) async throws -> APIPage<CaseSummaryDTO>
}

public final class RemoteCasesRepository: CasesRepository {
    private let apiClient: LegalAPIClient

    public init(apiClient: LegalAPIClient) {
        self.apiClient = apiClient
    }

    public func listCases(cursor: String? = nil, updatedAfter: Date? = nil) async throws -> APIPage<CaseSummaryDTO> {
        var components = URLComponents()
        components.path = "/api/v1/cases"
        components.queryItems = [
            cursor.map { URLQueryItem(name: "cursor", value: $0) },
            updatedAfter.map { URLQueryItem(name: "updated_after", value: ISO8601DateFormatter().string(from: $0)) },
        ].compactMap { $0 }

        return try await apiClient.send(components.url?.absoluteString ?? "/api/v1/cases")
    }
}
