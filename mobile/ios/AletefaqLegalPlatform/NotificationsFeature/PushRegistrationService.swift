import Foundation

public final class PushRegistrationService {
    private let apiClient: LegalAPIClient

    public init(apiClient: LegalAPIClient) {
        self.apiClient = apiClient
    }

    public func registerAPNSToken(_ token: String, deviceId: String) async throws {
        let request = RegisterDeviceRequest(token: token, deviceId: deviceId)
        let _: APIData<DeviceTokenResponse> = try await apiClient.send(
            "/api/v1/notifications/register-device",
            method: "POST",
            body: request
        )
    }
}

public struct DeviceTokenResponse: Decodable {
    public let id: UUID
}
