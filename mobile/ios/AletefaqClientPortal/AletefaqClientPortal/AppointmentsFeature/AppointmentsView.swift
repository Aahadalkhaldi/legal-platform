import SwiftUI

@MainActor
final class AppointmentsModel: ObservableObject {
    @Published var appointments: [AppointmentDTO] = []
    @Published var errorMessage: String?

    private let repository: AppointmentsRepository

    init(repository: AppointmentsRepository) {
        self.repository = repository
    }

    func load() async {
        do {
            appointments = try await repository.listUpcoming().data
        } catch {
            errorMessage = "Unable to load appointments."
        }
    }
}

struct AppointmentsView: View {
    @StateObject private var model: AppointmentsModel

    init(repository: AppointmentsRepository) {
        _model = StateObject(wrappedValue: AppointmentsModel(repository: repository))
    }

    var body: some View {
        List {
            if let errorMessage = model.errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            }

            ForEach(model.appointments) { item in
                VStack(alignment: .leading, spacing: 6) {
                    Text(item.title).font(.headline)
                    Text(item.startsAt.formatted(date: .abbreviated, time: .shortened))
                    if let location = item.location {
                        Text(location).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle("Appointments")
        .task { await model.load() }
        .refreshable { await model.load() }
    }
}
