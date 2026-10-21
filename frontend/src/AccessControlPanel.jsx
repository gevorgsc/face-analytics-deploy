import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, RefreshCw, Search, ShieldCheck, X } from 'lucide-react';
import { apiFetch } from './apiClient';
import { API } from './apiConfig';
import { ConfirmDialog, DeviceCard, DeviceForm } from './AccessControlDeviceCard';

// Main panel

export default function AccessControlPanel({ token, isAdmin }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editDevice, setEditDevice] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState('');
  const [confirmModal, setConfirmModal] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deviceStatuses, setDeviceStatuses] = useState({});
  const [refreshKey, setRefreshKey] = useState(0);
  const confirmRef = useRef(null);

  const showConfirm = (message, danger = false) => new Promise(resolve => {
    setConfirmModal({ message, danger, resolve });
    confirmRef.current = resolve;
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API}/api/acs`,
        { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setDevices(await res.json());
      else setError('Could not load access control devices');
    } catch (e) {
      setError(String(e.message || e));
    }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const handleTest = async (form) => {
    setTesting(true);
    setTestResult(null);
    setError('');
    try {
      const url = editDevice
        ? `${API}/api/acs/${editDevice.id}/probe`
        : `${API}/api/acs/probe`;
      const res = await apiFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      setTestResult(res.ok
        ? { ok: true, ...data }
        : { ok: false, message: data.detail || 'HCNetSDK connection failed' });
    } catch (e) {
      setTestResult({ ok: false, message: String(e) });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (form) => {
    setSaving(true);
    setError('');
    try {
      const isEdit = !!editDevice;
      const url = isEdit ? `${API}/api/acs/${editDevice.id}` : `${API}/api/acs`;
      const payload = { ...form };
      if (isEdit && !payload.password) delete payload.password;

      const res = await apiFetch(url, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.detail || 'Save failed');
        return;
      }
      setShowForm(false);
      setEditDevice(null);
      setTestResult(null);
      load();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (device) => {
    const ok = await showConfirm(`Delete "${device.name}"? This will also remove all its access logs.`, true);
    if (!ok) return;
    try {
      const res = await apiFetch(`${API}/api/acs/${device.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || 'Delete failed');
        return;
      }
    } catch (e) {
      setError(String(e.message || e));
      return;
    }
    load();
  };

  const handleStatusChange = useCallback((deviceId, status) => {
    setDeviceStatuses(current => ({ ...current, [deviceId]: status }));
  }, []);

  const normalizedSearch = search.trim().toLowerCase();
  const visibleDevices = devices.filter(device => {
    const status = deviceStatuses[device.id];
    const matchesText = !normalizedSearch || [
      device.name, device.ip_address, device.location, device.notes,
    ].some(value => String(value || '').toLowerCase().includes(normalizedSearch));
    if (!matchesText) return false;
    if (statusFilter === 'active') return Boolean(device.is_active);
    if (statusFilter === 'disabled') return !device.is_active;
    if (statusFilter === 'online') return Boolean(device.is_active && status?.online);
    if (statusFilter === 'offline') return Boolean(device.is_active && status && !status.online);
    return true;
  });

  const onlineCount = devices.filter(device => device.is_active && deviceStatuses[device.id]?.online).length;
  const disabledCount = devices.filter(device => !device.is_active).length;
  const offlineCount = devices.filter(device => (
    device.is_active && deviceStatuses[device.id] && !deviceStatuses[device.id].online
  )).length;

  const openEdit = (device) => {
    setEditDevice(device);
    setShowForm(true);
    setError('');
    setTestResult(null);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditDevice(null);
    setError('');
    setTestResult(null);
  };

  return (
    <div className="acs-panel">
      <div className="acs-panel-header">
        <div className="acs-panel-title">
          <ShieldCheck size={20} />
          <span>Access Control Devices</span>
          <span className="acs-count">{devices.length}</span>
        </div>
        {isAdmin && !showForm && (
          <button className="btn-primary" onClick={() => { setEditDevice(null); setShowForm(true); setError(''); }}>
            <Plus size={14} /> Add Device
          </button>
        )}
      </div>

      <div className="acs-device-summary">
        <div><span>Total</span><strong>{devices.length}</strong></div>
        <div className="online"><span>Online</span><strong>{onlineCount}</strong></div>
        <div className="offline"><span>Offline</span><strong>{offlineCount}</strong></div>
        <div><span>Disabled</span><strong>{disabledCount}</strong></div>
      </div>

      <div className="acs-device-toolbar">
        <label className="acs-device-search">
          <Search size={15} />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Search controllers..."
          />
        </label>
        <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
          <option value="all">All devices</option>
          <option value="active">Active</option>
          <option value="online">Online</option>
          <option value="offline">Offline</option>
          <option value="disabled">Disabled</option>
        </select>
        <button className="ghost-btn" onClick={() => setRefreshKey(value => value + 1)}>
          <RefreshCw size={14} /> Refresh All
        </button>
      </div>

      {showForm && (
        <div className="acs-form-wrapper">
          <div className="acs-form-title">
            {editDevice ? `Edit - ${editDevice.name}` : 'New ACS Device'}
            <button className="icon-btn" onClick={closeForm}><X size={16} /></button>
          </div>
          {error && <div className="acs-error">{error}</div>}
          <DeviceForm
            initial={editDevice}
            onSave={handleSave}
            onTest={handleTest}
            onCancel={closeForm}
            saving={saving}
            testing={testing}
            testResult={testResult}
          />
        </div>
      )}

      {!showForm && error && <div className="acs-error">{error}</div>}

      {loading ? (
        <div className="acs-loading-main">Loading devices...</div>
      ) : devices.length === 0 && !showForm ? (
        <div className="acs-empty-state">
          <ShieldCheck size={40} style={{ opacity: 0.2 }} />
          <p>No access control devices yet.</p>
          {isAdmin && (
            <button className="btn-primary" onClick={() => setShowForm(true)}>
              <Plus size={14} /> Add First Device
            </button>
          )}
        </div>
      ) : (
        <div className="acs-device-list">
          {visibleDevices.map(d => (
            <DeviceCard
              key={d.id}
              device={d}
              token={token}
              isAdmin={isAdmin}
              onEdit={openEdit}
              onDelete={handleDelete}
              refreshKey={refreshKey}
              onStatusChange={handleStatusChange}
            />
          ))}
          {visibleDevices.length === 0 && (
            <div className="acs-empty-state compact">
              <p>No devices match the current search or status filter.</p>
            </div>
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
    </div>
  );
}
