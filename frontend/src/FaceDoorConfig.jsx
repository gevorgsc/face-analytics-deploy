import { apiFetch } from './apiClient';
// FaceDoorConfig.jsx — Configure Camera → ACS Door auto-unlock mappings

import React, { useState, useEffect, useCallback } from 'react';
import { Link2, Plus, Trash2, RefreshCw, Save, Eye, EyeOff, ShieldAlert, CheckCircle, X } from 'lucide-react';
import { API } from './apiConfig';

function ConfirmDialog({ message, danger, onConfirm, onCancel }) {
  return (
    <div className="pm-dialog-overlay" onMouseDown={e => e.target === e.currentTarget && onCancel()}>
      <div className="pm-dialog">
        <div className="pm-dialog-header">
          <strong>{danger ? 'Confirm' : 'Notice'}</strong>
          <button className="pm-dialog-close" onClick={onCancel}><X size={16} /></button>
        </div>
        <div className="pm-dialog-body"><p className="pm-dialog-msg">{message}</p></div>
        <div className="pm-dialog-footer">
          <button className="ghost-btn" onClick={onCancel}>Cancel</button>
          <button className={danger ? 'danger-btn' : 'save-btn'} onClick={onConfirm}>
            {danger ? 'Delete' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}

const PERSON_TYPES = ['employee', 'vip', 'unknown'];

function MappingForm({ devices, cameras, initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: '',
    camera_id: '',
    acs_device_id: '',
    door_no: 1,
    allowed_types: ['employee', 'vip'],
    min_confidence: 0.65,
    require_face: false,
    cooldown_seconds: 5,
    is_active: true,
    ...initial,
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleType = (t) => {
    set('allowed_types', form.allowed_types.includes(t)
      ? form.allowed_types.filter(x => x !== t)
      : [...form.allowed_types, t]);
  };

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <h3 style={{ margin: 0, fontSize: 15 }}>
        {initial?.id ? 'Edit Mapping' : 'New Face → Door Mapping'}
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
            Mapping Name
          </label>
          <input value={form.name} onChange={e => set('name', e.target.value)}
                 placeholder="e.g. Main Entrance"
                 style={{ width: '100%', padding: '8px 10px', borderRadius: 7,
                          border: '1px solid var(--border)', background: 'var(--bg)',
                          fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
            Door No.
          </label>
          <input type="number" value={form.door_no} min={1} max={32}
                 onChange={e => set('door_no', Number(e.target.value))}
                 style={{ width: '100%', padding: '8px 10px', borderRadius: 7,
                          border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13,
                          boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
            Face Camera
          </label>
          <select value={form.camera_id} onChange={e => set('camera_id', Number(e.target.value))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 7,
                           border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13,
                           boxSizing: 'border-box' }}>
            <option value="">— Select camera —</option>
            {cameras.map(c => <option key={c.id} value={c.id}>{c.name} ({c.ip_address})</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
            ACS Device
          </label>
          <select value={form.acs_device_id} onChange={e => set('acs_device_id', Number(e.target.value))}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 7,
                           border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13,
                           boxSizing: 'border-box' }}>
            <option value="">— Select ACS device —</option>
            {devices.map(d => <option key={d.id} value={d.id}>{d.name} ({d.ip_address})</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
            Min Confidence (0–1)
          </label>
          <input type="number" value={form.min_confidence} step={0.05} min={0} max={1}
                 onChange={e => set('min_confidence', parseFloat(e.target.value))}
                 style={{ width: '100%', padding: '8px 10px', borderRadius: 7,
                          border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13,
                          boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>
            Cooldown (seconds)
          </label>
          <input type="number" value={form.cooldown_seconds} min={1} max={3600}
                 onChange={e => set('cooldown_seconds', Number(e.target.value))}
                 style={{ width: '100%', padding: '8px 10px', borderRadius: 7,
                          border: '1px solid var(--border)', background: 'var(--bg)', fontSize: 13,
                          boxSizing: 'border-box' }} />
        </div>
      </div>

      {/* Allowed person types */}
      <div>
        <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
          Allowed Person Types
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          {PERSON_TYPES.map(t => (
            <button key={t} onClick={() => toggleType(t)}
                    style={{
                      padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                      border: `1px solid ${form.allowed_types.includes(t) ? '#3b82f6' : 'var(--border)'}`,
                      background: form.allowed_types.includes(t) ? '#eff6ff' : 'var(--bg)',
                      color: form.allowed_types.includes(t) ? '#1d4ed8' : 'var(--muted)',
                      fontWeight: form.allowed_types.includes(t) ? 600 : 400,
                    }}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Toggles */}
      <div style={{ display: 'flex', gap: 20 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
          <input type="checkbox" checked={form.require_face}
                 onChange={e => set('require_face', e.target.checked)}
                 style={{ width: 15, height: 15 }} />
          <span>Require Face for Card Access (Dual-Factor)</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
          <input type="checkbox" checked={form.is_active}
                 onChange={e => set('is_active', e.target.checked)}
                 style={{ width: 15, height: 15 }} />
          <span>Active</span>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={() => onSave(form)}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none',
                         background: '#3b82f6', color: '#fff', fontWeight: 600,
                         fontSize: 13, cursor: 'pointer',
                         display: 'flex', alignItems: 'center', gap: 6 }}>
          <Save size={14} /> Save Mapping
        </button>
        <button onClick={onCancel}
                style={{ padding: '8px 14px', borderRadius: 8,
                         border: '1px solid var(--border)', background: 'var(--bg)',
                         fontSize: 13, cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function FaceDoorConfig({ token, isAdmin }) {
  const [mappings,  setMappings]  = useState([]);
  const [devices,   setDevices]   = useState([]);
  const [cameras,   setCameras]   = useState([]);
  const [denials,   setDenials]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [editItem,  setEditItem]  = useState(null);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState('');
  const [confirmModal, setConfirmModal] = useState(null);

  const showConfirm = (message, danger = false) => new Promise(resolve =>
    setConfirmModal({ message, danger, resolve }));

  const hdrs = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, dRes, cRes, denRes] = await Promise.all([
        apiFetch(`${API}/api/acs/face-door/mappings`, { headers: hdrs }),
        apiFetch(`${API}/api/acs`,                    { headers: hdrs }),
        apiFetch(`${API}/api/cameras`,                { headers: hdrs }),
        apiFetch(`${API}/api/acs/face-door/denials?hours=24&limit=50`, { headers: hdrs }),
      ]);
      if (mRes.ok)   setMappings(await mRes.json());
      if (dRes.ok)   setDevices(await dRes.json());
      if (cRes.ok)   setCameras(await cRes.json());
      if (denRes.ok) setDenials((await denRes.json()).items || []);
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const saveMapping = async (form) => {
    if (!form.camera_id || !form.acs_device_id) {
      setError('Camera and ACS device are required'); return;
    }
    setError('');
    const url  = form.id ? `${API}/api/acs/face-door/mappings/${form.id}` : `${API}/api/acs/face-door/mappings`;
    const meth = form.id ? 'PATCH' : 'POST';
    const res  = await apiFetch(url, { method: meth, headers: hdrs, body: JSON.stringify(form) });
    if (res.ok) {
      setSuccess(form.id ? 'Mapping updated.' : 'Mapping created.');
      setShowForm(false); setEditItem(null); load();
    } else {
      const d = await res.json();
      setError(d.detail || 'Save failed');
    }
  };

  const deleteMapping = async (id) => {
    const ok = await showConfirm('Delete this mapping?', true);
    if (!ok) return;
    await apiFetch(`${API}/api/acs/face-door/mappings/${id}`, { method: 'DELETE', headers: hdrs });
    load();
  };

  const reasonColor = (r) => {
    if (r === 'blacklisted')    return '#ef4444';
    if (r === 'no_access')      return '#f59e0b';
    if (r === 'low_confidence') return '#8b5cf6';
    return '#94a3b8';
  };

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link2 size={20} /> Face → Door Auto-Unlock
        </h2>
        {isAdmin && !showForm && (
          <button onClick={() => { setShowForm(true); setEditItem(null); }}
                  style={{ padding: '8px 16px', borderRadius: 8, border: 'none',
                           background: '#3b82f6', color: '#fff', fontWeight: 600,
                           fontSize: 13, cursor: 'pointer',
                           display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> Add Mapping
          </button>
        )}
      </div>

      {error   && <div style={{ padding:'10px 14px', borderRadius:8, background:'#fef2f2', color:'#dc2626', fontSize:13 }}>{error}</div>}
      {success && <div style={{ padding:'10px 14px', borderRadius:8, background:'#f0fdf4', color:'#15803d', fontSize:13 }}>{success}</div>}

      {/* How it works */}
      <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:10, padding:'12px 16px', fontSize:13 }}>
        <strong style={{ color:'#1d4ed8' }}>How it works:</strong>
        <span style={{ color:'#1e40af' }}>
          {' '}When a face is recognized by a linked camera with sufficient confidence, the mapped ACS door is
          automatically unlocked — no card swipe needed. Blacklisted persons are always denied.
        </span>
      </div>

      {/* Form */}
      {showForm && (
        <MappingForm devices={devices} cameras={cameras}
                     initial={editItem || {}}
                     onSave={saveMapping}
                     onCancel={() => { setShowForm(false); setEditItem(null); }} />
      )}

      {/* Mappings list */}
      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:'var(--muted)' }}>Loading…</div>
      ) : mappings.length === 0 ? (
        <div style={{ textAlign:'center', padding:48, color:'var(--muted)' }}>
          <Link2 size={40} style={{ opacity:.2, marginBottom:8, display:'block', margin:'0 auto 8px' }} />
          <p>No face→door mappings yet. Add one to enable auto-unlock.</p>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {mappings.map(m => (
            <div key={m.id} style={{
              background:'var(--card)', border:'1px solid var(--border)',
              borderRadius:10, padding:'14px 18px',
              display:'flex', alignItems:'center', gap:14, flexWrap:'wrap',
            }}>
              <div style={{ flex:1, minWidth:200 }}>
                <div style={{ fontWeight:700, fontSize:14 }}>{m.name || `Mapping #${m.id}`}</div>
                <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>
                  Camera #{m.camera_id} → ACS Device #{m.acs_device_id} · Door {m.door_no}
                </div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:3 }}>
                  Confidence ≥ {m.min_confidence} · Cooldown {m.cooldown_seconds}s ·
                  Types: {m.allowed_types?.join(', ') || '—'}
                  {m.require_face && <span style={{ color:'#8b5cf6', marginLeft:6 }}>· Dual-factor</span>}
                </div>
              </div>
              <span style={{
                padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600,
                background: m.is_active ? '#dcfce7' : '#f1f5f9',
                color:      m.is_active ? '#15803d' : '#64748b',
              }}>
                {m.is_active ? 'Active' : 'Inactive'}
              </span>
              {isAdmin && (
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={() => { setEditItem(m); setShowForm(true); }}
                          style={{ padding:'6px 10px', borderRadius:7, border:'1px solid var(--border)',
                                   background:'var(--bg)', cursor:'pointer', fontSize:12 }}>
                    Edit
                  </button>
                  <button onClick={() => deleteMapping(m.id)}
                          style={{ padding:'6px 10px', borderRadius:7, border:'1px solid #fecaca',
                                   background:'#fef2f2', color:'#dc2626', cursor:'pointer', fontSize:12 }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Recent denials */}
      <div style={{ background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:20 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
          <h3 style={{ margin:0, fontSize:14, display:'flex', alignItems:'center', gap:6 }}>
            <ShieldAlert size={16} /> Recent Access Denials (24h)
          </h3>
          <button className="btn-ghost-sm" onClick={load}>
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
        {denials.length === 0 ? (
          <p style={{ color:'var(--muted)', fontSize:13 }}>No denials in the last 24 hours.</p>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border)' }}>
                <th style={{ textAlign:'left', padding:'4px 8px', color:'var(--muted)' }}>Time</th>
                <th style={{ textAlign:'left', padding:'4px 8px', color:'var(--muted)' }}>Person</th>
                <th style={{ textAlign:'left', padding:'4px 8px', color:'var(--muted)' }}>Reason</th>
                <th style={{ textAlign:'left', padding:'4px 8px', color:'var(--muted)' }}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {denials.map(d => (
                <tr key={d.id} style={{ borderBottom:'1px solid var(--border)' }}>
                  <td style={{ padding:'5px 8px', whiteSpace:'nowrap' }}>
                    {new Date(d.created_at).toLocaleString('en-US',{
                      timeZone:'Asia/Yerevan', month:'2-digit', day:'2-digit',
                      hour:'2-digit', minute:'2-digit', hour12:false,
                    })}
                  </td>
                  <td style={{ padding:'5px 8px' }}>{d.person_name || d.card_number || '—'}</td>
                  <td style={{ padding:'5px 8px' }}>
                    <span style={{ padding:'2px 7px', borderRadius:4, fontSize:11, fontWeight:600,
                                  background: reasonColor(d.denial_reason)+'20',
                                  color: reasonColor(d.denial_reason) }}>
                      {d.denial_reason?.replace(/_/g,' ')}
                    </span>
                  </td>
                  <td style={{ padding:'5px 8px', color:'var(--muted)', fontSize:11 }}>{d.detail || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {confirmModal && (
        <ConfirmDialog
          message={confirmModal.message}
          danger={confirmModal.danger}
          onConfirm={() => { setConfirmModal(null); confirmModal.resolve(true); }}
          onCancel={() => { setConfirmModal(null); confirmModal.resolve(false); }}
        />
      )}
    </div>
  );
}
