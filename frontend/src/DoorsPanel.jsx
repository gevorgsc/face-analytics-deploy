// DoorsPanel.jsx - Door/relay HTTP trigger configuration

import React, { useEffect, useState } from 'react';
import { DoorOpen, Plus, Trash2, Edit2, Zap, X, Check } from 'lucide-react';

const PERSON_TYPES = ['employee', 'vip', 'blacklist', 'unknown'];

function DoorForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || {
    name: '', trigger_url: '', http_method: 'POST',
    trigger_types: ['employee', 'vip'], min_confidence: 0.5,
    cooldown_seconds: 5, is_active: true, headers: {}, payload_template: '',
  });

  const toggleType = (t) => setForm(f => ({
    ...f,
    trigger_types: f.trigger_types.includes(t)
      ? f.trigger_types.filter(x => x !== t)
      : [...f.trigger_types, t],
  }));

  return (
    <div className="door-form">
      <div className="door-form-row">
        <label>Name</label>
        <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Main Entrance" />
      </div>
      <div className="door-form-row">
        <label>Trigger URL</label>
        <input value={form.trigger_url} onChange={e => setForm(f => ({ ...f, trigger_url: e.target.value }))} placeholder="http://192.168.1.100/relay/open" />
      </div>
      <div className="door-form-row">
        <label>Method</label>
        <select value={form.http_method} onChange={e => setForm(f => ({ ...f, http_method: e.target.value }))}>
          {['POST', 'GET', 'PUT'].map(m => <option key={m}>{m}</option>)}
        </select>
      </div>
      <div className="door-form-row">
        <label>Min confidence</label>
        <input type="number" min="0" max="1" step="0.05" value={form.min_confidence}
          onChange={e => setForm(f => ({ ...f, min_confidence: parseFloat(e.target.value) }))} />
      </div>
      <div className="door-form-row">
        <label>Cooldown (s)</label>
        <input type="number" min="1" max="3600" value={form.cooldown_seconds}
          onChange={e => setForm(f => ({ ...f, cooldown_seconds: parseInt(e.target.value) || 5 }))} />
      </div>
      <div className="door-form-row">
        <label>Trigger for</label>
        <div className="door-types">
          {PERSON_TYPES.map(t => (
            <button key={t}
              className={`door-type-btn ${form.trigger_types.includes(t) ? 'active' : ''}`}
              onClick={() => toggleType(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="door-form-row">
        <label>JSON Payload (optional)</label>
        <textarea value={form.payload_template || ''} rows={3}
          placeholder='{"action":"open","id":"{person_id}"}'
          onChange={e => setForm(f => ({ ...f, payload_template: e.target.value || null }))} />
      </div>
      <div className="door-form-row">
        <label>Active</label>
        <input type="checkbox" checked={form.is_active}
          onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
      </div>
      <div className="door-form-actions">
        <button className="save-btn" onClick={() => onSave(form)}>Save</button>
        <button className="ghost-btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export default function DoorsPanel({ authFetch, API, isAdmin }) {
  const [doors, setDoors]     = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]  = useState(null);
  const [testing, setTesting]  = useState(null);
  const [testResult, setTestResult] = useState({});

  const load = async () => {
    const res = await authFetch(API + '/api/doors');
    if (res.ok) setDoors(await res.json());
  };

  useEffect(() => { load(); }, []);

  const save = async (form) => {
    const url    = editing ? `${API}/api/doors/${editing.id}` : `${API}/api/doors`;
    const method = editing ? 'PATCH' : 'POST';
    const res = await authFetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) { setShowForm(false); setEditing(null); load(); }
  };

  const del = async (id) => {
    await authFetch(`${API}/api/doors/${id}`, { method: 'DELETE' });
    load();
  };

  const test = async (id) => {
    setTesting(id);
    const res = await authFetch(`${API}/api/doors/${id}/test`, { method: 'POST' });
    const data = await res.json();
    setTestResult(r => ({ ...r, [id]: data }));
    setTesting(null);
  };

  return (
    <div className="card doors-panel">
      <div className="card-title-row">
        <h3><DoorOpen size={14} /> Door / Relay Integration</h3>
        {isAdmin && (
          <button className="btn-sm" onClick={() => { setEditing(null); setShowForm(v => !v); }}>
            <Plus size={12} /> New Door
          </button>
        )}
      </div>

      <p className="doors-desc">
        Trigger an HTTP request to a relay or access-control system when a recognized face is detected.
      </p>

      {(showForm && !editing) && isAdmin && (
        <DoorForm onSave={save} onCancel={() => setShowForm(false)} />
      )}

      <div className="doors-list">
        {doors.map(door => (
          <div key={door.id} className={`door-row${door.is_active ? '' : ' door-disabled'}`}>
            <div className="door-row-icon">
              <DoorOpen size={16} />
            </div>
            <div className="door-row-info">
              <b>{door.name}</b>
              <span className="door-url">{door.trigger_url}</span>
              <div className="door-meta">
                <span>{door.http_method}</span>
                <span>-</span>
                <span>Confidence at least {(door.min_confidence * 100).toFixed(0)}%</span>
                <span>-</span>
                <span>Cooldown {door.cooldown_seconds}s</span>
                <span>-</span>
                <span>{door.trigger_types.join(', ')}</span>
              </div>
              {testResult[door.id] && (
                <div className={`door-test-result ${testResult[door.id].ok ? 'ok' : 'err'}`}>
                  {testResult[door.id].ok
                    ? <><Check size={11} /> HTTP {testResult[door.id].status_code}</>
                    : <><X size={11} /> {testResult[door.id].error}</>}
                </div>
              )}
            </div>
            <div className="door-row-actions">
              <button className="icon-btn" title="Test relay" aria-label="Test relay"
                onClick={() => test(door.id)} disabled={testing === door.id}>
                <Zap size={13} className={testing === door.id ? 'spinning' : ''} />
              </button>
              {isAdmin && <>
                <button className="icon-btn" title="Edit" aria-label="Edit"
                  onClick={() => { setEditing(door); setShowForm(true); }}>
                  <Edit2 size={13} />
                </button>
                <button className="icon-btn danger" title="Delete" aria-label="Delete"
                  onClick={() => del(door.id)}>
                  <Trash2 size={13} />
                </button>
              </>}
            </div>
          </div>
        ))}
        {doors.length === 0 && !showForm && (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>No doors configured. Add one to trigger relays on face match.</p>
        )}
      </div>

      {editing && showForm && isAdmin && (
        <div className="door-edit-overlay">
          <DoorForm initial={editing} onSave={save} onCancel={() => { setEditing(null); setShowForm(false); }} />
        </div>
      )}
    </div>
  );
}
