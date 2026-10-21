import { apiFetch } from './apiClient';
import React, { useState, useEffect, useCallback } from 'react';
import { Building2, Plus, Trash2, RefreshCw, ChevronRight, Shield, Layers } from 'lucide-react';
import { API } from './apiConfig';

const H = tok => ({ Authorization: `Bearer ${tok}` });

export default function AcsLiftConfig({ token, isAdmin }) {
  const [lifts, setLifts]       = useState([]);
  const [devices, setDevices]   = useState([]);
  const [levels, setLevels]     = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [form, setForm]         = useState({ name: '', device_id: '', door_no: 1, floors: '', notes: '' });
  const [showForm, setShowForm] = useState(false);
  const [accessForm, setAccessForm] = useState({ access_level_id: '', allowed_floors: [] });
  const [showAccessForm, setShowAccessForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [lRes, dRes, lvRes] = await Promise.all([
        apiFetch(`${API}/api/acs/lift`,   { headers: H(token) }),
        apiFetch(`${API}/api/acs`,        { headers: H(token) }),
        apiFetch(`${API}/api/acs/levels`, { headers: H(token) }),
      ]);
      if (lRes.ok)  { const d = await lRes.json(); setLifts(d); if (selected) setSelected(d.find(l => l.id === selected.id) || null); }
      if (dRes.ok)  setDevices(await dRes.json());
      if (lvRes.ok) setLevels(await lvRes.json());
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const createLift = async () => {
    const floors = form.floors.split(',').map(f => f.trim()).filter(Boolean);
    const res = await apiFetch(`${API}/api/acs/lift`, {
      method: 'POST',
      headers: { ...H(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, device_id: Number(form.device_id), door_no: Number(form.door_no), floors }),
    });
    if (res.ok) { setShowForm(false); load(); }
  };

  const deleteLift = async (id) => {
    if (!confirm('Delete this lift?')) return;
    await apiFetch(`${API}/api/acs/lift/${id}`, { method: 'DELETE', headers: H(token) });
    setSelected(null); load();
  };

  const setFloorAccess = async () => {
    if (!selected || !accessForm.access_level_id) return;
    const res = await apiFetch(`${API}/api/acs/lift/${selected.id}/access`, {
      method: 'POST',
      headers: { ...H(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_level_id: Number(accessForm.access_level_id), allowed_floors: accessForm.allowed_floors }),
    });
    if (res.ok) { setShowAccessForm(false); load(); }
  };

  const removeFloorAccess = async (accessId) => {
    if (!selected) return;
    await apiFetch(`${API}/api/acs/lift/${selected.id}/access/${accessId}`, { method: 'DELETE', headers: H(token) });
    load();
  };

  const toggleFloor = (floor) => {
    setAccessForm(f => ({
      ...f,
      allowed_floors: f.allowed_floors.includes(floor)
        ? f.allowed_floors.filter(x => x !== floor)
        : [...f.allowed_floors, floor],
    }));
  };

  return (
    <div className="acs-panel">
      <div className="acs-panel-header">
        <div className="acs-panel-title"><Building2 size={18} /> Lift &amp; Floor Access</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isAdmin && <button className="save-btn" onClick={() => setShowForm(true)}><Plus size={13} /> Add Lift</button>}
          <button className="ghost-btn" onClick={load} disabled={loading}><RefreshCw size={13} className={loading ? 'spin' : ''} /></button>
        </div>
      </div>

      {showForm && (
        <div className="acs-form-card">
          <h4><Building2 size={14} /> Add Lift</h4>
          <div className="acs-form-grid">
            <label>Lift Name<input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Main Elevator" /></label>
            <label>Device
              <select value={form.device_id} onChange={e => setForm(f => ({ ...f, device_id: e.target.value }))}>
                <option value="">—</option>
                {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            <label>Door #<input type="number" min={1} max={32} value={form.door_no} onChange={e => setForm(f => ({ ...f, door_no: e.target.value }))} /></label>
            <label>Floors (comma-separated)<input value={form.floors} onChange={e => setForm(f => ({ ...f, floors: e.target.value }))} placeholder="B1, GF, 1, 2, 3, Roof" /></label>
          </div>
          <div className="acs-form-actions">
            <button className="ghost-btn" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="save-btn" onClick={createLift} disabled={!form.name || !form.device_id}>Create</button>
          </div>
        </div>
      )}

      <div className="acs-dash-stats">
        <div className="acs-stat-card">
          <div className="acs-stat-icon blue"><Building2 size={20} /></div>
          <div><div className="acs-stat-val">{lifts.length}</div><div className="acs-stat-label">Lifts</div></div>
        </div>
        <div className="acs-stat-card">
          <div className="acs-stat-icon purple"><Layers size={20} /></div>
          <div><div className="acs-stat-val">{lifts.reduce((s, l) => s + (l.floors?.length || 0), 0)}</div><div className="acs-stat-label">Floors Covered</div></div>
        </div>
        <div className="acs-stat-card">
          <div className="acs-stat-icon green"><Shield size={20} /></div>
          <div><div className="acs-stat-val">{levels.length}</div><div className="acs-stat-label">Access Levels</div></div>
        </div>
        <div className="acs-stat-card">
          <div className="acs-stat-icon orange"><ChevronRight size={20} /></div>
          <div><div className="acs-stat-val">{new Set(lifts.filter(l => l.device_id).map(l => l.device_id)).size}</div><div className="acs-stat-label">Devices</div></div>
        </div>
      </div>

      <div className="acs-split">
        <div className="acs-split-sidebar">
          <div style={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', padding: '4px 4px 8px' }}>
            Lifts ({lifts.length})
          </div>
          {lifts.length === 0
            ? <div className="acs-empty" style={{ padding: '20px 8px' }}>No lifts configured.</div>
            : lifts.map(l => (
              <button key={l.id} className={`acs-sidebar-item ${selected?.id === l.id ? 'active' : ''}`}
                onClick={() => setSelected(l)}>
                <Building2 size={15} />
                <div>
                  <strong>{l.name}</strong>
                  <span>Door {l.door_no} · {l.floors?.length || 0} floors</span>
                </div>
                <ChevronRight size={13} />
              </button>
            ))}
        </div>

        <div className="acs-split-main">
          {!selected
            ? (
              <div className="acs-empty-pro">
                <Building2 size={40} />
                <h3>Select a lift</h3>
                <p>Choose a lift from the left to manage its floor access rules.</p>
              </div>
            )
            : (
              <>
                <div className="acs-detail-hd">
                  <div>
                    <h3>{selected.name}</h3>
                    <p>{selected.device_name} · Door {selected.door_no}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {isAdmin && (
                      <>
                        <button className="save-btn" style={{ fontSize: 12 }}
                          onClick={() => { setAccessForm({ access_level_id: '', allowed_floors: [] }); setShowAccessForm(true); }}>
                          <Plus size={12} /> Access Rule
                        </button>
                        <button className="ghost-btn danger" style={{ height: 32, padding: '0 12px', fontSize: 12 }}
                          onClick={() => deleteLift(selected.id)}>
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                  {(selected.floors || []).map(floor => (
                    <span key={floor} className="acs-badge acs-badge-purple">{floor}</span>
                  ))}
                </div>

                {showAccessForm && (
                  <div className="acs-form-card">
                    <h4>Set Floor Access for Level</h4>
                    <div className="acs-form-grid" style={{ gridTemplateColumns: '1fr' }}>
                      <label>Access Level
                        <select value={accessForm.access_level_id} onChange={e => setAccessForm(f => ({ ...f, access_level_id: e.target.value }))}>
                          <option value="">—</option>
                          {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                      </label>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, marginBottom: 6, color: 'var(--muted)', fontWeight: 600 }}>Allowed floors:</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {(selected.floors || []).map(floor => (
                          <button key={floor} onClick={() => toggleFloor(floor)}
                            className={accessForm.allowed_floors.includes(floor) ? 'save-btn' : 'ghost-btn'}
                            style={{ minWidth: 40, fontSize: 12, fontWeight: 700 }}>
                            {floor}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="acs-form-actions">
                      <button className="ghost-btn" onClick={() => setShowAccessForm(false)}>Cancel</button>
                      <button className="save-btn" onClick={setFloorAccess} disabled={!accessForm.access_level_id}>Save</button>
                    </div>
                  </div>
                )}

                <div style={{ fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--muted)', marginBottom: 8 }}>
                  Access Level Rules
                </div>
                {(selected.floor_access || []).length === 0
                  ? <div className="acs-empty">No access rules yet. Add rules to define which levels can access which floors.</div>
                  : (
                    <div className="acs-table-wrap">
                      <table className="acs-table">
                        <thead><tr><th>Access Level</th><th>Allowed Floors</th>{isAdmin && <th></th>}</tr></thead>
                        <tbody>
                          {selected.floor_access.map(fa => (
                            <tr key={fa.id}>
                              <td><strong>{fa.access_level_name || fa.access_level_id}</strong></td>
                              <td>
                                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                  {fa.allowed_floors.map(f => (
                                    <span key={f} className="acs-badge acs-badge-green">{f}</span>
                                  ))}
                                </div>
                              </td>
                              {isAdmin && (
                                <td>
                                  <button className="ghost-btn danger" style={{ height: 28, padding: '0 10px' }} onClick={() => removeFloorAccess(fa.id)}>
                                    <Trash2 size={13} />
                                  </button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
              </>
            )}
        </div>
      </div>
    </div>
  );
}
