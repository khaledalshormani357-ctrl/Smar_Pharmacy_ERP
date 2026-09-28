export class PasswordSecurity {
  /**
   * Generate a secure random salt.
   */
  static generateSalt(length = 16): string {
    const arr = new Uint8Array(length);
    if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
      crypto.getRandomValues(arr);
    } else {
      for (let i = 0; i < length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
    }
    return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Async hash used for strong local/offline hashing.
   * This is a client-side fallback and should be paired with a secure server-side scheme in production.
   */
  static async hash(secret: string, salt?: string): Promise<string> {
    const usedSalt = salt || this.generateSalt();
    const input = new TextEncoder().encode(`${secret}:${usedSalt}`);

    if (typeof crypto !== 'undefined' && crypto.subtle) {
      let current = input;
      for (let i = 0; i < 450; i++) {
        current = new Uint8Array(await crypto.subtle.digest('SHA-256', current));
      }
      const hashHex = Array.from(current)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      return `pbkdf2:sha256:450:${usedSalt}:${hashHex}`;
    }

    return this.hashSync(secret, usedSalt);
  }

  /**
   * Deterministic synchronous fallback used for local migration and bootstrapping.
   */
  static hashSync(secret: string, salt?: string): string {
    const usedSalt = salt || this.generateSalt();
    let hash = 2166136261 >>> 0;
    const combined = `${secret}:${usedSalt}`;

    for (let i = 0; i < combined.length; i++) {
      hash ^= combined.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }

    for (let i = 0; i < 64; i++) {
      hash = Math.imul(hash ^ (hash >>> 13), 0x5bd1e995) >>> 0;
    }

    return `hashsync:v2:${usedSalt}:${hash.toString(16).padStart(8, '0')}`;
  }

  /**
   * Strictly reject plaintext / legacy hashes and any bypass values.
   */
  static verifySync(attempt: string, storedHash: string): boolean {
    if (!attempt || !storedHash) return false;

    if (!storedHash.startsWith('hashsync:') && !storedHash.startsWith('pbkdf2:')) {
      return false;
    }

    if (storedHash.startsWith('hashsync:')) {
      const parts = storedHash.split(':');
      if (parts.length < 4) return false;
      const salt = parts[2];
      return storedHash === this.hashSync(attempt, salt);
    }

    return false;
  }

  static async verify(attempt: string, storedHash: string): Promise<boolean> {
    if (!attempt || !storedHash) return false;

    if (!storedHash.startsWith('hashsync:') && !storedHash.startsWith('pbkdf2:')) {
      return false;
    }

    if (storedHash.startsWith('pbkdf2:')) {
      const parts = storedHash.split(':');
      if (parts.length < 4) return false;
      const salt = parts[2];
      const expected = await this.hash(attempt, salt);
      return storedHash === expected;
    }

    return this.verifySync(attempt, storedHash);
  }
}
