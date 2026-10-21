import { apiFetch } from './apiClient';
// SessionsPanel.jsx - Active sessions management

import React, { useState, useEffect, useCallback } from 'react';
import { Monitor, Trash2, LogOut, RefreshCw, Clock, Shield } from 'lucide-react';
import { API } from './apiConfig';

export default function SessionsPanel({ token, onLogoutEverywhere, t = key => key }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`${API}/api/auth/sessions`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setSessions(await r.json());
    } catch { setMsg(t('loadError')); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const revoke = async (id) => {
    await apiFetch(`${API}/api/auth/sessions/${id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    });
    setSessions(s => s.filter(x => x.id !== id));
    setMsg(t('sessionRevoked'));
  };

  const revokeAll = async () => {
    if (!confirm(t('logoutEverywhereConfirm'))) return;
    await apiFetch(`${API}/api/auth/sessions`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    });
    onLogoutEverywhere?.();
  };

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }) : '-';

  const daysLeft = (iso) => {
    if (!iso) return 0;
    return Math.max(0, Math.round((new Date(iso) - Date.now()) / 86400000));
  };

  return (
    <div className="sessions-panel card">
      <div className="sessions-header">
        <Shield size={16} />
        <strong>{t('activeSessions')}</strong>
        <span className="sessions-count">{sessions.length}</span>
        <button className="sessions-refresh" onClick={load} title={t('refresh')}><RefreshCw size={13} /></button>
        {sessions.length > 1 && (
          <button className="sessions-logout-all" onClick={revokeAll}>
            <LogOut size={13} /> {t('logoutEverywhere')}
          </button>
        )}
      </div>

      {msg && <div className="sessions-msg">{msg}</div>}

      {loading ? (
        <div className="sessions-loading">{t('loadingSessions')}</div>
      ) : sessions.length === 0 ? (
        <div className="sessions-empty">{t('noActiveSessions')}</div>
      ) : (
        <div className="sessions-list">
          {sessions.map((s, i) => (
            <div key={s.id} className={`session-row ${i === 0 ? 'session-current' : ''}`}>
              <Monitor size={15} />
              <div className="session-info">
                <span className="session-label">
                  {i === 0 ? t('currentSession') : `${t('session')} #${s.id}`}
                </span>
                <span className="session-dates">
                  <Clock size={10} /> {t('started')} {fmtDate(s.created_at)} &bull; {t('expiresIn')} {daysLeft(s.expires_at)}d
                </span>
              </div>
              {i !== 0 && (
                <button className="session-revoke" onClick={() => revoke(s.id)} title={t('revoke')}>
                  <Trash2 size={13} />
                </button>
              )}
              {i === 0 && <span className="session-active-badge">{t('activeStatus')}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
