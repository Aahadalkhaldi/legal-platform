import SwiftUI

@MainActor
final class ServiceRequestsModel: ObservableObject {
    @Published var requests: [ServiceRequestDTO] = []
    @Published var cases: [CaseSummaryDTO] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let repository: ServiceRequestsRepository
    private let casesRepository: CasesRepository

    init(repository: ServiceRequestsRepository, casesRepository: CasesRepository) {
        self.repository = repository
        self.casesRepository = casesRepository
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            async let requestsPage = repository.list(status: nil)
            async let casesPage = casesRepository.listCases(cursor: nil)
            requests = try await requestsPage.data
            cases = try await casesPage.data
        } catch {
            errorMessage = "Unable to load service requests."
        }
    }

    func submit(title: String, description: String, serviceType: String, caseId: UUID?) async {
        do {
            let request = CreateServiceRequestRequest(
                caseId: caseId,
                serviceType: serviceType,
                title: title,
                description: description,
                preferredContactMethod: "app",
                preferredAt: nil
            )
            _ = try await repository.create(request)
            await load()
        } catch {
            errorMessage = "Unable to submit service request."
        }
    }
}

struct ServiceRequestsView: View {
    @StateObject private var model: ServiceRequestsModel
    @State private var isPresentingForm = false

    init(repository: ServiceRequestsRepository, casesRepository: CasesRepository) {
        _model = StateObject(wrappedValue: ServiceRequestsModel(repository: repository, casesRepository: casesRepository))
    }

    var body: some View {
        List {
            if let errorMessage = model.errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            }

            ForEach(model.requests) { request in
                VStack(alignment: .leading, spacing: 6) {
                    Text(request.title).font(.headline)
                    Text(request.description).lineLimit(2)
                    HStack {
                        Text(request.serviceType.replacingOccurrences(of: "_", with: " ").capitalized)
                        Spacer()
                        Text(request.status.replacingOccurrences(of: "_", with: " ").capitalized)
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
            }
        }
        .overlay {
            if model.isLoading { ProgressView() }
        }
        .navigationTitle("Service Requests")
        .toolbar {
            Button {
                isPresentingForm = true
            } label: {
                Label("New Request", systemImage: "plus")
            }
        }
        .sheet(isPresented: $isPresentingForm) {
            NewServiceRequestView(cases: model.cases) { title, description, type, caseId in
                await model.submit(title: title, description: description, serviceType: type, caseId: caseId)
            }
        }
        .task { await model.load() }
        .refreshable { await model.load() }
    }
}

struct NewServiceRequestView: View {
    let cases: [CaseSummaryDTO]
    let onSubmit: (String, String, String, UUID?) async -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var description = ""
    @State private var serviceType = "consultation"
    @State private var caseId: UUID?

    var body: some View {
        NavigationStack {
            Form {
                Picker("Type", selection: $serviceType) {
                    Text("Consultation").tag("consultation")
                    Text("Document review").tag("document_review")
                    Text("New claim").tag("new_claim")
                    Text("Follow up").tag("follow_up")
                    Text("Other").tag("other")
                }

                Picker("Case", selection: $caseId) {
                    Text("No case").tag(Optional<UUID>.none)
                    ForEach(cases) { item in
                        Text(item.title).tag(Optional(item.id))
                    }
                }

                TextField("Title", text: $title)
                TextField("Description", text: $description, axis: .vertical)
                    .lineLimit(4...8)
            }
            .navigationTitle("New Request")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Submit") {
                        Task {
                            await onSubmit(title, description, serviceType, caseId)
                            dismiss()
                        }
                    }
                    .disabled(title.isEmpty || description.isEmpty)
                }
            }
        }
    }
}
