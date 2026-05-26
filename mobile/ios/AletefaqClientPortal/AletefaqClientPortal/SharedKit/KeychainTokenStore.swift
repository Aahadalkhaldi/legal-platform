import Foundation
import Security

final class KeychainTokenStore: TokenStore {
    private let service: String
    private let account = "supabase-session"

    init(service: String) {
        self.service = service
    }

    var hasSession: Bool {
        (try? loadSession()) != nil
    }

    func accessToken() throws -> String {
        try loadSession().accessToken
    }

    func refreshToken() throws -> String {
        try loadSession().refreshToken
    }

    func save(session: AuthSession) throws {
        let data = try JSONEncoder().encode(session)
        var query = baseQuery()
        SecItemDelete(query as CFDictionary)
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeychainError.unhandledStatus(status)
        }
    }

    func clearSensitiveState() throws {
        SecItemDelete(baseQuery() as CFDictionary)
    }

    private func loadSession() throws -> AuthSession {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else {
            throw KeychainError.missingSession
        }

        return try JSONDecoder().decode(AuthSession.self, from: data)
    }

    private func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
    }
}

enum KeychainError: Error {
    case missingSession
    case unhandledStatus(OSStatus)
}
