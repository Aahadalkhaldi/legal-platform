import SwiftUI

@MainActor
final class CasesListModel: ObservableObject {
    @Published var cases: [CaseSummaryDTO] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let repository: CasesRepository

    init(repository: CasesRepository) {
        self.repository = repository
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            cases = try await repository.listCases(cursor: nil).data
        } catch {
            errorMessage = "Unable to load cases."
        }
    }
}

struct CasesListView: View {
    @StateObject private var model: CasesListModel
    private let repository: CasesRepository
    private let documentsRepository: DocumentsRepository

    init(repository: CasesRepository, documentsRepository: DocumentsRepository) {
        self.repository = repository
        self.documentsRepository = documentsRepository
        _model = StateObject(wrappedValue: CasesListModel(repository: repository))
    }

    var body: some View {
        List {
            if let errorMessage = model.errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            }

            ForEach(model.cases) { item in
                NavigationLink {
                    CaseDetailView(caseId: item.id, repository: repository, documentsRepository: documentsRepository)
                } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(item.title).font(.headline)
                        HStack {
                            Text(item.caseNumber ?? "No case number")
                            Spacer()
                            Text(item.status.capitalized)
                        }
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .overlay {
            if model.isLoading { ProgressView() }
        }
        .navigationTitle("My Cases")
        .task { await model.load() }
        .refreshable { await model.load() }
    }
}
