import { useEffect } from 'react';
import { BackNavigationService } from '../services/BackNavigationService';

/**
 * Hook to register a back action handler (e.g. closing a modal, drawer, or canceling unsaved changes).
 * When active, intercepts Android hardware back button and Desktop Escape key.
 */
export function useBackHandler(
  id: string,
  isActive: boolean,
  onBack: () => boolean,
  priority = 100
) {
  useEffect(() => {
    if (!isActive) return;
    return BackNavigationService.registerHandler({
      id,
      priority,
      onBack,
    });
  }, [id, isActive, onBack, priority]);
}
