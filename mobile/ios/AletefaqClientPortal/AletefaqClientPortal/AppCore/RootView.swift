import SwiftUI

struct RootView: View {
    let environment: AppEnvironment
    @EnvironmentObject private var sessionStore: AuthSessionStore

    var body: some View {
        Group {
            if sessionStore.isAuthenticated {
                ClientPortalTabView(environment: environment)
            } else {
                LoginView()
            }
        }
        .task {
            sessionStore.restoreSession()
        }
    }
}

struct ClientPortalTabView: View {
    let environment: AppEnvironment

    var body: some View {
        TabView {
            NavigationStack {
                CasesListView(repository: environment.casesRepository, documentsRepository: environment.documentsRepository)
            }
            .tabItem { Label("Cases", systemImage: "folder") }

            NavigationStack {
                ServiceRequestsView(repository: environment.serviceRequestsRepository, casesRepository: environment.casesRepository)
            }
            .tabItem { Label("Services", systemImage: "plus.message") }

            NavigationStack {
                AppointmentsView(repository: environment.appointmentsRepository)
            }
            .tabItem { Label("Calendar", systemImage: "calendar") }

            NavigationStack {
                AssistantChatView(repository: environment.assistantRepository)
            }
            .tabItem { Label("Assistant", systemImage: "sparkles") }

            NavigationStack {
                NotificationsView(repository: environment.notificationsRepository)
            }
            .tabItem { Label("Alerts", systemImage: "bell") }
        }
    }
}
