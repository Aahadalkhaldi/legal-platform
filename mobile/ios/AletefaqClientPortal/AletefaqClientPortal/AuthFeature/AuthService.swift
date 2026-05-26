import Foundation

protocol AuthService {
    func signIn(email: String, password: String) async throws -> AuthSession
    func refreshSession() async throws -> AuthSession
    func signOut() async throws
}

final class SupabaseAuthService: AuthService {
    private let baseURL: URL
    private let anonKey: String
    private let tokenStore: TokenStore
    private let urlSession: URLSession

    init(baseURL: URL, anonKey: String, tokenStore: TokenStore, urlSession: URLSession = .shared) {
        self.baseURL = baseURL
        self.anonKey = anonKey
        self.tokenStore = tokenStore
        self.urlSession = urlSession
    }

    func signIn(email: String, password: String) async throws -> AuthSession {
        let body = PasswordGrantRequest(email: email, password: password)
        let session: SupabaseSessionResponse = try await sendAuthRequest("/auth/v1/token?grant_type=password", body: body)
        let authSession = session.toAuthSession()
        try tokenStore.save(session: authSession)
        return authSession
    }

    func refreshSession() async throws -> AuthSession {
        let body = RefreshGrantRequest(refreshToken: try tokenStore.refreshToken())
        let session: SupabaseSessionResponse = try await sendAuthRequest("/auth/v1/token?grant_type=refresh_token", body: body)
        let authSession = session.toAuthSession()
        try tokenStore.save(session: authSession)
        return authSession
    }

    func signOut() async throws {
        try tokenStore.clearSensitiveState()
    }

    private func sendAuthRequest<Response: Decodable>(_ path: String, body: Encodable) async throws -> Response {
        var request = URLRequest(url: URL(string: path, relativeTo: baseURL)!.absoluteURL)
        request.httpMethod = "POST"
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(anonKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder.legalPlatform.encode(AnyAuthEncodable(body))

        let (data, response) = try await urlSession.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, (200..<300).contains(httpResponse.statusCode) else {
            throw URLError(.userAuthenticationRequired)
        }

        return try JSONDecoder.legalPlatform.decode(Response.self, from: data)
    }
}

private struct PasswordGrantRequest: Encodable {
    let email: String
    let password: String
}

private struct RefreshGrantRequest: Encodable {
    let refreshToken: String

    enum CodingKeys: String, CodingKey {
        case refreshToken = "refresh_token"
    }
}

private struct SupabaseSessionResponse: Decodable {
    let accessToken: String
    let refreshToken: String
    let expiresIn: Int
    let tokenType: String

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresIn = "expires_in"
        case tokenType = "token_type"
    }

    func toAuthSession() -> AuthSession {
        AuthSession(accessToken: accessToken, refreshToken: refreshToken, expiresIn: expiresIn, tokenType: tokenType)
    }
}

private struct AnyAuthEncodable: Encodable {
    private let encodeClosure: (Encoder) throws -> Void

    init(_ wrapped: Encodable) {
        self.encodeClosure = wrapped.encode
    }

    func encode(to encoder: Encoder) throws {
        try encodeClosure(encoder)
    }
}
