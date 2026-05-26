import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var sessionStore: AuthSessionStore
    @State private var email = ""
    @State private var password = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Email", text: $email)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                    SecureField("Password", text: $password)
                }

                if let errorMessage = sessionStore.errorMessage {
                    Text(errorMessage)
                        .foregroundStyle(.red)
                }

                Button {
                    Task { await sessionStore.signIn(email: email, password: password) }
                } label: {
                    Label(sessionStore.isLoading ? "Signing in" : "Sign in", systemImage: "lock")
                }
                .disabled(email.isEmpty || password.isEmpty || sessionStore.isLoading)
            }
            .navigationTitle("Client Portal")
        }
    }
}
