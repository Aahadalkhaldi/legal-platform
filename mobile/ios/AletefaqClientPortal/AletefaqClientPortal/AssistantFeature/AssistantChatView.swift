import SwiftUI

struct ChatMessage: Identifiable {
    let id = UUID()
    let role: String
    let text: String
}

@MainActor
final class AssistantChatModel: ObservableObject {
    @Published var messages: [ChatMessage] = []
    @Published var draft = ""
    @Published var isSending = false
    @Published var errorMessage: String?

    private let repository: AssistantRepository

    init(repository: AssistantRepository) {
        self.repository = repository
    }

    func send() async {
        let message = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !message.isEmpty else { return }

        draft = ""
        messages.append(ChatMessage(role: "You", text: message))
        isSending = true
        defer { isSending = false }

        do {
            let response = try await repository.send(message: message, caseId: nil).data
            let citations = response.citations?.joined(separator: "\n") ?? ""
            messages.append(ChatMessage(role: "Assistant", text: citations.isEmpty ? response.answer : "\(response.answer)\n\nSources:\n\(citations)"))
        } catch {
            errorMessage = "Unable to reach the legal assistant."
        }
    }
}

struct AssistantChatView: View {
    @StateObject private var model: AssistantChatModel

    init(repository: AssistantRepository) {
        _model = StateObject(wrappedValue: AssistantChatModel(repository: repository))
    }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    ForEach(model.messages) { message in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(message.role).font(.caption).foregroundStyle(.secondary)
                            Text(message.text)
                                .padding(10)
                                .background(message.role == "You" ? Color.blue.opacity(0.12) : Color.gray.opacity(0.12))
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                        .frame(maxWidth: .infinity, alignment: message.role == "You" ? .trailing : .leading)
                    }
                }
                .padding()
            }

            if let errorMessage = model.errorMessage {
                Text(errorMessage).foregroundStyle(.red).font(.caption)
            }

            HStack {
                TextField("Ask about your case", text: $model.draft, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                Button {
                    Task { await model.send() }
                } label: {
                    Image(systemName: "paperplane.fill")
                }
                .disabled(model.isSending || model.draft.isEmpty)
            }
            .padding()
        }
        .navigationTitle("Legal Assistant")
    }
}
