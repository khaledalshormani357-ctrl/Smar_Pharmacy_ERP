export class PasswordSecurity {
  static readonly DEFAULT_ITERATIONS = 200000;
  static readonly DEFAULT_SALT_BYTES = 16;
  static readonly VERSION = 'v1';

  static generateSalt(length = 16): string {
    const arr = new Uint8Array(length);
    if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
      crypto.getRandomValues(arr);
    } else {
      for (let i = 0; i < length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
    }
    return Array.from(arr)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  static hexToBytes(hex: string): Uint8Array {
    const clean = hex.replace(/^0x/, '');
    if (clean.length % 2 !== 0) {
      throw new Error('Malformed hex input');
    }
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < clean.length; i += 2) {
      bytes[i / 2] = Number.parseInt(clean.slice(i, i + 2), 16);
    }
    return bytes;
  }

  static constantTimeEquals(a: string, b: string): boolean {
    const aBytes = new TextEncoder().encode(a);
    const bBytes = new TextEncoder().encode(b);
    const length = Math.max(aBytes.length, bBytes.length);
    let diff = 0;
    for (let i = 0; i < length; i++) {
      const aByte = aBytes[i] ?? 0;
      const bByte = bBytes[i] ?? 0;
      diff |= aByte ^ bByte;
    }
    return diff === 0 && aBytes.length === bBytes.length;
  }

  static normalizeLegacyHash(storedHash: string): string {
    if (!storedHash) return '';
    const trimmed = storedHash.trim();
    if (trimmed.startsWith('hashsync:')) {
      const parts = trimmed.split(':');
      if (parts.length >= 4) {
        return `legacy-hashsync:${parts[1]}:${parts[2]}:${parts[3]}`;
      }
    }
    return trimmed;
  }

  static async hash(secret: string, salt?: string, iterations = PasswordSecurity.DEFAULT_ITERATIONS): Promise<string> {
    if (!secret) {
      throw new Error('Secret is required for hashing');
    }

    const usedSalt = salt || this.generateSalt(this.DEFAULT_SALT_BYTES);
    const encoder = new TextEncoder();
    const saltBytes = this.hexToBytes(usedSalt);
    const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(secret), 'PBKDF2', false, ['deriveBits']);
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations,
        hash: 'SHA-256'
      },
      keyMaterial,
      256
    );

    const derived = Array.from(new Uint8Array(derivedBits))
      .map((val) => val.toString(16).padStart(2, '0'))
      .join('');

    return `pbkdf2-sha256:${this.VERSION}:${iterations}:${usedSalt}:${derived}`;
  }

  static hashSync(secret: string, salt?: string, iterations = PasswordSecurity.DEFAULT_ITERATIONS): string {
    if (!secret) {
      throw new Error('Secret is required for hashing');
    }

    const nodeCrypto = typeof require === 'function' ? require('node:crypto') : null;
    if (!nodeCrypto) {
      throw new Error('Synchronous PBKDF2 hashing is not available in this runtime; use PasswordSecurity.hash()');
    }

    const usedSalt = salt || this.generateSalt(this.DEFAULT_SALT_BYTES);
    const derived = nodeCrypto.pbkdf2Sync(secret, Buffer.from(usedSalt, 'hex'), iterations, 32, 'sha256');
    return `pbkdf2-sha256:${this.VERSION}:${iterations}:${usedSalt}:${derived.toString('hex')}`;
  }

  static async verify(attempt: string, storedHash: string): Promise<boolean> {
    if (!attempt || !storedHash) return false;

    try {
      if (storedHash.startsWith('pbkdf2-sha256:')) {
        const parts = storedHash.split(':');
        if (parts.length !== 5) return false;
        const [, , version, iterationsValue, salt, expectedHash] = parts;
        if (version !== this.VERSION) {
          return false;
        }
        const iterations = Number.parseInt(iterationsValue, 10);
        if (!Number.isFinite(iterations) || iterations < 1) {
          return false;
        }
        const derived = await this.hash(attempt, salt, iterations);
        const compareTarget = derived.split(':');
        const expected = compareTarget[4] ?? '';
        return this.constantTimeEquals(expected, expectedHash);
      }

      if (storedHash.startsWith('pbkdf2:sha256:')) {
        // Legacy construction: not actual PBKDF2. Treat as needing migration.
        const parts = storedHash.split(':');
        if (parts.length < 4) return false;
        const legacyIterations = Number.parseInt(parts[2], 10);
        const legacySalt = parts[3];
        if (!Number.isFinite(legacyIterations) || legacyIterations < 1 || !legacySalt) {
          return false;
        }
        const derived = await this.hash(attempt, legacySalt, legacyIterations);
        const legacyHash = derived.split(':')[4] ?? '';
        return this.constantTimeEquals(legacyHash, parts[4] ?? '');
      }

      if (storedHash.startsWith('hashsync:')) {
        const parts = storedHash.split(':');
        if (parts.length < 4) return false;
        const salt = parts[2];
        const legacyValue = this.hashSync(attempt, salt, 1);
        const expected = legacyValue.split(':')[4] ?? '';
        return this.constantTimeEquals(expected, parts[3] ?? '');
      }

      return false;
    } catch {
      return false;
    }
  }

  static verifySync(attempt: string, storedHash: string): boolean {
    if (!attempt || !storedHash) return false;

    try {
      if (storedHash.startsWith('pbkdf2-sha256:')) {
        const parts = storedHash.split(':');
        if (parts.length !== 5) return false;
        const [, , version, iterationsValue, salt, expectedHash] = parts;
        if (version !== this.VERSION) return false;
        const iterations = Number.parseInt(iterationsValue, 10);
        if (!Number.isFinite(iterations) || iterations < 1) return false;
        const derived = this.hashSync(attempt, salt, iterations);
        const actualHash = derived.split(':')[4] ?? '';
        return this.constantTimeEquals(actualHash, expectedHash);
      }

      if (storedHash.startsWith('hashsync:')) {
        const parts = storedHash.split(':');
        if (parts.length < 4) return false;
        const salt = parts[2];
        const legacy = this.hashSync(attempt, salt, 1);
        const actualHash = legacy.split(':')[4] ?? '';
        return this.constantTimeEquals(actualHash, parts[3] ?? '');
      }

      return false;
    } catch {
      return false;
    }
  }

  static needsRehash(storedHash: string): boolean {
    if (!storedHash) return false;

    if (storedHash.startsWith('pbkdf2-sha256:')) {
      const parts = storedHash.split(':');
      if (parts.length !== 5) return true;
      const iterations = Number.parseInt(parts[3], 10);
      return !Number.isFinite(iterations) || iterations < this.DEFAULT_ITERATIONS;
    }

    if (storedHash.startsWith('pbkdf2:sha256:') || storedHash.startsWith('hashsync:')) {
      return true;
    }

    return false;
  }
}
