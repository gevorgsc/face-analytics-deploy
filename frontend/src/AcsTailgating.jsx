import { apiFetch } from './apiClient';
import React, { useState, useEffect, useCallback } from 'react';
import { UserX, Plus, RefreshCw, CheckCircle, AlertTriangle, Trash2, Shield, Activity } from 'lucide-react';
import { API } from './apiConfig';
import { useAcsTr } from './i18n';

const H = tok => ({ Authorization: `Bearer ${tok}` });

export default function AcsTailgating({ token, isAdmin }) {
  const t = useAcsTr();
  const [configs, setConfigs]   = useState([]);
  const [events, setEvents]     = useState([]);
  const [devices, setDevices]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState('events');
  const [showForm, setShowForm] = useState(false);
  const [resolveId, setResolveId] = useState(null);
  const [note, setNote]           = useState('');
  const [form, setForm] = useState({ device_id: '', door_no: 1, sensitivity: 'medium', alert_email: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, eRes, dRes] = await Promise.all([
        apiFetch(`${API}/api/acs/tailgating/configs`,        { headers: H(token) }),
        apiFetch(`${API}/api/acs/tailgating/events?limit=100`, { headers: H(token) }),
        apiFetch(`${API}/api/acs`,                           { headers: H(token) }),
      ]);
      if (cRes.ok) setConfigs(await cRes.json());
      if (eRes.ok) setEvents(await eRes.json());
      if (dRes.ok) setDevices(await dRes.json());
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const createConfig = async () => {
    const res = await apiFetch(`${API}/api/acs/tailgating/configs`, {
      method: 'POST',
      headers: { ...H(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, device_id: Number(form.device_id), door_no: Number(form.door_no) }),
    });
    if (res.ok) { setShowForm(false); load(); }
  };

  const deleteConfig = async id => {
    if (!confirm('Delete this tailgating config?')) return;
    await apiFetch(`${API}/api/acs/tailgating/configs/${id}`, { method: 'DELETE', headers: H(token) });
    load();
  };

  const resolve = async id => {
    await apiFetch(`${API}/api/acs/tailgating/events/${id}/resolve`, {
      method: 'PATCH',
      headers: { ...H(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ note }),
    });
    setResolveId(null); setNote(''); load();
  };

  const fmt = v => v ? new Date(v).toLocaleString('en-US', {
    timeZone: 'Asia/Yerevan', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }) : '—';
  const devName = id => devices.find(d => d.id === id)?.name || `#${id}`;

  const sensBadge = s => ({
    low:    <span className="acs-badge acs-badge-blue">Low</span>,
    medium: <span className="acs-badge acs-badge-yellow">Medium</span>,
    high:   <span className="acs-badge acs-badge-red">High</span>,
  }[s] || <span className="acs-badge acs-badge-gray">{s}</span>);

  const unresolved = events.filter(e => !e.resolved_at).length;
  const resolved   = events.length - unresolved;

  return (
    <div className="acs-panel">
      <div className="acs-panel-header">
        <div className="acs-panel-title"><UserX size={18} /> Tailgating Detection</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isAdmin && (
            <button className="save-btn" onClick={() => setShowForm(v => !v)}>
              <Plus size={13} /> Add Config
            </button>
          )}
          <button className="ghost-btn" onClick={load} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
        Monitor and alert when multiple people pass through a door on a single credential event.
      </p>

      <div className="acs-dash-stats">
        <div className="acs-stat-card">
          <div className="acs-stat-icon red"><AlertTriangle size={20} /></div>
          <div><div className="acs-stat-val">{unresolved}</div><div className="acs-stat-label">Open Incidents</div></div>
        </div>
        <div className="acs-stat-card">
          <div className="acs-stat-icon green"><CheckCircle size={20} /></div>
          <div><div className="acs-stat-val">{resolved}</div><div className="acs-stat-label">Resolved</div></div>
        </div>
        <div className="acs-stat-card">
          <div className="acs-stat-icon blue"><Shield size={20} /></div>
          <div><div className="acs-stat-val">{configs.filter(c => c.is_active).length}<small> / {configs.length}</small></div><div className="acs-stat-label">Active Monitors</div></div>
        </div>
        <div className="acs-stat-card">
          <div className="acs-stat-icon orange"><Activity size={20} /></div>
          <div><div className="acs-stat-val">{events.length}</div><div className="acs-stat-label">Total Incidents</div></div>
        </div>
      </div>

      {showForm && (
        <div className="acs-form-card">
          <h4><UserX size={14} /> New Tailgating Config</h4>
          <div className="acs-form-grid">
            <label>Device
              <select value={form.device_id} onChange={e => setForm(f => ({ ...f, device_id: e.target.value }))}>
                <option value="">— select controller —</option>
                {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            <label>Door #
              <input type="number" min={1} max={32} value={form.door_no}
                onChange={e => setForm(f => ({ ...f, door_no: e.target.value }))} />
            </label>
            <label>Sensitivity
              <select value={form.sensitivity} onChange={e => setForm(f => ({ ...f, sensitivity: e.target.value }))}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
            <label>Alert Email (optional)
              <input type="email" value={form.alert_email} placeholder="security@company.com"
                onChange={e => setForm(f => ({ ...f, alert_email: e.target.value }))} />
            </label>
          </div>
          <div className="acs-form-actions">
            <button className="ghost-btn" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="save-btn" onClick={createConfig} disabled={!form.device_id}>Create</button>
          </div>
        </div>
      )}

      <div className="acs-filter-pills">
        <button className={tab === 'events' ? 'active' : ''} onClick={() => setTab('events')}>
          {t('Incidents')} {unresolved > 0 && <span className="acs-badge acs-badge-red" style={{ marginLeft: 4 }}>{unresolved}</span>}
        </button>
        <button className={tab === 'configs' ? 'active' : ''} onClick={() => setTab('configs')}>
          {t('Configurations')} ({configs.length})
        </button>
      </div>

      {resolveId && (
        <div className="acs-form-card">
          <h4><CheckCircle size={14} /> Resolve Incident</h4>
          <div className="acs-form-grid" style={{ gridTemplateColumns: '1fr' }}>
            <label>Resolution Note
              <input value={note} placeholder="Describe what happened…"
                onChange={e => setNote(e.target.value)} />
            </label>
          </div>
          <div className="acs-form-actions">
            <button className="ghost-btn" onClick={() => { setResolveId(null); setNote(''); }}>Cancel</button>
            <button className="save-btn" onClick={() => resolve(resolveId)}>Mark Resolved</button>
          </div>
        </div>
      )}

      {tab === 'events' && (
        events.length === 0
          ? (
            <div className="acs-empty-pro">
              <CheckCircle size={40} />
              <h3>No tailgating incidents</h3>
              <p>Events will appear here when the detector triggers on a monitored door.</p>
            </div>
          )
          : (
            <div className="acs-table-wrap">
              <table className="acs-table">
                <thead>
                  <tr><th>Time</th><th>Device</th><th>Door</th><th>Person / Card</th><th>Status</th>{isAdmin && <th></th>}</tr>
                </thead>
                <tbody>
                  {events.map(ev => (
                    <tr key={ev.id}>
                      <td className="acs-td-time">{fmt(ev.created_at)}</td>
                      <td>{ev.device_name || devName(ev.device_id)}</td>
                      <td>Door {ev.door_no}</td>
                      <td><strong>{ev.person_name || ev.card_number || '—'}</strong></td>
                      <td>
                        {ev.resolved_at
                          ? <span className="acs-badge acs-badge-green">Resolved</span>
                          : <span className="acs-badge acs-badge-red">Open</span>}
                      </td>
                      {isAdmin && (
                        <td>
                          {!ev.resolved_at && (
                            <button className="ghost-btn" style={{ height: 26, padding: '0 10px', fontSize: 11 }}
                              onClick={() => { setResolveId(ev.id); setNote(''); }}>
                              <CheckCircle size={11} /> Resolve
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
      )}

      {tab === 'configs' && (
        configs.length === 0
          ? (
            <div className="acs-empty-pro">
              <UserX size={40} />
              <h3>No tailgating monitors</h3>
              <p>Add a configuration to start monitoring doors for tailgating events.</p>
            </div>
          )
          : (
            <div className="acs-table-wrap">
              <table className="acs-table">
                <thead>
                  <tr><th>Device</th><th>Door</th><th>Sensitivity</th><th>Alert Email</th><th>Status</th>{isAdmin && <th></th>}</tr>
                </thead>
                <tbody>
                  {configs.map(c => (
                    <tr key={c.id}>
                      <td><strong>{devName(c.device_id)}</strong></td>
                      <td>Door {c.door_no}</td>
                      <td>{sensBadge(c.sensitivity)}</td>
                      <td style={{ color: 'var(--muted)', fontSize: 12 }}>{c.alert_email || '—'}</td>
                      <td>
                        <span className={`acs-badge ${c.is_active ? 'acs-badge-green' : 'acs-badge-gray'}`}>
                          {c.is_active ? 'Active' : 'Off'}
                        </span>
                      </td>
                      {isAdmin && (
                        <td>
                          <button className="ghost-btn danger" style={{ height: 28, padding: '0 10px', fontSize: 12 }}
                            onClick={() => deleteConfig(c.id)}>
                            <Trash2 size={12} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
      )}
    </div>
  );
}
