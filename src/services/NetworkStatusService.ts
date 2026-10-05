// Network Status & Connectivity Management Service
// Smart Pharmacy ERP - Phase 8.9 (Internet Connectivity & Online Services Integration Gate)

import { Network, ConnectionStatus } from '@capacitor/network';
import { Capacitor } from '@capacitor/core';
import { FirebaseSyncService } from './FirebaseSyncService';

export type NetworkState = 'ONLINE' | 'OFFLINE' | 'CONNECTING' | 'UNKNOWN';

export type NetworkErrorCode =
  | 'NETWORK_OFFLINE'
  | 'NETWORK_TIMEOUT'
  | 'DNS_ERROR'
  | 'SERVER_ERROR'
  | 'AUTH_ERROR'
  | 'RATE_LIMIT'
  | 'PROVIDER_ERROR'
  | 'INVALID_RESPONSE'
  | 'API_UNREACHABLE'
  | 'UPLOAD_ERROR'
  | 'UNKNOWN_NETWORK_ERROR';

export const NETWORK_ERROR_MESSAGES: Record<NetworkErrorCode, string> = {
  NETWORK_OFFLINE: 'لا يوجد اتصال بالإنترنت. يرجى التحقق من اتصال الشبكة (Wi-Fi / بيانات الجوال).',
  NETWORK_TIMEOUT: 'انتهت مهلة الاتصال بالخادم. يرجى إعادة المحاولة.',
  DNS_ERROR: 'تعذر الوصول إلى الخادم (خطأ في الاتصال الشبكي أو DNS).',
  SERVER_ERROR: 'الخدمة غير متاحة حالياً على الخادم (خطأ 500). يرجى المحاولة لاحقاً.',
  AUTH_ERROR: 'انتهت صلاحية جلسة الدخول أو أن المفتاح غير مصرح به.',
  RATE_LIMIT: 'الخدمة مشغولة، يرجى الانتظار والمحاولة لاحقاً.',
  PROVIDER_ERROR: 'مزود الخدمة يواجه ضغطاً مؤقتاً، جاري المحاولة مع المزود البديل.',
  INVALID_RESPONSE: 'استجابة الخادم غير متوقعة أو غير مكتملة.',
  API_UNREACHABLE: 'الإنترنت متصل لكن تعذر الوصول إلى عنوان الخادم السحابي (API Unreachable). تحقق من إعداد عنوان الخادم.',
  UPLOAD_ERROR: 'فشل رفع بيانات الصورة إلى الخادم أثناء الإرسال. تحقق من استقرار الاتصال.',
  UNKNOWN_NETWORK_ERROR: 'حدث خطأ غير متوقع في الشبكة.'
};

export interface NetworkErrorInfo {
  code: NetworkErrorCode;
  message: string;
}

export class NetworkStatusServiceClass {
  private currentState: NetworkState = 'UNKNOWN';
  private listeners: Set<(state: NetworkState) => void> = new Set();
  private isInitialized = false;
  private syncOnReconnect = true;
  private lastPingTime = 0;
  private syncCallback: (() => Promise<any>) | null = null;
  private customApiBaseUrl: string | null = null;

  constructor() {
    this.init();
  }

  /**
   * Registers a sync callback to avoid circular import issues
   */
  public registerSyncCallback(cb: () => Promise<any>) {
    this.syncCallback = cb;
  }

  /**
   * Initializes network listeners across Capacitor and Web environments
   */
  public init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Default initial guess
    if (typeof navigator !== 'undefined') {
      this.currentState = navigator.onLine ? 'ONLINE' : 'OFFLINE';
    }

    // 1. Capacitor Native Network Plugin Listener
    try {
      Network.getStatus().then((status: ConnectionStatus) => {
        this.updateState(status.connected ? 'ONLINE' : 'OFFLINE');
      }).catch(() => {
        // Fallback to web state
        if (typeof navigator !== 'undefined') {
          this.updateState(navigator.onLine ? 'ONLINE' : 'OFFLINE');
        }
      });

      Network.addListener('networkStatusChange', (status: ConnectionStatus) => {
        this.updateState(status.connected ? 'ONLINE' : 'OFFLINE');
      });
    } catch {
      // Capacitor Network not available, using DOM events
    }

    // 2. Standard Web DOM Event Listeners
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.updateState('ONLINE');
      });
      window.addEventListener('offline', () => {
        this.updateState('OFFLINE');
      });
    }
  }

  /**
   * Updates current network state and notifies listeners & auto-sync trigger
   */
  private updateState(newState: NetworkState) {
    const prevState = this.currentState;
    this.currentState = newState;

    if (prevState !== newState) {
      console.log(`[NetworkStatusService] State transitioned: ${prevState} -> ${newState}`);
      this.notifyListeners(newState);

      // On reconnection from OFFLINE to ONLINE, trigger background outbox sync automatically
      if (newState === 'ONLINE' && prevState === 'OFFLINE' && this.syncOnReconnect) {
        this.triggerSyncWhenOnline();
      }
    }
  }

  /**
   * Automatically triggers outbox sync to Firebase in the background without blocking local ERP
   */
  public async triggerSyncWhenOnline(): Promise<void> {
    try {
      console.log('[NetworkStatusService] Online connection restored. Triggering automatic background sync...');
      if (this.syncCallback) {
        await this.syncCallback();
      } else {
        await FirebaseSyncService.syncPendingOutbox();
      }
    } catch (syncErr) {
      console.warn('[NetworkStatusService] Background sync on reconnect completed with notes:', syncErr);
    }
  }

  /**
   * Returns current synchronous network state
   */
  public getStatus(): NetworkState {
    return this.currentState;
  }

  /**
   * Fast boolean connectivity check
   */
  public isOnline(): boolean {
    return this.currentState === 'ONLINE';
  }

  /**
   * Manually sets state (useful for deterministic test mocks or airplane mode simulations)
   */
  public setStateForTesting(state: NetworkState) {
    this.updateState(state);
  }

  /**
   * Active Ping Probe to verify real internet reachability
   */
  public async checkNetworkNow(timeoutMs = 4000): Promise<NetworkState> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.updateState('OFFLINE');
      return 'OFFLINE';
    }

    this.updateState('CONNECTING');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const pingUrl = this.resolveApiEndpoint('/api/health');
      const res = await fetch(pingUrl, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal
      });

      clearTimeout(timer);
      if (res.ok) {
        this.lastPingTime = Date.now();
        this.updateState('ONLINE');
        return 'ONLINE';
      }
      this.updateState('OFFLINE');
      return 'OFFLINE';
    } catch {
      clearTimeout(timer);
      // If server ping fails but browser reports online, mark as OFFLINE for cloud services
      this.updateState('OFFLINE');
      return 'OFFLINE';
    }
  }

  /**
   * Detects if running inside Capacitor Android/iOS Native Container
   */
  public isNativeEnvironment(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      if (Capacitor.isNativePlatform()) return true;
      const plat = Capacitor.getPlatform();
      if (plat === 'android' || plat === 'ios') return true;
    } catch {}
    if ((window as any).Capacitor?.isNativePlatform?.()) return true;
    if (window.location.protocol === 'capacitor:' || window.location.protocol === 'file:') return true;
    // On Android with androidScheme: "https", origin is https://localhost (port is empty string, NOT 3000)
    if (window.location.hostname === 'localhost' && window.location.port !== '3000') return true;
    return false;
  }

  /**
   * Retrieves active API Base URL with override support
   */
  public getApiBaseUrl(): string {
    if (this.customApiBaseUrl && this.customApiBaseUrl.trim()) {
      return this.customApiBaseUrl.trim().replace(/\/+$/, '');
    }

    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('smart_pharmacy_api_base_url');
        if (saved && saved.trim()) {
          return saved.trim().replace(/\/+$/, '');
        }
      } catch {}
    }

    const envBase = (import.meta as any).env?.VITE_API_BASE_URL;
    if (envBase && typeof envBase === 'string' && envBase.trim()) {
      return envBase.trim().replace(/\/+$/, '');
    }

    // In web browser (inside AI Studio container or local dev server), relative paths work directly
    if (typeof window !== 'undefined' && !this.isNativeEnvironment()) {
      return '';
    }

    // Default canonical production cloud backend
    return 'https://smart-pharmacy-erp-api.onrender.com';
  }

  /**
   * Allows user or diagnostics to set a custom backend host URL
   */
  public setCustomApiBaseUrl(url: string | null) {
    this.customApiBaseUrl = url && url.trim() ? url.trim() : null;
    if (typeof window !== 'undefined') {
      try {
        if (url && url.trim()) {
          localStorage.setItem('smart_pharmacy_api_base_url', url.trim());
        } else {
          localStorage.removeItem('smart_pharmacy_api_base_url');
        }
      } catch {}
    }
  }

  /**
   * Resolves canonical API endpoint URL with HTTPS safety
   * - In native Capacitor: routes to the production HTTPS cloud server
   * - In web browser: uses current origin or relative proxy endpoint
   * - Never uses insecure HTTP in production or unroutable localhost in native Android
   */
  public resolveApiEndpoint(relativePath: string): string {
    const cleanPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
    const baseUrl = this.getApiBaseUrl();
    if (baseUrl) {
      return `${baseUrl}${cleanPath}`;
    }
    return cleanPath;
  }

  /**
   * Deep Reachability Check specifically for the Backend Server API
   * Distinguishes between General Internet Online and API Unreachable
   */
  public async checkApiReachability(timeoutMs = 5000): Promise<{ reachable: boolean; httpStatus?: number; error?: string; url: string }> {
    const targetUrl = this.resolveApiEndpoint('/api/health');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(targetUrl, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal
      });
      clearTimeout(timer);

      if (res.ok) {
        return { reachable: true, httpStatus: res.status, url: targetUrl };
      }
      return { reachable: false, httpStatus: res.status, error: `HTTP ${res.status}`, url: targetUrl };
    } catch (err: any) {
      clearTimeout(timer);
      const isTimeout = err?.name === 'AbortError' || /timeout/i.test(err?.message || '');
      return {
        reachable: false,
        error: isTimeout ? 'TIMEOUT' : (err?.message || 'NETWORK_ERROR'),
        url: targetUrl
      };
    }
  }

  /**
   * Subscribe to network status changes
   */
  public addListener(listener: (state: NetworkState) => void): () => void {
    this.listeners.add(listener);
    // Notify immediately with current state
    listener(this.currentState);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(state: NetworkState) {
    this.listeners.forEach((listener) => {
      try {
        listener(state);
      } catch (err) {
        console.error('[NetworkStatusService] Error in listener callback:', err);
      }
    });
  }

  /**
   * Standardizes error object into user-friendly Arabic error message (Section 17)
   */
  public formatNetworkError(err: unknown): NetworkErrorInfo {
    if (!err) {
      return {
        code: 'UNKNOWN_NETWORK_ERROR',
        message: NETWORK_ERROR_MESSAGES.UNKNOWN_NETWORK_ERROR
      };
    }

    const msg = String((err as any)?.message || err || '').toLowerCase();
    const code = (err as any)?.code;

    if (msg.includes('502') || msg.includes('503') || msg.includes('provider') || msg.includes('high demand') || msg.includes('overloaded')) {
      return {
        code: 'PROVIDER_ERROR',
        message: NETWORK_ERROR_MESSAGES.PROVIDER_ERROR
      };
    }

    if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('abort') || code === 'ECONNABORTED') {
      return {
        code: 'NETWORK_TIMEOUT',
        message: NETWORK_ERROR_MESSAGES.NETWORK_TIMEOUT
      };
    }

    if (msg.includes('enotfound') || msg.includes('dns') || msg.includes('getaddrinfo')) {
      return {
        code: 'DNS_ERROR',
        message: NETWORK_ERROR_MESSAGES.DNS_ERROR
      };
    }

    if (msg.includes('401') || msg.includes('403') || msg.includes('unauthorized') || msg.includes('auth')) {
      return {
        code: 'AUTH_ERROR',
        message: NETWORK_ERROR_MESSAGES.AUTH_ERROR
      };
    }

    if (msg.includes('429') || msg.includes('quota') || msg.includes('rate limit')) {
      return {
        code: 'RATE_LIMIT',
        message: NETWORK_ERROR_MESSAGES.RATE_LIMIT
      };
    }

    if (msg.includes('500') || msg.includes('internal server error')) {
      return {
        code: 'SERVER_ERROR',
        message: NETWORK_ERROR_MESSAGES.SERVER_ERROR
      };
    }

    if (msg.includes('json') || msg.includes('parse') || msg.includes('invalid response')) {
      return {
        code: 'INVALID_RESPONSE',
        message: NETWORK_ERROR_MESSAGES.INVALID_RESPONSE
      };
    }

    if (msg.includes('api_unreachable') || msg.includes('unreachable') || msg.includes('failed to fetch') || msg.includes('connection refused') || msg.includes('err_connection_refused')) {
      if (this.isOnline()) {
        return {
          code: 'API_UNREACHABLE',
          message: NETWORK_ERROR_MESSAGES.API_UNREACHABLE
        };
      }
    }

    if (!this.isOnline() || msg.includes('offline') || msg.includes('no internet')) {
      return {
        code: 'NETWORK_OFFLINE',
        message: NETWORK_ERROR_MESSAGES.NETWORK_OFFLINE
      };
    }

    return {
      code: 'UNKNOWN_NETWORK_ERROR',
      message: NETWORK_ERROR_MESSAGES.UNKNOWN_NETWORK_ERROR
    };
  }
}

export const NetworkStatusService = new NetworkStatusServiceClass();
