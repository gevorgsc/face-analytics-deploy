import { apiFetch } from './apiClient';
import React, { useState, useEffect, useCallback } from 'react';
import { MapPin, Plus, RefreshCw, Play, CheckCircle, Clock, Trash2, ChevronRight, Activity, Shield } from 'lucide-react';
import { API } from './apiConfig';

const H = tok => ({ Authorization: `Bearer ${tok}` });

export default function AcsGuardTour({ token, isAdmin }) {
  const [tours, setTours]         = useState([]);
  const [devices, setDevices]     = useState([]);
  const [selected, setSelected]   = useState(null);
  const [executions, setExecs]    = useState([]);
  const [detailTab, setDetailTab] = useState('checkpoints');
  const [loading, setLoading]     = useState(false);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm] = useState({ name: '', description: '', is_ordered: true });
  const [cpForm, setCpForm] = useState({ device_id: '', door_no: 1, order: 1, name: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, dRes] = await Promise.all([
        apiFetch(`${API}/api/acs/guard-tours`,  { headers: H(token) }),
        apiFetch(`${API}/api/acs`,              { headers: H(token) }),
      ]);
      if (tRes.ok) { const list = await tRes.json(); setTours(list); if (selected) setSelected(list.find(t => t.id === selected.id) || null); }
      if (dRes.ok) setDevices(await dRes.json());
    } finally { setLoading(false); }
  }, [token, selected]);

  const loadExecs = useCallback(async tourId => {
    const res = await apiFetch(`${API}/api/acs/guard-tours/${tourId}/executions`, { headers: H(token) });
    if (res.ok) setExecs(await res.json());
  }, [token]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (selected) { loadExecs(selected.id); } }, [selected, loadExecs]);

  const createTour = async () => {
    const res = await apiFetch(`${API}/api/acs/guard-tours`, {
      method: 'POST',
      headers: { ...H(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) { setShowForm(false); load(); }
  };

  const deleteTour = async id => {
    if (!confirm('Delete this guard tour?')) return;
    await apiFetch(`${API}/api/acs/guard-tours/${id}`, { method: 'DELETE', headers: H(token) });
    if (selected?.id === id) setSelected(null);
    load();
  };

  const addCheckpoint = async () => {
    if (!selected || !cpForm.device_id) return;
    await apiFetch(`${API}/api/acs/guard-tours/${selected.id}/checkpoints`, {
      method: 'POST',
      headers: { ...H(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...cpForm, device_id: Number(cpForm.device_id), door_no: Number(cpForm.door_no), order: Number(cpForm.order) }),
    });
    load();
  };

  const startExecution = async tourId => {
    await apiFetch(`${API}/api/acs/guard-tours/${tourId}/executions`, { method: 'POST', headers: H(token) });
    loadExecs(tourId);
  };

  const fmt = v => v ? new Date(v).toLocaleString('en-US', {
    timeZone: 'Asia/Yerevan', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }) : '—';
  const devName = id => devices.find(d => d.id === id)?.name || `#${id}`;

  return (
    <div className="acs-panel">
      <div className="acs-panel-header">
        <div className="acs-panel-title"><MapPin size={18} /> Guard Tour</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isAdmin && (
            <button className="save-btn" onClick={() => setShowForm(v => !v)}>
              <Plus size={13} /> New Tour
            </button>
          )}
          <button className="ghost-btn" onClick={load} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      <div className="acs-dash-stats">
        <div className="acs-stat-card">
          <div className="acs-stat-icon blue"><MapPin size={20} /></div>
          <div><div className="acs-stat-val">{tours.length}</div><div className="acs-stat-label">Total Tours</div></div>
        </div>
        <div className="acs-stat-card">
          <div className="acs-stat-icon purple"><Shield size={20} /></div>
          <div><div className="acs-stat-val">{tours.reduce((s, t) => s + (t.checkpoints?.length || 0), 0)}</div><div className="acs-stat-label">Checkpoints</div></div>
        </div>
        <div className="acs-stat-card">
          <div className="acs-stat-icon green"><CheckCircle size={20} /></div>
          <div><div className="acs-stat-val">{tours.filter(t => t.is_ordered).length}</div><div className="acs-stat-label">Ordered Tours</div></div>
        </div>
        <div className="acs-stat-card">
          <div className="acs-stat-icon orange"><Activity size={20} /></div>
          <div><div className="acs-stat-val">{tours.filter(t => !t.is_ordered).length}</div><div className="acs-stat-label">Free-form Tours</div></div>
        </div>
      </div>

      {showForm && (
        <div className="acs-form-card">
          <h4><MapPin size={14} /> New Guard Tour</h4>
          <div className="acs-form-grid">
            <label>Tour Name
              <input value={form.name} placeholder="Night Round A" onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </label>
            <label>Description
              <input value={form.description} placeholder="Optional description" onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </label>
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <input type="checkbox" checked={form.is_ordered} onChange={e => setForm(f => ({ ...f, is_ordered: e.target.checked }))} />
              Enforce checkpoint order
            </label>
          </div>
          <div className="acs-form-actions">
            <button className="ghost-btn" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="save-btn" onClick={createTour} disabled={!form.name}>Create Tour</button>
          </div>
        </div>
      )}

      <div className="acs-split">
        <div className="acs-split-sidebar">
          <div style={{ fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--muted)', padding: '4px 4px 8px' }}>
            Tours ({tours.length})
          </div>
          {tours.length === 0
            ? <div className="acs-empty" style={{ padding: '20px 8px' }}>No tours yet.</div>
            : tours.map(t => (
              <button key={t.id} className={`acs-sidebar-item ${selected?.id === t.id ? 'active' : ''}`}
                onClick={() => { setSelected(t); setDetailTab('checkpoints'); }}>
                <MapPin size={15} />
                <div>
                  <strong>{t.name}</strong>
                  <span>{t.checkpoints?.length || 0} checkpoints · {t.is_ordered ? 'Ordered' : 'Free'}</span>
                </div>
                <ChevronRight size={13} />
              </button>
            ))}
        </div>

        <div className="acs-split-main">
          {!selected
            ? (
              <div className="acs-empty-pro">
                <MapPin size={40} />
                <h3>Select a tour</h3>
                <p>Choose a guard tour from the left to manage its checkpoints and executions.</p>
              </div>
            )
            : (
              <>
                <div className="acs-detail-hd">
                  <div>
                    <h3>{selected.name}</h3>
                    <p>{selected.description || (selected.is_ordered ? 'Ordered checkpoints' : 'Free-form checkpoints')}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {isAdmin && (
                      <>
                        <button className="save-btn" style={{ fontSize: 12 }} onClick={() => startExecution(selected.id)}>
                          <Play size={12} /> Start Execution
                        </button>
                        <button className="ghost-btn danger" style={{ height: 32, padding: '0 12px', fontSize: 12 }}
                          onClick={() => deleteTour(selected.id)}>
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="acs-filter-pills">
                  <button className={detailTab === 'checkpoints' ? 'active' : ''} onClick={() => setDetailTab('checkpoints')}>
                    Checkpoints ({selected.checkpoints?.length || 0})
                  </button>
                  <button className={detailTab === 'executions' ? 'active' : ''} onClick={() => setDetailTab('executions')}>
                    Executions ({executions.length})
                  </button>
                </div>

                {detailTab === 'checkpoints' && (
                  <>
                    {isAdmin && (
                      <div className="acs-form-card">
                        <h4><Plus size={13} /> Add Checkpoint</h4>
                        <div className="acs-form-grid">
                          <label>Name
                            <input value={cpForm.name} placeholder="Main Entrance" onChange={e => setCpForm(f => ({ ...f, name: e.target.value }))} />
                          </label>
                          <label>Device
                            <select value={cpForm.device_id} onChange={e => setCpForm(f => ({ ...f, device_id: e.target.value }))}>
                              <option value="">—</option>
                              {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                          </label>
                          <label>Door #
                            <input type="number" min={1} max={32} value={cpForm.door_no} onChange={e => setCpForm(f => ({ ...f, door_no: e.target.value }))} />
                          </label>
                          <label>Order
                            <input type="number" min={1} value={cpForm.order} onChange={e => setCpForm(f => ({ ...f, order: e.target.value }))} />
                          </label>
                        </div>
                        <div className="acs-form-actions">
                          <button className="save-btn" onClick={addCheckpoint} disabled={!cpForm.device_id}>Add</button>
                        </div>
                      </div>
                    )}

                    {(selected.checkpoints || []).length === 0
                      ? <div className="acs-empty">No checkpoints added yet.</div>
                      : (
                        <div className="acs-table-wrap">
                          <table className="acs-table">
                            <thead><tr><th>#</th><th>Name</th><th>Device</th><th>Door</th></tr></thead>
                            <tbody>
                              {[...(selected.checkpoints || [])].sort((a, b) => a.order - b.order).map(cp => (
                                <tr key={cp.id}>
                                  <td style={{ fontWeight: 700, color: 'var(--primary)' }}>{cp.order}</td>
                                  <td><strong>{cp.name || '—'}</strong></td>
                                  <td>{devName(cp.device_id)}</td>
                                  <td>Door {cp.door_no}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                  </>
                )}

                {detailTab === 'executions' && (
                  executions.length === 0
                    ? <div className="acs-empty">No executions recorded for this tour.</div>
                    : (
                      <div className="acs-table-wrap">
                        <table className="acs-table">
                          <thead><tr><th>Started</th><th>Completed</th><th>Progress</th><th>Status</th></tr></thead>
                          <tbody>
                            {executions.map(ex => (
                              <tr key={ex.id}>
                                <td className="acs-td-time">{fmt(ex.started_at)}</td>
                                <td className="acs-td-time">{fmt(ex.completed_at)}</td>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div className="acs-progress" style={{ width: 80 }}>
                                      <div className="acs-progress-bar" style={{ width: `${ex.completion_pct || 0}%` }} />
                                    </div>
                                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{ex.completion_pct || 0}%</span>
                                  </div>
                                </td>
                                <td>
                                  <span className={`acs-badge ${ex.status === 'completed' ? 'acs-badge-green' : ex.status === 'in_progress' ? 'acs-badge-blue' : 'acs-badge-gray'}`}>
                                    {ex.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                )}
              </>
            )}
        </div>
      </div>
    </div>
  );
}
