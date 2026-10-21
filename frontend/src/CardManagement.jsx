import { apiFetch } from './apiClient';
// CardManagement.jsx — Person-centric card management (HikCentral style)

import React, { useCallback, useEffect, useState } from 'react';
import {
  CreditCard, Plus, Trash2, RefreshCw, Search, Server,
  X, CheckCircle, ChevronDown, ChevronUp, User,
} from 'lucide-react';
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
            {danger ? 'Revoke' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}

const CARD_TYPE_LABELS = {
  normal: 'Normal', disabled: 'Disabled',
  stress: 'Stress', super: 'Super', visitor: 'Visitor',
};
const STATUS_STYLE = {
  active:  { bg: '#d1fae5', color: '#065f46' },
  revoked: { bg: '#fee2e2', color: '#991b1b' },
  expired: { bg: '#f1f5f9', color: '#64748b' },
  error:   { bg: '#fef3c7', color: '#92400e' },
};

function fmtDate(v) {
  if (!v) return '—';
  return new Date(v).toLocaleDateString('en-CA');
}

// ── Issue card modal ──────────────────────────────────────────────────────────

function IssueCardModal({ person, devices, token, onClose, onSaved }) {
  const [form, setForm] = useState({
    device_id: devices[0]?.id || '',
    card_number: person.card_number || '',
    card_type: 'normal',
    valid_from: '',
    valid_to: '',
    note: '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true); setError('');
    try {
      const res = await apiFetch(`${API}/api/acs/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          person_id:  person.id,
          device_id:  parseInt(form.device_id),
          card_number: form.card_number.trim(),
          card_type:  form.card_type,
          valid_from: form.valid_from || undefined,
          valid_to:   form.valid_to   || undefined,
          note:       form.note,
        }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.detail || 'Failed'); return; }
      onSaved();
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',
                  alignItems:'center',justifyContent:'center',zIndex:9999 }} onClick={onClose}>
      <div style={{ background:'var(--card)',borderRadius:16,padding:24,minWidth:340,maxWidth:420 }}
           onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight:700,fontSize:15,marginBottom:4,display:'flex',alignItems:'center',justifyContent:'space-between' }}>
          Issue Card — {person.full_name}
          <button onClick={onClose} style={{ background:'none',border:'none',cursor:'pointer' }}><X size={16}/></button>
        </div>
        <div style={{ fontSize:12,color:'var(--muted)',marginBottom:16 }}>
          {person.department || person.person_type}
        </div>
        {error && <div style={{ background:'#fee2e2',color:'#991b1b',borderRadius:8,
                                padding:'8px 12px',fontSize:12,marginBottom:12 }}>{error}</div>}
        <div style={{ display:'flex',flexDirection:'column',gap:11 }}>
          {[
            ['ACS Device *', 'device_id', 'select-device'],
            ['Card Number *','card_number','text'],
            ['Card Type',    'card_type',  'select-type'],
            ['Valid From',   'valid_from', 'date'],
            ['Valid To',     'valid_to',   'date'],
            ['Note',         'note',       'text'],
          ].map(([l,k,t]) => (
            <label key={k} style={{ fontSize:12,fontWeight:500,color:'var(--text-soft)',display:'flex',flexDirection:'column',gap:4 }}>
              {l}
              {t === 'select-device' ? (
                <select value={form[k]} onChange={e=>set(k,e.target.value)} style={INPUT_S}>
                  {devices.filter(d=>d.is_active).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              ) : t === 'select-type' ? (
                <select value={form[k]} onChange={e=>set(k,e.target.value)} style={INPUT_S}>
                  {Object.entries(CARD_TYPE_LABELS).map(([v,l])=><option key={v} value={v}>{l}</option>)}
                </select>
              ) : (
                <input type={t==='date'?'date':'text'} value={form[k]}
                       onChange={e=>set(k,e.target.value)} style={INPUT_S} />
              )}
            </label>
          ))}
        </div>
        <div style={{ display:'flex',justifyContent:'flex-end',gap:10,marginTop:18 }}>
          <button onClick={onClose} disabled={saving} className="ghost-btn">Cancel</button>
          <button onClick={save}    disabled={saving} className="save-btn">
            {saving ? 'Issuing…' : 'Issue & Push to Device'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Person card ───────────────────────────────────────────────────────────────

function PersonCard({ person, cards, devices, token, isAdmin, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  const [showIssue, setShowIssue] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null);
  const activeCards = cards.filter(c => c.status === 'active');

  const showConfirm = (message, danger = false) => new Promise(resolve =>
    setConfirmModal({ message, danger, resolve }));

  const revoke = async (cardId, cardNo) => {
    const ok = await showConfirm(`Revoke card ${cardNo}?`, true);
    if (!ok) return;
    await apiFetch(`${API}/api/acs/cards/${cardId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    });
    onRefresh();
  };

  const bulkRevoke = async () => {
    const ok = await showConfirm(`Revoke ALL ${activeCards.length} active card(s) for ${person.full_name}?`, true);
    if (!ok) return;
    const res = await apiFetch(`${API}/api/acs/cards/bulk-revoke/${person.id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    });
    const d = await res.json();
    if (res.ok && d.revoked) await showConfirm(`Revoked ${d.revoked} card(s).${d.errors?.length ? ' Errors: '+d.errors.join(', ') : ''}`);
    onRefresh();
  };

  return (
    <div style={{ background:'var(--card)',border:'1px solid var(--border)',borderRadius:12,
                  overflow:'hidden',display:'flex',flexDirection:'column' }}>
      {/* Person header */}
      <div style={{ padding:'16px',display:'flex',gap:12,alignItems:'flex-start' }}>
        <div style={{ width:52,height:52,borderRadius:'50%',overflow:'hidden',flexShrink:0,
                      background:'var(--bg)',border:'2px solid var(--border)',
                      display:'flex',alignItems:'center',justifyContent:'center' }}>
          {person.preview_image
            ? <img src={person.preview_image} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }} />
            : <User size={22} style={{ color:'var(--muted)' }} />}
        </div>
        <div style={{ flex:1,minWidth:0 }}>
          <div style={{ fontWeight:700,fontSize:14,color:'var(--text)',
                        overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>
            {person.full_name}
          </div>
          <div style={{ fontSize:11,color:'var(--muted)',marginTop:2 }}>
            {person.department || person.person_type}
          </div>
          {person.card_number && (
            <div style={{ fontSize:11,fontFamily:'monospace',color:'var(--muted)',marginTop:3 }}>
              🪪 {person.card_number}
            </div>
          )}
        </div>
        <div style={{ display:'flex',flexDirection:'column',alignItems:'flex-end',gap:5,flexShrink:0 }}>
          <span style={{ fontSize:11,fontWeight:600,padding:'2px 8px',borderRadius:10,
                         background: activeCards.length > 0 ? '#d1fae5' : '#f1f5f9',
                         color: activeCards.length > 0 ? '#065f46' : '#64748b' }}>
            {activeCards.length} card{activeCards.length !== 1 ? 's' : ''}
          </span>
          {isAdmin && (
            <button onClick={() => setShowIssue(true)}
                    style={{ display:'flex',alignItems:'center',gap:4,padding:'4px 10px',
                             borderRadius:7,border:'1px solid var(--primary)',background:'transparent',
                             color:'var(--primary)',fontSize:11,fontWeight:600,cursor:'pointer' }}>
              <Plus size={11}/> Issue Card
            </button>
          )}
          {isAdmin && activeCards.length > 1 && (
            <button onClick={bulkRevoke}
                    style={{ display:'flex',alignItems:'center',gap:4,padding:'4px 10px',
                             borderRadius:7,border:'1px solid #fca5a5',background:'#fef2f2',
                             color:'#dc2626',fontSize:11,fontWeight:600,cursor:'pointer' }}>
              <Trash2 size={11}/> Revoke All
            </button>
          )}
        </div>
      </div>

      {/* Cards list */}
      {cards.length > 0 && (
        <div style={{ borderTop:'1px solid var(--border-soft)' }}>
          <button onClick={() => setExpanded(v=>!v)}
                  style={{ width:'100%',padding:'8px 16px',background:'none',border:'none',
                           display:'flex',alignItems:'center',justifyContent:'space-between',
                           fontSize:11,color:'var(--muted)',cursor:'pointer' }}>
            <span><CreditCard size={11} style={{ marginRight:4 }}/>{cards.length} card record{cards.length!==1?'s':''}</span>
            {expanded ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
          </button>

          {expanded && (
            <div style={{ padding:'0 12px 12px' }}>
              {cards.map(c => {
                const st = STATUS_STYLE[c.status] || STATUS_STYLE.active;
                return (
                  <div key={c.id} style={{ display:'flex',alignItems:'center',gap:8,
                                           padding:'8px 10px',background:'var(--bg)',
                                           borderRadius:8,marginBottom:5 }}>
                    <div style={{ flex:1,minWidth:0 }}>
                      <div style={{ display:'flex',alignItems:'center',gap:6,marginBottom:2 }}>
                        <code style={{ fontSize:12,fontWeight:600 }}>{c.card_number}</code>
                        <span style={{ ...st,borderRadius:5,padding:'1px 6px',fontSize:10,fontWeight:700 }}>
                          {c.status}
                        </span>
                        <span style={{ fontSize:10,color:'var(--muted)' }}>
                          {CARD_TYPE_LABELS[c.card_type]||c.card_type}
                        </span>
                      </div>
                      <div style={{ fontSize:10,color:'var(--muted)' }}>
                        <Server size={9} style={{ marginRight:3 }}/>{c.device_name}
                        {c.valid_to && ` · expires ${fmtDate(c.valid_to)}`}
                      </div>
                    </div>
                    {isAdmin && c.status === 'active' && (
                      <button onClick={() => revoke(c.id, c.card_number)}
                              style={{ padding:'3px 7px',borderRadius:6,border:'1px solid var(--danger)',
                                       background:'transparent',color:'var(--danger)',cursor:'pointer',
                                       display:'flex',alignItems:'center',gap:3,fontSize:11 }}>
                        <Trash2 size={10}/> Revoke
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showIssue && (
        <IssueCardModal person={person} devices={devices} token={token}
                        onClose={() => setShowIssue(false)} onSaved={onRefresh} />
      )}

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

// ── Main panel ────────────────────────────────────────────────────────────────

export default function CardManagement({ token, isAdmin }) {
  const [cards,   setCards]   = useState([]);
  const [devices, setDevices] = useState([]);
  const [persons, setPersons] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search,  setSearch]  = useState('');
  const [typeF,   setTypeF]   = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, dRes, pRes] = await Promise.all([
        apiFetch(`${API}/api/acs/cards`,  { headers: { Authorization: `Bearer ${token}` } }),
        apiFetch(`${API}/api/acs`,        { headers: { Authorization: `Bearer ${token}` } }),
        apiFetch(`${API}/api/persons`,    { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (cRes.ok) setCards(await cRes.json());
      if (dRes.ok) setDevices(await dRes.json());
      if (pRes.ok) setPersons(await pRes.json());
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  // Group cards by person_id
  const cardsByPerson = {};
  cards.forEach(c => {
    if (!cardsByPerson[c.person_id]) cardsByPerson[c.person_id] = [];
    cardsByPerson[c.person_id].push(c);
  });

  const filtered = persons.filter(p => {
    if (typeF !== 'all' && p.person_type !== typeF) return false;
    if (search && !p.full_name?.toLowerCase().includes(search.toLowerCase()) &&
                  !p.department?.toLowerCase().includes(search.toLowerCase()) &&
                  !p.card_number?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalCards   = cards.filter(c => c.status === 'active').length;
  const withCards    = new Set(cards.filter(c=>c.status==='active').map(c=>c.person_id)).size;
  const withoutCards = persons.filter(p => !cardsByPerson[p.id]?.some(c=>c.status==='active')).length;

  return (
    <div style={{ padding:24,display:'flex',flexDirection:'column',gap:18 }}>
      {/* Header */}
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}>
        <div style={{ display:'flex',alignItems:'center',gap:10,fontSize:18,fontWeight:700,color:'var(--text)' }}>
          <CreditCard size={20}/> Card Management
        </div>
        <button onClick={load} disabled={loading} className="ghost-btn">
          <RefreshCw size={13} className={loading?'spin':''}/> Refresh
        </button>
      </div>

      {/* Summary */}
      <div style={{ display:'flex',gap:10 }}>
        {[
          ['Active Cards', totalCards, '#dbeafe', '#1d4ed8'],
          ['With Card', withCards, '#d1fae5', '#065f46'],
          ['No Card', withoutCards, '#fef3c7', '#92400e'],
        ].map(([l,v,bg,color])=>(
          <div key={l} style={{ background:bg,color,borderRadius:10,padding:'10px 18px',fontSize:13,fontWeight:700 }}>
            <span style={{ fontSize:20,fontWeight:800 }}>{v}</span>
            <div style={{ fontSize:11,fontWeight:500,marginTop:2 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:'flex',gap:10,flexWrap:'wrap',alignItems:'center' }}>
        <div style={{ position:'relative' }}>
          <Search size={14} style={{ position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--muted)' }}/>
          <input value={search} onChange={e=>setSearch(e.target.value)}
                 placeholder="Search by name, dept, card…"
                 style={{ ...INPUT_S, paddingLeft:30,width:240 }}/>
        </div>
        <div style={{ display:'flex',gap:6 }}>
          {['all','employee','vip','blacklist'].map(t=>(
            <button key={t} onClick={()=>setTypeF(t)}
                    style={{ padding:'5px 12px',borderRadius:20,fontSize:11,fontWeight:600,
                             border: typeF===t?'none':'1px solid var(--border)',
                             background: typeF===t?'var(--primary)':'transparent',
                             color: typeF===t?'#fff':'var(--muted)',cursor:'pointer' }}>
              {t==='all'?'All':t.charAt(0).toUpperCase()+t.slice(1)}
            </button>
          ))}
        </div>
        <span style={{ fontSize:12,color:'var(--muted)',marginLeft:'auto' }}>{filtered.length} persons</span>
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ textAlign:'center',padding:60,color:'var(--muted)' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:'center',padding:60,color:'var(--muted)' }}>No persons found.</div>
      ) : (
        <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:12 }}>
          {filtered.map(p => (
            <PersonCard
              key={p.id}
              person={p}
              cards={cardsByPerson[p.id] || []}
              devices={devices}
              token={token}
              isAdmin={isAdmin}
              onRefresh={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const INPUT_S = { padding:'8px 10px',borderRadius:7,border:'1px solid var(--border)',fontSize:13,
  background:'var(--bg)',color:'var(--text)' };
