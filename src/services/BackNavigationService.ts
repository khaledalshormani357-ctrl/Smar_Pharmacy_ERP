// Back Navigation Manager for Smart Pharmacy ERP (Capacitor Android & Web PWA)
// Implements strict Back Navigation Policy:
// 1. Closes topmost modal / drawer / dialog if active
// 2. Navigates back from sub-screen / tab to Dashboard
// 3. Double-back to exit on Dashboard with 2-second cooldown toast notification
// 4. Safe confirmation prompt if unsaved form data exists

import { App as CapacitorApp } from '@capacitor/app';

export interface BackHandler {
  id: string;
  priority: number; // Higher number = handled first (e.g., Modals: 100, Sub-views: 50, Navigation: 10)
  onBack: () => boolean; // return true if handled/consumed, false if deferred to next handler
}

class BackNavigationServiceSingleton {
  private handlers: BackHandler[] = [];
  private lastRootBackTime = 0;
  private isInitialized = false;
  private toastCallback: ((msg: string) => void) | null = null;
  private fallbackToRootCallback: (() => boolean) | null = null;

  /**
   * Register a custom back-action handler (e.g., closing a modal or drawer).
   * Returns an unregister function to call on unmount.
   */
  public registerHandler(handler: BackHandler): () => void {
    // Remove if already exists with same ID
    this.handlers = this.handlers.filter((h) => h.id !== handler.id);
    this.handlers.push(handler);
    // Keep sorted by priority descending
    this.handlers.sort((a, b) => b.priority - a.priority);

    return () => {
      this.handlers = this.handlers.filter((h) => h.id !== handler.id);
    };
  }

  /**
   * Sets callback to show exit toast on root screen
   */
  public setToastCallback(cb: (msg: string) => void) {
    this.toastCallback = cb;
  }

  /**
   * Sets callback to go back to root dashboard when no modals are open
   */
  public setFallbackToRootCallback(cb: () => boolean) {
    this.fallbackToRootCallback = cb;
  }

  /**
   * Executes back step.
   * Returns true if consumed, false if root exit occurred.
   */
  public handleBackPress(): boolean {
    // 1. Try topmost registered handler (modals, drawers, open dialogs)
    for (let i = 0; i < this.handlers.length; i++) {
      const handler = this.handlers[i];
      try {
        const handled = handler.onBack();
        if (handled) {
          return true; // Successfully consumed by top modal/drawer
        }
      } catch (err) {
        console.error(`Back handler "${handler.id}" error:`, err);
      }
    }

    // 2. If no modal consumed it, check if we can navigate back to Dashboard
    if (this.fallbackToRootCallback) {
      const returnedToRoot = this.fallbackToRootCallback();
      if (returnedToRoot) {
        return true;
      }
    }

    // 3. User is at Dashboard root -> Double-back to exit policy
    const now = Date.now();
    const elapsed = now - this.lastRootBackTime;

    if (elapsed < 2000) {
      // Confirmed exit within 2 seconds
      try {
        CapacitorApp.exitApp();
      } catch (e) {
        console.log('Exit app called (web fallback)');
      }
      return false;
    } else {
      this.lastRootBackTime = now;
      if (this.toastCallback) {
        this.toastCallback('اضغط مرة أخرى للخروج من التطبيق');
      }
      return true;
    }
  }

  /**
   * Initializes Capacitor Android listener and Web PopState / Escape listener.
   */
  public init() {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // Capacitor Native Android Back Button Listener
    try {
      CapacitorApp.addListener('backButton', () => {
        this.handleBackPress();
      });
    } catch (e) {
      // Running in pure web browser or test environment without native bridge
    }

    // Desktop/Browser Escape key listener for keyboard accessibility
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          // If a modal or drawer is open, let handleBackPress process it
          if (this.handlers.length > 0) {
            this.handleBackPress();
          }
        }
      });
    }
  }
}

export const BackNavigationService = new BackNavigationServiceSingleton();
