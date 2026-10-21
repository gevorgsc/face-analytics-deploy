// CameraHealthPanel.jsx - Camera online/offline status overview

import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCw, CheckCircle2, XCircle } from 'lucide-react';

export default function CameraHealthPanel({ authFetch, API }) {
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch(API + '/api/cameras/health-status');
      if (res.ok) {
        setCameras(await res.json());
        setLastRefresh(new Date());
      }
    } finally { setLoading(false); }
  };

  useEffect(() => {
    load();
    const iv = setInterval(load, 60000); // refresh every 60s
    return () => clearInterval(iv);
  }, []);

  const online  = cameras.filter(c => c.is_active && c.live_enabled && c.online).length;
  const offline = cameras.filter(c => c.is_active && c.live_enabled && !c.online).length;
  const total   = cameras.filter(c => c.is_active && c.live_enabled).length;
  const activeCount = cameras.filter(c => c.is_active).length;
  const inCount = cameras.filter(c => c.direction === 'in').length;
  const outCount = cameras.filter(c => c.direction === 'out').length;

  return (
    <div className="card health-panel">
      <div className="card-title-row">
        <div>
          <h3><Wifi size={14} /> Camera Health</h3>
          <p className="health-subtitle">
            {activeCount}/{cameras.length} active - {inCount} entrance - {outCount} exit
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {lastRefresh && (
            <span className="health-last-refresh">
              {lastRefresh.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button className="icon-btn" onClick={load} disabled={loading}
            title="Refresh health status" aria-label="Refresh health status">
            <RefreshCw size={13} className={loading ? 'spinning' : ''} />
          </button>
        </div>
      </div>

      {/* Summary badges */}
      <div className="health-summary">
        <div className="health-badge health-badge-online">
          <CheckCircle2 size={14} /> {online} Online
        </div>
        <div className="health-badge health-badge-offline">
          <XCircle size={14} /> {offline} Offline
        </div>
        <div className="health-badge health-badge-total">
          {total} Live-enabled
        </div>
      </div>

      {/* Camera list */}
      <div className="health-list">
        {cameras.map(cam => {
          const active = cam.is_active && cam.live_enabled;
          const status = !active ? 'disabled' : cam.online ? 'online' : 'offline';
          return (
            <div key={cam.id} className={`health-row health-row-${status}`}>
              <span className={`health-dot health-dot-${status}`} />
              <div className="health-row-info">
                <span className="health-cam-name">{cam.name}</span>
                {cam.location && <span className="health-cam-loc">{cam.location}</span>}
                {cam.runtime?.last_error && (
                  <span className="health-cam-loc">
                    {cam.runtime.last_error}
                    {cam.runtime.failure_count ? ` - retry #${cam.runtime.failure_count}` : ''}
                  </span>
                )}
              </div>
              <span className="health-cam-ip">{cam.ip_address}</span>
              <span className={`health-status-label health-status-${status}`}>
                {status === 'online' ? <><Wifi size={10} /> Online</> :
                 status === 'offline' ? <><WifiOff size={10} /> Offline</> :
                 'Disabled'}
              </span>
            </div>
          );
        })}
        {cameras.length === 0 && (
          <div className="health-empty">No cameras configured.</div>
        )}
      </div>
    </div>
  );
}
