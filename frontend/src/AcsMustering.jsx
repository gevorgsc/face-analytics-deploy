import { apiFetch } from './apiClient';
import React, { useState, useEffect, useCallback } from 'react';
import { Users, RefreshCw, Download, TrendingUp, AlertTriangle, UserCheck, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { API } from './apiConfig';

const H = tok => ({ Authorization: `Bearer ${tok}` });

export default function AcsMustering({ token }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API}/api/acs/mustering/snapshot`, { headers: H(token) });
      if (res.ok) setData(await res.json());
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  const downloadRoster = async () => {
    // Download as PDF (reportlab); fall back to JSON text if PDF unavailable
    const res = await apiFetch(`${API}/api/acs/mustering/evacuation-report/pdf`, { headers: H(token) });
    if (!res.ok) {
      // Fall back to plain-text JSON roster
      const fallback = await apiFetch(`${API}/api/acs/mustering/evacuation-report`, { headers: H(token) });
      if (!fallback.ok) return;
      const text = JSON.stringify(await fallback.json(), null, 2);
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
      const a = document.createElement('a'); a.href = url; a.download = `evacuation_roster_${Date.now()}.txt`; a.click();
      URL.revokeObjectURL(url);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evacuation_roster_${new Date().toISOString().slice(0,16).replace('T','_')}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fmt = v => v ? new Date(v).toLocaleString('en-US', {
    timeZone: 'Asia/Yerevan', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }) : '—';

  return (
    <div className="acs-panel">
      <div className="acs-panel-header">
        <div className="acs-panel-title"><Users size={18} /> Mustering / Evacuation</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="ghost-btn" onClick={downloadRoster}><Download size={13} /> Evacuation Roster</button>
          <button className="ghost-btn" onClick={load} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
        Real-time headcount based on door IN/OUT events. Auto-refreshes every 20 seconds.
      </p>

      {data && (
        <>
          <div className="acs-dash-stats">
            <div className="acs-stat-card">
              <div className="acs-stat-icon blue"><Users size={20} /></div>
              <div>
                <div className="acs-stat-val">{data.total_inside ?? 0}</div>
                <div className="acs-stat-label">Currently Inside</div>
              </div>
            </div>
            <div className="acs-stat-card">
              <div className="acs-stat-icon green"><ArrowUpRight size={20} /></div>
              <div>
                <div className="acs-stat-val">{data.entries_today ?? 0}</div>
                <div className="acs-stat-label">Entries Today</div>
              </div>
            </div>
            <div className="acs-stat-card">
              <div className="acs-stat-icon orange"><ArrowDownLeft size={20} /></div>
              <div>
                <div className="acs-stat-val">{data.exits_today ?? 0}</div>
                <div className="acs-stat-label">Exits Today</div>
              </div>
            </div>
            <div className="acs-stat-card">
              <div className="acs-stat-icon purple"><UserCheck size={20} /></div>
              <div>
                <div className="acs-stat-val">{(data.persons_inside || []).length}</div>
                <div className="acs-stat-label">Tracked Persons</div>
              </div>
            </div>
          </div>

          {(data.persons_inside || []).length === 0
            ? (
              <div className="acs-empty-pro">
                <UserCheck size={40} />
                <h3>Nobody currently inside</h3>
                <p>Persons will appear here when they scan IN at a monitored door.</p>
              </div>
            )
            : (
              <div className="acs-form-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div className="acs-section-head" style={{ padding: '14px 18px 12px', marginBottom: 0 }}>
                  <h4><Users size={14} /> Who's Inside ({data.persons_inside.length})</h4>
                </div>
                <div className="acs-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                  <table className="acs-table">
                    <thead>
                      <tr><th>Person</th><th>Card</th><th>Last Seen</th><th>Direction</th></tr>
                    </thead>
                    <tbody>
                      {data.persons_inside.map((p, i) => (
                        <tr key={i}>
                          <td><strong>{p.person_name || '—'}</strong></td>
                          <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{p.card_number || '—'}</td>
                          <td className="acs-td-time">{fmt(p.last_event_at)}</td>
                          <td>
                            <span className="acs-badge acs-badge-blue">
                              <ArrowUpRight size={10} /> IN
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          {(data.hourly_flow || []).length > 0 && (
            <div className="acs-form-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="acs-section-head" style={{ padding: '14px 18px 12px', marginBottom: 0 }}>
                <h4><TrendingUp size={14} /> Hourly Flow — Today</h4>
              </div>
              <div className="acs-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                <table className="acs-table">
                  <thead><tr><th>Hour</th><th>Entries</th><th>Exits</th><th>Net</th></tr></thead>
                  <tbody>
                    {data.hourly_flow.map((h, i) => (
                      <tr key={i}>
                        <td className="acs-td-time">{h.hour}</td>
                        <td><span className="acs-badge acs-badge-green">+{h.entries}</span></td>
                        <td><span className="acs-badge acs-badge-orange">-{h.exits}</span></td>
                        <td style={{ fontWeight: 700, color: (h.entries - h.exits) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                          {h.entries - h.exits >= 0 ? '+' : ''}{h.entries - h.exits}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {!data && !loading && (
        <div className="acs-empty-pro">
          <AlertTriangle size={40} />
          <h3>No occupancy data</h3>
          <p>Make sure ACS devices are recording events with IN/OUT direction.</p>
        </div>
      )}
    </div>
  );
}
