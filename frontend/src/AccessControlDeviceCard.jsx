import { apiFetch } from './apiClient';
// AccessControlPanel.jsx - Hikvision ACS device management + door control

import React, { useEffect, useState } from 'react';
import {
  ShieldCheck, Trash2, Edit2, X, RefreshCw,
  LockOpen, Lock, DoorOpen, Wifi, WifiOff, ChevronDown,
  ChevronUp, Clock, AlertTriangle, CheckCircle, List,
} from 'lucide-react';
import { API } from './apiConfig';

// в”Ђв”Ђ Confirm dialog в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export function ConfirmDialog({ message, danger, onConfirm, onCancel }) {
  return (
    <div className="pm-dialog-overlay" onMouseDown={e => e.target === e.currentTarget && onCancel()}>
      <div className="pm-dialog">
        <div className="pm-dialog-header">
          <strong>{danger ? 'Confirm' : 'Notice'}</strong>
          <button className="pm-dialog-close" onClick={onCancel}><X size={16} /></button>
        </div>
        <div className="pm-dialog-body">
          <p className="pm-dialog-msg">{message}</p>
        </div>
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

// в”Ђв”Ђ helpers в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

function badge(type) {
  const map = {
    manual_unlock:    { bg: '#d1fae5', color: '#065f46', label: 'Manual Unlock' },
    manual_lock:      { bg: '#fee2e2', color: '#991b1b', label: 'Manual Lock' },
    manual_stay_open: { bg: '#fef3c7', color: '#92400e', label: 'Stay Open' },
    manual_stay_close:{ bg: '#e0e7ff', color: '#3730a3', label: 'Stay Closed' },
    access_granted:   { bg: '#d1fae5', color: '#065f46', label: 'Access Granted' },
    access_denied:    { bg: '#fee2e2', color: '#991b1b', label: 'Access Denied' },
    door_opened:      { bg: '#dbeafe', color: '#1e40af', label: 'Door Opened' },
    door_closed:      { bg: '#f1f5f9', color: '#475569', label: 'Door Closed' },
    alarm:            { bg: '#fee2e2', color: '#991b1b', label: 'Alarm' },
  };
  const s = map[type] || { bg: '#f1f5f9', color: '#475569', label: type };
  return (
    <span style={{ background: s.bg, color: s.color, borderRadius: 6,
                   padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
      {s.label}
    </span>
  );
}

function fmtDate(v) {
  if (!v) return '-';
  return new Date(v).toLocaleString('en-US', {
    timeZone: 'Asia/Yerevan', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

function fmtRelative(v) {
  if (!v) return '-';
  const sec = Math.floor((Date.now() - new Date(v).getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

// в”Ђв”Ђ Device form в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

const EMPTY_FORM = {
  name: '', ip_address: '', sdk_port: 8000, http_port: 80,
  username: 'admin', password: '',
  door_count: 1, control_mode: 'sdk', location: '', notes: '', is_active: true,
};

export function DeviceForm({ initial, onSave, onCancel, onTest, saving, testing, testResult }) {
  const [form, setForm] = useState(initial ? {
    ...EMPTY_FORM, ...initial, password: '',
  } : EMPTY_FORM);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="acs-form">
      <div className="acs-form-grid">
        <label>
          <span>Device Name *</span>
          <input value={form.name} onChange={e => set('name', e.target.value)}
                 placeholder="Main Entrance Controller" />
        </label>
        <label>
          <span>IP Address *</span>
          <input value={form.ip_address} onChange={e => set('ip_address', e.target.value)}
                 placeholder="192.168.1.100" />
        </label>
        <label>
          <span>Control Mode</span>
          <select value={form.control_mode} onChange={e => set('control_mode', e.target.value)}
                  style={{padding:'8px 10px',border:'1px solid var(--border)',borderRadius:7,fontSize:13,background:'var(--bg)'}}>
            <option value="sdk">HCNetSDK (direct controller connection)</option>
            <option value="isapi">ISAPI (fallback)</option>
          </select>
        </label>
        <label>
          <span>HTTP Port {form.control_mode === 'isapi' ? '(ISAPI)' : ''}</span>
          <input type="number" value={form.http_port}
                 onChange={e => set('http_port', parseInt(e.target.value) || 80)} />
        </label>
        <label>
          <span>SDK Port {form.control_mode === 'sdk' ? '(SDK)' : ''}</span>
          <input type="number" value={form.sdk_port}
                 onChange={e => set('sdk_port', parseInt(e.target.value) || 8000)} />
        </label>
        <label>
          <span>Door Count</span>
          <input type="number" min="1" max="32" value={form.door_count}
                 onChange={e => set('door_count', parseInt(e.target.value) || 1)} />
        </label>
        <label>
          <span>Username</span>
          <input value={form.username} onChange={e => set('username', e.target.value)}
                 placeholder="admin" />
        </label>
        <label>
          <span>{initial ? 'Password (leave blank to keep)' : 'Password'}</span>
          <input type="password" value={form.password}
                 onChange={e => set('password', e.target.value)}
                 placeholder={initial ? '********' : 'Enter password'} />
        </label>
        <label>
          <span>Location</span>
          <input value={form.location} onChange={e => set('location', e.target.value)}
                 placeholder="Building A, Floor 1" />
        </label>
        <label>
          <span>Notes</span>
          <input value={form.notes} onChange={e => set('notes', e.target.value)}
                 placeholder="Optional notes" />
        </label>
      </div>

      <label className="acs-checkbox-row">
        <input type="checkbox" checked={form.is_active}
               onChange={e => set('is_active', e.target.checked)} />
        <span>Active</span>
      </label>

      <div className="acs-form-actions">
        {form.control_mode === 'sdk' && (
          <button className="ghost-btn" onClick={() => onTest(form)}
                  disabled={saving || testing || !form.ip_address || (!initial && !form.password)}>
            {testing ? 'Testing...' : 'Test Connection'}
          </button>
        )}
        <button className="ghost-btn" onClick={onCancel} disabled={saving}>Cancel</button>
        <button className="btn-primary" onClick={() => onSave(form)} disabled={saving}>
          {saving ? 'Saving...' : (initial ? 'Update Device' : 'Add Device')}
        </button>
      </div>
      {testResult && (
        <div className={`acs-test-result ${testResult.ok ? 'ok' : 'error'}`}>
          {testResult.message}
          {testResult.serial_number ? ` | Serial: ${testResult.serial_number}` : ''}
          {testResult.device_type !== undefined ? ` | Device type: ${testResult.device_type}` : ''}
        </div>
      )}
    </div>
  );
}

// в”Ђв”Ђ Door control row в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

function DoorControls({ device, token, onAction }) {
  const [busy, setBusy] = useState({});
  const [results, setResults] = useState({});

  const doCmd = async (doorNo, cmd) => {
    const key = `${doorNo}-${cmd}`;
    setBusy(b => ({ ...b, [key]: true }));
    try {
      const res = await apiFetch(
        `${API}/api/acs/${device.id}/doors/${doorNo}/${cmd}`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      setResults(r => ({ ...r, [`${doorNo}`]: { ok: res.ok, msg: data.message || (res.ok ? 'OK' : data.detail) } }));
      if (onAction) onAction(device.id);
    } catch (e) {
      setResults(r => ({ ...r, [`${doorNo}`]: { ok: false, msg: String(e) } }));
    } finally {
      setBusy(b => ({ ...b, [key]: false }));
    }
  };

  return (
    <div className="acs-doors">
      {Array.from({ length: device.door_count || 1 }, (_, i) => i + 1).map(n => (
        <div key={n} className="acs-door-row">
          <span className="acs-door-label">
            <DoorOpen size={14} style={{ marginRight: 4 }} />
            Door {n}
          </span>
          <div className="acs-door-btns">
            <button className="btn-unlock"
                    disabled={busy[`${n}-unlock`]}
                    onClick={() => doCmd(n, 'unlock')}>
              <LockOpen size={13} /> Unlock
            </button>
            <button className="btn-lock"
                    disabled={busy[`${n}-lock`]}
                    onClick={() => doCmd(n, 'lock')}>
              <Lock size={13} /> Lock
            </button>
            <button className="btn-stay-open"
                    disabled={busy[`${n}-stay_open`]}
                    onClick={() => doCmd(n, 'stay_open')}>
              Stay Open
            </button>
            <button className="btn-stay-close"
                    disabled={busy[`${n}-stay_close`]}
                    onClick={() => doCmd(n, 'stay_close')}>
              Stay Closed
            </button>
          </div>
          {results[`${n}`] && (
            <span className={`acs-door-result ${results[`${n}`].ok ? 'ok' : 'err'}`}>
              {results[`${n}`].ok ? <CheckCircle size={12} /> : <AlertTriangle size={12} />}
              {results[`${n}`].msg}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// в”Ђв”Ђ Device status badge в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

function StatusBadge({ status, loading }) {
  if (loading) return (
    <span className="acs-status" style={{ background:'#f1f5f9', color:'#64748b' }}>
      <RefreshCw size={11} className="spin" /> Checking...
    </span>
  );
  if (!status) return null;
  if (!status.online) return (
    <span className="acs-status offline"><WifiOff size={12} /> Offline</span>
  );
  return (
    <span className="acs-status online"><Wifi size={12} /> Online</span>
  );
}

// в”Ђв”Ђ Device card в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export function DeviceCard({
  device, token, isAdmin, onEdit, onDelete,
  refreshKey, onStatusChange,
}) {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [events, setEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [showEvents, setShowEvents] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshotError, setSnapshotError] = useState('');
  const [syncInfo, setSyncInfo] = useState(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const fetchStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await apiFetch(`${API}/api/acs/${device.id}/status`,
        { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      const next = res.ok
        ? data
        : { online: false, message: data.detail || `HTTP ${res.status}` };
      setStatus(next);
      onStatusChange?.(device.id, next);
    } catch (error) {
      const next = { online: false, message: String(error.message || error) };
      setStatus(next);
      onStatusChange?.(device.id, next);
    }
    finally { setLoadingStatus(false); }
  };

  // Auto-fetch status on mount
  useEffect(() => {
    if (device.is_active) fetchStatus();
    else {
      const next = { online: false, disabled: true, message: 'Device disabled' };
      setStatus(next);
      setLoadingStatus(false);
      onStatusChange?.(device.id, next);
    }
  }, [device.id, device.is_active, refreshKey]);

  const fetchEvents = async () => {
    setLoadingEvents(true);
    try {
      const res = await apiFetch(`${API}/api/acs/${device.id}/events?limit=20`,
        { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setEvents(await res.json());
    } catch { /* ignore */ }
    finally { setLoadingEvents(false); }
  };

  const takeSnapshot = async () => {
    setSnapshotLoading(true);
    setSnapshotError('');
    try {
      const res = await apiFetch(`${API}/api/acs/${device.id}/snapshot`,
        { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setSnapshotError(d.detail || 'Snapshot failed');
        return;
      }
      const blob = await res.blob();
      if (snapshot) URL.revokeObjectURL(snapshot);
      setSnapshot(URL.createObjectURL(blob));
    } catch (e) {
      setSnapshotError(String(e));
    } finally {
      setSnapshotLoading(false);
    }
  };

  const fetchSyncInfo = async () => {
    try {
      const res = await apiFetch(
        `${API}/api/acs/analytics/offline-cache?device_id=${device.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const rows = await res.json();
        const latest = rows[0];
        setSyncInfo(latest ? { count: rows.length, synced_at: latest.synced_at } : { count: 0, synced_at: null });
      }
    } catch { /* ignore */ }
  };

  const syncNow = async () => {
    setSyncBusy(true);
    setSyncResult(null);
    try {
      const res = await apiFetch(`${API}/api/acs/analytics/offline-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ device_id: device.id }),
      });
      const d = await res.json().catch(() => ({}));
      setSyncResult(res.ok
        ? { ok: true, msg: `Synced ${d.synced ?? 0} cards` }
        : { ok: false, msg: d.detail || 'Sync failed' });
      fetchSyncInfo();
    } catch (e) {
      setSyncResult({ ok: false, msg: String(e) });
    } finally {
      setSyncBusy(false);
    }
  };

  const handleExpand = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) { fetchEvents(); fetchSyncInfo(); }
  };

  return (
    <div className={`acs-card ${!device.is_active ? 'acs-card-inactive' : ''}`}>
      <div className="acs-card-header" onClick={handleExpand}>
        <div className="acs-card-title">
          <ShieldCheck size={18} className="acs-icon" />
          <div>
            <strong>{device.name}</strong>
            <span className="acs-card-meta">
              {device.ip_address}:{device.control_mode === 'isapi' ? (device.http_port || 80) : (device.sdk_port || 8000)}
              &nbsp;-&nbsp;{(device.control_mode || 'isapi').toUpperCase()}
              &nbsp;-&nbsp;{device.door_count} door{device.door_count !== 1 ? 's' : ''}
              {device.location ? ` - ${device.location}` : ''}
            </span>
          </div>
        </div>
        <div className="acs-card-right">
          <StatusBadge status={status} loading={loadingStatus} />
          {!device.is_active && (
            <span className="acs-status disabled">Disabled</span>
          )}
          {isAdmin && (
            <button className="icon-btn" onClick={e => { e.stopPropagation(); onEdit(device); }}
                    title="Edit">
              <Edit2 size={14} />
            </button>
          )}
          {isAdmin && (
            <button className="icon-btn danger" onClick={e => { e.stopPropagation(); onDelete(device); }}
                    title="Delete">
              <Trash2 size={14} />
            </button>
          )}
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {expanded && (
        <div className="acs-card-body">
          <div className="acs-card-actions-row">
            <button className="btn-ghost-sm" onClick={fetchStatus} disabled={loadingStatus}>
              <RefreshCw size={12} className={loadingStatus ? 'spin' : ''} />
              Refresh Status
            </button>
            <button className="btn-ghost-sm" onClick={takeSnapshot} disabled={snapshotLoading}>
              <RefreshCw size={12} className={snapshotLoading ? 'spin' : ''} />
              {snapshotLoading ? 'Capturing...' : 'Snapshot'}
            </button>
            <button className="btn-ghost-sm" onClick={() => { setShowEvents(v => !v); if (!showEvents) fetchEvents(); }}>
              <List size={12} /> {showEvents ? 'Hide' : 'Show'} Log
            </button>
          </div>

          <div className="acs-device-detail-grid">
            <div><span>Connection</span><strong>{status?.online ? 'Connected' : status?.message || 'Not checked'}</strong></div>
            <div><span>Username</span><strong>{device.username || 'admin'}</strong></div>
            <div><span>Location</span><strong>{device.location || 'Not specified'}</strong></div>
            <div><span>Last configuration update</span><strong>{fmtDate(device.updated_at)}</strong></div>
          </div>

          {(snapshot || snapshotError) && (
            <div className="acs-snapshot-wrap">
              {snapshot && (
                <img src={snapshot} alt="Device snapshot" className="acs-snapshot-img" />
              )}
              {snapshotError && (
                <div className="acs-snapshot-err">
                  <AlertTriangle size={13} /> {snapshotError}
                </div>
              )}
            </div>
          )}

          <div className="acs-offline-bar">
            <div className="acs-offline-info">
              <Clock size={12} />
              {syncInfo === null
                ? <span>Loading sync info...</span>
                : syncInfo.synced_at
                  ? <span>Offline cache: <b>{syncInfo.count}</b> card{syncInfo.count !== 1 ? 's' : ''} - Last synced {fmtRelative(syncInfo.synced_at)}</span>
                  : <span style={{ color: 'var(--muted)' }}>Offline cache empty</span>
              }
            </div>
            <div className="acs-offline-actions">
              {syncResult && (
                <span className={`acs-door-result ${syncResult.ok ? 'ok' : 'err'}`}>
                  {syncResult.ok ? <CheckCircle size={12} /> : <AlertTriangle size={12} />}
                  {syncResult.msg}
                </span>
              )}
              <button className="btn-ghost-sm" onClick={syncNow} disabled={syncBusy}>
                <RefreshCw size={12} className={syncBusy ? 'spin' : ''} />
                {syncBusy ? 'Syncing...' : 'Sync Cards'}
              </button>
            </div>
          </div>

          {status?.status_available && (
            <div className="acs-status-grid">
              {Array.from({ length: device.door_count || 1 }, (_, i) => i).map(i => (
                <div key={i} className="acs-status-door">
                  <span className="acs-status-door-label">Door {i + 1}</span>
                  <span className={`acs-dot ${status.door_lock_status?.[i] ? 'open' : 'closed'}`}>
                    {status.door_lock_status?.[i] ? 'Unlocked' : 'Locked'}
                  </span>
                  <span className={`acs-dot ${status.door_sensor_status?.[i] ? 'open' : 'closed'}`}>
                    Sensor: {status.door_sensor_status?.[i] ? 'Open' : 'Closed'}
                  </span>
                  {status.card_reader_online?.[i] !== undefined && (
                    <span className={`acs-dot ${status.card_reader_online[i] ? 'online' : 'offline'}`}>
                      Reader: {status.card_reader_online[i] ? 'Online' : 'Offline'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <DoorControls device={device} token={token} onAction={() => { fetchEvents(); fetchStatus(); }} />

          {showEvents && (
            <div className="acs-events">
              <div className="acs-events-header">
                <Clock size={13} /> Recent Access Log
                <button className="btn-ghost-sm" onClick={fetchEvents} disabled={loadingEvents}>
                  <RefreshCw size={11} className={loadingEvents ? 'spin' : ''} />
                </button>
              </div>
              {loadingEvents ? (
                <div className="acs-loading">Loading...</div>
              ) : events.length === 0 ? (
                <div className="acs-empty">No events yet</div>
              ) : (
                <table className="acs-table">
                  <thead>
                    <tr><th>Time</th><th>Door</th><th>Type</th><th>Card / Person</th></tr>
                  </thead>
                  <tbody>
                    {events.map(ev => (
                      <tr key={ev.id}>
                        <td className="acs-td-time">{fmtDate(ev.created_at)}</td>
                        <td>Door {ev.door_no ?? '-'}</td>
                        <td>{badge(ev.event_type)}</td>
                        <td>{ev.person_name || ev.card_number || <span style={{color:'#94a3b8'}}>-</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
