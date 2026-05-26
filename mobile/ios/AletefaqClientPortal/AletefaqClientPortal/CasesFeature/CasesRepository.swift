import Foundation

protocol CasesRepository {
    func listCases(cursor: String?) async throws -> APIPage<CaseSummaryDTO>
    func caseDetail(id: UUID) async throws -> APIData<CaseDetailDTO>
    func clientUpdates(caseId: UUID) async throws -> APIPage<ClientUpdateDTO>
}

final class RemoteCasesRepository: CasesRepository {
    private let apiClient: LegalAPIClient

    init(apiClient: LegalAPIClient) {
        self.apiClient = apiClient
    }

    func listCases(cursor: String? = nil) async throws -> APIPage<CaseSummaryDTO> {
        var components = URLComponents()
        components.path = "/api/v1/cases"
        components.queryItems = cursor.map { [URLQueryItem(name: "cursor", value: $0)] }
        return try await apiClient.send(components.string ?? "/api/v1/cases")
    }

    func caseDetail(id: UUID) async throws -> APIData<CaseDetailDTO> {
        try await apiClient.send("/api/v1/cases/\(id.uuidString)")
    }

    func clientUpdates(caseId: UUID) async throws -> APIPage<ClientUpdateDTO> {
        try await apiClient.send("/api/v1/cases/\(caseId.uuidString)/client-updates")
    }
}
