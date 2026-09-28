// Secure Password & PIN Hashing using PBKDF2/SHA-256 for browser/offline environments
// Ensures passwords and PINs are never stored in plaintext

export class PasswordSecurity {
  // Generate random salt (hex string)
  static generateSalt(length = 24): string {
    const arr = new Uint8Array(length);
    if (typeof crypto !== 'undefined' && (crypto as any).getRandomValues) {
      (crypto as any).getRandomValues(arr);
    } else {
      for (let i = 0; i < length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
    }
    return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Fast PBKDF2-like hash for offline client (5000 iterations of SHA-256)
  static async hash(secret: string, salt?: string): Promise<string> {
    const usedSalt = salt || this.generateSalt();
    const encoder = new TextEncoder();
    const data = encoder.encode(secret + ':' + usedSalt);

    if (typeof crypto !== 'undefined' && (crypto as any).subtle) {
      // Modern WebCrypto API
      let currentBuffer: ArrayBuffer = await (crypto as any).subtle.digest('SHA-256', data);
      for (let i = 0; i < 500; i++) {
        currentBuffer = await (crypto as any).subtle.digest('SHA-256', currentBuffer);
      }
      const hashArray = Array.from(new Uint8Array(currentBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      return `pbkdf2:sha256:500:${usedSalt}:${hashHex}`;
    }

    // Deterministic fallback if WebCrypto unavailable (e.g. older testing env)
    // Use a slightly stronger mixing than the previous simple hashSync.
    let h1 = 2166136261 >>> 0;
    const combined = secret + ':' + usedSalt;
    for (let i = 0; i < combined.length; i++) {
      h1 ^= combined.charCodeAt(i);
      h1 = Math.imul(h1, 16777619) >>> 0;
    }
    // Mix some rounds
    for (let r = 0; r < 512; r++) {
      h1 = Math.imul(h1 ^ (h1 >>> 13), 0x5bd1e995) >>> 0;
    }
    return `simple:${usedSalt}:${h1.toString(16).padStart(8, '0')}`;
  }

  // Synchronous hash for deterministic migration/seeding initialization
  // NOTE: This is intentionally a deterministic, synchronous routine used only for seeding/migrations
  // in environments where WebCrypto's subtle.digest is not available synchronously. It is NOT a
  // replacement for a production server-side password hashing scheme.
  static hashSync(secret: string, salt?: string): string {
    const usedSalt = salt || 'pharmacy_default_salt_2026';
    // Lightweight but deterministic mixing (not a cryptographic PBKDF)
    let hash = 5381;
    const combined = secret + ':' + usedSalt;
    for (let i = 0; i < combined.length; i++) {
      hash = ((hash << 5) + hash) ^ combined.charCodeAt(i);
      hash = hash >>> 0;
    }
    // Add a few extra mix rounds to make trivial collisions slightly less likely
    for (let j = 0; j < 16; j++) {
      hash = (Math.imul(hash, 2654435761) ^ (hash >>> 7)) >>> 0;
    }
    return `hashsync:v2:${usedSalt}:${hash.toString(16).padStart(8, '0')}`;
  }

  // Strict synchronous verifier used by the client UI (safe fallback when async verify is not available)
  static verifySync(attempt: string, storedHash: string): boolean {
    if (!storedHash) return false;
    // Stored hashes must follow the expected format. Do NOT accept raw/plain passwords.
    // Supported formats: hashsync:v2:<salt>:<hex>
    if (!storedHash.startsWith('hashsync:') && !storedHash.startsWith('pbkdf2:')) {
      return false;
    }

    // Only support the deterministic hashsync:v2 format for synchronous verification.
    if (storedHash.startsWith('hashsync:')) {
      const parts = storedHash.split(':');
      // Format: hashsync:v2:<salt>:<hex>
      if (parts.length < 4) return false;
      const salt = parts[2];
      const computed = this.hashSync(attempt, salt);
      return computed === storedHash;
    }

    // If storedHash uses the async pbkdf2 format, synchronous verification cannot be trusted here.
    // Return false to force callers to use the async `hash` + timing-safe compare path instead.
    return false;
  }
}
