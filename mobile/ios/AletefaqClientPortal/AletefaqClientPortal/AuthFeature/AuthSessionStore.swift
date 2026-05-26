import Foundation

@MainActor
final class AuthSessionStore: ObservableObject {
    @Published private(set) var isAuthenticated: Bool = false
    @Published var errorMessage: String?
    @Published var isLoading = false

    private let authService: AuthService
    private let tokenStore: TokenStore

    init(authService: AuthService, tokenStore: TokenStore) {
        self.authService = authService
        self.tokenStore = tokenStore
    }

    func restoreSession() {
        isAuthenticated = tokenStore.hasSession
    }

    func signIn(email: String, password: String) async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            _ = try await authService.signIn(email: email, password: password)
            isAuthenticated = true
        } catch {
            errorMessage = "Unable to sign in. Check credentials and MFA requirements."
        }
    }

    func signOut() {
        try? tokenStore.clearSensitiveState()
        isAuthenticated = false
    }
}
