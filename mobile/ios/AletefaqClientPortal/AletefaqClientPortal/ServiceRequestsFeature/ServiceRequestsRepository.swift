import Foundation

protocol ServiceRequestsRepository {
    func list(status: String?) async throws -> APIPage<ServiceRequestDTO>
    func create(_ request: CreateServiceRequestRequest) async throws -> APIData<ServiceRequestDTO>
}

final class RemoteServiceRequestsRepository: ServiceRequestsRepository {
    private let apiClient: LegalAPIClient

    init(apiClient: LegalAPIClient) {
        self.apiClient = apiClient
    }

    func list(status: String? = nil) async throws -> APIPage<ServiceRequestDTO> {
        var components = URLComponents()
        components.path = "/api/v1/service-requests"
        components.queryItems = status.map { [URLQueryItem(name: "status", value: $0)] }
        return try await apiClient.send(components.string ?? "/api/v1/service-requests")
    }

    func create(_ request: CreateServiceRequestRequest) async throws -> APIData<ServiceRequestDTO> {
        try await apiClient.send("/api/v1/service-requests", method: "POST", body: request)
    }
}
