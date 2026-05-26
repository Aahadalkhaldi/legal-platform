import Foundation

public struct APIErrorEnvelope: Decodable, Error {
    public struct APIError: Decodable {
        public let code: String
        public let message: String
        public let requestId: String
    }

    public let error: APIError
}

public protocol TokenStore {
    func accessToken() throws -> String
    func clearSensitiveState() throws
}

public final class LegalAPIClient {
    private let baseURL: URL
    private let tokenStore: TokenStore
    private let urlSession: URLSession

    public init(baseURL: URL, tokenStore: TokenStore, urlSession: URLSession = .shared) {
        self.baseURL = baseURL
        self.tokenStore = tokenStore
        self.urlSession = urlSession
    }

    public func send<Response: Decodable>(
        _ path: String,
        method: String = "GET",
        body: Encodable? = nil,
        responseType: Response.Type = Response.self
    ) async throws -> Response {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method
        request.setValue("Bearer \(try tokenStore.accessToken())", forHTTPHeaderField: "Authorization")
        request.setValue(UUID().uuidString, forHTTPHeaderField: "X-Request-ID")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let body {
            request.httpBody = try JSONEncoder.legalPlatform.encode(AnyEncodable(body))
        }

        let (data, response) = try await urlSession.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }

        if (200..<300).contains(httpResponse.statusCode) {
            return try JSONDecoder.legalPlatform.decode(Response.self, from: data)
        }

        if let apiError = try? JSONDecoder.legalPlatform.decode(APIErrorEnvelope.self, from: data) {
            throw apiError
        }

        throw URLError(.badServerResponse)
    }
}

private struct AnyEncodable: Encodable {
    private let encodeClosure: (Encoder) throws -> Void

    init(_ wrapped: Encodable) {
        self.encodeClosure = wrapped.encode
    }

    func encode(to encoder: Encoder) throws {
        try encodeClosure(encoder)
    }
}

extension JSONEncoder {
    static let legalPlatform: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()
}

extension JSONDecoder {
    static let legalPlatform: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()
}
