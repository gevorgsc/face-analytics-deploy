import { apiFetch } from './apiClient';
import React, { useState, useEffect, useCallback } from 'react';
import { KeyRound, Plus, Trash2, RefreshCw, CheckCircle, Clock, Users, Shield } from 'lucide-react';
import { API } from './apiConfig';

const H = tok => ({ Authorization: `Bearer ${tok}` });

export default function AcsDualAuth({ token, isAdmin }) {
  const [rules, setRules]     = useState([]);
  const [pending, setPending] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab]         = useState('rules');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ device_id: '', door_no: 1, timeout_seconds: 30, description: '' });
  const [secondCards, setSecondCards] = useState({});
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rRes, pRes, dRes] = await Promise.all([
        apiFetch(`${API}/api/acs/dual-auth/rules`,   { headers: H(token) }),
        apiFetch(`${API}/api/acs/dual-auth/pending`,  { headers: H(token) }),
        apiFetch(`${API}/api/acs`,                    { headers: H(token) }),
      ]);
      if (rRes.ok) setRules(await rRes.json());
      if (pRes.ok) setPending(await pRes.json());
      if (dRes.ok) setDevices(await dRes.json());
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);

  const createRule = async () => {
    const res = await apiFetch(`${API}/api/acs/dual-auth/rules`, {
      method: 'POST',
      headers: { ...H(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, device_id: Number(form.device_id), door_no: Number(form.door_no), timeout_seconds: Number(form.timeout_seconds) }),
    });
    if (res.ok) { setShowForm(false); load(); }
  };

  const deleteRule = async id => {
    if (!confirm('Delete this dual-auth rule?')) return;
    await apiFetch(`${API}/api/acs/dual-auth/rules/${id}`, { method: 'DELETE', headers: H(token) });
    load();
  };

  const confirm2nd = async id => {
    const cardNumber = String(secondCards[id] || '').trim();
    if (!cardNumber) {
      setMessage('Enter the second card number.');
      return;
    }
    const response = await apiFetch(`${API}/api/acs/dual-auth/confirm/${id}`, {
      method: 'POST',
      headers: { ...H(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ card_number: cardNumber }),
    });
    const result = await response.json().catch(() => ({}));
    setMessage(result.detail || result.message || (response.ok ? 'Door unlocked.' : 'Confirmation failed.'));
    if (response.ok) {
      setSecondCards(values => ({ ...values, [id]: '' }));
    }
    load();
  };

  const fmt = v => v ? new Date(v).toLocaleString('en-US', {
    timeZone: 'Asia/Yerevan', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }) : '—';
  const devName = id => devices.find(d => d.id === id)?.name || `#${id}`;

  const secsLeft = expiresAt => {
    if (!expiresAt) return null;
    const diff = Math.round((new Date(expiresAt) - Date.now()) / 1000);
    return diff > 0 ? diff : 0;
  };

  return (
    <div className="acs-panel">
      <div className="acs-panel-header">
        <div className="acs-panel-title"><KeyRound size={18} /> Dual Authentication</div>
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
        Require two different active credentials at a door within a configurable time window.
        Refreshes every 10 seconds.
      </p>
      {message && <div className="credential-health-message">{message}</div>}

      <div className="acs-dash-stats">
        <div className="acs-stat-card">
          <div className="acs-stat-icon blue"><Shield size={20} /></div>
          <div><div className="acs-stat-val">{rules.filter(r => r.is_active).length}<small> / {rules.length}</small></div><div className="acs-stat-label">Active Rules</div></div>
        </div>
        <div className="acs-stat-card">
          <div className="acs-stat-icon yellow"><Clock size={20} /></div>
          <div><div className="acs-stat-val">{pending.length}</div><div className="acs-stat-label">Awaiting 2nd Card</div></div>
        </div>
        <div className="acs-stat-card">
          <div className="acs-stat-icon purple"><KeyRound size={20} /></div>
          <div><div className="acs-stat-val">{rules.length}</div><div className="acs-stat-label">Total Rules</div></div>
        </div>
        <div className="acs-stat-card">
          <div className="acs-stat-icon green"><Users size={20} /></div>
          <div><div className="acs-stat-val">{new Set(rules.map(r => r.device_id)).size}</div><div className="acs-stat-label">Devices Covered</div></div>
        </div>
      </div>

      {showForm && (
        <div className="acs-form-card">
          <h4><KeyRound size={14} /> New Dual-Auth Rule</h4>
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
            <label>Timeout (seconds)
              <input type="number" min={10} max={300} value={form.timeout_seconds}
                onChange={e => setForm(f => ({ ...f, timeout_seconds: e.target.value }))} />
            </label>
            <label style={{ gridColumn: '1/-1' }}>Description
              <input value={form.description} placeholder="e.g. Server room dual card"
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </label>
          </div>
          <div className="acs-form-actions">
            <button className="ghost-btn" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="save-btn" onClick={createRule} disabled={!form.device_id}>Create Rule</button>
          </div>
        </div>
      )}

      <div className="acs-filter-pills">
        <button className={tab === 'rules' ? 'active' : ''} onClick={() => setTab('rules')}>Rules ({rules.length})</button>
        <button className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>
          Pending {pending.length > 0 && <span className="acs-badge acs-badge-yellow" style={{ marginLeft: 4 }}>{pending.length}</span>}
        </button>
      </div>

      {tab === 'rules' && (
        rules.length === 0
          ? (
            <div className="acs-empty-pro">
              <KeyRound size={40} />
              <h3>No dual-auth rules</h3>
              <p>Add rules to require two card presentations on high-security doors.</p>
            </div>
          )
          : (
            <div className="acs-table-wrap">
              <table className="acs-table">
                <thead>
                  <tr><th>Device</th><th>Door</th><th>Timeout</th><th>Description</th><th>Status</th>{isAdmin && <th></th>}</tr>
                </thead>
                <tbody>
                  {rules.map(r => (
                    <tr key={r.id}>
                      <td><strong>{devName(r.device_id)}</strong></td>
                      <td>Door {r.door_no}</td>
                      <td style={{ color: 'var(--muted)', fontSize: 12 }}>{r.timeout_seconds}s</td>
                      <td style={{ color: 'var(--muted)', fontSize: 12 }}>{r.description || '—'}</td>
                      <td>
                        <span className={`acs-badge ${r.is_active ? 'acs-badge-green' : 'acs-badge-gray'}`}>
                          {r.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      {isAdmin && (
                        <td>
                          <button className="ghost-btn danger" style={{ height: 28, padding: '0 10px', fontSize: 12 }}
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

      {tab === 'pending' && (
        pending.length === 0
          ? (
            <div className="acs-empty-pro">
              <Clock size={40} />
              <h3>No pending sessions</h3>
              <p>Waiting for a first card swipe on a dual-auth door.</p>
            </div>
          )
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {pending.map(p => {
                const secs = secsLeft(p.expires_at);
                return (
                  <div key={p.id} className="acs-form-card" style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div className="acs-stat-icon yellow" style={{ width: 36, height: 36, borderRadius: 9 }}>
                          <Users size={16} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--text)' }}>
                            {p.person_name || p.card_number || 'Unknown'}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                            {devName(p.device_id)} · Door {p.door_no} · started {fmt(p.created_at)}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {secs !== null && (
                          <span className={`acs-badge ${secs > 10 ? 'acs-badge-yellow' : 'acs-badge-red'}`}>
                            <Clock size={10} /> {secs}s
                          </span>
                        )}
                        {isAdmin && (
                          <>
                            <input
                              value={secondCards[p.id] || ''}
                              onChange={event => setSecondCards(values => ({ ...values, [p.id]: event.target.value }))}
                              placeholder="Second card number"
                              style={{ height: 30, width: 170 }}
                            />
                            <button className="save-btn" style={{ height: 30, padding: '0 14px', fontSize: 12 }}
                              onClick={() => confirm2nd(p.id)}>
                              <CheckCircle size={12} /> Unlock
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
      )}
    </div>
  );
}
