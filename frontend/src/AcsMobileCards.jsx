import { apiFetch } from './apiClient';
import React, { useState, useEffect, useCallback } from 'react';
import { Smartphone, Plus, RefreshCw, QrCode, XCircle, CheckCircle, Clock } from 'lucide-react';
import { API } from './apiConfig';

const H = tok => ({ Authorization: `Bearer ${tok}` });

const STATUS_BADGE = {
  active:  'acs-badge-green',
  revoked: 'acs-badge-red',
  expired: 'acs-badge-gray',
};

export default function AcsMobileCards({ token, isAdmin }) {
  const [cards, setCards]       = useState([]);
  const [persons, setPersons]   = useState([]);
  const [devices, setDevices]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [statusFilter, setStatusFilter] = useState('active');
  const [form, setForm]         = useState({
    person_id: '', device_id: '',
    valid_from: new Date().toISOString().slice(0, 10),
    valid_to: '', notes: '',
  });
  const [showForm, setShowForm] = useState(false);
  const [qrModal, setQrModal]   = useState(null);
  const [qrUrl, setQrUrl]       = useState('');
  const [saving, setSaving]     = useState(false);
  const [allCards, setAllCards] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, aRes, pRes, dRes] = await Promise.all([
        apiFetch(`${API}/api/acs/mobile-cards?status=${statusFilter}&limit=200`, { headers: H(token) }),
        apiFetch(`${API}/api/acs/mobile-cards?limit=1000`, { headers: H(token) }),
        apiFetch(`${API}/api/acs/person-management/persons?limit=500`, { headers: H(token) }),
        apiFetch(`${API}/api/acs`, { headers: H(token) }),
      ]);
      if (cRes.ok) setCards(await cRes.json());
      if (aRes.ok) setAllCards(await aRes.json());
      if (pRes.ok) setPersons(await pRes.json());
      if (dRes.ok) setDevices(await dRes.json());
    } finally { setLoading(false); }
  }, [token, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const issue = async () => {
    setSaving(true);
    try {
      const res = await apiFetch(`${API}/api/acs/mobile-cards`, {
        method: 'POST',
        headers: { ...H(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          person_id: Number(form.person_id),
          device_id: form.device_id ? Number(form.device_id) : null,
          valid_from: form.valid_from ? new Date(form.valid_from).toISOString() : undefined,
          valid_to:   form.valid_to   ? new Date(form.valid_to).toISOString()   : undefined,
        }),
      });
      if (res.ok) { setShowForm(false); load(); }
    } finally { setSaving(false); }
  };

  const revoke = async (id) => {
    if (!confirm('Revoke this mobile card?')) return;
    await apiFetch(`${API}/api/acs/mobile-cards/${id}/revoke`, { method: 'POST', headers: H(token) });
    load();
  };

  const openQr = (cardId) => {
    setQrModal(cardId);
    setQrUrl(`${API}/api/acs/mobile-cards/${cardId}/qr`);
  };

  const fmt = v => v ? new Date(v).toLocaleDateString('en-CA', { timeZone: 'Asia/Yerevan' }) : '—';
  const fmtFull = v => v ? new Date(v).toLocaleString('en-US', { timeZone: 'Asia/Yerevan', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : '—';

  return (
    <div className="acs-panel">
      <div className="acs-panel-header">
        <div className="acs-panel-title"><Smartphone size={18} /> Mobile Cards</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isAdmin && <button className="save-btn" onClick={() => setShowForm(true)}><Plus size={13} /> Issue Card</button>}
          <button className="ghost-btn" onClick={load} disabled={loading}><RefreshCw size={13} className={loading ? 'spin' : ''} /></button>
        </div>
      </div>

      <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
        Issue virtual access cards delivered as QR codes to employees' smartphones.
        Each card has a unique token that can be validated at the door.
      </p>

      {qrModal && (
        <div className="pm-dialog-overlay" onMouseDown={e => e.target === e.currentTarget && setQrModal(null)}>
          <div className="pm-dialog">
            <div className="pm-dialog-header"><strong>Mobile Card QR Code</strong></div>
            <div className="pm-dialog-body" style={{ textAlign: 'center', padding: 24 }}>
              <img src={qrUrl} alt="QR Code"
                style={{ width: 200, height: 200, border: '1px solid var(--border)', borderRadius: 10 }}
                onError={e => { e.target.style.display = 'none'; }} />
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>
                Scan to verify or share with the employee
              </div>
            </div>
            <div className="pm-dialog-footer">
              <button className="ghost-btn" onClick={() => setQrModal(null)}>Close</button>
              <a className="save-btn" href={qrUrl} download={`card_${qrModal}.png`}
                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                Download
              </a>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="acs-form-card">
          <h4><Smartphone size={14} /> Issue Mobile Card</h4>
          <div className="acs-form-grid">
            <label>Person
              <select value={form.person_id} onChange={e => setForm(f => ({ ...f, person_id: e.target.value }))}>
                <option value="">—</option>
                {persons.map(p => <option key={p.id} value={p.id}>{p.full_name} {p.employee_no ? `(${p.employee_no})` : ''}</option>)}
              </select>
            </label>
            <label>Device (optional)
              <select value={form.device_id} onChange={e => setForm(f => ({ ...f, device_id: e.target.value }))}>
                <option value="">— all devices —</option>
                {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            <label>Valid From<input type="date" value={form.valid_from} onChange={e => setForm(f => ({ ...f, valid_from: e.target.value }))} /></label>
            <label>Valid To<input type="date" value={form.valid_to} onChange={e => setForm(f => ({ ...f, valid_to: e.target.value }))} /></label>
            <label style={{ gridColumn: '1/-1' }}>Notes<input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></label>
          </div>
          <div className="acs-form-actions">
            <button className="ghost-btn" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="save-btn" onClick={issue} disabled={!form.person_id || saving}>
              {saving ? 'Issuing…' : 'Issue Card'}
            </button>
          </div>
        </div>
      )}

      <div className="acs-dash-stats">
        <div className="acs-stat-card">
          <div className="acs-stat-icon green"><CheckCircle size={20} /></div>
          <div><div className="acs-stat-val">{allCards.filter(c => c.status === 'active').length}</div><div className="acs-stat-label">Active</div></div>
        </div>
        <div className="acs-stat-card">
          <div className="acs-stat-icon red"><XCircle size={20} /></div>
          <div><div className="acs-stat-val">{allCards.filter(c => c.status === 'revoked').length}</div><div className="acs-stat-label">Revoked</div></div>
        </div>
        <div className="acs-stat-card">
          <div className="acs-stat-icon gray"><Clock size={20} /></div>
          <div><div className="acs-stat-val">{allCards.filter(c => c.status === 'expired').length}</div><div className="acs-stat-label">Expired</div></div>
        </div>
        <div className="acs-stat-card">
          <div className="acs-stat-icon blue"><Smartphone size={20} /></div>
          <div><div className="acs-stat-val">{allCards.length}</div><div className="acs-stat-label">Total Issued</div></div>
        </div>
      </div>

      <div className="acs-filter-pills">
        {['active', 'revoked', 'expired'].map(s => (
          <button key={s} className={statusFilter === s ? 'active' : ''} onClick={() => setStatusFilter(s)}
            style={{ textTransform: 'capitalize' }}>{s}</button>
        ))}
      </div>

      {cards.length === 0
        ? (
          <div className="acs-empty-pro">
            <Smartphone size={40} />
            <h3>No {statusFilter} mobile cards</h3>
            <p>Issue a mobile card to allow QR-based door access from a smartphone.</p>
          </div>
        )
        : (
          <div className="acs-table-wrap">
            <table className="acs-table">
              <thead>
                <tr><th>Person</th><th>Device</th><th>Valid From</th><th>Valid To</th><th>Last Used</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {cards.map(c => (
                  <tr key={c.id}>
                    <td><strong>{c.person_name || `#${c.person_id}`}</strong></td>
                    <td>{c.device_name || <span style={{ color: 'var(--muted)' }}>All</span>}</td>
                    <td className="acs-td-time">{fmt(c.valid_from)}</td>
                    <td className="acs-td-time">{fmt(c.valid_to)}</td>
                    <td className="acs-td-time">{fmtFull(c.last_used_at)}</td>
                    <td>
                      <span className={`acs-badge ${STATUS_BADGE[c.status] || 'acs-badge-gray'}`} style={{ textTransform: 'capitalize' }}>
                        {c.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {c.status === 'active' && (
                          <button className="ghost-btn" title="Show QR" onClick={() => openQr(c.id)} style={{ height: 28, padding: '0 8px' }}>
                            <QrCode size={13} />
                          </button>
                        )}
                        {c.status === 'active' && isAdmin && (
                          <button className="ghost-btn danger" title="Revoke" onClick={() => revoke(c.id)} style={{ height: 28, padding: '0 8px' }}>
                            <XCircle size={13} />
                          </button>
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
