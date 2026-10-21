import React, { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function ConfirmModal({
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  danger = true,
}) {
  useEffect(() => {
    const handle = e => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onCancel]);

  return (
    <div className="modal-bg" onClick={onCancel}>
      <div className="modal-card confirm-modal" onClick={e => e.stopPropagation()}>
        <div className="confirm-icon"><AlertTriangle size={28} color="#f59e0b" /></div>
        <p className="confirm-message">{message}</p>
        <div className="modal-actions">
          <button onClick={onCancel}>{cancelLabel}</button>
          <button className={danger ? 'danger' : ''} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
