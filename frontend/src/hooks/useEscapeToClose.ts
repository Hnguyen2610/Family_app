import { useEffect } from 'react';

/**
 * Closes a hand-rolled (non-Radix/Base-UI) modal on Escape. Pair with role="dialog"
 * aria-modal="true" and an initial-focus ref on the dialog container — see HoroscopeModal,
 * DailySummaryModal, NewMonthModal for the pattern.
 */
export function useEscapeToClose(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);
}
