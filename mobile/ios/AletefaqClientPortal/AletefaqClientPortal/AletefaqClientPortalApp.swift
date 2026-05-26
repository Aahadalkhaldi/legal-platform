import SwiftUI

@main
struct AletefaqClientPortalApp: App {
    @StateObject private var sessionStore: AuthSessionStore
    private let environment: AppEnvironment

    init() {
        let environment = AppEnvironment.live()
        self.environment = environment
        _sessionStore = StateObject(wrappedValue: AuthSessionStore(authService: environment.authService, tokenStore: environment.tokenStore))
    }

    var body: some Scene {
        WindowGroup {
            RootView(environment: environment)
                .environmentObject(sessionStore)
        }
    }
}
