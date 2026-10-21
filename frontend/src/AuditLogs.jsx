import React, { useMemo, useState } from 'react';
import { RefreshCw, ScrollText, Search, Shield } from 'lucide-react';
import SessionsPanel from './SessionsPanel';

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-US', {
    timeZone: 'Asia/Yerevan',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

const ACTION_COLORS = {
  LOGIN: '#22c55e',
  LOGIN_FAILED: '#ef4444',
  LOGOUT: '#6b7280',
  USER_CREATED: '#3b82f6',
  USER_UPDATED: '#f59e0b',
  USER_DELETED: '#ef4444',
  PERSON_CREATED: '#3b82f6',
  PERSON_UPDATED: '#f59e0b',
  PERSON_DELETED: '#ef4444',
  CAMERA_CREATED: '#3b82f6',
  CAMERA_UPDATED: '#f59e0b',
  CAMERA_DELETED: '#ef4444',
  EXPORT_EXCEL: '#8b5cf6',
  EXPORT_PDF: '#8b5cf6',
  EVENT_DELETED: '#ef4444',
};

export default function AuditLogs({
  logs = [],
  loadAuditLogs,
  token,
  onLogoutEverywhere,
  t = key => key,
}) {
  const [view, setView] = useState('logs');
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');

  const uniqueActions = useMemo(() => {
    const s = new Set(logs.map(l => l.action).filter(Boolean));
    return ['all', ...Array.from(s).sort()];
  }, [logs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter(log => {
      if (actionFilter !== 'all' && log.action !== actionFilter) return false;
      if (!q) return true;
      return (
        (log.username || '').toLowerCase().includes(q) ||
        (log.action || '').toLowerCase().includes(q) ||
        (log.details || '').toLowerCase().includes(q) ||
        (log.ip_address || '').toLowerCase().includes(q) ||
        (log.target_type || '').toLowerCase().includes(q)
      );
    });
  }, [logs, search, actionFilter]);

  return (
    <div className="audit-shell">
      <div className="audit-subtabs" role="tablist" aria-label="Security audit views">
        <button
          className={view === 'logs' ? 'active' : ''}
          onClick={() => setView('logs')}
          role="tab"
          aria-selected={view === 'logs'}
        >
          <ScrollText size={14} /> {t('auditLogs')}
        </button>
        <button
          className={view === 'sessions' ? 'active' : ''}
          onClick={() => setView('sessions')}
          role="tab"
          aria-selected={view === 'sessions'}
        >
          <Shield size={14} /> {t('sessions')}
        </button>
      </div>

      {view === 'sessions' ? (
        <SessionsPanel token={token} onLogoutEverywhere={onLogoutEverywhere} t={t} />
      ) : (
        <div className="card">
          <div className="card-title-row">
            <h2>{t('auditLogs')}</h2>
            <button className="save-btn" onClick={() => loadAuditLogs?.()}>
              <RefreshCw size={15} /> {t('refresh')}
            </button>
          </div>

          <div className="audit-toolbar">
            <div className="audit-search">
              <Search size={14} />
              <input
                placeholder="Search user, action, IP, details..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
              {uniqueActions.map(a => (
                <option key={a} value={a}>{a === 'all' ? 'All Actions' : a}</option>
              ))}
            </select>
            <span className="audit-count">
              {filtered.length} / {logs.length} logs
            </span>
          </div>

          <div className="audit-table-wrap">
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Details</th>
                  <th>IP</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map(log => (
                  <tr key={log.id}>
                    <td className="audit-time">{formatDateTime(log.created_at)}</td>
                    <td><b>{log.username || 'system'}</b></td>
                    <td>
                      <span
                        className="audit-action"
                        style={{ color: ACTION_COLORS[log.action] || 'inherit' }}
                      >
                        {log.action || '-'}
                      </span>
                    </td>
                    <td className="audit-time">
                      {log.target_type || '-'}{log.target_id ? ` #${log.target_id}` : ''}
                    </td>
                    <td className="audit-details" title={log.details}>
                      {log.details || '-'}
                    </td>
                    <td className="audit-time">{log.ip_address || '-'}</td>
                  </tr>
                ))}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan="6" className="audit-empty">
                      {search || actionFilter !== 'all' ? 'No matching logs' : 'No audit logs found'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
