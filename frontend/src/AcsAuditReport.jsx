import { apiFetch } from './apiClient';
import React, { useState, useCallback } from 'react';
import { FileSearch, Download, Search, Shield } from 'lucide-react';
import { API } from './apiConfig';

const H = tok => ({ Authorization: `Bearer ${tok}` });

const EVENT_BADGE = ev => {
  if (!ev) return 'acs-badge-gray';
  if (ev.includes('granted') || ev.includes('unlock')) return 'acs-badge-green';
  if (ev.includes('denied') || ev === 'alarm') return 'acs-badge-red';
  return 'acs-badge-gray';
};

export default function AcsAuditReport({ token }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    date_from:  new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
    date_to:    new Date().toISOString().slice(0, 10),
    event_type: '',
  });

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.date_from) params.set('date_from', filters.date_from + 'T00:00:00');
      if (filters.date_to)   params.set('date_to',   filters.date_to   + 'T23:59:59');
      if (filters.event_type) params.set('event_type', filters.event_type);
      const res = await apiFetch(`${API}/api/acs/audit-report/summary?${params}`, { headers: H(token) });
      if (res.ok) setData(await res.json());
    } finally { setLoading(false); }
  }, [token, filters]);

  const downloadCSV = async () => {
    const params = new URLSearchParams();
    if (filters.date_from) params.set('date_from', filters.date_from + 'T00:00:00');
    if (filters.date_to)   params.set('date_to',   filters.date_to   + 'T23:59:59');
    if (filters.event_type) params.set('event_type', filters.event_type);
    const res = await apiFetch(`${API}/api/acs/audit-report/export/csv?${params}`, { headers: H(token) });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'acs_audit.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const fmt = v => v ? new Date(v).toLocaleString('en-US', {
    timeZone: 'Asia/Yerevan', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }) : '—';

  return (
    <div className="acs-panel">
      <div className="acs-panel-header">
        <div className="acs-panel-title"><FileSearch size={18} /> Audit Report</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {data && (
            <button className="ghost-btn" onClick={downloadCSV}><Download size={13} /> Export CSV</button>
          )}
        </div>
      </div>

      <div className="acs-form-card">
        <h4><Search size={14} /> Report Filters</h4>
        <div className="acs-form-grid">
          <label>From<input type="date" value={filters.date_from} onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))} /></label>
          <label>To<input type="date" value={filters.date_to} onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))} /></label>
          <label>Event Type
            <select value={filters.event_type} onChange={e => setFilters(f => ({ ...f, event_type: e.target.value }))}>
              <option value="">All Events</option>
              <option value="access_granted">Access Granted</option>
              <option value="access_denied">Access Denied</option>
              <option value="alarm">Alarm</option>
              <option value="manual_unlock">Manual Unlock</option>
            </select>
          </label>
        </div>
        <div className="acs-form-actions" style={{ marginTop: 0 }}>
          <button className="save-btn" onClick={run} disabled={loading}>
            <Search size={13} /> {loading ? 'Running…' : 'Run Report'}
          </button>
        </div>
      </div>

      {data && (
        <>
          <div className="acs-dash-stats">
            <div className="acs-stat-card">
              <div className="acs-stat-icon blue"><Shield size={18} /></div>
              <div><div className="acs-stat-val">{data.total_events}</div><div className="acs-stat-label">Total Events</div></div>
            </div>
            <div className="acs-stat-card">
              <div className="acs-stat-icon green"><Shield size={18} /></div>
              <div><div className="acs-stat-val">{data.granted}</div><div className="acs-stat-label">Granted</div></div>
            </div>
            <div className="acs-stat-card">
              <div className="acs-stat-icon red"><Shield size={18} /></div>
              <div><div className="acs-stat-val">{data.denied}</div><div className="acs-stat-label">Denied</div></div>
            </div>
            <div className="acs-stat-card">
              <div className="acs-stat-icon purple"><FileSearch size={18} /></div>
              <div><div className="acs-stat-val">{data.unique_persons}</div><div className="acs-stat-label">Unique Persons</div></div>
            </div>
          </div>

          {data.events.length === 0
            ? <div className="acs-empty">No events found for the selected filters.</div>
            : (
              <>
                <div className="acs-table-wrap">
                  <table className="acs-table">
                    <thead>
                      <tr><th>Time</th><th>Device</th><th>Door</th><th>Person</th><th>Event</th><th>Card</th><th>Dir</th></tr>
                    </thead>
                    <tbody>
                      {data.events.slice(0, 500).map(ev => (
                        <tr key={ev.id}>
                          <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{fmt(ev.created_at)}</td>
                          <td style={{ fontSize: 12 }}>{ev.device_name || '—'}</td>
                          <td style={{ fontSize: 12 }}>Door {ev.door_no ?? '—'}</td>
                          <td style={{ fontSize: 12 }}>
                            {ev.person_name || <span style={{ color: 'var(--muted)' }}>Unknown</span>}
                          </td>
                          <td>
                            <span className={`acs-badge ${EVENT_BADGE(ev.event_type)}`}>
                              {ev.event_type?.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td style={{ fontSize: 11, color: 'var(--muted)', fontFamily: 'monospace' }}>{ev.card_number || '—'}</td>
                          <td style={{ fontSize: 12 }}>{ev.direction || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {data.events.length > 500 && (
                  <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 8 }}>
                    Showing first 500 of {data.events.length} events. Export CSV for full data.
                  </p>
                )}
              </>
            )}
        </>
      )}
    </div>
  );
}
