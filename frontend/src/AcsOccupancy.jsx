import { apiFetch } from './apiClient';
import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, Plus, Trash2, RefreshCw, Users, AlertTriangle, RotateCcw, ChevronRight } from 'lucide-react';
import { API } from './apiConfig';

const H = tok => ({ Authorization: `Bearer ${tok}` });

export default function AcsOccupancy({ token, isAdmin }) {
  const [snapshot, setSnapshot] = useState(null);
  const [zones, setZones]       = useState([]);
  const [inside, setInside]     = useState({});
  const [devices, setDevices]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm]         = useState({ name: '', description: '', max_capacity: '', color: '#3B82F6', door_rules: [] });
  const [showForm, setShowForm] = useState(false);
  const [ruleForm, setRuleForm] = useState({ device_id: '', door_no: 1, direction: 'in' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [snapRes, zRes, dRes] = await Promise.all([
        apiFetch(`${API}/api/acs/occupancy/snapshot`,  { headers: H(token) }),
        apiFetch(`${API}/api/acs/occupancy/zones`,      { headers: H(token) }),
        apiFetch(`${API}/api/acs`,                      { headers: H(token) }),
      ]);
      if (snapRes.ok) setSnapshot(await snapRes.json());
      if (zRes.ok)    setZones(await zRes.json());
      if (dRes.ok)    setDevices(await dRes.json());
    } finally { setLoading(false); }
  }, [token]);

  const loadInside = useCallback(async (zoneId) => {
    const res = await apiFetch(`${API}/api/acs/occupancy/zones/${zoneId}/inside`, { headers: H(token) });
    if (res.ok) { const data = await res.json(); setInside(prev => ({ ...prev, [zoneId]: data })); }
  }, [token]);

  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  useEffect(() => { if (selected) loadInside(selected.id); }, [selected, loadInside]);

  const addRule = () => {
    if (!ruleForm.device_id || !ruleForm.door_no) return;
    setForm(f => ({ ...f, door_rules: [...f.door_rules, { device_id: Number(ruleForm.device_id), door_no: Number(ruleForm.door_no), direction: ruleForm.direction }] }));
    setRuleForm({ device_id: '', door_no: 1, direction: 'in' });
  };

  const removeRule = (i) => setForm(f => ({ ...f, door_rules: f.door_rules.filter((_, idx) => idx !== i) }));

  const createZone = async () => {
    const res = await apiFetch(`${API}/api/acs/occupancy/zones`, {
      method: 'POST',
      headers: { ...H(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, max_capacity: form.max_capacity ? Number(form.max_capacity) : null }),
    });
    if (res.ok) {
      setShowForm(false);
      setForm({ name: '', description: '', max_capacity: '', color: '#3B82F6', door_rules: [] });
      load();
    }
  };

  const deleteZone = async (id) => {
    if (!confirm('Delete this zone?')) return;
    await apiFetch(`${API}/api/acs/occupancy/zones/${id}`, { method: 'DELETE', headers: H(token) });
    if (selected?.id === id) setSelected(null);
    load();
  };

  const resetZone = async (id) => {
    if (!confirm('Reset all occupancy entries for this zone?')) return;
    await apiFetch(`${API}/api/acs/occupancy/zones/${id}/reset`, { method: 'POST', headers: H(token) });
    load(); loadInside(id);
  };

  const fmt = v => v ? new Date(v).toLocaleString('en-US', { timeZone: 'Asia/Yerevan', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
  const deviceName = id => devices.find(d => d.id === id)?.name || `Device #${id}`;

  const overCount = snapshot?.zones?.filter(z => z.is_over_capacity).length ?? 0;

  return (
    <div className="acs-panel">
      <div className="acs-panel-header">
        <div className="acs-panel-title"><BarChart3 size={18} /> Zone Occupancy</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isAdmin && <button className="save-btn" onClick={() => setShowForm(true)}><Plus size={13} /> Add Zone</button>}
          <button className="ghost-btn" onClick={load} disabled={loading}><RefreshCw size={13} className={loading ? 'spin' : ''} /></button>
        </div>
      </div>

      <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
        Real-time zone headcount based on IN/OUT door events. Auto-refreshes every 15 seconds.
      </p>

      {snapshot && (
        <div className="acs-dash-stats">
          <div className="acs-stat-card">
            <div className="acs-stat-icon blue"><Users size={20} /></div>
            <div><div className="acs-stat-val">{snapshot.total_inside ?? 0}</div><div className="acs-stat-label">Total Inside</div></div>
          </div>
          {overCount > 0 && (
            <div className="acs-stat-card" style={{ borderColor: 'var(--danger, #ef4444)' }}>
              <div className="acs-stat-icon red"><AlertTriangle size={20} /></div>
              <div><div className="acs-stat-val">{overCount}</div><div className="acs-stat-label">Over Capacity</div></div>
            </div>
          )}
        </div>
      )}

      {(snapshot?.zones?.length ?? 0) > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
          {snapshot.zones.map(z => (
            <button key={z.zone_id}
              onClick={() => { setSelected(zones.find(zz => zz.id === z.zone_id)); loadInside(z.zone_id); }}
              style={{
                background: z.is_over_capacity
                  ? 'color-mix(in srgb, var(--danger, #ef4444) 8%, var(--card))'
                  : 'color-mix(in srgb, var(--success, #16a34a) 8%, var(--card))',
                border: `2px solid ${z.is_over_capacity ? 'var(--danger, #ef4444)' : z.color || 'var(--primary)'}`,
                borderRadius: 12, padding: '14px 16px',
                cursor: 'pointer', textAlign: 'left',
                transition: 'transform .12s, box-shadow .12s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,.1)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: z.color || 'var(--primary)', flexShrink: 0 }} />
                <strong style={{ fontSize: 13, color: 'var(--text)' }}>{z.zone_name}</strong>
              </div>
              <div style={{ fontSize: 30, fontWeight: 800, color: z.is_over_capacity ? 'var(--danger, #ef4444)' : 'var(--text)', lineHeight: 1 }}>
                {z.current_count}
                {z.max_capacity && (
                  <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--muted)' }}> / {z.max_capacity}</span>
                )}
              </div>
              {z.is_over_capacity && (
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--danger, #ef4444)', marginTop: 4, letterSpacing: '.06em' }}>
                  OVER CAPACITY
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {showForm && (
        <div className="acs-form-card">
          <h4><BarChart3 size={14} /> New Occupancy Zone</h4>
          <div className="acs-form-grid">
            <label>Zone Name<input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Office Floor 3" /></label>
            <label>Max Capacity<input type="number" min={1} value={form.max_capacity} onChange={e => setForm(f => ({ ...f, max_capacity: e.target.value }))} placeholder="optional" /></label>
            <label>Color<input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} /></label>
          </div>
          <div style={{ fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--muted)', margin: '12px 0 8px' }}>
            Door Rules (IN/OUT tracking)
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <select value={ruleForm.device_id} onChange={e => setRuleForm(f => ({ ...f, device_id: e.target.value }))}>
              <option value="">— device —</option>
              {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <input type="number" min={1} max={32} value={ruleForm.door_no}
              onChange={e => setRuleForm(f => ({ ...f, door_no: e.target.value }))}
              style={{ width: 64 }} placeholder="Door #" />
            <select value={ruleForm.direction} onChange={e => setRuleForm(f => ({ ...f, direction: e.target.value }))}>
              <option value="in">IN</option>
              <option value="out">OUT</option>
            </select>
            <button className="ghost-btn" onClick={addRule}><Plus size={12} /></button>
          </div>
          {form.door_rules.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {form.door_rules.map((r, i) => (
                <span key={i} className="acs-badge acs-badge-purple" style={{ cursor: 'default' }}>
                  {deviceName(r.device_id)} · Door {r.door_no} · {r.direction.toUpperCase()}
                  <button onClick={() => removeRule(i)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 0 4px', color: 'inherit', lineHeight: 1 }}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="acs-form-actions">
            <button className="ghost-btn" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="save-btn" onClick={createZone} disabled={!form.name}>Create Zone</button>
          </div>
        </div>
      )}

      {selected && (
        <div className="acs-form-card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="acs-detail-hd" style={{ padding: '14px 18px 12px' }}>
            <div>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 12, height: 12, borderRadius: '50%', background: selected.color || 'var(--primary)', flexShrink: 0 }} />
                {selected.name}
                <span className="acs-badge acs-badge-blue">{inside[selected.id]?.length ?? '…'} inside</span>
              </h3>
              <p>{selected.description || (selected.max_capacity ? `Capacity: ${selected.max_capacity}` : 'No capacity limit')}</p>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {isAdmin && (
                <>
                  <button className="ghost-btn" style={{ height: 30, padding: '0 12px', fontSize: 12 }} onClick={() => resetZone(selected.id)}>
                    <RotateCcw size={12} /> Reset
                  </button>
                  <button className="ghost-btn danger" style={{ height: 30, padding: '0 12px', fontSize: 12 }} onClick={() => deleteZone(selected.id)}>
                    <Trash2 size={12} />
                  </button>
                </>
              )}
            </div>
          </div>
          {(inside[selected.id] || []).length === 0
            ? <div className="acs-empty" style={{ padding: '20px 18px' }}>Nobody tracked inside this zone right now.</div>
            : (
              <div className="acs-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                <table className="acs-table">
                  <thead><tr><th>Person</th><th>Entered</th></tr></thead>
                  <tbody>
                    {inside[selected.id].map(e => (
                      <tr key={e.id}>
                        <td><strong>{e.person_name || e.card_number || 'Unknown'}</strong></td>
                        <td className="acs-td-time">{fmt(e.entered_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}

      {zones.length === 0 && !loading && (
        <div className="acs-empty-pro">
          <BarChart3 size={40} />
          <h3>No occupancy zones</h3>
          <p>Create zones and assign door rules to start tracking real-time headcounts.</p>
        </div>
      )}
    </div>
  );
}
