import { apiFetch } from './apiClient';
// VisitorManagement.jsx — Temporary visitor access with QR codes

import React, { useCallback, useEffect, useState } from 'react';
import { UserPlus, QrCode, CheckCircle, XCircle, RefreshCw, Trash2, Plus, X, Download, ShieldAlert } from 'lucide-react';
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

const STATUS_META = {
  reserved:  { bg:'#e0e7ff', color:'#3730a3', label:'Reserved'  },
  pending:   { bg:'#fef3c7', color:'#92400e', label:'Pending'   },
  active:    { bg:'#d1fae5', color:'#065f46', label:'Active'    },
  completed: { bg:'#dbeafe', color:'#1e40af', label:'Completed' },
  cancelled: { bg:'#f1f5f9', color:'#64748b', label:'Cancelled' },
  expired:   { bg:'#fee2e2', color:'#991b1b', label:'Expired'   },
};

function fmtDt(v) {
  if (!v) return '—';
  return new Date(v).toLocaleString('en-US', { timeZone:'Asia/Yerevan',
    year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false });
}

function QrModal({ visitor, token, onClose }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    apiFetch(`${API}/api/acs/visitors/${visitor.id}/qr`, { headers:{ Authorization:`Bearer ${token}` }})
      .then(r => r.blob()).then(b => setSrc(URL.createObjectURL(b))).catch(()=>{});
    return () => { if (src) URL.revokeObjectURL(src); };
  }, [visitor.id]);
  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',
                  alignItems:'center',justifyContent:'center',zIndex:9999 }} onClick={onClose}>
      <div style={{ background:'var(--card)',borderRadius:16,padding:28,textAlign:'center',minWidth:280 }}
           onClick={e=>e.stopPropagation()}>
        <div style={{ fontWeight:700,fontSize:15,marginBottom:4 }}>{visitor.full_name}</div>
        <div style={{ fontSize:12,color:'var(--muted)',marginBottom:16 }}>
          Valid: {fmtDt(visitor.valid_from)} — {fmtDt(visitor.valid_to)}
        </div>
        {src ? <img src={src} style={{ width:200,height:200 }} alt="QR" />
             : <div style={{ width:200,height:200,background:'#f1f5f9',borderRadius:8,
                             display:'flex',alignItems:'center',justifyContent:'center',
                             color:'var(--muted)',fontSize:12 }}>Loading…</div>}
        <div style={{ marginTop:12,display:'flex',gap:10,justifyContent:'center',flexWrap:'wrap' }}>
          {src && <a href={src} download={`visitor_${visitor.id}_qr.png`}
                     style={{ display:'inline-flex',alignItems:'center',gap:5,padding:'6px 14px',
                              borderRadius:7,background:'var(--primary)',color:'#fff',
                              fontSize:12,fontWeight:600,textDecoration:'none' }}>
                    <Download size={13}/> Save QR
                  </a>}
          {src && (
            <button onClick={() => {
              const w = window.open('', '_blank');
              w.document.write(`
                <html><head><title>Visitor Badge — ${visitor.full_name}</title>
                <style>
                  body{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8fafc;}
                  .badge{border:2px solid #1d4ed8;border-radius:16px;padding:32px 40px;text-align:center;max-width:320px;background:#fff;box-shadow:0 4px 24px rgba(0,0,0,.1);}
                  .badge h2{margin:0 0 4px;font-size:22px;color:#1d4ed8;}
                  .badge .name{font-size:20px;font-weight:800;margin:12px 0 4px;}
                  .badge .sub{font-size:13px;color:#64748b;margin:2px 0;}
                  .badge img{width:180px;height:180px;margin:16px 0;}
                  .badge .valid{font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:10px;margin-top:8px;}
                  @media print{body{background:#fff;}.badge{border:2px solid #1d4ed8;box-shadow:none;}}
                </style></head><body>
                <div class="badge">
                  <h2>VISITOR PASS</h2>
                  <div class="name">${visitor.full_name}</div>
                  <div class="sub">${visitor.company || ''}</div>
                  <div class="sub">Host: ${visitor.host_name || '—'}</div>
                  <img src="${src}" alt="QR Code"/>
                  <div class="valid">
                    Valid: ${new Date(visitor.valid_from).toLocaleString()} —<br/>
                    ${new Date(visitor.valid_to).toLocaleString()}
                  </div>
                </div>
                <script>window.onload=()=>{window.print();}</script>
                </body></html>
              `);
              w.document.close();
            }}
            style={{ display:'inline-flex',alignItems:'center',gap:5,padding:'6px 14px',
                     borderRadius:7,background:'#f0fdf4',color:'#15803d',border:'1px solid #bbf7d0',
                     fontSize:12,fontWeight:600,cursor:'pointer' }}>
              🖨️ Print Badge
            </button>
          )}
          <button onClick={onClose} style={{ padding:'6px 14px',borderRadius:7,
                  border:'1px solid var(--border)',background:'transparent',fontSize:12,cursor:'pointer' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

const EMPTY = { full_name:'', phone:'', company:'', host_person_id:'', visit_reason:'',
                id_type:'passport', id_number:'', visitor_group:'General',
                access_level_id:'', card_number:'', device_id:'', valid_from:'',
                valid_to:'', note:'', consent_accepted:true };

export default function VisitorManagement({ token, isAdmin }) {
  const [visitors, setVisitors] = useState([]);
  const [devices,  setDevices]  = useState([]);
  const [reference, setReference] = useState({ hosts:[], access_levels:[], groups:[] });
  const [dashboard, setDashboard] = useState({});
  const [watchList, setWatchList] = useState([]);
  const [hikcentral, setHikcentral] = useState({ configured:false });
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState('reservations');
  const [watchForm, setWatchForm] = useState({ full_name:'', organization:'', id_number:'', watch_type:'important', reason:'' });
  const [loading,  setLoading]  = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState(EMPTY);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [qrFor,    setQrFor]    = useState(null);
  const [statusF,  setStatusF]  = useState('all');
  const [confirmModal, setConfirmModal] = useState(null);

  const showConfirm = (message, danger = false) => new Promise(resolve =>
    setConfirmModal({ message, danger, resolve }));

  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [vRes, dRes, rRes, sRes, wRes, hRes] = await Promise.all([
        apiFetch(`${API}/api/acs/visitors`, { headers:{ Authorization:`Bearer ${token}` } }),
        apiFetch(`${API}/api/acs`,          { headers:{ Authorization:`Bearer ${token}` } }),
        apiFetch(`${API}/api/acs/visitors/reference-data`, { headers:{ Authorization:`Bearer ${token}` } }),
        apiFetch(`${API}/api/acs/visitors/dashboard`, { headers:{ Authorization:`Bearer ${token}` } }),
        apiFetch(`${API}/api/acs/visitors/watch-list`, { headers:{ Authorization:`Bearer ${token}` } }),
        apiFetch(`${API}/api/integrations/hikcentral/status`, { headers:{ Authorization:`Bearer ${token}` } }),
      ]);
      if (vRes.ok) setVisitors(await vRes.json());
      if (dRes.ok) setDevices(await dRes.json());
      if (rRes.ok) setReference(await rRes.json());
      if (sRes.ok) setDashboard(await sRes.json());
      if (wRes.ok) setWatchList(await wRes.json());
      if (hRes.ok) setHikcentral(await hRes.json());
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      const res = await apiFetch(`${API}/api/acs/visitors`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body: JSON.stringify({ ...form,
          device_id: form.device_id ? parseInt(form.device_id) : undefined,
          host_person_id: form.host_person_id ? parseInt(form.host_person_id) : undefined,
          access_level_id: form.access_level_id ? parseInt(form.access_level_id) : undefined,
          valid_from: form.valid_from + ':00',
          valid_to:   form.valid_to   + ':00',
        }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.detail||'Save failed'); return; }
      setShowForm(false); setForm(EMPTY); load();
    } finally { setSaving(false); }
  };

  const review = async (id, decision) => {
    await apiFetch(`${API}/api/acs/visitors/${id}/review`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
      body:JSON.stringify({ decision }),
    });
    load();
  };

  const addWatch = async () => {
    const res = await apiFetch(`${API}/api/acs/visitors/watch-list`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
      body:JSON.stringify(watchForm),
    });
    if (res.ok) {
      setWatchForm({ full_name:'', organization:'', id_number:'', watch_type:'important', reason:'' });
      load();
    }
  };

  const syncHikcentral = async dryRun => {
    setSyncing(true); setError('');
    try {
      const res = await apiFetch(`${API}/api/integrations/hikcentral/sync/people`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body:JSON.stringify({ dry_run:dryRun }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'HikCentral sync failed');
      setError(`${dryRun ? 'Preview' : 'Sync'}: ${data.created} new, ${data.updated} updated, ${data.skipped} skipped.`);
      if (!dryRun) load();
    } catch (requestError) {
      setError(String(requestError.message || requestError));
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (id) => {
    const ok = await showConfirm('Delete this visitor record?', true);
    if (!ok) return;
    await apiFetch(`${API}/api/acs/visitors/${id}`, { method:'DELETE', headers:{ Authorization:`Bearer ${token}` }});
    load();
  };

  const filtered = visitors.filter(v => statusF === 'all' || v.status === statusF);

  const TH = { padding:'10px 14px',textAlign:'left',fontSize:11,fontWeight:700,
               color:'var(--muted)',textTransform:'uppercase',borderBottom:'1px solid var(--border)' };
  const TD = { padding:'10px 14px',verticalAlign:'middle',fontSize:13 };
  const INPUT_S = { padding:'8px 10px',borderRadius:7,border:'1px solid var(--border)',
                    fontSize:13,background:'var(--bg)',color:'var(--text)',width:'100%' };

  return (
    <div style={{ padding:24,display:'flex',flexDirection:'column',gap:18 }}>
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}>
        <div style={{ display:'flex',alignItems:'center',gap:10,fontSize:18,fontWeight:700,color:'var(--text)' }}>
          <UserPlus size={20}/> Visitor Management
          <span style={{ background:'var(--primary-soft)',color:'var(--primary)',borderRadius:12,
                         padding:'2px 10px',fontSize:12,fontWeight:700 }}>{visitors.length}</span>
        </div>
        <div style={{ display:'flex',gap:8 }}>
          {isAdmin && <button onClick={()=>syncHikcentral(true)} disabled={!hikcentral.configured || syncing} className="ghost-btn" title={hikcentral.configured ? `Connected to ${hikcentral.host}` : 'Add HikCentral AppKey/AppSecret in backend .env'}>
            <RefreshCw size={13} className={syncing?'spin':''}/> HikCentral Preview
          </button>}
          {isAdmin && <button onClick={()=>syncHikcentral(false)} disabled={!hikcentral.configured || syncing} className="ghost-btn">
            Sync People
          </button>}
          <button onClick={load} disabled={loading} className="ghost-btn">
            <RefreshCw size={13} className={loading?'spin':''}/> Refresh
          </button>
          <button onClick={()=>{ setShowForm(v=>!v); setForm(EMPTY); setError(''); }} className="save-btn">
            <Plus size={13}/> New Visitor
          </button>
        </div>
      </div>

      <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:10 }}>
        {[['Expected',dashboard.expected],['Inside',dashboard.inside],['Overdue',dashboard.overdue],['Pending approval',dashboard.pending_approval]].map(([label,value])=>(
          <div key={label} style={{ background:'var(--card)',border:'1px solid var(--border)',borderRadius:10,padding:'13px 15px' }}>
            <div style={{ fontSize:11,color:'var(--muted)',textTransform:'uppercase' }}>{label}</div>
            <strong style={{ display:'block',fontSize:22,marginTop:4 }}>{value || 0}</strong>
          </div>
        ))}
      </div>

      <div style={{ display:'flex',gap:8 }}>
        <button className={tab==='reservations'?'save-btn':'ghost-btn'} onClick={()=>setTab('reservations')}>Reservations</button>
        <button className={tab==='watch'?'save-btn':'ghost-btn'} onClick={()=>setTab('watch')}>Watch List</button>
      </div>

      {tab === 'reservations' && showForm && (
        <div style={{ background:'var(--card)',border:'1px solid var(--border)',borderRadius:12,padding:20 }}>
          <div style={{ fontWeight:700,fontSize:14,marginBottom:14,display:'flex',
                        alignItems:'center',justifyContent:'space-between' }}>
            Register Visitor
            <button onClick={()=>setShowForm(false)} style={{ background:'none',border:'none',cursor:'pointer' }}>
              <X size={16}/>
            </button>
          </div>
          {error && <div style={{ background:'#fee2e2',color:'#991b1b',borderRadius:8,
                                  padding:'8px 12px',fontSize:12,marginBottom:12 }}>{error}</div>}
          <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12 }}>
            {[['Full Name *','full_name','text'],['Phone','phone','text'],
              ['Company','company','text'],['Visit Reason','visit_reason','text'],
              ['ID Number','id_number','text'],['Card Number','card_number','text']].map(([l,f,t])=>(
              <label key={f} style={{ fontSize:12,fontWeight:500,color:'var(--text-soft)',display:'flex',flexDirection:'column',gap:4 }}>
                {l}
                <input type={t} value={form[f]} onChange={e=>set(f,e.target.value)} style={INPUT_S} />
              </label>
            ))}
            <label style={{ fontSize:12,fontWeight:500,color:'var(--text-soft)',display:'flex',flexDirection:'column',gap:4 }}>
              Host Employee
              <select value={form.host_person_id} onChange={e=>set('host_person_id',e.target.value)} style={INPUT_S}>
                <option value="">Select host</option>
                {reference.hosts.map(p=><option key={p.id} value={p.id}>{p.name}{p.department ? ` · ${p.department}` : ''}</option>)}
              </select>
            </label>
            <label style={{ fontSize:12,fontWeight:500,color:'var(--text-soft)',display:'flex',flexDirection:'column',gap:4 }}>
              Access Level
              <select value={form.access_level_id} onChange={e=>set('access_level_id',e.target.value)} style={INPUT_S}>
                <option value="">No access level</option>
                {reference.access_levels.map(level=><option key={level.id} value={level.id}>{level.name}</option>)}
              </select>
            </label>
            <label style={{ fontSize:12,fontWeight:500,color:'var(--text-soft)',display:'flex',flexDirection:'column',gap:4 }}>
              Visitor Group
              <select value={form.visitor_group} onChange={e=>set('visitor_group',e.target.value)} style={INPUT_S}>
                {reference.groups.map(group=><option key={group}>{group}</option>)}
              </select>
            </label>
            <label style={{ fontSize:12,fontWeight:500,color:'var(--text-soft)',display:'flex',flexDirection:'column',gap:4 }}>
              ACS Device (optional)
              <select value={form.device_id} onChange={e=>set('device_id',e.target.value)} style={INPUT_S}>
                <option value="">None</option>
                {devices.filter(d=>d.is_active).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
            <label style={{ fontSize:12,fontWeight:500,color:'var(--text-soft)',display:'flex',flexDirection:'column',gap:4 }}>
              Valid From *
              <input type="datetime-local" value={form.valid_from} onChange={e=>set('valid_from',e.target.value)} style={INPUT_S}/>
            </label>
            <label style={{ fontSize:12,fontWeight:500,color:'var(--text-soft)',display:'flex',flexDirection:'column',gap:4 }}>
              Valid To *
              <input type="datetime-local" value={form.valid_to} onChange={e=>set('valid_to',e.target.value)} style={INPUT_S}/>
            </label>
            <label style={{ fontSize:12,fontWeight:500,color:'var(--text-soft)',display:'flex',flexDirection:'column',gap:4,gridColumn:'1/-1' }}>
              Note
              <input value={form.note} onChange={e=>set('note',e.target.value)} style={INPUT_S}/>
            </label>
          </div>
          <div style={{ display:'flex',justifyContent:'flex-end',gap:10,marginTop:14 }}>
            <button onClick={()=>setShowForm(false)} disabled={saving} className="ghost-btn">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="save-btn">
              {saving?'Saving…':'Create & Generate QR'}
            </button>
          </div>
        </div>
      )}

      {tab === 'reservations' && <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
        {['all','reserved','pending','active','completed','expired','cancelled'].map(s=>(
          <button key={s} onClick={()=>setStatusF(s)}
                  style={{ padding:'5px 12px',borderRadius:20,fontSize:11,fontWeight:600,
                           border: statusF===s?'none':'1px solid var(--border)',
                           background: statusF===s?(STATUS_META[s]?.bg||'var(--primary)'):'transparent',
                           color: statusF===s?(STATUS_META[s]?.color||'#fff'):'var(--muted)',
                           cursor:'pointer' }}>
            {s === 'all' ? 'All' : STATUS_META[s]?.label||s}
          </button>
        ))}
      </div>}
      <div style={{ display:tab === 'reservations' ? 'block' : 'none' }}>

      {loading ? <div style={{ textAlign:'center',padding:40,color:'var(--muted)' }}>Loading…</div>
               : filtered.length === 0 ? <div style={{ textAlign:'center',padding:40,color:'var(--muted)' }}>No visitors found.</div>
               : (
        <div style={{ overflowX:'auto',background:'var(--card)',borderRadius:12,border:'1px solid var(--border)' }}>
          <table style={{ width:'100%',borderCollapse:'collapse',fontSize:13 }}>
            <thead>
              <tr style={{ background:'var(--bg)' }}>
                {['Name','Company','Host','Valid From','Valid To','Status','Card','Check-in','Check-out',''].map(h=>(
                  <th key={h} style={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((v,i)=>{
                const sm = STATUS_META[v.status]||STATUS_META.pending;
                return (
                  <tr key={v.id} style={{ borderBottom:'1px solid var(--border-soft)',background:i%2?'var(--bg)':'transparent' }}>
                    <td style={{ ...TD,fontWeight:600 }}>{v.full_name}</td>
                    <td style={{ ...TD,color:'var(--muted)' }}>{v.company||'—'}</td>
                    <td style={{ ...TD,color:'var(--muted)' }}>{v.host_name||'—'}</td>
                    <td style={{ ...TD,color:'var(--muted)',fontSize:11 }}>{fmtDt(v.valid_from)}</td>
                    <td style={{ ...TD,color:'var(--muted)',fontSize:11 }}>{fmtDt(v.valid_to)}</td>
                    <td style={TD}>
                      <span style={{ ...sm,borderRadius:6,padding:'2px 10px',fontSize:11,fontWeight:700 }}>
                        {sm.label}
                      </span>
                    </td>
                    <td style={{ ...TD,fontFamily:'monospace',fontSize:11 }}>{v.card_number||'—'}</td>
                    <td style={{ ...TD,fontSize:11,color:'var(--muted)' }}>{fmtDt(v.checked_in_at)}</td>
                    <td style={{ ...TD,fontSize:11,color:'var(--muted)' }}>{fmtDt(v.checked_out_at)}</td>
                    <td style={TD}>
                      <div style={{ display:'flex',gap:4 }}>
                        <button onClick={()=>setQrFor(v)} title="Show QR"
                                className="icon-btn"><QrCode size={13}/></button>
                        {isAdmin && v.approval_status === 'pending' && <>
                          <button onClick={()=>review(v.id,'approved')} title="Approve" className="icon-btn"><CheckCircle size={13}/></button>
                          <button onClick={()=>review(v.id,'rejected')} title="Reject" className="icon-btn danger"><XCircle size={13}/></button>
                        </>}
                        {isAdmin && <button onClick={()=>handleDelete(v.id)} title="Delete"
                                           className="icon-btn danger">
                          <Trash2 size={13}/>
                        </button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      </div>

      {tab === 'watch' && (
        <div style={{ display:'grid',gap:12 }}>
          <div style={{ background:'var(--card)',border:'1px solid var(--border)',borderRadius:12,padding:16 }}>
            <div style={{ display:'flex',alignItems:'center',gap:8,fontWeight:700,marginBottom:12 }}><ShieldAlert size={17}/> Add Watch Entry</div>
            <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:10 }}>
              <input placeholder="Full name" value={watchForm.full_name} onChange={e=>setWatchForm(f=>({...f,full_name:e.target.value}))} style={INPUT_S}/>
              <input placeholder="Organization" value={watchForm.organization} onChange={e=>setWatchForm(f=>({...f,organization:e.target.value}))} style={INPUT_S}/>
              <input placeholder="ID number" value={watchForm.id_number} onChange={e=>setWatchForm(f=>({...f,id_number:e.target.value}))} style={INPUT_S}/>
              <select value={watchForm.watch_type} onChange={e=>setWatchForm(f=>({...f,watch_type:e.target.value}))} style={INPUT_S}>
                <option value="important">Important</option><option value="blocked">Blocked</option>
              </select>
              <input placeholder="Reason" value={watchForm.reason} onChange={e=>setWatchForm(f=>({...f,reason:e.target.value}))} style={INPUT_S}/>
              <button className="save-btn" onClick={addWatch}>Add to Watch List</button>
            </div>
          </div>
          <div style={{ overflowX:'auto',background:'var(--card)',borderRadius:12,border:'1px solid var(--border)' }}>
            <table style={{ width:'100%',borderCollapse:'collapse' }}><thead><tr>
              {['Name','Organization','ID Number','Type','Reason'].map(h=><th key={h} style={TH}>{h}</th>)}
            </tr></thead><tbody>{watchList.map(item=><tr key={item.id}>
              <td style={TD}>{item.full_name||'—'}</td><td style={TD}>{item.organization||'—'}</td>
              <td style={TD}>{item.id_number||'—'}</td><td style={TD}>{item.watch_type}</td><td style={TD}>{item.reason||'—'}</td>
            </tr>)}</tbody></table>
          </div>
        </div>
      )}

      {qrFor && <QrModal visitor={qrFor} token={token} onClose={()=>setQrFor(null)} />}

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
