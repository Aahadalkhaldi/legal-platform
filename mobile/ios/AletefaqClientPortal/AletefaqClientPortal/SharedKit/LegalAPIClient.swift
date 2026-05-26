import Foundation

struct APIPage<T: Decodable>: Decodable {
    struct Page: Decodable {
        let nextCursor: String?
        let limit: Int
    }

    let data: [T]
    let page: Page
}

struct APIData<T: Decodable>: Decodable {
    let data: T
    let requestId: String?
}

struct APIErrorEnvelope: Decodable, Error {
    struct APIError: Decodable {
        let code: String
        let message: String
        let requestId: String
    }

    let error: APIError
}

protocol TokenStore {
    func accessToken() throws -> String
    func refreshToken() throws -> String
    func save(session: AuthSession) throws
    func clearSensitiveState() throws
    var hasSession: Bool { get }
}

final class LegalAPIClient {
    private let baseURL: URL
    private let tokenStore: TokenStore
    private let urlSession: URLSession

    init(baseURL: URL, tokenStore: TokenStore, urlSession: URLSession = .shared) {
        self.baseURL = baseURL
        self.tokenStore = tokenStore
        self.urlSession = urlSession
    }

    func send<Response: Decodable>(
        _ path: String,
        method: String = "GET",
        body: Encodable? = nil,
        responseType: Response.Type = Response.self
    ) async throws -> Response {
        let url = URL(string: path, relativeTo: baseURL)?.absoluteURL ?? baseURL.appendingPathComponent(path)
        var request = URLRequest(url: url)
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
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let value = try container.decode(String.self)
            if let date = ISO8601DateFormatter.legalPlatformWithFractionalSeconds.date(from: value)
                ?? ISO8601DateFormatter.legalPlatform.date(from: value) {
                return date
            }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Invalid ISO-8601 date: \(value)")
        }
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }()
}

private extension ISO8601DateFormatter {
    static let legalPlatform: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    static let legalPlatformWithFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}
