// OccupancyWidget.jsx - Real-time occupancy counter with capacity bar

import React, { useEffect, useState } from 'react';
import { Users, Settings, AlertTriangle, ArrowDown, ArrowUp } from 'lucide-react';

export default function OccupancyWidget({ authFetch, API, isAdmin, wsData }) {
  const [data, setData]         = useState(null);
  const [editing, setEditing]   = useState(false);
  const [maxInput, setMaxInput] = useState('');
  const [saving, setSaving]     = useState(false);

  const load = async () => {
    try {
      const res = await authFetch(API + '/api/stats/occupancy');
      if (res.ok) setData(await res.json());
    } catch {}
  };

  // Initial load only — updates arrive via WebSocket (occupancy_update)
  useEffect(() => { load(); }, []);

  // Apply server-pushed occupancy stats instantly, no polling needed
  useEffect(() => {
    if (wsData) setData(wsData);
  }, [wsData]);

  const saveMax = async () => {
    setSaving(true);
    try {
      const res = await authFetch(API + '/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ occupancy_max_capacity: maxInput }),
      });
      if (res.ok) { setEditing(false); load(); }
    } finally { setSaving(false); }
  };

  if (!data) return null;

  const { currently_inside, max_capacity, capacity_pct, is_over_capacity, in_today, out_today } = data;
  const hasMax = max_capacity > 0;
  const pct    = hasMax ? Math.min(capacity_pct, 100) : 0;
  const barColor = is_over_capacity
    ? 'var(--danger)'
    : pct > 80 ? 'var(--warning)' : 'var(--success)';

  return (
    <div className={`card occupancy-widget${is_over_capacity ? ' occupancy-over' : ''}`}>
      <div className="card-title-row">
        <h3><Users size={14} /> Occupancy</h3>
        {isAdmin && (
          <button
            className="icon-btn"
            title="Set max capacity"
            aria-label="Set max capacity"
            onClick={() => { setMaxInput(String(max_capacity || '')); setEditing(v => !v); }}
          >
            <Settings size={13} />
          </button>
        )}
      </div>

      {editing && isAdmin && (
        <div className="occupancy-edit">
          <input
            className="ep-input"
            type="number" min="0" placeholder="Max capacity (0 = unlimited)"
            value={maxInput} onChange={e => setMaxInput(e.target.value)}
          />
          <button className="save-btn" onClick={saveMax} disabled={saving}>
            {saving ? '...' : 'Save'}
          </button>
          <button className="ghost-btn" onClick={() => setEditing(false)}>Cancel</button>
        </div>
      )}

      <div className="occupancy-main">
        <div className="occupancy-count">
          <span className="occupancy-num" style={{ color: is_over_capacity ? 'var(--danger)' : 'inherit' }}>
            {currently_inside}
          </span>
          {hasMax && <span className="occupancy-max">/ {max_capacity}</span>}
          <span className="occupancy-label">inside now</span>
        </div>

        {hasMax && (
          <div className="occupancy-bar-wrap">
            <div className="occupancy-bar">
              <div className="occupancy-bar-fill" style={{ width: `${pct}%`, background: barColor }} />
            </div>
            <span className="occupancy-pct">{capacity_pct?.toFixed(0)}%</span>
          </div>
        )}

        {is_over_capacity && (
          <div className="occupancy-alert">
            <AlertTriangle size={13} /> Over capacity!
          </div>
        )}
      </div>

      <div className="occupancy-footer">
        <span><ArrowDown size={12} /> {in_today} in today</span>
        <span><ArrowUp size={12} /> {out_today} out today</span>
      </div>
    </div>
  );
}
