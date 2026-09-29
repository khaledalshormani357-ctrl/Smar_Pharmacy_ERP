export type NativeSqliteStatus = {
  available: boolean;
  initialized: boolean;
  reason?: string;
  databaseName?: string;
  version?: number;
};

export class NativeSqliteBridge {
  private static readonly DATABASE_NAME = 'smart_pharmacy_erp_native';
  private static readonly LEGACY_STORAGE_KEY = 'smart_pharmacy_erp_db_v1';

  static async initialize(): Promise<NativeSqliteStatus> {
    try {
      const mod = await Function('return import("@capacitor-community/sqlite")')();
      const SQLite = (mod as any)?.SQLite ?? (mod as any)?.default?.SQLite ?? null;

      if (!SQLite) {
        return {
          available: false,
          initialized: false,
          reason: 'SQLite plugin is not installed or not available in this build.'
        };
      }

      if (typeof SQLite.createConnection !== 'function') {
        return {
          available: false,
          initialized: false,
          reason: 'SQLite plugin is present but missing the required createConnection API.'
        };
      }

      return {
        available: true,
        initialized: true,
        databaseName: this.DATABASE_NAME,
        version: 1,
        reason: 'Native SQLite bridge is ready.'
      };
    } catch (error) {
      return {
        available: false,
        initialized: false,
        reason: error instanceof Error ? error.message : 'Native SQLite bridge could not be initialized.'
      };
    }
  }

  static getLegacyState<T>(fallback: T): T {
    if (typeof localStorage === 'undefined') {
      return fallback;
    }

    try {
      const raw = localStorage.getItem(this.LEGACY_STORAGE_KEY);
      if (!raw) {
        return fallback;
      }
      const parsed = JSON.parse(raw) as T;
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
      return fallback;
    } catch {
      return fallback;
    }
  }

  static hasLegacyData(): boolean {
    if (typeof localStorage === 'undefined') {
      return false;
    }
    const raw = localStorage.getItem(this.LEGACY_STORAGE_KEY);
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw);
      return Boolean(parsed && typeof parsed === 'object' && parsed.profile);
    } catch {
      return false;
    }
  }

  static async migrateLegacyStorageToNative<T>(legacyState: T): Promise<T> {
    const status = await this.initialize();
    if (!status.available || !legacyState || typeof legacyState !== 'object') {
      return legacyState;
    }

    // This is the required migration hook for the next SQLite phase.
    // A real native plugin will execute the actual SQL schema creation and row import here.
    // The legacy localStorage state remains intact until migration succeeds.
    return legacyState;
  }
}
