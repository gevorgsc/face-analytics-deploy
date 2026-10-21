import { apiFetch } from './apiClient';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check, Clock3, Plus, RefreshCw, Trash2, Users, X,
} from 'lucide-react';
import { API } from './apiConfig';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Yerevan' });

function Modal({ title, children, onClose }) {
  return (
    <div className="pm-dialog-overlay" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="attd-admin-modal">
        <div className="pm-dialog-header">
          <strong>{title}</strong>
          <button className="pm-dialog-close" onClick={onClose}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function AttendanceAdmin({ token, section, isAdmin }) {
  const [shifts, setShifts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [requests, setRequests] = useState([]);
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [summary, setSummary] = useState(null);
  const [range, setRange] = useState({ date_from: `${today().slice(0, 7)}-01`, date_to: today() });

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }), [token]);

  const api = useCallback(async (path, options = {}) => {
    const response = await apiFetch(`${API}/api/attd${path}`, {
      ...options,
      headers: { ...headers, ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || `HTTP ${response.status}`);
    return data;
  }, [headers]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (section === 'shifts') setShifts(await api('/shifts'));
      if (section === 'groups') {
        const [groupRows, shiftRows] = await Promise.all([api('/groups'), api('/shifts')]);
        setGroups(groupRows); setShifts(shiftRows);
      }
      if (section === 'schedules') {
        const [scheduleRows, groupRows, shiftRows, personRows] = await Promise.all([
          api('/schedules'), api('/groups'), api('/shifts'), api('/people'),
        ]);
        setSchedules(scheduleRows); setGroups(groupRows); setShifts(shiftRows); setPeople(personRows);
      }
      if (section === 'requests') {
        const [requestRows, personRows] = await Promise.all([api('/requests'), api('/people')]);
        setRequests(requestRows); setPeople(personRows);
      }
      if (section === 'calculation') {
        setSummary(await api(`/calculation-summary?date_from=${range.date_from}&date_to=${range.date_to}`));
      }
    } catch (requestError) {
      setError(String(requestError.message || requestError));
    } finally {
      setLoading(false);
    }
  }, [api, range.date_from, range.date_to, section]);

  useEffect(() => { load(); }, [load]);

  const submit = async (path, payload) => {
    try {
      await api(path, { method: 'POST', body: JSON.stringify(payload) });
      setModal(null);
      load();
    } catch (requestError) {
      setError(String(requestError.message || requestError));
    }
  };

  const remove = async path => {
    if (!window.confirm('Delete this item?')) return;
    try {
      await api(path, { method: 'DELETE' });
      load();
    } catch (requestError) {
      setError(String(requestError.message || requestError));
    }
  };

  const review = async (id, decision) => {
    await submit(`/requests/${id}/review`, { decision });
  };

  const recalculate = async () => {
    try {
      setLoading(true);
      await api('/recalculate', { method: 'POST', body: JSON.stringify(range) });
      await load();
    } catch (requestError) {
      setError(String(requestError.message || requestError));
      setLoading(false);
    }
  };

  return (
    <div className="attd-admin">
      <div className="attd-admin-head">
        <div>
          <strong>{section[0].toUpperCase() + section.slice(1)}</strong>
          <span>Time and attendance configuration</span>
        </div>
        <div>
          <button className="ghost-btn" onClick={load}><RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh</button>
          {section !== 'calculation' && (isAdmin || section === 'requests') && (
            <button className="save-btn" onClick={() => setModal(section)}><Plus size={13} /> Add</button>
          )}
        </div>
      </div>
      {error && <div className="acs-error">{error}</div>}

      {section === 'shifts' && (
        <div className="attd-config-grid">
          {shifts.map(shift => (
            <article key={shift.id} className="attd-config-card">
              <div><Clock3 size={17} /><strong>{shift.name}</strong></div>
              <p>{shift.work_start} - {shift.work_end} · Break {shift.break_minutes} min</p>
              <p>Grace {shift.grace_minutes} min · Minimum {shift.minimum_minutes} min</p>
              <div className="attd-day-list">{DAYS.map((day, index) => <span className={shift.work_days.includes(index + 1) ? 'active' : ''} key={day}>{day}</span>)}</div>
              {isAdmin && <button className="icon-btn danger" onClick={() => remove(`/shifts/${shift.id}`)}><Trash2 size={13} /></button>}
            </article>
          ))}
        </div>
      )}

      {section === 'groups' && (
        <div className="attd-config-grid">
          {groups.map(group => (
            <article key={group.id} className="attd-config-card" style={{ borderTopColor: group.color }}>
              <div><Users size={17} /><strong>{group.name}</strong></div>
              <p>{group.description || 'No description'}</p>
              <p>Default shift: <b>{group.shift_name || 'Not assigned'}</b></p>
              <span className="attd-member-count">{group.member_count} scheduled people</span>
              {isAdmin && <button className="icon-btn danger" onClick={() => remove(`/groups/${group.id}`)}><Trash2 size={13} /></button>}
            </article>
          ))}
        </div>
      )}

      {section === 'schedules' && (
        <div className="attd-table-wrap"><table className="attd-table">
          <thead><tr><th>Person</th><th>Department</th><th>Group</th><th>Shift</th><th>Effective Period</th><th /></tr></thead>
          <tbody>{schedules.map(item => (
            <tr key={item.id}><td><b>{item.person_name}</b></td><td>{item.department || '-'}</td><td>{item.group_name || '-'}</td>
              <td>{item.shift_name}</td><td>{item.valid_from} - {item.valid_to || 'Open ended'}</td>
              <td>{isAdmin && <button className="icon-btn danger" onClick={() => remove(`/schedules/${item.id}`)}><Trash2 size={13} /></button>}</td></tr>
          ))}</tbody>
        </table></div>
      )}

      {section === 'requests' && (
        <div className="attd-table-wrap"><table className="attd-table">
          <thead><tr><th>Person</th><th>Type</th><th>Period</th><th>Details</th><th>Status</th><th>Review</th></tr></thead>
          <tbody>{requests.map(item => (
            <tr key={item.id}><td><b>{item.person_name}</b><small>{item.department}</small></td><td>{item.request_type}</td>
              <td>{item.date_from} - {item.date_to}</td><td>{item.reason || item.correction_in || '-'}</td>
              <td><span className={`attd-request-status ${item.status}`}>{item.status}</span></td>
              <td>{isAdmin && item.status === 'pending' && <div className="attd-review-actions">
                <button onClick={() => review(item.id, 'approved')}><Check size={12} /> Approve</button>
                <button className="reject" onClick={() => review(item.id, 'rejected')}><X size={12} /> Reject</button>
              </div>}</td></tr>
          ))}</tbody>
        </table></div>
      )}

      {section === 'calculation' && (
        <>
          <div className="attd-calc-filter">
            <input type="date" value={range.date_from} onChange={event => setRange(current => ({ ...current, date_from: event.target.value }))} />
            <span>to</span>
            <input type="date" value={range.date_to} onChange={event => setRange(current => ({ ...current, date_to: event.target.value }))} />
            <button className="save-btn" onClick={load}>Calculate</button>
            {isAdmin && <button className="ghost-btn" onClick={recalculate}>Recalculate Records</button>}
          </div>
          {summary && <div className="attd-calc-grid">
            <div><span>Attendance Records</span><strong>{summary.records}</strong></div>
            <div><span>Total Work Hours</span><strong>{summary.total_work_hours || '00:00'}</strong></div>
            <div><span>Pending Requests</span><strong>{summary.pending_requests}</strong></div>
            {Object.entries(summary.status_counts || {}).map(([status, count]) => <div key={status}><span>{status.replaceAll('_', ' ')}</span><strong>{count}</strong></div>)}
          </div>}
        </>
      )}

      {!loading && ['shifts', 'groups', 'schedules', 'requests'].includes(section)
        && ({ shifts, groups, schedules, requests }[section]?.length || 0) === 0
        && <div className="al-empty">{({
          shifts: 'No shifts configured yet.',
          groups: 'No groups configured yet.',
          schedules: 'No schedules configured yet.',
          requests: 'No requests configured yet.',
        })[section]}</div>}

      {modal === 'shifts' && <ShiftForm onClose={() => setModal(null)} onSave={payload => submit('/shifts', payload)} />}
      {modal === 'groups' && <GroupForm shifts={shifts} onClose={() => setModal(null)} onSave={payload => submit('/groups', payload)} />}
      {modal === 'schedules' && <ScheduleForm people={people} groups={groups} shifts={shifts} onClose={() => setModal(null)} onSave={payload => submit('/schedules', payload)} />}
      {modal === 'requests' && <RequestForm people={people} onClose={() => setModal(null)} onSave={payload => submit('/requests', payload)} />}
    </div>
  );
}

function ShiftForm({ onClose, onSave }) {
  const [form, setForm] = useState({ name: '', work_start: '09:00', work_end: '18:00', break_minutes: 60, grace_minutes: 15, minimum_minutes: 240, calculation_mode: 'first_last', overtime_enabled: false, overtime_after_minutes: 0, min_punch_interval: 2, work_days: [1,2,3,4,5] });
  const set = (key, value) => setForm(current => ({ ...current, [key]: value }));
  return <Modal title="New Shift" onClose={onClose}><div className="attd-form">
    <label>Name<input value={form.name} onChange={event => set('name', event.target.value)} /></label>
    <div className="attd-form-grid"><label>Start<input type="time" value={form.work_start} onChange={event => set('work_start', event.target.value)} /></label><label>End<input type="time" value={form.work_end} onChange={event => set('work_end', event.target.value)} /></label></div>
    <div className="attd-form-grid"><label>Break minutes<input type="number" value={form.break_minutes} onChange={event => set('break_minutes', Number(event.target.value))} /></label><label>Grace minutes<input type="number" value={form.grace_minutes} onChange={event => set('grace_minutes', Number(event.target.value))} /></label></div>
    <label>Minimum work minutes<input type="number" value={form.minimum_minutes} onChange={event => set('minimum_minutes', Number(event.target.value))} /></label>
    <div className="attd-form-grid"><label>Calculation<select value={form.calculation_mode} onChange={event => set('calculation_mode', event.target.value)}><option value="first_last">First / last punch</option><option value="paired_punches">Paired punches</option></select></label><label>Minimum punch interval<input type="number" value={form.min_punch_interval} onChange={event => set('min_punch_interval', Number(event.target.value))} /></label></div>
    <div className="attd-form-grid"><label><input type="checkbox" checked={form.overtime_enabled} onChange={event => set('overtime_enabled', event.target.checked)} /> Enable overtime</label><label>Overtime threshold<input type="number" value={form.overtime_after_minutes} onChange={event => set('overtime_after_minutes', Number(event.target.value))} /></label></div>
    <div className="attd-day-list">{DAYS.map((day, index) => <button className={form.work_days.includes(index + 1) ? 'active' : ''} onClick={() => set('work_days', form.work_days.includes(index + 1) ? form.work_days.filter(value => value !== index + 1) : [...form.work_days, index + 1])} key={day}>{day}</button>)}</div>
    <div className="pm-dialog-footer"><button className="ghost-btn" onClick={onClose}>Cancel</button><button className="save-btn" onClick={() => onSave(form)}>Create</button></div>
  </div></Modal>;
}

function GroupForm({ shifts, onClose, onSave }) {
  const [form, setForm] = useState({ name: '', description: '', shift_id: '', color: '#3B82F6' });
  return <Modal title="New Attendance Group" onClose={onClose}><div className="attd-form">
    <label>Name<input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></label>
    <label>Description<textarea value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} /></label>
    <label>Default Shift<select value={form.shift_id} onChange={event => setForm(current => ({ ...current, shift_id: event.target.value }))}><option value="">No shift</option>{shifts.map(shift => <option key={shift.id} value={shift.id}>{shift.name}</option>)}</select></label>
    <label>Color<input type="color" value={form.color} onChange={event => setForm(current => ({ ...current, color: event.target.value }))} /></label>
    <div className="pm-dialog-footer"><button className="ghost-btn" onClick={onClose}>Cancel</button><button className="save-btn" onClick={() => onSave(form)}>Create</button></div>
  </div></Modal>;
}

function ScheduleForm({ people, groups, shifts, onClose, onSave }) {
  const [form, setForm] = useState({ person_ids: [], group_id: '', shift_id: '', valid_from: today(), valid_to: '' });
  const group = groups.find(item => String(item.id) === String(form.group_id));
  const payload = { ...form, shift_id: form.shift_id || group?.shift_id };
  return <Modal title="Assign Schedule" onClose={onClose}><div className="attd-form">
    <label>People<select multiple className="attd-multi-select" value={form.person_ids} onChange={event => setForm(current => ({ ...current, person_ids: [...event.target.selectedOptions].map(option => option.value) }))}>{people.map(person => <option key={person.id} value={person.id}>{person.full_name} · {person.department || 'No department'}</option>)}</select><small>Use Ctrl or Shift to select multiple people.</small></label>
    <label>Attendance Group<select value={form.group_id} onChange={event => setForm(current => ({ ...current, group_id: event.target.value }))}><option value="">No group</option>{groups.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>Shift<select value={form.shift_id} onChange={event => setForm(current => ({ ...current, shift_id: event.target.value }))}><option value="">Use group shift</option>{shifts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <div className="attd-form-grid"><label>Valid From<input type="date" value={form.valid_from} onChange={event => setForm(current => ({ ...current, valid_from: event.target.value }))} /></label><label>Valid To<input type="date" value={form.valid_to} onChange={event => setForm(current => ({ ...current, valid_to: event.target.value }))} /></label></div>
    <div className="pm-dialog-footer"><button className="ghost-btn" onClick={onClose}>Cancel</button><button className="save-btn" disabled={!payload.person_ids.length || !payload.shift_id} onClick={() => onSave(payload)}>Assign {payload.person_ids.length || ''}</button></div>
  </div></Modal>;
}

function RequestForm({ people, onClose, onSave }) {
  const [form, setForm] = useState({ person_id: '', request_type: 'leave', date_from: today(), date_to: today(), correction_in: '', correction_out: '', start_time: '', end_time: '', reason: '' });
  return <Modal title="New Attendance Request" onClose={onClose}><div className="attd-form">
    <label>Person<select value={form.person_id} onChange={event => setForm(current => ({ ...current, person_id: event.target.value }))}><option value="">Select person</option>{people.map(person => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select></label>
    <label>Request Type<select value={form.request_type} onChange={event => setForm(current => ({ ...current, request_type: event.target.value }))}><option value="leave">Leave</option><option value="overtime">Overtime</option><option value="correction">Check-In/Out Correction</option></select></label>
    <div className="attd-form-grid"><label>From<input type="date" value={form.date_from} onChange={event => setForm(current => ({ ...current, date_from: event.target.value }))} /></label><label>To<input type="date" value={form.date_to} onChange={event => setForm(current => ({ ...current, date_to: event.target.value }))} /></label></div>
    {form.request_type === 'correction' && <div className="attd-form-grid"><label>Correct Check-In<input type="time" value={form.correction_in} onChange={event => setForm(current => ({ ...current, correction_in: event.target.value }))} /></label><label>Correct Check-Out<input type="time" value={form.correction_out} onChange={event => setForm(current => ({ ...current, correction_out: event.target.value }))} /></label></div>}
    {form.request_type === 'overtime' && <div className="attd-form-grid"><label>Start<input type="time" value={form.start_time} onChange={event => setForm(current => ({ ...current, start_time: event.target.value }))} /></label><label>End<input type="time" value={form.end_time} onChange={event => setForm(current => ({ ...current, end_time: event.target.value }))} /></label></div>}
    <label>Reason<textarea value={form.reason} onChange={event => setForm(current => ({ ...current, reason: event.target.value }))} /></label>
    <div className="pm-dialog-footer"><button className="ghost-btn" onClick={onClose}>Cancel</button><button className="save-btn" disabled={!form.person_id} onClick={() => onSave(form)}>Submit</button></div>
  </div></Modal>;
}
