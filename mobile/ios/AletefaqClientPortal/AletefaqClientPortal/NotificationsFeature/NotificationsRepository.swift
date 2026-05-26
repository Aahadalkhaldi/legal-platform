import Foundation
protocol NotificationsRepository {
    func list() async throws -> APIPage<NotificationDTO>
    func registerAPNSToken(_ token: String, deviceId: String) async throws
}

final class RemoteNotificationsRepository: NotificationsRepository {
    private let apiClient: LegalAPIClient

    init(apiClient: LegalAPIClient) {
        self.apiClient = apiClient
    }

    func list() async throws -> APIPage<NotificationDTO> {
        try await apiClient.send("/api/v1/notifications")
    }

    func registerAPNSToken(_ token: String, deviceId: String) async throws {
        let request = RegisterDeviceRequest(token: token, deviceId: deviceId)
        let _: APIData<DeviceTokenResponse> = try await apiClient.send(
            "/api/v1/notifications/register-device",
            method: "POST",
            body: request
        )
    }
}

struct DeviceTokenResponse: Decodable {
    let id: UUID
}
