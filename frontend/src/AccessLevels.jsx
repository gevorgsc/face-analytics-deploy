import { apiFetch } from './apiClient';
// AccessLevels.jsx — Define door access groups and assign persons

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Shield, Plus, Trash2, Edit2, Users, DoorOpen, X,
  ChevronDown, ChevronUp, RefreshCw, UserPlus, UserMinus, Server, Copy,
  Search, Clock3, ListChecks, BadgeCheck, UploadCloud,
} from 'lucide-react';
import { API } from './apiConfig';
import AcsUiSelect from './AcsUiSelect';

// ── Shared dialogs ────────────────────────────────────────────────────────────

function PromptModal({ title, defaultValue, onConfirm, onCancel }) {
  const [value, setValue] = useState(defaultValue || '');
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const submit = () => { if (value.trim()) onConfirm(value.trim()); };
  return (
    <div className="pm-dialog-overlay" onMouseDown={e => e.target === e.currentTarget && onCancel()}>
      <div className="pm-dialog">
        <div className="pm-dialog-header">
          <strong>{title}</strong>
          <button className="pm-dialog-close" onClick={onCancel}><X size={16} /></button>
        </div>
        <div className="pm-dialog-body">
          <input ref={ref} className="pm-dialog-input" value={value}
                 onChange={e => setValue(e.target.value)}
                 onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }} />
        </div>
        <div className="pm-dialog-footer">
          <button className="ghost-btn" onClick={onCancel}>Cancel</button>
          <button className="save-btn" onClick={submit} disabled={!value.trim()}>OK</button>
        </div>
      </div>
    </div>
  );
}

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

// ── Helpers ───────────────────────────────────────────────────────────────────

const COLORS = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#EC4899','#6366F1'];
const SCHEDULE_DAYS = [
  ['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'],
  ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday'],
];

const makeSchedule = (name = 'All Day', start = '00:00', end = '23:59', days = 7) => ({
  name,
  timezone: 'Asia/Yerevan',
  weekly: Object.fromEntries(SCHEDULE_DAYS.map(([key], index) => [
    key,
    index < days ? [{ start, end }] : [],
  ])),
  holiday_mode: 'follow_weekly',
  controller_plan_template_no: name === 'All Day' ? 1 : null,
});

function ScheduleEditor({ value, onChange }) {
  const schedule = value || makeSchedule();

  const applyPreset = preset => {
    if (preset === 'all-day') onChange(makeSchedule());
    if (preset === 'business') onChange(makeSchedule('Business Hours', '09:00', '18:00', 5));
    if (preset === 'weekdays') onChange(makeSchedule('Weekdays', '08:00', '20:00', 5));
    if (preset === 'custom') onChange({ ...schedule, name: 'Custom Schedule' });
  };

  const updateDay = (day, field, nextValue) => {
    const current = schedule.weekly?.[day] || [];
    let periods = current;
    if (field === 'enabled') {
      periods = nextValue ? [{ start: '09:00', end: '18:00' }] : [];
    } else {
      periods = [{ start: current[0]?.start || '09:00', end: current[0]?.end || '18:00', [field]: nextValue }];
    }
    onChange({
      ...schedule,
      name: 'Custom Schedule',
      weekly: { ...schedule.weekly, [day]: periods },
    });
  };

  return (
    <div className="al-schedule-editor">
      <div className="al-schedule-head">
        <div><Clock3 size={15} /><strong>Access Schedule</strong></div>
        <select onChange={event => applyPreset(event.target.value)} defaultValue="">
          <option value="" disabled>Apply preset</option>
          <option value="all-day">All Day</option>
          <option value="business">Business Hours</option>
          <option value="weekdays">Weekdays 08:00-20:00</option>
          <option value="custom">Custom</option>
        </select>
      </div>
      <div className="al-schedule-days">
        {SCHEDULE_DAYS.map(([day, label]) => {
          const period = schedule.weekly?.[day]?.[0];
          return (
            <div className={`al-schedule-day ${period ? 'enabled' : ''}`} key={day}>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(period)}
                  onChange={event => updateDay(day, 'enabled', event.target.checked)}
                />
                <span>{label.slice(0, 3)}</span>
              </label>
              <input type="time" value={period?.start || '09:00'} disabled={!period}
                     onChange={event => updateDay(day, 'start', event.target.value)} />
              <span>to</span>
              <input type="time" value={period?.end || '18:00'} disabled={!period}
                     onChange={event => updateDay(day, 'end', event.target.value)} />
            </div>
          );
        })}
      </div>
      <div className="al-schedule-options">
        <label>
          Holiday policy
          <select value={schedule.holiday_mode || 'follow_weekly'}
                  onChange={event => onChange({ ...schedule, holiday_mode: event.target.value })}>
            <option value="follow_weekly">Follow weekly schedule</option>
            <option value="deny">Deny access</option>
            <option value="allow">Allow access</option>
          </select>
        </label>
        <label>
          Controller plan template
          <input type="number" min="1" max="255"
                 value={schedule.controller_plan_template_no ?? ''}
                 placeholder="Not mapped"
                 onChange={event => onChange({
                   ...schedule,
                   controller_plan_template_no: event.target.value ? Number(event.target.value) : null,
                 })} />
        </label>
        <small>Plan 1 is the controller's 24/7 template. Map custom schedules only after creating the same plan on the controller.</small>
      </div>
    </div>
  );
}

function ColorPicker({ value, onChange }) {
  return (
    <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
      {COLORS.map(c => (
        <button key={c} onClick={() => onChange(c)}
                style={{ width:22,height:22,borderRadius:'50%',background:c,border:value===c?'3px solid var(--text)':'2px solid transparent',cursor:'pointer' }} />
      ))}
    </div>
  );
}

// ── Level form (create / edit) ────────────────────────────────────────────────

function LevelForm({ initial, devices, onSave, onCancel, saving }) {
  const [form, setForm] = useState(initial ? {
    name:        initial.name,
    description: initial.description || '',
    color:       initial.color || '#3B82F6',
    is_active:   initial.is_active !== false,
    door_rules:  initial.door_rules || [],
    schedule_config: initial.schedule_config || makeSchedule(),
  } : { name:'', description:'', color:'#3B82F6', is_active:true, door_rules:[], schedule_config:makeSchedule() });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleDoor = (deviceId, doorNo) => {
    setForm(f => {
      const rules = [...f.door_rules];
      const rIdx  = rules.findIndex(r => r.device_id === deviceId);
      if (rIdx === -1) {
        rules.push({ device_id: deviceId, door_numbers: [doorNo] });
      } else {
        const doors = rules[rIdx].door_numbers || [];
        if (doors.includes(doorNo)) {
          const nd = doors.filter(d => d !== doorNo);
          if (nd.length === 0) rules.splice(rIdx, 1);
          else rules[rIdx] = { ...rules[rIdx], door_numbers: nd };
        } else {
          rules[rIdx] = { ...rules[rIdx], door_numbers: [...doors, doorNo] };
        }
      }
      return { ...f, door_rules: rules };
    });
  };

  const isDoorSelected = (deviceId, doorNo) => {
    const rule = form.door_rules.find(r => r.device_id === deviceId);
    return rule?.door_numbers?.includes(doorNo) || false;
  };

  return (
    <div style={{ background:'var(--card)',border:'1px solid var(--border)',borderRadius:12,padding:20 }}>
      <div style={{ fontWeight:700,fontSize:14,marginBottom:16 }}>
        {initial ? `Edit — ${initial.name}` : 'New Access Level'}
      </div>
      <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12 }}>
        <label style={LBL}>
          Name *
          <input value={form.name} onChange={e=>set('name',e.target.value)} style={INPUT_S}
                 placeholder="e.g. HR Team, VIP Floor…" />
        </label>
        <label style={LBL}>
          Description
          <input value={form.description} onChange={e=>set('description',e.target.value)} style={INPUT_S} />
        </label>
      </div>
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:12,fontWeight:500,color:'var(--text-soft)',marginBottom:6 }}>Color</div>
        <ColorPicker value={form.color} onChange={v=>set('color',v)} />
      </div>

      <ScheduleEditor value={form.schedule_config} onChange={value => set('schedule_config', value)} />

      {/* Door access rules */}
      <div style={{ marginBottom:14 }}>
        <div style={{ fontSize:12,fontWeight:600,color:'var(--text)',marginBottom:10 }}>
          Door Access Rights
        </div>
        {devices.filter(d=>d.is_active).length === 0 ? (
          <div style={{ fontSize:12,color:'var(--muted)' }}>No active ACS devices.</div>
        ) : (
          <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
            {devices.filter(d=>d.is_active).map(device => (
              <div key={device.id} style={{ background:'var(--bg)',borderRadius:8,padding:'10px 14px' }}>
                <div style={{ fontSize:12,fontWeight:600,color:'var(--text)',marginBottom:8,
                              display:'flex',alignItems:'center',gap:6 }}>
                  <Server size={13}/> {device.name}
                  <span style={{ fontSize:10,color:'var(--muted)' }}>{device.ip_address}</span>
                </div>
                <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
                  {Array.from({ length: device.door_count||1 },(_,i)=>i+1).map(n => (
                    <button key={n} onClick={() => toggleDoor(device.id, n)}
                            style={{ padding:'5px 14px',borderRadius:7,fontSize:12,fontWeight:600,cursor:'pointer',
                                     border: isDoorSelected(device.id,n) ? 'none' : '1px solid var(--border)',
                                     background: isDoorSelected(device.id,n) ? form.color : 'transparent',
                                     color: isDoorSelected(device.id,n) ? '#fff' : 'var(--muted)' }}>
                      <DoorOpen size={11} style={{ marginRight:4 }}/>Door {n}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <label style={{ display:'flex',alignItems:'center',gap:8,fontSize:13,fontWeight:500,marginBottom:14 }}>
        <input type="checkbox" checked={form.is_active} onChange={e=>set('is_active',e.target.checked)}/>
        Active
      </label>

      <div style={{ display:'flex',justifyContent:'flex-end',gap:10 }}>
        <button onClick={onCancel} disabled={saving} className="ghost-btn">Cancel</button>
        <button onClick={() => onSave(form)} disabled={saving} className="save-btn">
          {saving ? 'Saving…' : (initial ? 'Update Level' : 'Create Level')}
        </button>
      </div>
    </div>
  );
}

// ── Level card ────────────────────────────────────────────────────────────────

function LevelCard({
  level, devices, token, onEdit, onDelete, onClone, onRefresh,
  onDeploy,
  manageMembers = false, canConfigure = false, canAssign = false,
}) {
  const [expanded,  setExpanded]  = useState(false);
  const [members,   setMembers]   = useState([]);
  const [available, setAvailable] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [showAdd,   setShowAdd]   = useState(false);
  const [selPerson, setSelPerson] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validTo,   setValidTo]   = useState('');
  const [adding,    setAdding]    = useState(false);
  const [planCheck, setPlanCheck] = useState(null);
  const [verifying, setVerifying] = useState(false);

  const loadMembers = async () => {
    setLoading(true);
    try {
      const [mRes, aRes] = await Promise.all([
        apiFetch(`${API}/api/acs/levels/${level.id}/members`,           { headers:{ Authorization:`Bearer ${token}` } }),
        apiFetch(`${API}/api/acs/levels/${level.id}/available-persons`, { headers:{ Authorization:`Bearer ${token}` } }),
      ]);
      if (mRes.ok) setMembers(await mRes.json());
      if (aRes.ok) setAvailable(await aRes.json());
    } finally { setLoading(false); }
  };

  const handleExpand = () => {
    if (!manageMembers) return;
    if (!expanded) loadMembers();
    setExpanded(v=>!v);
  };

  const addMember = async () => {
    if (!selPerson) return;
    setAdding(true);
    await apiFetch(`${API}/api/acs/levels/${level.id}/members`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
      body: JSON.stringify({ person_id: parseInt(selPerson), issue_cards: true,
                             valid_from: validFrom||undefined, valid_to: validTo||undefined }),
    });
    setSelPerson(''); setValidFrom(''); setValidTo(''); setShowAdd(false); setAdding(false);
    loadMembers(); onRefresh();
  };

  const removeMember = async (memberId) => {
    await apiFetch(`${API}/api/acs/levels/${level.id}/members/${memberId}`, {
      method:'DELETE', headers:{ Authorization:`Bearer ${token}` },
    });
    loadMembers(); onRefresh();
  };

  const verifySchedule = async () => {
    setVerifying(true);
    setPlanCheck(null);
    try {
      const response = await apiFetch(`${API}/api/acs/levels/${level.id}/verify-schedule`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json().catch(() => ({}));
      setPlanCheck({
        ok: Boolean(response.ok && result.ok),
        message: result.message || 'Plan verification failed',
      });
    } finally {
      setVerifying(false);
    }
  };

  const doorSummary = level.door_rules.map(r => {
    const d = devices.find(x=>x.id===r.device_id);
    return `${d?.name||'Device '+r.device_id}: Doors ${(r.door_numbers||[]).join(',')}`;
  }).join(' | ');

  return (
    <div style={{ background:'var(--card)',border:`2px solid ${level.color||'#3B82F6'}22`,
                  borderRadius:12,overflow:'hidden' }}>
      {/* Header */}
      <div style={{ display:'flex',alignItems:'center',gap:0 }}>
        <div style={{ width:6,alignSelf:'stretch',background:level.color||'#3B82F6',flexShrink:0 }}/>
        <div style={{ flex:1,padding:'14px 16px',cursor:manageMembers?'pointer':'default',display:'flex',
                      alignItems:'center',justifyContent:'space-between' }}
             onClick={handleExpand}>
          <div>
            <div style={{ display:'flex',alignItems:'center',gap:10 }}>
              <Shield size={16} style={{ color:level.color||'#3B82F6' }}/>
              <strong style={{ fontSize:14,fontWeight:700,color:'var(--text)' }}>{level.name}</strong>
              <span style={{ background:`${level.color}22`,color:level.color,borderRadius:12,
                             padding:'2px 10px',fontSize:11,fontWeight:700 }}>
                <Users size={11} style={{ marginRight:3 }}/>{level.member_count} members
              </span>
              {!level.is_active && (
                <span style={{ fontSize:10,background:'#f1f5f9',color:'#64748b',borderRadius:6,padding:'2px 8px' }}>inactive</span>
              )}
            </div>
            {(level.description || doorSummary) && (
              <div style={{ fontSize:11,color:'var(--muted)',marginTop:4 }}>
                {level.description && <span>{level.description} · </span>}
                <DoorOpen size={10} style={{ marginRight:3 }}/>{doorSummary || 'No doors configured'}
              </div>
            )}
            <div className="al-card-meta">
              <span>
                <Clock3 size={11} />
                {level.schedule_summary || 'All Day'}
                {level.schedule_active_now ? ' (active now)' : ' (inactive now)'}
              </span>
              <span className={level.controller_plan_mapped ? 'al-plan-ok' : 'al-plan-warn'}>
                {level.controller_plan_mapped
                  ? `Controller plan ${level.schedule_config?.controller_plan_template_no}`
                  : 'Controller plan not mapped'}
              </span>
              <span><DoorOpen size={11} /> {level.door_rules.reduce((sum, rule) => sum + (rule.door_numbers?.length || 0), 0)} access point(s)</span>
            </div>
          </div>
          <div style={{ display:'flex',alignItems:'center',gap:8 }}>
            {canConfigure && <>
              {Number(level.schedule_config?.controller_plan_template_no || 0) > 1 && (
                <button onClick={e=>{e.stopPropagation();onDeploy(level);}}
                        className="icon-btn" title="Deploy schedule to controllers">
                  <UploadCloud size={13}/>
                </button>
              )}
              <button onClick={e=>{e.stopPropagation();verifySchedule();}}
                      className="icon-btn" title="Verify controller plan" disabled={verifying}>
                <BadgeCheck size={13} className={verifying ? 'spin' : ''}/>
              </button>
              <button onClick={e=>{e.stopPropagation();onEdit(level);}}
                      className="icon-btn" title="Edit"><Edit2 size={13}/></button>
              <button onClick={e=>{e.stopPropagation();onClone(level);}}
                      className="icon-btn" style={{color:'#7c3aed',borderColor:'#c4b5fd'}} title="Clone level">
                <Copy size={13}/>
              </button>
              <button onClick={e=>{e.stopPropagation();onDelete(level);}}
                      className="icon-btn danger" title="Delete"><Trash2 size={13}/></button>
            </>}
            {manageMembers && (expanded ? <ChevronUp size={16}/> : <ChevronDown size={16}/>)}
          </div>
        </div>
      </div>
      {planCheck && (
        <div className={`al-plan-check ${planCheck.ok ? 'ok' : 'error'}`}>
          {planCheck.message}
        </div>
      )}

      {/* Members */}
      {manageMembers && expanded && (
        <div style={{ borderTop:'1px solid var(--border-soft)',padding:'14px 16px' }}>
          <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12 }}>
            <span style={{ fontSize:13,fontWeight:600,color:'var(--text)' }}>Members</span>
            {canAssign && (
              <button onClick={()=>setShowAdd(v=>!v)} className="save-btn" style={{padding:'5px 12px',fontSize:12}}>
                <UserPlus size={12}/> Add Person
              </button>
            )}
          </div>

          {showAdd && (
            <div style={{ background:'var(--bg)',borderRadius:8,padding:'12px',marginBottom:12,
                          display:'flex',flexDirection:'column',gap:10 }}>
              <select value={selPerson} onChange={e=>setSelPerson(e.target.value)} style={INPUT_S}>
                <option value="">Select person…</option>
                {available.filter(p=>!p.already_member).map(p=>(
                  <option key={p.id} value={p.id}>
                    {p.full_name} {p.department?`(${p.department})`:''} {p.card_number?`🪪${p.card_number}`:'(no card)'}
                  </option>
                ))}
              </select>
              <div style={{ display:'flex',gap:10 }}>
                <label style={{ ...LBL, flex:1 }}>
                  Valid From
                  <input type="date" value={validFrom} onChange={e=>setValidFrom(e.target.value)} style={INPUT_S}/>
                </label>
                <label style={{ ...LBL, flex:1 }}>
                  Valid To
                  <input type="date" value={validTo} onChange={e=>setValidTo(e.target.value)} style={INPUT_S}/>
                </label>
              </div>
              <div style={{ display:'flex',gap:8 }}>
                <button onClick={addMember} disabled={adding||!selPerson} className="save-btn">
                  {adding?'Adding…':'Add & Issue Card'}
                </button>
                <button onClick={()=>setShowAdd(false)} className="ghost-btn">Cancel</button>
              </div>
            </div>
          )}

          {loading ? <div style={{ color:'var(--muted)',fontSize:12 }}>Loading…</div>
                   : members.length === 0 ? <div style={{ color:'var(--muted)',fontSize:12 }}>No members yet.</div>
                   : (
            <div style={{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:8 }}>
              {members.map(m => (
                <div key={m.id} style={{ display:'flex',alignItems:'center',gap:10,
                                         padding:'10px 12px',background:'var(--bg)',borderRadius:8 }}>
                  <div style={{ width:36,height:36,borderRadius:'50%',overflow:'hidden',flexShrink:0,
                                background:'var(--border)',display:'flex',alignItems:'center',justifyContent:'center' }}>
                    {m.preview_image
                      ? <img src={m.preview_image} alt="" style={{ width:'100%',height:'100%',objectFit:'cover' }}/>
                      : <Users size={16} style={{ color:'var(--muted)' }}/>}
                  </div>
                  <div style={{ flex:1,minWidth:0 }}>
                    <div style={{ fontSize:13,fontWeight:600,color:'var(--text)',
                                  overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>
                      {m.person_name}
                    </div>
                    <div style={{ fontSize:10,color:'var(--muted)' }}>
                      {m.department||m.person_type}
                      {m.card_number && ` · 🪪${m.card_number}`}
                    </div>
                    {m.valid_to && <div style={{ fontSize:10,color:'var(--muted)' }}>until {m.valid_to?.slice(0,10)}</div>}
                  </div>
                  {canAssign && (
                    <button onClick={()=>removeMember(m.id)} title="Remove"
                            className="icon-btn danger" style={{flexShrink:0}}><UserMinus size={13}/></button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function AccessLevels({ token, isAdmin }) {
  const [levels,  setLevels]  = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm,setShowForm]= useState(false);
  const [editLv,  setEditLv]  = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [confirmModal, setConfirmModal] = useState(null);
  const [promptModal,  setPromptModal]  = useState(null);
  const [mode, setMode] = useState('manage');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [error, setError] = useState('');

  const showConfirm = (message, danger = false) => new Promise(resolve =>
    setConfirmModal({ message, danger, resolve }));
  const showPrompt = (title, defaultValue = '') => new Promise(resolve =>
    setPromptModal({ title, defaultValue, resolve }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [lRes,dRes] = await Promise.all([
        apiFetch(`${API}/api/acs/levels`, { headers:{ Authorization:`Bearer ${token}` } }),
        apiFetch(`${API}/api/acs`,        { headers:{ Authorization:`Bearer ${token}` } }),
      ]);
      if (lRes.ok) setLevels(await lRes.json());
      if (dRes.ok) setDevices(await dRes.json());
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (form) => {
    setSaving(true);
    setError('');
    try {
      const url    = editLv ? `${API}/api/acs/levels/${editLv.id}` : `${API}/api/acs/levels`;
      const method = editLv ? 'PATCH' : 'POST';
      const res    = await apiFetch(url, {
        method, headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setShowForm(false);
        setEditLv(null);
        load();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || 'Unable to save access level');
      }
    } finally { setSaving(false); }
  };

  const handleClone = async (lv) => {
    const newName = await showPrompt(`Clone "${lv.name}" — enter name for copy:`, `${lv.name} (Copy)`);
    if (!newName) return;
    const res = await apiFetch(`${API}/api/acs/levels/${lv.id}/clone`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });
    if (!res.ok) await showConfirm('Clone failed', false);
    else load();
  };

  const handleDelete = async (lv) => {
    const ok = await showConfirm(`Delete access level "${lv.name}"? All member assignments will be removed.`, true);
    if (!ok) return;
    await apiFetch(`${API}/api/acs/levels/${lv.id}`, {
      method:'DELETE', headers:{ Authorization:`Bearer ${token}` }
    });
    load();
  };

  const handleDeploy = async (lv) => {
    const planNo = lv.schedule_config?.controller_plan_template_no;
    const confirmed = await showConfirm(
      `Deploy "${lv.schedule_summary}" and its ${new Date().getFullYear()} holiday policy as controller plan ${planNo} on every controller used by "${lv.name}"? Successful deployment will resynchronize active members.`,
      false,
    );
    if (!confirmed) return;
    const response = await apiFetch(`${API}/api/acs/levels/${lv.id}/deploy-schedule`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        confirm: true,
        resync_members: true,
        holiday_year: new Date().getFullYear(),
      }),
    });
    const result = await response.json().catch(() => ({}));
    await showConfirm(result.detail || result.message || (response.ok ? 'Schedule deployed.' : 'Schedule deployment failed.'), false);
    load();
  };

  const openEdit = (lv) => { setEditLv(lv); setShowForm(true); };
  const visibleLevels = levels.filter(level => {
    const matchesSearch = !search.trim()
      || level.name.toLowerCase().includes(search.trim().toLowerCase())
      || String(level.description || '').toLowerCase().includes(search.trim().toLowerCase());
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'active' ? level.is_active : !level.is_active);
    return matchesSearch && matchesStatus;
  });
  const totalMembers = levels.reduce((sum, level) => sum + (level.member_count || 0), 0);
  const totalPoints = levels.reduce(
    (sum, level) => sum + level.door_rules.reduce((count, rule) => count + (rule.door_numbers?.length || 0), 0),
    0,
  );

  return (
    <div className="al-page">
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between' }}>
        <div style={{ display:'flex',alignItems:'center',gap:10,fontSize:18,fontWeight:700,color:'var(--text)' }}>
          <Shield size={20}/> Access Levels
          <span style={{ background:'var(--primary-soft)',color:'var(--primary)',borderRadius:12,
                         padding:'2px 10px',fontSize:12,fontWeight:700 }}>{levels.length}</span>
        </div>
        <div style={{ display:'flex',gap:8 }}>
          <button onClick={load} disabled={loading} className="ghost-btn">
            <RefreshCw size={13} className={loading?'spin':''}/> Refresh
          </button>
          {isAdmin && mode === 'manage' && (
            <button onClick={()=>{ setEditLv(null); setShowForm(v=>!v); }} className="save-btn">
              <Plus size={13}/> New Level
            </button>
          )}
        </div>
      </div>

      <div className="al-tabs">
        <button className={mode === 'manage' ? 'active' : ''} onClick={() => setMode('manage')}>
          <ListChecks size={15} /> Manage Access Levels
        </button>
        <button className={mode === 'assign' ? 'active' : ''} onClick={() => setMode('assign')}>
          <Users size={15} /> Assign People
        </button>
      </div>

      <div className="al-summary">
        <div><span>Access Levels</span><strong>{levels.length}</strong></div>
        <div><span>Assigned People</span><strong>{totalMembers}</strong></div>
        <div><span>Access Points</span><strong>{totalPoints}</strong></div>
        <div><span>Schedules</span><strong className="text">
          {new Set(levels.map(level => level.schedule_summary || 'All Day')).size} configured
        </strong></div>
      </div>

      <div className="al-toolbar">
        <label><Search size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search access levels" /></label>
        <AcsUiSelect
          className="al-status-ui-select"
          label="All levels"
          value={statusFilter}
          onChange={setStatusFilter}
          minWidth="170px"
          options={[
            { value: 'all', label: 'All levels' },
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
        />
      </div>

      {mode === 'assign' && (
        <div className="al-info-banner">
          Select an access level below, then assign or remove people. Changes automatically synchronize face, card, PIN and fingerprint credentials with its controllers.
        </div>
      )}

      {error && <div className="acs-error">{error}</div>}

      {mode === 'manage' && showForm && (
        <LevelForm
          initial={editLv}
          devices={devices}
          onSave={handleSave}
          onCancel={()=>{ setShowForm(false); setEditLv(null); }}
          saving={saving}
        />
      )}

      {loading ? (
        <div style={{ textAlign:'center',padding:60,color:'var(--muted)' }}>Loading…</div>
      ) : levels.length === 0 && !showForm ? (
        <div style={{ textAlign:'center',padding:60,color:'var(--muted)',display:'flex',
                      flexDirection:'column',alignItems:'center',gap:12 }}>
          <Shield size={48} style={{ opacity:.15 }}/>
          <p>No access levels yet. Create one to define door access groups.</p>
          {isAdmin && mode === 'manage' && (
            <button onClick={()=>setShowForm(true)} className="save-btn">
              <Plus size={14}/> Create First Level
            </button>
          )}
        </div>
      ) : (
        <div style={{ display:'flex',flexDirection:'column',gap:10 }}>
          {visibleLevels.map(lv => (
            <LevelCard
              key={lv.id}
              level={lv}
              devices={devices}
              token={token}
              onEdit={openEdit}
              onDelete={handleDelete}
              onClone={handleClone}
              onDeploy={handleDeploy}
              onRefresh={load}
              manageMembers={mode === 'assign'}
              canConfigure={mode === 'manage' && isAdmin}
              canAssign={mode === 'assign' && isAdmin}
            />
          ))}
          {visibleLevels.length === 0 && (
            <div className="al-empty">No access levels match the current filter.</div>
          )}
        </div>
      )}

      {confirmModal && (
        <ConfirmDialog
          message={confirmModal.message}
          danger={confirmModal.danger}
          onConfirm={() => { setConfirmModal(null); confirmModal.resolve(true); }}
          onCancel={() => { setConfirmModal(null); confirmModal.resolve(false); }}
        />
      )}
      {promptModal && (
        <PromptModal
          title={promptModal.title}
          defaultValue={promptModal.defaultValue}
          onConfirm={v => { setPromptModal(null); promptModal.resolve(v); }}
          onCancel={() => { setPromptModal(null); promptModal.resolve(null); }}
        />
      )}
    </div>
  );
}

const INPUT_S = { padding:'8px 10px',borderRadius:7,border:'1px solid var(--border)',fontSize:13,
  background:'var(--bg)',color:'var(--text)',width:'100%' };
const LBL = { fontSize:12,fontWeight:500,color:'var(--text-soft)',display:'flex',flexDirection:'column',gap:4 };
