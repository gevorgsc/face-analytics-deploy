// ============================================================
// CamerasManagementPro.jsx - GSC Face Analytics Pro (v5)
// Enterprise camera management with IN/OUT direction support
// ============================================================

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Camera as CameraIcon, Plus, Trash2, Edit3, Save, X,
  Zap, Eye, MapPin, Wifi, Lock, Hash, Activity,
  Server, Power, Layers,
  ArrowDown, ArrowUp, ArrowDownUp, Video, Copy, CheckCircle2
} from 'lucide-react';

// Channel encoding: 101 = ch1 main, 102 = ch1 sub, 103 = ch1 third
function getStreamType(channel) {
  const ch = Number(channel) || 101;
  if (ch >= 100) { const d = ch % 100; if (d === 2) return 1; if (d === 3) return 2; }
  return 0;
}
function applyStreamType(channel, stype) {
  const ch = Number(channel) || 101;
  const base = ch >= 100 ? Math.floor(ch / 100) : Math.max(1, ch);
  return base * 100 + stype + 1;
}

const EMPTY = {
  name: '', ip_address: '', port: 8000, username: '', password: '',
  location: '', notes: '',
  is_active: 1, ai_enabled: 1, live_enabled: 1,
  direction: 'both',
  snapshot_mode: 'hiksdk', http_port: 80,
};

const SNAPSHOT_MODES = [
  { value: 'hiksdk', label: 'Hikvision SDK',       desc: 'HCNetSDK private protocol, SDK port usually 8000' },
  { value: 'onvif', label: 'ONVIF (HTTP Digest)',  desc: 'ONVIF snapshot via SOAP, works with many brands' },
];

function FormField({ label, icon: Icon, children, full }) {
  return (
    <div className={`cmp-field ${full ? 'cmp-field-full' : ''}`}>
      <label>
        {Icon && <Icon size={11} />}
        {label}
      </label>
      {children}
    </div>
  );
}

function DirectionIcon({ direction, size = 11 }) {
  if (direction === 'in')  return <ArrowDown  size={size} />;
  if (direction === 'out') return <ArrowUp    size={size} />;
  return <ArrowDownUp size={size} />;
}

function directionLabel(d) {
  if (d === 'in')  return 'ENTRANCE';
  if (d === 'out') return 'EXIT';
  return 'BIDIRECTIONAL';
}

function getAlarmServerConfig(apiBase) {
  const base = apiBase || `${window.location.protocol}//${window.location.host}`;
  const url = new URL(base, window.location.origin);
  return {
    host: url.hostname,
    protocol: 'HTTP',
    port: url.port || (url.protocol === 'https:' ? '443' : '80'),
    path: '/api/alarm/hikvision',
    fullUrl: `${url.protocol}//${url.host}/api/alarm/hikvision`,
  };
}

function absoluteApiUrl(apiBase, path) {
  return path?.startsWith('http') ? path : `${apiBase}${path || ''}`;
}

async function getSignedStreamUrl(apiBase, cameraId, authFetch) {
  const res = await authFetch(`${apiBase}/api/cameras/${cameraId}/stream-url`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return absoluteApiUrl(apiBase, data.url);
}

function AlarmServerGuide({ apiBase }) {
  const [copied, setCopied] = useState('');
  const cfg = getAlarmServerConfig(apiBase);

  const copy = async (key, value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(''), 1200);
    } catch {
      setCopied('');
    }
  };

  const items = [
    ['host', 'Destination IP / Host', cfg.host],
    ['path', 'URL', cfg.path],
    ['protocol', 'Protocol Type', cfg.protocol],
    ['port', 'Port No.', cfg.port],
  ];

  return (
    <div className="cmp-alarm-guide">
      <div className="cmp-alarm-head">
        <div>
          <h4><Server size={14} /> Hikvision Alarm Server</h4>
          <p>Camera web panel {'>'} Event {'>'} Alarm Setting {'>'} Alarm Server</p>
        </div>
        <button className="ghost-btn" onClick={() => copy('full', cfg.fullUrl)}>
          {copied === 'full' ? <CheckCircle2 size={13} /> : <Copy size={13} />}
          Copy endpoint
        </button>
      </div>

      <div className="cmp-alarm-grid">
        {items.map(([key, label, value]) => (
          <button key={key} className="cmp-alarm-item" onClick={() => copy(key, value)}>
            <small>{label}</small>
            <b>{value}</b>
            {copied === key ? <CheckCircle2 size={13} /> : <Copy size={13} />}
          </button>
        ))}
      </div>
    </div>
  );
}

function CameraForm({ initial, onSave, onCancel, t, apiBase }) {
  const [v, setV] = useState({
    ...EMPTY,
    ...(initial || {}),
    snapshot_mode: SNAPSHOT_MODES.some(m => m.value === initial?.snapshot_mode) ? initial.snapshot_mode : 'hiksdk',
    // Never reuse masked/generated display values as editable secrets.
    password: '',
  });

  const save = () => {
    const payload = { ...v };
    if (!payload.password) delete payload.password;
    onSave(payload);
  };

  return (
    <div className="card cmp-form">
      <div className="cmp-form-head">
        <div className="cmp-form-icon">
          <CameraIcon size={20} />
        </div>
        <div>
          <h3>{initial ? 'Edit Camera' : 'Add New Camera'}</h3>
          <small>
            {(v.snapshot_mode === 'onvif')
              ? 'ONVIF snapshot'
              : 'Hikvision HCNetSDK - use SDK port 8000'}
          </small>
        </div>
      </div>

      {/* Alarm Server guide - only shown when adding a NEW camera, not when editing */}
      {!initial && <AlarmServerGuide apiBase={apiBase} />}

      <div className="cmp-form-grid">
        <FormField label="Camera Name" icon={CameraIcon}>
          <input value={v.name} onChange={e => setV({ ...v, name: e.target.value })} placeholder="e.g. Main Entrance" />
        </FormField>

        <FormField label="IP Address" icon={Wifi}>
          <input value={v.ip_address} onChange={e => setV({ ...v, ip_address: e.target.value })} placeholder="172.16.11.197" />
        </FormField>

        <FormField label="Username" icon={Lock}>
          <input value={v.username || ''} onChange={e => setV({ ...v, username: e.target.value })} placeholder="admin" />
        </FormField>

        <FormField label="Password" icon={Lock}>
          <input type="password" value={v.password || ''} onChange={e => setV({ ...v, password: e.target.value })} placeholder="********" />
        </FormField>

        {v.snapshot_mode === 'hiksdk' ? (
          <FormField label="Port" icon={Hash}>
            <input
              type="number"
              value={v.port}
              onChange={e => setV({ ...v, port: Number(e.target.value) })}
              placeholder="8000"
            />
          </FormField>
        ) : (
          <FormField label="HTTP Port" icon={Server}>
            <input
              type="number" min="1" max="65535"
              value={v.http_port || 80}
              onChange={e => setV({ ...v, http_port: parseInt(e.target.value) || 80 })}
              placeholder="80"
            />
          </FormField>
        )}

        <FormField label="Direction" icon={ArrowDownUp}>
          <select
            value={v.direction || 'both'}
            onChange={e => setV({ ...v, direction: e.target.value })}
          >
            <option value="both">Bidirectional (default)</option>
            <option value="in">Entrance (IN only)</option>
            <option value="out">Exit (OUT only)</option>
          </select>
        </FormField>

        <FormField label="Snapshot Mode" icon={Video}>
          <select
            value={v.snapshot_mode || 'hiksdk'}
            onChange={e => {
              const mode = e.target.value;
              setV({
                ...v,
                snapshot_mode: mode,
                port: mode === 'hiksdk' ? (v.port || 8000) : v.port,
                http_port: mode === 'onvif' ? (v.http_port || 80) : v.http_port,
              });
            }}
          >
            {SNAPSHOT_MODES.map(m => (
              <option key={m.value} value={m.value} title={m.desc}>
                {m.label}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Default Stream" icon={Layers}>
          <select
            value={getStreamType(v.channel || 101)}
            onChange={e => setV({ ...v, channel: applyStreamType(v.channel || 101, Number(e.target.value)) })}
          >
            <option value={0}>Main Stream (high quality)</option>
            <option value={1}>Sub Stream (low bandwidth)</option>
          </select>
        </FormField>

        <FormField label="Location" icon={MapPin}>
          <input value={v.location || ''} onChange={e => setV({ ...v, location: e.target.value })} placeholder="Optional location" />
        </FormField>

        <FormField label="Notes" icon={Edit3} full>
          <textarea value={v.notes || ''} onChange={e => setV({ ...v, notes: e.target.value })} placeholder="Optional notes..." rows={1} />
        </FormField>
      </div>

      <div className="cmp-toggles">
        <label className={`cmp-toggle ${v.is_active ? 'on' : ''}`}>
          <input type="checkbox" checked={!!v.is_active} onChange={e => setV({ ...v, is_active: e.target.checked ? 1 : 0 })} />
          <Power size={14} /> <span>Active</span>
        </label>
        <label className={`cmp-toggle ${v.ai_enabled ? 'on' : ''}`}>
          <input type="checkbox" checked={!!v.ai_enabled} onChange={e => setV({ ...v, ai_enabled: e.target.checked ? 1 : 0 })} />
          <Zap size={14} /> <span>Detection</span>
        </label>
        <label className={`cmp-toggle ${v.live_enabled ? 'on' : ''}`}>
          <input type="checkbox" checked={!!v.live_enabled} onChange={e => setV({ ...v, live_enabled: e.target.checked ? 1 : 0 })} />
          <Eye size={14} /> <span>Live Stream</span>
        </label>
      </div>

      <div className="cmp-form-actions">
        {onCancel && (
          <button className="ghost-btn" onClick={onCancel}>
            <X size={14} /> Cancel
          </button>
        )}
        <button className="save-btn" onClick={save}>
          <Save size={14} /> {initial ? 'Save Changes' : 'Add Camera'}
        </button>
      </div>
    </div>
  );
}

function LiveViewModal({ camera, apiBase, authFetch, token, onClose }) {
  const [imgSrc, setImgSrc] = useState(null);
  const [errMsg, setErrMsg] = useState('');
  const [diag, setDiag] = useState(null);
  const activeRef = React.useRef(true);
  const timerRef = React.useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (camera.snapshot_mode === 'hiksdk' && token) {
      let cancelled = false;
      setImgSrc(null);
      setErrMsg('');
      setDiag(null);
      getSignedStreamUrl(apiBase, camera.id, authFetch)
        .then(streamUrl => { if (!cancelled) setImgSrc(streamUrl); })
        .catch(e => { if (!cancelled) setErrMsg(e.message || 'Cannot create stream URL'); });
      return () => { cancelled = true; };
    }

    activeRef.current = true;
    setErrMsg('');
    let prev = null;

    async function fetchFrame() {
      if (!activeRef.current) return;
      clearTimeout(timerRef.current);
      try {
        const res = await authFetch(`${apiBase}/api/cameras/${camera.id}/snapshot`);
        if (!activeRef.current) return;
        if (res.ok) {
          const blob = await res.blob();
          if (!activeRef.current) return;
          const url = URL.createObjectURL(blob);
          setImgSrc(url);
          setErrMsg('');
          setDiag(null);
          if (prev) URL.revokeObjectURL(prev);
          prev = url;
        } else {
          const body = await res.json().catch(() => ({}));
          setErrMsg(body?.detail || `HTTP ${res.status}`);
          const diagRes = await authFetch(`${apiBase}/api/cameras/${camera.id}/diagnostics`);
          if (diagRes.ok && activeRef.current) {
            setDiag(await diagRes.json());
          }
        }
      } catch {
        if (activeRef.current) setErrMsg('Cannot reach server');
      }
      if (activeRef.current) {
        timerRef.current = setTimeout(fetchFrame, 1000);
      }
    }

    fetchFrame();
    return () => {
      activeRef.current = false;
      clearTimeout(timerRef.current);
      if (prev) URL.revokeObjectURL(prev);
    };
  }, [camera.id, camera.snapshot_mode, apiBase, authFetch, token]);

  return createPortal(
    <div className="live-modal-backdrop" onClick={onClose}>
      <div className="live-modal" onClick={e => e.stopPropagation()}>
        <div className="live-modal-head">
          <div className="live-modal-title">
            <Video size={16} />
            <span>{camera.name}</span>
            {camera.location && <small><MapPin size={11} /> {camera.location}</small>}
          </div>
          <button className="ghost-btn live-modal-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="live-modal-body">
          {!imgSrc && !errMsg && (
            <div className="live-status">
              <Activity size={22} className="live-spin" />
              <span>Connecting...</span>
            </div>
          )}
          {errMsg && !imgSrc && (
            <div className="live-status live-error">
              <CameraIcon size={28} />
              <span>Stream unavailable</span>
              <small>{errMsg}</small>
              {diag?.hint && <small>{diag.hint}</small>}
            </div>
          )}
          {imgSrc && (
            <img src={imgSrc} alt={`Live: ${camera.name}`} className="live-stream-img" />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function CameraCard({ camera, onUpdate, onDelete, canEdit, canDelete, apiBase, autoOpen, onAutoOpenHandled }) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Auto-open edit form when this camera was just auto-registered
  React.useEffect(() => {
    if (autoOpen && canEdit) {
      setEditing(true);
      onAutoOpenHandled?.();
    }
  }, [autoOpen]);

  if (editing) {
    return (
        <CameraForm
        initial={camera}
        onSave={(data) => { onUpdate(camera.id, data); setEditing(false); }}
        onCancel={() => setEditing(false)}
        apiBase={apiBase}
      />
    );
  }

  const isOnline = !!camera.is_active;
  const direction = camera.direction || 'both';

  return (
    <div className={`cmp-card cmp-card-compact ${isOnline ? 'online' : 'offline'} dir-${direction}${expanded ? ' expanded' : ''}`}>
      <div className="cmp-card-row" onClick={() => setExpanded(v => !v)}>
        <div className="cmp-card-left">
          <div className={`cmp-status-dot ${isOnline ? 'on' : 'off'}`} />
          <span className="cmp-card-name">{camera.name}</span>
          <span className={`cmp-flag dir-flag dir-${direction}`}>
            <DirectionIcon direction={direction} />
            {direction === 'in' ? 'IN' : direction === 'out' ? 'OUT' : 'BOTH'}
          </span>
        </div>
        <div className="cmp-card-right" onClick={e => e.stopPropagation()}>
          {canEdit && (
            <button className="cmp-icon-btn" title="Edit" onClick={() => setEditing(true)}>
              <Edit3 size={13} />
            </button>
          )}
          {canDelete && (
            <button className="cmp-icon-btn danger" title="Delete" onClick={() => onDelete(camera.id)}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="cmp-card-details">
          <div className="cmp-net-item"><small>IP</small><b>{camera.ip_address}</b></div>
          <div className="cmp-net-item"><small>PORT</small><b>{camera.port}</b></div>
          {camera.location && <div className="cmp-net-item"><small>LOC</small><b>{camera.location}</b></div>}
          {camera.notes    && <div className="cmp-net-item cmp-net-item-full"><small>NOTE</small><b>{camera.notes}</b></div>}
        </div>
      )}
    </div>
  );
}

export default function CamerasManagementPro({
  cameras, createCamera, updateCamera, deleteCamera, canEdit, canDelete, t, apiBase, authFetch, token,
  autoEditCameraId, onAutoEditHandled,
}) {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <>
      <div className="cmp-header">
        {canEdit && (
          <button className="save-btn" onClick={() => setShowAdd(!showAdd)}>
            <Plus size={14} /> {showAdd ? 'Cancel' : 'Add Camera'}
          </button>
        )}
      </div>

      {showAdd && canEdit && (
        <CameraForm
          onSave={(data) => { createCamera(data); setShowAdd(false); }}
          onCancel={() => setShowAdd(false)}
          apiBase={apiBase}
        />
      )}

      <div className="cmp-grid">
        {(!cameras || cameras.length === 0) ? (
          <div className="cmp-empty">
            <CameraIcon size={42} />
            <h3>No cameras configured</h3>
            <p>Add your first camera to start receiving face events.</p>
          </div>
        ) : (
          cameras.map(c => (
            <CameraCard
              key={c.id}
              camera={c}
              onUpdate={updateCamera}
              onDelete={deleteCamera}
              canEdit={canEdit}
              canDelete={canDelete}
              apiBase={apiBase}
              authFetch={authFetch}
              token={token}
              autoOpen={autoEditCameraId === c.id}
              onAutoOpenHandled={onAutoEditHandled}
            />
          ))
        )}
      </div>
</>
  );
}
