// AttendanceRulesPanel.jsx - Work schedule rules + daily attendance report

import React, { useEffect, useState } from 'react';
import { Clock, Plus, Trash2, RefreshCw, CheckCircle2, XCircle, AlertTriangle, Minus, Edit3, X } from 'lucide-react';

const DAY_LABELS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const STATUS_CONFIG = {
  present:    { label: 'Present',    color: 'var(--success)', icon: <CheckCircle2 size={12} /> },
  late:       { label: 'Late',       color: 'var(--warning)', icon: <AlertTriangle size={12} /> },
  absent:     { label: 'Absent',     color: 'var(--danger)',  icon: <XCircle size={12} /> },
  left_early: { label: 'Left Early', color: '#8b5cf6',        icon: <Minus size={12} /> },
  weekend:    { label: 'Weekend',    color: 'var(--muted)',   icon: null },
};

function formatTime(isoStr) {
  if (!isoStr) return '-';
  return new Date(isoStr).toLocaleTimeString('en-US', {
    timeZone: 'Asia/Yerevan', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

export default function AttendanceRulesPanel({ authFetch, API, isAdmin }) {
  const [rules, setRules]         = useState([]);
  const [report, setReport]       = useState(null);
  const [reportDate, setReportDate] = useState(new Date().toISOString().slice(0, 10));
  const [loadingReport, setLoadingReport] = useState(false);
  const [showForm, setShowForm]   = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [editForm, setEditForm]   = useState(null);
  const [form, setForm]           = useState({
    name: 'Default Schedule', work_start: '09:00', work_end: '18:00',
    grace_minutes: 15, work_days: [1,2,3,4,5],
  });

  const loadRules = async () => {
    const res = await authFetch(API + '/api/attendance/rules');
    if (res.ok) setRules(await res.json());
  };

  const loadReport = async () => {
    setLoadingReport(true);
    try {
      const res = await authFetch(API + `/api/attendance/daily-report?report_date=${reportDate}`);
      if (res.ok) setReport(await res.json());
    } finally { setLoadingReport(false); }
  };

  useEffect(() => { loadRules(); loadReport(); }, []);

  const saveRule = async () => {
    const res = await authFetch(API + '/api/attendance/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) { setShowForm(false); loadRules(); }
  };

  const deleteRule = async (id) => {
    await authFetch(API + `/api/attendance/rules/${id}`, { method: 'DELETE' });
    loadRules();
  };

  const toggleDay = (d) => {
    setForm(f => ({
      ...f,
      work_days: f.work_days.includes(d)
        ? f.work_days.filter(x => x !== d)
        : [...f.work_days, d].sort(),
    }));
  };

  const startEditRule = (r) => {
    setEditingRule(r.id);
    setEditForm({ name: r.name, work_start: r.work_start, work_end: r.work_end, grace_minutes: r.grace_minutes, work_days: [...r.work_days] });
    setShowForm(false);
  };

  const toggleEditDay = (d) => {
    setEditForm(f => ({
      ...f,
      work_days: f.work_days.includes(d)
        ? f.work_days.filter(x => x !== d)
        : [...f.work_days, d].sort(),
    }));
  };

  const saveEditRule = async () => {
    const res = await authFetch(API + `/api/attendance/rules/${editingRule}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    if (res.ok) { setEditingRule(null); setEditForm(null); loadRules(); }
  };

  return (
    <div className="attendance-rules-panel">
      {/* Rules section */}
      <div className="card">
        <div className="card-title-row">
          <h3><Clock size={14} /> Work Schedule Rules</h3>
          {isAdmin && (
            <button className="btn-sm" onClick={() => setShowForm(v => !v)}>
              <Plus size={12} /> New Rule
            </button>
          )}
        </div>

        {showForm && isAdmin && (
          <div className="rule-form">
            <div className="rule-form-row">
              <label>Name</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="rule-form-row">
              <label>Work Start</label>
              <input type="time" value={form.work_start} onChange={e => setForm(f => ({ ...f, work_start: e.target.value }))} />
            </div>
            <div className="rule-form-row">
              <label>Work End</label>
              <input type="time" value={form.work_end} onChange={e => setForm(f => ({ ...f, work_end: e.target.value }))} />
            </div>
            <div className="rule-form-row">
              <label>Grace (min)</label>
              <input type="number" min="0" max="120" value={form.grace_minutes}
                onChange={e => setForm(f => ({ ...f, grace_minutes: parseInt(e.target.value) || 0 }))} />
            </div>
            <div className="rule-form-row">
              <label>Work Days</label>
              <div className="rule-days">
                {[1,2,3,4,5,6,7].map(d => (
                  <button key={d}
                    className={`rule-day-btn ${form.work_days.includes(d) ? 'active' : ''}`}
                    onClick={() => toggleDay(d)}
                  >{DAY_LABELS[d]}</button>
                ))}
              </div>
            </div>
            <div className="rule-form-actions">
              <button className="save-btn" onClick={saveRule}>Save</button>
              <button className="ghost-btn" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </div>
        )}

        {rules.length === 0 ? (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>No rules yet. Create one to enable daily reports.</p>
        ) : (
          <div className="rules-list">
            {rules.map(r => (
              <div key={r.id} className="rule-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                {editingRule === r.id && editForm ? (
                  <div className="rule-form" style={{ marginTop: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <b style={{ fontSize: 13 }}>Edit Rule</b>
                      <button className="icon-btn" onClick={() => setEditingRule(null)}><X size={13} /></button>
                    </div>
                    <div className="rule-form-row">
                      <label>Name</label>
                      <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                    </div>
                    <div className="rule-form-row">
                      <label>Work Start</label>
                      <input type="time" value={editForm.work_start} onChange={e => setEditForm(f => ({ ...f, work_start: e.target.value }))} />
                    </div>
                    <div className="rule-form-row">
                      <label>Work End</label>
                      <input type="time" value={editForm.work_end} onChange={e => setEditForm(f => ({ ...f, work_end: e.target.value }))} />
                    </div>
                    <div className="rule-form-row">
                      <label>Grace (min)</label>
                      <input type="number" min="0" max="120" value={editForm.grace_minutes} onChange={e => setEditForm(f => ({ ...f, grace_minutes: parseInt(e.target.value) || 0 }))} />
                    </div>
                    <div className="rule-form-row">
                      <label>Work Days</label>
                      <div className="rule-days">
                        {[1,2,3,4,5,6,7].map(d => (
                          <button key={d} className={`rule-day-btn ${editForm.work_days.includes(d) ? 'active' : ''}`} onClick={() => toggleEditDay(d)}>{DAY_LABELS[d]}</button>
                        ))}
                      </div>
                    </div>
                    <div className="rule-form-actions">
                      <button className="save-btn" onClick={saveEditRule}>Save</button>
                      <button className="ghost-btn" onClick={() => setEditingRule(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <b>{r.name}</b>
                      <span style={{ color: 'var(--muted)', fontSize: 12, marginLeft: 8 }}>
                        {r.work_start}-{r.work_end} - Grace {r.grace_minutes}min
                        - {r.work_days.map(d => DAY_LABELS[d]).join(', ')}
                      </span>
                    </div>
                    {isAdmin && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="icon-btn" title="Edit rule" onClick={() => startEditRule(r)}><Edit3 size={13} /></button>
                        <button className="icon-btn danger" title="Delete rule" onClick={() => deleteRule(r.id)}><Trash2 size={13} /></button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Daily report */}
      <div className="card">
        <div className="card-title-row">
          <h3>Daily Attendance Report</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="date" value={reportDate}
              onChange={e => setReportDate(e.target.value)} className="date-input-sm" />
            <button className="btn-sm" onClick={loadReport} disabled={loadingReport}>
              <RefreshCw size={12} className={loadingReport ? 'spinning' : ''} /> Refresh
            </button>
          </div>
        </div>

        {report && (
          <>
            <div className="report-summary">
              {Object.entries(report.summary).map(([k, v]) => (
                <div key={k} className={`report-badge report-badge-${k}`}>
                  {STATUS_CONFIG[k]?.icon}
                  <span>{v} {STATUS_CONFIG[k]?.label || k}</span>
                </div>
              ))}
            </div>

            {report.rows.length === 0 ? (
              <p style={{ color: 'var(--muted)', fontSize: 13 }}>No employees registered.</p>
            ) : (
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Department</th>
                    <th>Status</th>
                    <th>First In</th>
                    <th>Last Event</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map(row => {
                    const sc = STATUS_CONFIG[row.status] || STATUS_CONFIG.present;
                    return (
                      <tr key={row.person_id}>
                        <td>{row.full_name}</td>
                        <td style={{ color: 'var(--muted)' }}>{row.department || '-'}</td>
                        <td>
                          <span className={`status-badge status-${row.status}`} style={{ color: sc.color }}>
                            {sc.icon} {sc.label}
                          </span>
                        </td>
                        <td>{formatTime(row.first_in)}</td>
                        <td>{formatTime(row.last_event)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}
