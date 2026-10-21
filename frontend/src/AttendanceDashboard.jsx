// AttendanceDashboard.jsx — Professional attendance management panel

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Users, Clock, CheckCircle, XCircle, AlertCircle, CalendarDays,
  ChevronLeft, ChevronRight, Download, RefreshCw, Edit2, QrCode,
  UserCheck, UserX, LogIn, LogOut, Coffee, Sun, Moon, Briefcase,
  Search, Settings2, ClipboardList,
} from 'lucide-react';
import { apiFetch } from './apiClient';
import { API } from './apiConfig';
import AttendanceRulesPanel from './AttendanceRulesPanel';
import AttendanceAdmin from './AttendanceAdmin';

// ── helpers ──────────────────────────────────────────────────────────────────

const STATUS_META = {
  present:    { label: 'Present',     color: '#065f46', bg: '#d1fae5', Icon: CheckCircle },
  late:       { label: 'Late',        color: '#92400e', bg: '#fef3c7', Icon: Clock       },
  absent:     { label: 'Absent',      color: '#991b1b', bg: '#fee2e2', Icon: XCircle     },
  early_exit: { label: 'Early Exit',  color: '#1e40af', bg: '#dbeafe', Icon: LogOut      },
  half_day:   { label: 'Half Day',    color: '#5b21b6', bg: '#ede9fe', Icon: Coffee      },
  weekend:    { label: 'Weekend',     color: '#64748b', bg: '#f1f5f9', Icon: Sun         },
  holiday:    { label: 'Holiday',     color: '#0f766e', bg: '#ccfbf1', Icon: Moon        },
  manual:     { label: 'Manual',      color: '#6b21a8', bg: '#f5f3ff', Icon: Edit2       },
};

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, color: '#64748b', bg: '#f1f5f9', Icon: AlertCircle };
  const { label, color, bg, Icon } = m;
  return (
    <span style={{ background: bg, color, borderRadius: 6, padding: '2px 10px',
                   fontSize: 11, fontWeight: 700, display:'inline-flex', alignItems:'center', gap:4 }}>
      <Icon size={11} /> {label}
    </span>
  );
}

function fmtTime(v) {
  if (!v) return '—';
  return new Date(v).toLocaleString('en-US', {
    timeZone: 'Asia/Yerevan', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}
function fmtDate(v) {
  if (!v) return '—';
  return new Date(v).toLocaleString('en-US', {
    timeZone: 'Asia/Yerevan', year:'numeric', month:'2-digit', day:'2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}
function todayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Yerevan' });
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ Icon, label, value, color, bg, onClick }) {
  return (
    <div onClick={onClick}
         style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 12,
                  padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14,
                  flex: 1, minWidth: 120, cursor: onClick ? 'pointer' : 'default',
                  transition: 'box-shadow .15s' }}
         className="attd-stat-card">
      <div style={{ width: 40, height: 40, borderRadius: 10, background: bg, color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={20} />
      </div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', lineHeight: 1.1 }}>{value}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>{label}</div>
      </div>
    </div>
  );
}

// ── QR Modal ──────────────────────────────────────────────────────────────────

function QrModal({ person, onClose }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;
    apiFetch(`/api/attd/qr/${person.person_id}`)
      .then(response => {
        if (!response.ok) throw new Error(`QR request failed (${response.status})`);
        return response.blob();
      })
      .then(blob => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [person.person_id]);

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', display:'flex',
                  alignItems:'center', justifyContent:'center', zIndex:9999 }}
         onClick={onClose}>
      <div style={{ background:'var(--card)', borderRadius:16, padding:28, textAlign:'center',
                    minWidth:260 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight:700, fontSize:15, marginBottom:8 }}>{person.person_name}</div>
        <div style={{ fontSize:12, color:'var(--muted)', marginBottom:16 }}>Scan to check-in / check-out</div>
        {src ? <img src={src} style={{ width:200, height:200 }} alt="QR" />
              : <div style={{ width:200, height:200, background:'#f1f5f9', borderRadius:8,
                              display:'flex', alignItems:'center', justifyContent:'center',
                              color:'var(--muted)', fontSize:12 }}>Loading…</div>}
        <div style={{ marginTop:12, display:'flex', gap:10, justifyContent:'center' }}>
          {src && <a href={src} download={`qr_${person.person_id}.png`}
                     style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'6px 14px',
                              borderRadius:7, background:'var(--primary)', color:'#fff',
                              fontSize:12, fontWeight:600, textDecoration:'none' }}>
                    <Download size={13} /> Save PNG
                  </a>}
          <button onClick={onClose}
                  style={{ padding:'6px 14px', borderRadius:7, border:'1px solid var(--border)',
                           background:'transparent', fontSize:12, cursor:'pointer' }}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Manual check-in modal ─────────────────────────────────────────────────────

function ManualModal({ person, date, onClose, onSaved }) {
  const [action,  setAction]  = useState('check_in');
  const [time,    setTime]    = useState('');
  const [note,    setNote]    = useState('');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  const save = async () => {
    setSaving(true); setError('');
    try {
      const res = await apiFetch('/api/attd/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: person.person_id, work_date: date, action, time: time || undefined, note }),
      });
      if (!res.ok) { const d = await res.json().catch(()=>({})); setError(d.detail || 'Save failed'); return; }
      onSaved();
      onClose();
    } finally { setSaving(false); }
  };

  const ACTIONS = [
    { v:'check_in',  l:'Check In'    },
    { v:'check_out', l:'Check Out'   },
    { v:'absent',    l:'Mark Absent' },
    { v:'holiday',   l:'Holiday'     },
    { v:'present',   l:'Mark Present'},
  ];

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.45)', display:'flex',
                  alignItems:'center', justifyContent:'center', zIndex:9999 }} onClick={onClose}>
      <div style={{ background:'var(--card)', borderRadius:16, padding:28, minWidth:320, maxWidth:380 }}
           onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight:700, fontSize:15, marginBottom:4 }}>Manual Attendance</div>
        <div style={{ fontSize:12, color:'var(--muted)', marginBottom:18 }}>
          {person.person_name} · {date}
        </div>
        {error && <div style={{ background:'#fee2e2', color:'#991b1b', borderRadius:8,
                                padding:'8px 12px', fontSize:12, marginBottom:12 }}>{error}</div>}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <label style={{ fontSize:12, fontWeight:500, color:'var(--text-soft)' }}>
            Action
            <select value={action} onChange={e => setAction(e.target.value)}
                    style={{ display:'block', width:'100%', marginTop:4, padding:'8px 10px',
                             borderRadius:7, border:'1px solid var(--border)', fontSize:13,
                             background:'var(--bg)' }}>
              {ACTIONS.map(a => <option key={a.v} value={a.v}>{a.l}</option>)}
            </select>
          </label>
          {['check_in','check_out'].includes(action) && (
            <label style={{ fontSize:12, fontWeight:500, color:'var(--text-soft)' }}>
              Time (Yerevan, HH:MM) — leave blank for now
              <input type="time" value={time} onChange={e => setTime(e.target.value)}
                     style={{ display:'block', width:'100%', marginTop:4, padding:'8px 10px',
                              borderRadius:7, border:'1px solid var(--border)', fontSize:13,
                              background:'var(--bg)' }} />
            </label>
          )}
          <label style={{ fontSize:12, fontWeight:500, color:'var(--text-soft)' }}>
            Note (optional)
            <input value={note} onChange={e => setNote(e.target.value)}
                   placeholder="Reason, comment…"
                   style={{ display:'block', width:'100%', marginTop:4, padding:'8px 10px',
                            borderRadius:7, border:'1px solid var(--border)', fontSize:13,
                            background:'var(--bg)' }} />
          </label>
        </div>
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
          <button onClick={onClose} disabled={saving}
                  style={{ padding:'7px 16px', borderRadius:7, border:'1px solid var(--border)',
                           background:'transparent', fontSize:13, cursor:'pointer' }}>Cancel</button>
          <button onClick={save} disabled={saving}
                  style={{ padding:'7px 16px', borderRadius:7, border:'none',
                           background:'var(--primary)', color:'#fff', fontSize:13,
                           fontWeight:600, cursor:'pointer' }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function AttendanceDashboard({ token, isAdmin, canOperate }) {
  const [selDate,   setSelDate]   = useState(todayStr());
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [filter,    setFilter]    = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [search,    setSearch]    = useState('');
  const [qrPerson,  setQrPerson]  = useState(null);
  const [manPerson, setManPerson] = useState(null);
  const [view,      setView]      = useState('today'); // 'today' | 'history' | 'rules'
  const [histRecords, setHistRecords] = useState([]);
  const [histFrom,  setHistFrom]  = useState(todayStr());
  const [histTo,    setHistTo]    = useState(todayStr());
  const [histLoading, setHistLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = selDate === todayStr()
        ? '/api/attd/today'
        : `/api/attd/report/${selDate}`;
      const res = await apiFetch(endpoint);
      if (res.ok) setData(await res.json());
    } finally { setLoading(false); }
  }, [selDate]);

  useEffect(() => { if (view === 'today') load(); }, [load, view]);

  const loadHistory = useCallback(async () => {
    setHistLoading(true);
    try {
      const res = await apiFetch(
        `/api/attd/records?date_from=${histFrom}&date_to=${histTo}&limit=500`,
      );
      if (res.ok) setHistRecords(await res.json());
    } finally { setHistLoading(false); }
  }, [histFrom, histTo]);

  useEffect(() => { if (view === 'history') loadHistory(); }, [loadHistory, view]);

  const exportHistory = () => {
    const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const rows = [
      ['Date', 'Employee', 'Department', 'Status', 'Check In', 'Check Out', 'Work Hours', 'Note'],
      ...histRecords.map(record => [
        record.work_date, record.person_name, record.department, record.status,
        record.check_in_at || '', record.check_out_at || '', record.work_hours || '', record.note || '',
      ]),
    ];
    const blob = new Blob([rows.map(row => row.map(escape).join(',')).join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `attendance_${histFrom}_${histTo}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const shiftDate = (n) => {
    const d = new Date(selDate + 'T12:00:00');
    d.setDate(d.getDate() + n);
    setSelDate(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Yerevan' }));
  };

  const records   = data?.records || [];
  const summary   = data?.summary || {};
  const filtered  = records.filter(r => {
    if (filter !== 'all' && r.status !== filter) return false;
    if (departmentFilter !== 'all' && (r.department || '') !== departmentFilter) return false;
    if (search && !r.person_name?.toLowerCase().includes(search.toLowerCase()) &&
                  !r.department?.toLowerCase().includes(search.toLowerCase()) &&
                  !r.card_number?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const departments = [...new Set(records.map(record => record.department).filter(Boolean))].sort();
  const authFetch = apiFetch;

  return (
    <div className="attd-page">
      {/* View tabs */}
      <div className="attd-nav">
        <button className={view === 'today' ? 'active' : ''} onClick={() => setView('today')}>
          <CalendarDays size={15} /> Time & Attendance Overview
        </button>
        <button className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}>
          <ClipboardList size={15} /> Attendance Records
        </button>
        <button className={view === 'rules' ? 'active' : ''} onClick={() => setView('rules')}>
          <Settings2 size={15} /> Work Rules
        </button>
        <button className={view === 'groups' ? 'active' : ''} onClick={() => setView('groups')}>
          <Users size={15} /> Attendance Groups
        </button>
        <button className={view === 'shifts' ? 'active' : ''} onClick={() => setView('shifts')}>
          <Clock size={15} /> Shifts
        </button>
        <button className={view === 'schedules' ? 'active' : ''} onClick={() => setView('schedules')}>
          <Briefcase size={15} /> Schedule
        </button>
        <button className={view === 'requests' ? 'active' : ''} onClick={() => setView('requests')}>
          <Edit2 size={15} /> Requests
        </button>
        <button className={view === 'calculation' ? 'active' : ''} onClick={() => setView('calculation')}>
          <CheckCircle size={15} /> Calculation
        </button>
      </div>

      {view === 'today' && <>
        {/* Date navigation */}
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={() => shiftDate(-1)} style={{ padding:'6px 10px', borderRadius:7,
                  border:'1px solid var(--border)', background:'var(--card)', cursor:'pointer' }}>
            <ChevronLeft size={16} />
          </button>
          <input type="date" value={selDate} onChange={e => setSelDate(e.target.value)}
                 style={{ padding:'7px 12px', borderRadius:8, border:'1px solid var(--border)',
                          fontSize:13, background:'var(--card)', color:'var(--text)', fontWeight:600 }} />
          <button onClick={() => shiftDate(1)} style={{ padding:'6px 10px', borderRadius:7,
                  border:'1px solid var(--border)', background:'var(--card)', cursor:'pointer' }}>
            <ChevronRight size={16} />
          </button>
          {selDate !== todayStr() && (
            <button onClick={() => setSelDate(todayStr())}
                    style={{ padding:'6px 14px', borderRadius:7, border:'1px solid var(--primary)',
                             color:'var(--primary)', background:'transparent', fontSize:12,
                             fontWeight:600, cursor:'pointer' }}>Today</button>
          )}
          <button onClick={load} disabled={loading} style={{ marginLeft:'auto', padding:'6px 14px',
                  borderRadius:7, border:'1px solid var(--border)', background:'var(--card)',
                  fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:5 }}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
          </button>
        </div>

        {/* Summary stat cards */}
        {data && (
          <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
            <StatCard Icon={Users}       label="Total Employees" value={data.total || 0}
                      color="#1d4ed8" bg="#dbeafe" onClick={() => setFilter('all')} />
            <StatCard Icon={CheckCircle} label="Present"   value={(summary.present||0)+(summary.late||0)}
                      color="#065f46" bg="#d1fae5" onClick={() => setFilter('present')} />
            <StatCard Icon={XCircle}     label="Absent"    value={summary.absent||0}
                      color="#991b1b" bg="#fee2e2" onClick={() => setFilter('absent')} />
            <StatCard Icon={Clock}       label="Late"      value={summary.late||0}
                      color="#92400e" bg="#fef3c7" onClick={() => setFilter('late')} />
            <StatCard Icon={LogOut}      label="Early Exit" value={summary.early_exit||0}
                      color="#1e40af" bg="#dbeafe" onClick={() => setFilter('early_exit')} />
            <StatCard Icon={Coffee}      label="Half Day"  value={summary.half_day||0}
                      color="#5b21b6" bg="#ede9fe" onClick={() => setFilter('half_day')} />
          </div>
        )}

        {/* Filter + search */}
        <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
          <div style={{ position:'relative' }}>
            <Search size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)',
                                       color:'var(--muted)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)}
                   placeholder="Search by name, department, card…"
                   style={{ paddingLeft:30, padding:'7px 12px 7px 30px', borderRadius:8,
                            border:'1px solid var(--border)', fontSize:13, width:260,
                            background:'var(--card)', color:'var(--text)' }} />
          </div>
          <select
            value={departmentFilter}
            onChange={event => setDepartmentFilter(event.target.value)}
            className="attd-department-filter"
          >
            <option value="all">All Departments</option>
            {departments.map(department => (
              <option key={department} value={department}>{department}</option>
            ))}
          </select>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {['all','present','late','absent','early_exit','half_day'].map(s => (
              <button key={s} onClick={() => setFilter(s)}
                      style={{ padding:'5px 12px', borderRadius:20, fontSize:11, fontWeight:600,
                               border: filter===s ? 'none' : '1px solid var(--border)',
                               background: filter===s ? (STATUS_META[s]?.bg||'var(--primary)') : 'transparent',
                               color: filter===s ? (STATUS_META[s]?.color||'#fff') : 'var(--muted)',
                               cursor:'pointer' }}>
                {s === 'all' ? 'All' : STATUS_META[s]?.label || s}
              </button>
            ))}
          </div>
        </div>

        {/* Records table */}
        {loading ? (
          <div style={{ textAlign:'center', padding:40, color:'var(--muted)' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:40, color:'var(--muted)' }}>No records found.</div>
        ) : (
          <div style={{ overflowX:'auto', background:'var(--card)', borderRadius:12,
                        border:'1px solid var(--border)' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'var(--bg)' }}>
                  <th style={TH}>Employee</th>
                  <th style={TH}>Department</th>
                  <th style={TH}>Card #</th>
                  <th style={TH}>Status</th>
                  <th style={TH}>Check-In</th>
                  <th style={TH}>Check-Out</th>
                  <th style={TH}>Work Hours</th>
                  <th style={TH}>Note</th>
                  {(isAdmin || canOperate) && <th style={TH}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.person_id} style={{ borderBottom:'1px solid var(--border-soft)',
                                                 background: i%2===0 ? 'transparent' : 'var(--bg)' }}>
                    <td style={TD}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        {r.preview_image && (
                          <img src={r.preview_image} alt=""
                               style={{ width:30, height:30, borderRadius:'50%', objectFit:'cover',
                                        border:'1px solid var(--border)', flexShrink:0 }} />
                        )}
                        <span style={{ fontWeight:600 }}>{r.person_name || '—'}</span>
                      </div>
                    </td>
                    <td style={{ ...TD, color:'var(--muted)' }}>{r.department || '—'}</td>
                    <td style={{ ...TD, fontFamily:'monospace', fontSize:11, color:'var(--muted)' }}>
                      {r.card_number || '—'}
                    </td>
                    <td style={TD}><StatusBadge status={r.status} /></td>
                    <td style={{ ...TD, color: r.check_in_at ? 'var(--text)' : 'var(--muted)' }}>
                      {fmtTime(r.check_in_at)}
                    </td>
                    <td style={{ ...TD, color: r.check_out_at ? 'var(--text)' : 'var(--muted)' }}>
                      {fmtTime(r.check_out_at)}
                    </td>
                    <td style={{ ...TD, fontWeight:600, color: r.work_hours ? 'var(--text)' : 'var(--muted)' }}>
                      {r.work_hours || (r.check_in_at && !r.check_out_at ? 'In progress' : '—')}
                    </td>
                    <td style={{ ...TD, color:'var(--muted)', fontSize:11 }}>
                      {r.is_manual ? <span style={{ color:'#7c3aed' }}>✎ </span> : ''}{r.note || ''}
                    </td>
                    {(isAdmin || canOperate) && (
                      <td style={TD}>
                        <div style={{ display:'flex', gap:4 }}>
                          <button title="Manual adjust" onClick={() => setManPerson(r)}
                                  style={ICON_BTN}><Edit2 size={13} /></button>
                          <button title="Show QR" onClick={() => setQrPerson(r)}
                                  style={ICON_BTN}><QrCode size={13} /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>}

      {view === 'history' && <>
        {/* History date range */}
        <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <label style={{ fontSize:12, fontWeight:500, color:'var(--text-soft)', display:'flex', alignItems:'center', gap:6 }}>
            From <input type="date" value={histFrom} onChange={e => setHistFrom(e.target.value)}
                        style={DATE_IN} />
          </label>
          <label style={{ fontSize:12, fontWeight:500, color:'var(--text-soft)', display:'flex', alignItems:'center', gap:6 }}>
            To <input type="date" value={histTo} onChange={e => setHistTo(e.target.value)}
                      style={DATE_IN} />
          </label>
          <button onClick={loadHistory} disabled={histLoading}
                  style={{ padding:'7px 16px', borderRadius:8, border:'none', background:'var(--primary)',
                           color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer',
                           display:'flex', alignItems:'center', gap:5 }}>
            <RefreshCw size={13} className={histLoading ? 'spin' : ''} /> Load
          </button>
          <button onClick={exportHistory} disabled={!histRecords.length} className="ghost-btn">
            <Download size={13} /> Export CSV
          </button>
        </div>

        {histLoading ? (
          <div style={{ textAlign:'center', padding:40, color:'var(--muted)' }}>Loading…</div>
        ) : histRecords.length === 0 ? (
          <div style={{ textAlign:'center', padding:40, color:'var(--muted)' }}>No records for this range.</div>
        ) : (
          <div style={{ overflowX:'auto', background:'var(--card)', borderRadius:12,
                        border:'1px solid var(--border)' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'var(--bg)' }}>
                  <th style={TH}>Date</th>
                  <th style={TH}>Employee</th>
                  <th style={TH}>Department</th>
                  <th style={TH}>Status</th>
                  <th style={TH}>Check-In</th>
                  <th style={TH}>Check-Out</th>
                  <th style={TH}>Work Hours</th>
                  <th style={TH}>Note</th>
                </tr>
              </thead>
              <tbody>
                {histRecords.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom:'1px solid var(--border-soft)',
                                          background: i%2===0 ? 'transparent' : 'var(--bg)' }}>
                    <td style={{ ...TD, fontWeight:600 }}>{r.work_date}</td>
                    <td style={TD}><span style={{ fontWeight:600 }}>{r.person_name || '—'}</span></td>
                    <td style={{ ...TD, color:'var(--muted)' }}>{r.department || '—'}</td>
                    <td style={TD}><StatusBadge status={r.status} /></td>
                    <td style={TD}>{fmtTime(r.check_in_at)}</td>
                    <td style={TD}>{fmtTime(r.check_out_at)}</td>
                    <td style={{ ...TD, fontWeight:600 }}>{r.work_hours || '—'}</td>
                    <td style={{ ...TD, color:'var(--muted)', fontSize:11 }}>
                      {r.is_manual ? <span style={{ color:'#7c3aed' }}>✎ </span> : ''}{r.note || ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </>}

      {view === 'rules' && (
        <AttendanceRulesPanel authFetch={authFetch} API={API} isAdmin={isAdmin} />
      )}

      {['groups', 'shifts', 'schedules', 'requests', 'calculation'].includes(view) && (
        <AttendanceAdmin token={token} section={view} isAdmin={isAdmin} />
      )}

      {/* Modals */}
      {qrPerson  && <QrModal person={qrPerson} onClose={() => setQrPerson(null)} />}
      {manPerson && <ManualModal person={manPerson} date={selDate}
                                 onClose={() => setManPerson(null)} onSaved={load} />}
    </div>
  );
}

// styles
const TH = { padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:700,
             color:'var(--muted)', textTransform:'uppercase', letterSpacing:.5,
             borderBottom:'1px solid var(--border)' };
const TD = { padding:'10px 14px', verticalAlign:'middle' };
const ICON_BTN = { padding:'4px 6px', borderRadius:6, border:'1px solid var(--border)',
                   background:'transparent', cursor:'pointer', display:'inline-flex',
                   alignItems:'center', color:'var(--muted)' };
const DATE_IN  = { padding:'7px 10px', borderRadius:7, border:'1px solid var(--border)',
                   fontSize:13, background:'var(--card)', color:'var(--text)' };
