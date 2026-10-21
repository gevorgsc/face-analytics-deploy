// ============================================================
// useToast.js - GSC Face Analytics Pro
// Replaces all native alert() calls with enterprise toasts
// ============================================================

import { useState, useCallback, useEffect } from 'react';

let _addToast = null;

// Global toast trigger - call toast.success / toast.error anywhere
// action?: { label: string, onClick: () => void }
export const toast = {
  success: (msg, opts = {}) => _addToast?.({ type: 'success', msg, duration: opts.duration ?? 4000, action: opts.action }),
  error:   (msg, opts = {}) => _addToast?.({ type: 'error',   msg, duration: opts.duration ?? 5000, action: opts.action }),
  warn:    (msg, opts = {}) => _addToast?.({ type: 'warn',    msg, duration: opts.duration ?? 4500, action: opts.action }),
  info:    (msg, opts = {}) => _addToast?.({ type: 'info',    msg, duration: opts.duration ?? 3500, action: opts.action }),
};

let _id = 0;

export function useToastProvider() {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback(({ type, msg, duration, action }) => {
    const id = ++_id;
    setToasts(prev => [...prev, { id, type, msg, duration, action }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  }, []);

  // Register global handler
  useEffect(() => {
    _addToast = addToast;
    return () => { _addToast = null; };
  }, [addToast]);

  const dismiss = useCallback(id => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return { toasts, dismiss };
}
