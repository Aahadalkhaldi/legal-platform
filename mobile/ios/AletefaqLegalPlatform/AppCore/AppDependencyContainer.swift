import Foundation

public final class AppDependencyContainer {
    public let apiClient: LegalAPIClient
    public let casesRepository: CasesRepository
    public let pushRegistrationService: PushRegistrationService

    public init(apiBaseURL: URL, tokenStore: TokenStore) {
        self.apiClient = LegalAPIClient(baseURL: apiBaseURL, tokenStore: tokenStore)
        self.casesRepository = RemoteCasesRepository(apiClient: apiClient)
        self.pushRegistrationService = PushRegistrationService(apiClient: apiClient)
    }
}
