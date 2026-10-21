import { apiFetch } from './apiClient';
import React, { useState, useEffect, useCallback } from 'react';
import { Ban, Plus, Trash2, RefreshCw, RotateCcw, Shield, AlertTriangle, CheckCircle, Activity } from 'lucide-react';
import { API } from './apiConfig';

const H = tok => ({ Authorization: `Bearer ${tok}` });

export default function AcsAntiPassback({ token, isAdmin }) {
  const [rules, setRules]           = useState([]);
  const [violations, setViolations] = useState([]);
  const [devices, setDevices]       = useState([]);
  const [loading, setLoading]       = useState(false);
  const [tab, setTab]               = useState('rules');
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm] = useState({ device_id: '', door_no_in: 1, door_no_out: 2, mode: 'soft', reset_hours: 12 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rRes, vRes, dRes] = await Promise.all([
        apiFetch(`${API}/api/acs/anti-passback/rules`,               { headers: H(token) }),
        apiFetch(`${API}/api/acs/anti-passback/violations?limit=100`, { headers: H(token) }),
        apiFetch(`${API}/api/acs`,                                    { headers: H(token) }),
      ]);
      if (rRes.ok) setRules(await rRes.json());
      if (vRes.ok) setViolations(await vRes.json());
      if (dRes.ok) setDevices(await dRes.json());
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const createRule = async () => {
    const res = await apiFetch(`${API}/api/acs/anti-passback/rules`, {
      method: 'POST',
      headers: { ...H(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        device_id: Number(form.device_id),
        door_no_in: Number(form.door_no_in),
        door_no_out: Number(form.door_no_out),
        reset_hours: Number(form.reset_hours),
      }),
    });
    if (res.ok) { setShowForm(false); load(); }
  };

  const deleteRule = async id => {
    if (!confirm('Delete this anti-passback rule?')) return;
    await apiFetch(`${API}/api/acs/anti-passback/rules/${id}`, { method: 'DELETE', headers: H(token) });
    load();
  };

  const resetPerson = async personId => {
    await apiFetch(`${API}/api/acs/anti-passback/reset/${personId}`, { method: 'POST', headers: H(token) });
    load();
  };

  const fmt = v => v ? new Date(v).toLocaleString('en-US', {
    timeZone: 'Asia/Yerevan', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }) : '—';

  const devName = id => devices.find(d => d.id === id)?.name || `#${id}`;
  const activeRules = rules.filter(r => r.is_active).length;
  const hardRules   = rules.filter(r => r.mode === 'hard').length;

  return (
    <div className="acs-panel">
      <div className="acs-panel-header">
        <div className="acs-panel-title"><Ban size={18} /> Anti-Passback</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isAdmin && (
            <button className="save-btn" onClick={() => setShowForm(v => !v)}>
              <Plus size={13} /> Add Rule
            </button>
          )}
          <button className="ghost-btn" onClick={load} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
        Prevent credential re-use in the same direction without a matching exit.
        <strong> Soft</strong> mode logs a warning; <strong>Hard</strong> mode blocks platform-triggered unlocks
        and records violations for grants already made by a controller.
      </p>

      <div className="acs-dash-stats">
        <div className="acs-stat-card">
          <div className="acs-stat-icon blue"><Shield size={20} /></div>
          <div><div className="acs-stat-val">{activeRules}<small> / {rules.length}</small></div><div className="acs-stat-label">Active Rules</div></div>
        </div>
        <div className="acs-stat-card">
          <div className="acs-stat-icon red"><Ban size={20} /></div>
          <div><div className="acs-stat-val">{hardRules}</div><div className="acs-stat-label">Hard Mode</div></div>
        </div>
        <div className="acs-stat-card">
          <div className="acs-stat-icon orange"><AlertTriangle size={20} /></div>
          <div><div className="acs-stat-val">{violations.length}</div><div className="acs-stat-label">Violations Logged</div></div>
        </div>
        <div className="acs-stat-card">
          <div className="acs-stat-icon green"><CheckCircle size={20} /></div>
          <div><div className="acs-stat-val">{rules.filter(r => r.mode === 'soft').length}</div><div className="acs-stat-label">Soft Mode</div></div>
        </div>
      </div>

      {showForm && (
        <div className="acs-form-card">
          <h4><Shield size={14} /> New Anti-Passback Rule</h4>
          <div className="acs-form-grid">
            <label>Device
              <select value={form.device_id} onChange={e => setForm(f => ({ ...f, device_id: e.target.value }))}>
                <option value="">— select controller —</option>
                {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            <label>IN Door #
              <input type="number" min={1} max={32} value={form.door_no_in}
                onChange={e => setForm(f => ({ ...f, door_no_in: e.target.value }))} />
            </label>
            <label>OUT Door #
              <input type="number" min={1} max={32} value={form.door_no_out}
                onChange={e => setForm(f => ({ ...f, door_no_out: e.target.value }))} />
            </label>
            <label>Enforcement Mode
              <select value={form.mode} onChange={e => setForm(f => ({ ...f, mode: e.target.value }))}>
                <option value="soft">Soft — log only</option>
                <option value="hard">Hard — block access</option>
              </select>
            </label>
            <label>State Reset (hours)
              <input type="number" min={0} max={168} value={form.reset_hours}
                onChange={e => setForm(f => ({ ...f, reset_hours: e.target.value }))} />
            </label>
          </div>
          <div className="acs-form-actions">
            <button className="ghost-btn" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="save-btn" onClick={createRule} disabled={!form.device_id}>Create Rule</button>
          </div>
        </div>
      )}

      <div className="acs-filter-pills">
        <button className={tab === 'rules' ? 'active' : ''} onClick={() => setTab('rules')}>
          Rules ({rules.length})
        </button>
        <button className={tab === 'violations' ? 'active' : ''} onClick={() => setTab('violations')}>
          Violations {violations.length > 0 && <span className="acs-badge acs-badge-red" style={{ marginLeft: 4 }}>{violations.length}</span>}
        </button>
      </div>

      {tab === 'rules' && (
        rules.length === 0
          ? (
            <div className="acs-empty-pro">
              <Ban size={40} />
              <h3>No anti-passback rules</h3>
              <p>Create rules to prevent credential re-use between entry and exit doors.</p>
            </div>
          )
          : (
            <div className="acs-table-wrap">
              <table className="acs-table">
                <thead>
                  <tr>
                    <th>Device</th><th>IN Door</th><th>OUT Door</th>
                    <th>Mode</th><th>Reset</th><th>Status</th>
                    {isAdmin && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {rules.map(r => (
                    <tr key={r.id}>
                      <td><strong>{devName(r.device_id)}</strong></td>
                      <td>Door {r.door_no_in}</td>
                      <td>Door {r.door_no_out}</td>
                      <td>
                        <span className={`acs-badge ${r.mode === 'hard' ? 'acs-badge-red' : 'acs-badge-yellow'}`}>
                          {r.mode}
                        </span>
                      </td>
                      <td style={{ color: 'var(--muted)', fontSize: 12 }}>{r.reset_hours}h</td>
                      <td>
                        <span className={`acs-badge ${r.is_active ? 'acs-badge-green' : 'acs-badge-gray'}`}>
                          {r.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      {isAdmin && (
                        <td>
                          <button className="ghost-btn danger"
                            style={{ height: 28, padding: '0 10px', fontSize: 12 }}
                            onClick={() => deleteRule(r.id)}>
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

      {tab === 'violations' && (
        violations.length === 0
          ? (
            <div className="acs-empty-pro">
              <Activity size={40} />
              <h3>No violations recorded</h3>
              <p>Violations appear here when a person re-uses a credential without a matching exit event.</p>
            </div>
          )
          : (
            <div className="acs-table-wrap">
              <table className="acs-table">
                <thead>
                  <tr><th>Time</th><th>Person / Card</th><th>Device</th><th>Door</th><th>Direction</th><th></th></tr>
                </thead>
                <tbody>
                  {violations.map(v => (
                    <tr key={v.id}>
                      <td className="acs-td-time">{fmt(v.created_at)}</td>
                      <td><strong>{v.person_name || v.card_number || '—'}</strong></td>
                      <td>{v.device_name || '—'}</td>
                      <td>Door {v.door_no}</td>
                      <td>
                        <span className={`acs-badge ${v.direction === 'in' ? 'acs-badge-blue' : 'acs-badge-orange'}`}>
                          {v.direction?.toUpperCase()}
                        </span>
                      </td>
                      <td>
                        {v.person_id && isAdmin && (
                          <button className="ghost-btn" style={{ height: 26, padding: '0 10px', fontSize: 11 }}
                            title="Reset person state" onClick={() => resetPerson(v.person_id)}>
                            <RotateCcw size={11} /> Reset
                          </button>
                        )}
                      </td>
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
