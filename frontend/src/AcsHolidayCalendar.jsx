import { apiFetch } from './apiClient';
import React, { useState, useEffect, useCallback } from 'react';
import { CalendarDays, Plus, Trash2, RefreshCw, Sparkles, Sun } from 'lucide-react';
import { API } from './apiConfig';

const H = tok => ({ Authorization: `Bearer ${tok}` });

const TYPE_BADGE = {
  public:     'acs-badge-blue',
  custom:     'acs-badge-yellow',
  restricted: 'acs-badge-red',
};

export default function AcsHolidayCalendar({ token, isAdmin }) {
  const [holidays, setHolidays] = useState([]);
  const [todayInfo, setTodayInfo] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [year, setYear]         = useState(new Date().getFullYear());
  const [form, setForm]         = useState({ name: '', date: '', is_recurring: false, holiday_type: 'custom', notes: '' });
  const [showForm, setShowForm] = useState(false);
  const [seeding, setSeeding]   = useState(false);
  const currentYear = new Date().getFullYear();
  const availableYears = Array.from({ length: 7 }, (_, index) => currentYear - 2 + index);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [hRes, tRes] = await Promise.all([
        apiFetch(`${API}/api/acs/holidays?year=${year}`, { headers: H(token) }),
        apiFetch(`${API}/api/acs/holidays/today`,        { headers: H(token) }),
      ]);
      if (hRes.ok) setHolidays(await hRes.json());
      if (tRes.ok) setTodayInfo(await tRes.json());
    } finally { setLoading(false); }
  }, [token, year]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    const res = await apiFetch(`${API}/api/acs/holidays`, {
      method: 'POST',
      headers: { ...H(token), 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) { setShowForm(false); load(); }
  };

  const remove = async (id) => {
    if (!confirm('Delete this holiday?')) return;
    await apiFetch(`${API}/api/acs/holidays/${id}`, { method: 'DELETE', headers: H(token) });
    load();
  };

  const seedArmenian = async () => {
    setSeeding(true);
    try {
      const res = await apiFetch(`${API}/api/acs/holidays/seed-armenian`, { method: 'POST', headers: H(token) });
      if (res.ok) load();
    } finally { setSeeding(false); }
  };

  return (
    <div className="acs-panel">
      <div className="acs-panel-header">
        <div className="acs-panel-title"><CalendarDays size={18} /> Holiday Calendar</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={year} onChange={e => setYear(Number(e.target.value))}>
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {isAdmin && (
            <>
              <button className="ghost-btn" onClick={seedArmenian} disabled={seeding}>
                <Sparkles size={13} /> {seeding ? 'Loading…' : 'Armenian Holidays'}
              </button>
              <button className="save-btn" onClick={() => setShowForm(true)}><Plus size={13} /> Add</button>
            </>
          )}
          <button className="ghost-btn" onClick={load} disabled={loading}><RefreshCw size={13} className={loading ? 'spin' : ''} /></button>
        </div>
      </div>

      {todayInfo && (
        <div className={`acs-form-card ${todayInfo.is_holiday ? '' : ''}`}
          style={{
            padding: '12px 16px',
            background: todayInfo.is_holiday
              ? 'color-mix(in srgb, #f59e0b 10%, var(--card))'
              : 'color-mix(in srgb, var(--success, #16a34a) 8%, var(--card))',
            borderColor: todayInfo.is_holiday ? '#f59e0b' : 'var(--success, #16a34a)',
          }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
            {todayInfo.is_holiday
              ? <Sun size={16} style={{ color: '#d97706' }} />
              : <CalendarDays size={16} style={{ color: 'var(--success, #16a34a)' }} />}
            {todayInfo.is_holiday
              ? <span><strong>Today is a holiday:</strong> {todayInfo.holiday?.name}</span>
              : <span>{`Today (${todayInfo.today}) is a regular working day.`}</span>}
          </div>
        </div>
      )}

      {showForm && (
        <div className="acs-form-card">
          <h4><CalendarDays size={14} /> Add Holiday</h4>
          <div className="acs-form-grid">
            <label>Name<input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Independence Day" /></label>
            <label>Date
              <input
                type={form.is_recurring ? 'text' : 'date'}
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                placeholder={form.is_recurring ? 'MM-DD' : ''}
              />
            </label>
            <label>Type
              <select value={form.holiday_type} onChange={e => setForm(f => ({ ...f, holiday_type: e.target.value }))}>
                <option value="public">Public Holiday</option>
                <option value="custom">Custom</option>
                <option value="restricted">Restricted Access</option>
              </select>
            </label>
            <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={form.is_recurring} onChange={e => setForm(f => ({ ...f, is_recurring: e.target.checked }))} />
              Recurring annually (MM-DD)
            </label>
          </div>
          <div className="acs-form-actions">
            <button className="ghost-btn" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="save-btn" onClick={create} disabled={!form.name || !form.date}>Save</button>
          </div>
        </div>
      )}

      <div className="acs-dash-stats">
        <div className="acs-stat-card">
          <div className="acs-stat-icon blue"><CalendarDays size={20} /></div>
          <div><div className="acs-stat-val">{holidays.length}</div><div className="acs-stat-label">{`Total (${year})`}</div></div>
        </div>
        <div className="acs-stat-card">
          <div className="acs-stat-icon green"><Sun size={20} /></div>
          <div><div className="acs-stat-val">{holidays.filter(h => h.holiday_type === 'public').length}</div><div className="acs-stat-label">Public</div></div>
        </div>
        <div className="acs-stat-card">
          <div className="acs-stat-icon yellow"><Sparkles size={20} /></div>
          <div><div className="acs-stat-val">{holidays.filter(h => h.holiday_type === 'custom').length}</div><div className="acs-stat-label">Custom</div></div>
        </div>
        <div className="acs-stat-card">
          <div className="acs-stat-icon orange"><RefreshCw size={20} /></div>
          <div><div className="acs-stat-val">{holidays.filter(h => h.is_recurring).length}</div><div className="acs-stat-label">Recurring</div></div>
        </div>
      </div>

      {holidays.length === 0
        ? (
          <div className="acs-empty-pro">
            <CalendarDays size={40} />
            <h3>{`No holidays for ${year}`}</h3>
            <p>Use "Armenian Holidays" to auto-populate, or add entries manually.</p>
          </div>
        )
        : (
          <div className="acs-table-wrap">
            <table className="acs-table">
              <thead>
                <tr><th>Date</th><th>Name</th><th>Type</th><th>Recurring</th>{isAdmin && <th></th>}</tr>
              </thead>
              <tbody>
                {holidays.map(h => (
                  <tr key={h.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{h.date}</td>
                    <td>
                      <strong>{h.name}</strong>
                      {h.notes && <span style={{ color: 'var(--muted)', fontSize: 11, marginLeft: 6 }}>{h.notes}</span>}
                    </td>
                    <td>
                      <span className={`acs-badge ${TYPE_BADGE[h.holiday_type] || 'acs-badge-gray'}`} style={{ textTransform: 'capitalize' }}>
                        {h.holiday_type}
                      </span>
                    </td>
                    <td>
                      {h.is_recurring
                        ? <span className="acs-badge acs-badge-purple">Recurring</span>
                        : <span style={{ color: 'var(--muted)', fontSize: 12 }}>—</span>}
                    </td>
                    {isAdmin && (
                      <td>
                        <button className="ghost-btn danger" style={{ height: 28, padding: '0 10px' }} onClick={() => remove(h.id)}>
                          <Trash2 size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
