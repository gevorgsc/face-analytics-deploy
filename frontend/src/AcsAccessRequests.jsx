import { apiFetch } from './apiClient';
import React, { useState, useEffect, useCallback } from 'react';
import { ClipboardList, Plus, CheckCircle, XCircle, RefreshCw, Clock } from 'lucide-react';
import { API } from './apiConfig';

const H = tok => ({ Authorization: `Bearer ${tok}` });

const STATUS_BADGE = {
  pending:  'acs-badge-yellow',
  approved: 'acs-badge-green',
  rejected: 'acs-badge-red',
};

export default function AcsAccessRequests({ token, isAdmin }) {
  const [requests, setRequests]   = useState([]);
  const [levels, setLevels]       = useState([]);
  const [persons, setPersons]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [form, setForm]           = useState({ person_id: '', access_level_id: '', reason: '', valid_from: '', valid_to: '' });
  const [showForm, setShowForm]   = useState(false);
  const [reviewNotes, setReviewNotes] = useState({});
  const [saving, setSaving]       = useState(false);
  const [allRequests, setAllRequests] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rRes, aRes, lRes, pRes] = await Promise.all([
        apiFetch(`${API}/api/acs/access-requests?status=${statusFilter}&limit=200`, { headers: H(token) }),
        apiFetch(`${API}/api/acs/access-requests?limit=1000`, { headers: H(token) }),
        apiFetch(`${API}/api/acs/levels`, { headers: H(token) }),
        apiFetch(`${API}/api/acs/person-management/persons?limit=500`, { headers: H(token) }),
      ]);
      if (rRes.ok) setRequests(await rRes.json());
      if (aRes.ok) setAllRequests(await aRes.json());
      if (lRes.ok) setLevels(await lRes.json());
      if (pRes.ok) setPersons(await pRes.json());
    } finally { setLoading(false); }
  }, [token, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const createRequest = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`${API}/api/acs/access-requests`, {
        method: 'POST',
        headers: { ...H(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, person_id: Number(form.person_id), access_level_id: form.access_level_id ? Number(form.access_level_id) : null }),
      });
      if (res.ok) { setShowForm(false); load(); }
    } finally { setSaving(false); }
  };

  const approve = async (id) => {
    await apiFetch(`${API}/api/acs/access-requests/${id}/approve`, {
      method: 'POST',
      headers: { ...H(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: reviewNotes[id] || '' }),
    });
    load();
  };

  const reject = async (id) => {
    await apiFetch(`${API}/api/acs/access-requests/${id}/reject`, {
      method: 'POST',
      headers: { ...H(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: reviewNotes[id] || '' }),
    });
    load();
  };

  const fmt = v => v ? new Date(v).toLocaleDateString('en-CA', { timeZone: 'Asia/Yerevan' }) : '—';
  const fmtFull = v => v ? new Date(v).toLocaleString('en-US', { timeZone: 'Asia/Yerevan', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';

  const StatusIcon = ({ status }) => {
    if (status === 'approved') return <CheckCircle size={14} style={{ color: 'var(--success, #16a34a)' }} />;
    if (status === 'rejected') return <XCircle size={14} style={{ color: 'var(--danger, #ef4444)' }} />;
    return <Clock size={14} style={{ color: '#f59e0b' }} />;
  };

  return (
    <div className="acs-panel">
      <div className="acs-panel-header">
        <div className="acs-panel-title"><ClipboardList size={18} /> Access Requests</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="save-btn" onClick={() => setShowForm(true)}><Plus size={13} /> New Request</button>
          <button className="ghost-btn" onClick={load} disabled={loading}><RefreshCw size={13} className={loading ? 'spin' : ''} /></button>
        </div>
      </div>

      {showForm && (
        <div className="acs-form-card">
          <h4><ClipboardList size={14} /> New Access Request</h4>
          <div className="acs-form-grid">
            <label>Person
              <select value={form.person_id} onChange={e => setForm(f => ({ ...f, person_id: e.target.value }))}>
                <option value="">— select person —</option>
                {persons.map(p => <option key={p.id} value={p.id}>{p.full_name} {p.employee_no ? `(${p.employee_no})` : ''}</option>)}
              </select>
            </label>
            <label>Access Level
              <select value={form.access_level_id} onChange={e => setForm(f => ({ ...f, access_level_id: e.target.value }))}>
                <option value="">— select level —</option>
                {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <label>Valid From<input type="date" value={form.valid_from} onChange={e => setForm(f => ({ ...f, valid_from: e.target.value }))} /></label>
            <label>Valid To<input type="date" value={form.valid_to} onChange={e => setForm(f => ({ ...f, valid_to: e.target.value }))} /></label>
            <label style={{ gridColumn: '1/-1' }}>Reason
              <textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} rows={2} />
            </label>
          </div>
          <div className="acs-form-actions">
            <button className="ghost-btn" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="save-btn" onClick={createRequest} disabled={saving}>{saving ? 'Submitting…' : 'Submit Request'}</button>
          </div>
        </div>
      )}

      <div className="acs-dash-stats">
        <div className="acs-stat-card">
          <div className="acs-stat-icon yellow"><Clock size={20} /></div>
          <div><div className="acs-stat-val">{allRequests.filter(r => r.status === 'pending').length}</div><div className="acs-stat-label">Pending</div></div>
        </div>
        <div className="acs-stat-card">
          <div className="acs-stat-icon green"><CheckCircle size={20} /></div>
          <div><div className="acs-stat-val">{allRequests.filter(r => r.status === 'approved').length}</div><div className="acs-stat-label">Approved</div></div>
        </div>
        <div className="acs-stat-card">
          <div className="acs-stat-icon red"><XCircle size={20} /></div>
          <div><div className="acs-stat-val">{allRequests.filter(r => r.status === 'rejected').length}</div><div className="acs-stat-label">Rejected</div></div>
        </div>
        <div className="acs-stat-card">
          <div className="acs-stat-icon blue"><ClipboardList size={20} /></div>
          <div><div className="acs-stat-val">{allRequests.length}</div><div className="acs-stat-label">Total</div></div>
        </div>
      </div>

      <div className="acs-filter-pills">
        {['pending', 'approved', 'rejected'].map(s => (
          <button key={s} className={statusFilter === s ? 'active' : ''} onClick={() => setStatusFilter(s)}
            style={{ textTransform: 'capitalize' }}>{s}</button>
        ))}
      </div>

      {requests.length === 0
        ? (
          <div className="acs-empty-pro">
            <ClipboardList size={40} />
            <h3>No {statusFilter} requests</h3>
            <p>Access requests submitted by operators will appear here.</p>
          </div>
        )
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {requests.map(r => (
              <div key={r.id} className="acs-form-card" style={{ padding: '14px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <StatusIcon status={r.status} />
                      <strong style={{ fontSize: 14 }}>{r.person_name || `Person #${r.person_id}`}</strong>
                      <span className={`acs-badge ${STATUS_BADGE[r.status] || 'acs-badge-gray'}`} style={{ textTransform: 'capitalize' }}>{r.status}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      Level: <strong>{r.access_level_name || '—'}</strong> ·
                      Valid: {fmt(r.valid_from)} → {fmt(r.valid_to)} ·
                      Submitted: {fmtFull(r.created_at)}
                    </div>
                    {r.reason && <div style={{ fontSize: 12, marginTop: 4 }}>Reason: {r.reason}</div>}
                    {r.reviewer_note && (
                      <div style={{ fontSize: 12, marginTop: 4, color: 'var(--muted)' }}>Review note: {r.reviewer_note}</div>
                    )}
                  </div>

                  {r.status === 'pending' && isAdmin && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
                      <input
                        placeholder="Note (optional)"
                        value={reviewNotes[r.id] || ''}
                        onChange={e => setReviewNotes(n => ({ ...n, [r.id]: e.target.value }))}
                        style={{ fontSize: 12, width: 180 }}
                      />
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="save-btn" style={{ height: 28, padding: '0 12px', fontSize: 12 }} onClick={() => approve(r.id)}>
                          <CheckCircle size={11} /> Approve
                        </button>
                        <button className="ghost-btn danger" style={{ height: 28, padding: '0 12px', fontSize: 12 }} onClick={() => reject(r.id)}>
                          <XCircle size={11} /> Reject
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
