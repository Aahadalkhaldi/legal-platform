import Foundation

protocol AppointmentsRepository {
    func listUpcoming() async throws -> APIData<[AppointmentDTO]>
}

final class RemoteAppointmentsRepository: AppointmentsRepository {
    private let apiClient: LegalAPIClient

    init(apiClient: LegalAPIClient) {
        self.apiClient = apiClient
    }

    func listUpcoming() async throws -> APIData<[AppointmentDTO]> {
        try await apiClient.send("/api/v1/appointments")
    }
}
