import Foundation

protocol AssistantRepository {
    func send(message: String, caseId: UUID?) async throws -> APIData<AssistantChatResponse>
}

final class RemoteAssistantRepository: AssistantRepository {
    private let apiClient: LegalAPIClient

    init(apiClient: LegalAPIClient) {
        self.apiClient = apiClient
    }

    func send(message: String, caseId: UUID?) async throws -> APIData<AssistantChatResponse> {
        let request = AssistantChatRequest(caseId: caseId, message: message)
        return try await apiClient.send("/api/v1/ai/legal-assistant/chat", method: "POST", body: request)
    }
}
