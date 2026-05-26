import SwiftUI

@MainActor
final class NotificationsModel: ObservableObject {
    @Published var notifications: [NotificationDTO] = []
    @Published var errorMessage: String?

    private let repository: NotificationsRepository

    init(repository: NotificationsRepository) {
        self.repository = repository
    }

    func load() async {
        do {
            notifications = try await repository.list().data
        } catch {
            errorMessage = "Unable to load notifications."
        }
    }
}

struct NotificationsView: View {
    @EnvironmentObject private var sessionStore: AuthSessionStore
    @StateObject private var model: NotificationsModel

    init(repository: NotificationsRepository) {
        _model = StateObject(wrappedValue: NotificationsModel(repository: repository))
    }

    var body: some View {
        List {
            if let errorMessage = model.errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            }

            ForEach(model.notifications) { item in
                VStack(alignment: .leading, spacing: 6) {
                    Text(item.title).font(.headline)
                    if let body = item.body {
                        Text(body)
                    }
                    Text(item.createdAt.formatted(date: .abbreviated, time: .shortened))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Section {
                Button(role: .destructive) {
                    sessionStore.signOut()
                } label: {
                    Label("Sign out", systemImage: "rectangle.portrait.and.arrow.right")
                }
            }
        }
        .navigationTitle("Alerts")
        .task { await model.load() }
        .refreshable { await model.load() }
    }
}
