// ============================================================
// ToastContainer.jsx - GSC Face Analytics Pro
// Enterprise toast notifications - replaces alert()
// ============================================================

import React, { useEffect, useState } from 'react';
import { useToastProvider } from './useToast';

const ICONS = {
  success: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  error: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  warn: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  info: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
};

function ToastItem({ id, type, msg, duration, action, onDismiss }) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setVisible(true), 10);
    const t2 = setTimeout(() => setLeaving(true), duration - 400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [duration]);

  const handleDismiss = () => {
    setLeaving(true);
    setTimeout(() => onDismiss(id), 350);
  };

  const handleAction = (e) => {
    e.stopPropagation();
    action?.onClick?.();
    handleDismiss();
  };

  return (
    <div
      className={`toast-item toast-${type} ${visible ? 'toast-visible' : ''} ${leaving ? 'toast-leaving' : ''}`}
      onClick={action ? undefined : handleDismiss}
    >
      <span className="toast-icon">{ICONS[type]}</span>
      <span className="toast-msg">{msg}</span>
      {action && (
        <button className="toast-action-btn" onClick={handleAction}>
          {action.label}
        </button>
      )}
      <button className="toast-close" onClick={handleDismiss}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const { toasts, dismiss } = useToastProvider();

  return (
    <div className="toast-container">
      {toasts.map(t => (
        <ToastItem key={t.id} {...t} onDismiss={dismiss} />
      ))}
    </div>
  );
}
