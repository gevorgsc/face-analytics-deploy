import { apiFetch } from './apiClient';
import React, { useState, useEffect, useCallback } from 'react';
import { Camera, Plus, Trash2, RefreshCw, ToggleLeft, ToggleRight, Zap, CheckCircle, XCircle } from 'lucide-react';
import { API } from './apiConfig';

const H = tok => ({ Authorization: `Bearer ${tok}` });
const EVENT_TYPES = ['access_granted', 'access_denied', 'alarm', 'manual_unlock'];

export default function AcsDoorCamera({ token, isAdmin }) {
  const [mappings, setMappings] = useState([]);
  const [devices, setDevices]   = useState([]);
  const [cameras, setCameras]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [form, setForm]         = useState({ device_id: '', door_no: 1, camera_id: '', trigger_events: ['access_granted', 'access_denied'] });
  const [showForm, setShowForm] = useState(false);
  const [snapResult, setSnapResult] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, dRes, cRes] = await Promise.all([
        apiFetch(`${API}/api/acs/door-camera/mappings`, { headers: H(token) }),
        apiFetch(`${API}/api/acs`,    { headers: H(token) }),
        apiFetch(`${API}/api/cameras`, { headers: H(token) }),
      ]);
      if (mRes.ok) setMappings(await mRes.json());
      if (dRes.ok) setDevices(await dRes.json());
      if (cRes.ok) setCameras(await cRes.json());
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const toggleEvent = (ev) => {
    setForm(f => ({
      ...f,
      trigger_events: f.trigger_events.includes(ev) ? f.trigger_events.filter(x => x !== ev) : [...f.trigger_events, ev],
    }));
  };

  const create = async () => {
    const res = await apiFetch(`${API}/api/acs/door-camera/mappings`, {
      method: 'POST',
      headers: { ...H(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, device_id: Number(form.device_id), door_no: Number(form.door_no), camera_id: Number(form.camera_id) }),
    });
    if (res.ok) { setShowForm(false); load(); }
  };

  const toggle = async (m) => {
    await apiFetch(`${API}/api/acs/door-camera/mappings/${m.id}`, {
      method: 'PATCH',
      headers: { ...H(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !m.is_active }),
    });
    load();
  };

  const remove = async (id) => {
    if (!confirm('Delete mapping?')) return;
    await apiFetch(`${API}/api/acs/door-camera/mappings/${id}`, { method: 'DELETE', headers: H(token) });
    load();
  };

  const triggerSnap = async (id) => {
    setSnapResult(s => ({ ...s, [id]: 'loading' }));
    const res = await apiFetch(`${API}/api/acs/door-camera/snapshot/${id}`, { method: 'POST', headers: H(token) });
    const d = await res.json();
    setSnapResult(s => ({ ...s, [id]: d.ok ? 'ok' : 'err' }));
    setTimeout(() => setSnapResult(s => { const n = { ...s }; delete n[id]; return n; }), 3000);
  };

  return (
    <div className="acs-panel">
      <div className="acs-panel-header">
        <div className="acs-panel-title"><Camera size={18} /> Door Camera Snapshot</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isAdmin && <button className="save-btn" onClick={() => setShowForm(true)}><Plus size={13} /> Add Mapping</button>}
          <button className="ghost-btn" onClick={load} disabled={loading}><RefreshCw size={13} className={loading ? 'spin' : ''} /></button>
        </div>
      </div>

      <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
        Link a door to a camera. When a card event occurs, a snapshot is automatically captured and stored alongside the access event.
      </p>

      {showForm && (
        <div className="acs-form-card">
          <h4><Camera size={14} /> New Door → Camera Mapping</h4>
          <div className="acs-form-grid">
            <label>ACS Device
              <select value={form.device_id} onChange={e => setForm(f => ({ ...f, device_id: e.target.value }))}>
                <option value="">—</option>
                {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            <label>Door #<input type="number" min={1} max={32} value={form.door_no} onChange={e => setForm(f => ({ ...f, door_no: e.target.value }))} /></label>
            <label>Camera
              <select value={form.camera_id} onChange={e => setForm(f => ({ ...f, camera_id: e.target.value }))}>
                <option value="">—</option>
                {cameras.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <div style={{ gridColumn: '1/-1' }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Trigger on events:</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {EVENT_TYPES.map(ev => (
                  <label key={ev} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.trigger_events.includes(ev)} onChange={() => toggleEvent(ev)} />
                    {ev.replace(/_/g, ' ')}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="acs-form-actions">
            <button className="ghost-btn" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="save-btn" onClick={create} disabled={!form.device_id || !form.camera_id}>Create</button>
          </div>
        </div>
      )}

      <div className="acs-dash-stats">
        <div className="acs-stat-card">
          <div className="acs-stat-icon blue"><Camera size={20} /></div>
          <div><div className="acs-stat-val">{mappings.length}</div><div className="acs-stat-label">Total Links</div></div>
        </div>
        <div className="acs-stat-card">
          <div className="acs-stat-icon green"><CheckCircle size={20} /></div>
          <div><div className="acs-stat-val">{mappings.filter(m => m.is_active).length}</div><div className="acs-stat-label">Active</div></div>
        </div>
        <div className="acs-stat-card">
          <div className="acs-stat-icon purple"><Zap size={20} /></div>
          <div><div className="acs-stat-val">{cameras.length}</div><div className="acs-stat-label">Cameras</div></div>
        </div>
        <div className="acs-stat-card">
          <div className="acs-stat-icon orange"><ToggleRight size={20} /></div>
          <div><div className="acs-stat-val">{new Set(mappings.map(m => m.device_id)).size}</div><div className="acs-stat-label">Devices</div></div>
        </div>
      </div>

      {mappings.length === 0
        ? (
          <div className="acs-empty-pro">
            <Camera size={40} />
            <h3>No door-camera mappings</h3>
            <p>Link ACS doors to cameras to automatically capture snapshots on access events.</p>
          </div>
        )
        : (
          <div className="acs-table-wrap">
            <table className="acs-table">
              <thead>
                <tr><th>Device</th><th>Door</th><th>Camera</th><th>Trigger Events</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {mappings.map(m => (
                  <tr key={m.id}>
                    <td><strong>{m.device_name}</strong></td>
                    <td>Door {m.door_no}</td>
                    <td>{m.camera_name}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {m.trigger_events.map(ev => (
                          <span key={ev} className="acs-badge acs-badge-gray" style={{ fontSize: 10 }}>
                            {ev.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span className={`acs-badge ${m.is_active ? 'acs-badge-green' : 'acs-badge-gray'}`}>
                        {m.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <button className="ghost-btn" title="Test snapshot" onClick={() => triggerSnap(m.id)}
                          style={{ height: 28, padding: '0 8px', color: snapResult[m.id] === 'ok' ? 'var(--success, #16a34a)' : snapResult[m.id] === 'err' ? 'var(--danger, #ef4444)' : undefined }}>
                          {snapResult[m.id] === 'ok'
                            ? <CheckCircle size={13} />
                            : snapResult[m.id] === 'err'
                            ? <XCircle size={13} />
                            : <Zap size={13} />}
                        </button>
                        {isAdmin && (
                          <>
                            <button className="ghost-btn" onClick={() => toggle(m)} title={m.is_active ? 'Disable' : 'Enable'}
                              style={{ height: 28, padding: '0 8px' }}>
                              {m.is_active
                                ? <ToggleRight size={16} style={{ color: 'var(--success, #16a34a)' }} />
                                : <ToggleLeft size={16} />}
                            </button>
                            <button className="ghost-btn danger" onClick={() => remove(m.id)} style={{ height: 28, padding: '0 8px' }}>
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
