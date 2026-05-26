import Foundation

struct AppEnvironment {
    let tokenStore: KeychainTokenStore
    let authService: AuthService
    let apiClient: LegalAPIClient
    let casesRepository: CasesRepository
    let documentsRepository: DocumentsRepository
    let serviceRequestsRepository: ServiceRequestsRepository
    let appointmentsRepository: AppointmentsRepository
    let notificationsRepository: NotificationsRepository
    let assistantRepository: AssistantRepository

    static func live(bundle: Bundle = .main) -> AppEnvironment {
        let apiBaseURL = bundle.urlValue(for: "API_BASE_URL", fallback: "http://localhost:3000")
        let supabaseURL = bundle.urlValue(for: "SUPABASE_URL", fallback: "http://localhost:54321")
        let anonKey = bundle.stringValue(for: "SUPABASE_ANON_KEY", fallback: "")
        let tokenStore = KeychainTokenStore(service: "com.aletefaq.clientportal")
        let authService = SupabaseAuthService(baseURL: supabaseURL, anonKey: anonKey, tokenStore: tokenStore)
        let apiClient = LegalAPIClient(baseURL: apiBaseURL, tokenStore: tokenStore)

        return AppEnvironment(
            tokenStore: tokenStore,
            authService: authService,
            apiClient: apiClient,
            casesRepository: RemoteCasesRepository(apiClient: apiClient),
            documentsRepository: RemoteDocumentsRepository(apiClient: apiClient),
            serviceRequestsRepository: RemoteServiceRequestsRepository(apiClient: apiClient),
            appointmentsRepository: RemoteAppointmentsRepository(apiClient: apiClient),
            notificationsRepository: RemoteNotificationsRepository(apiClient: apiClient),
            assistantRepository: RemoteAssistantRepository(apiClient: apiClient)
        )
    }
}

private extension Bundle {
    func stringValue(for key: String, fallback: String) -> String {
        object(forInfoDictionaryKey: key) as? String ?? fallback
    }

    func urlValue(for key: String, fallback: String) -> URL {
        URL(string: stringValue(for: key, fallback: fallback)) ?? URL(string: fallback)!
    }
}
