// QualityDashboard.jsx - Face quality breakdown per camera

import React, { useEffect, useState } from 'react';
import { BarChart3, RefreshCw, AlertTriangle, CheckCircle2, SlidersHorizontal, Save } from 'lucide-react';

export default function QualityDashboard({ authFetch, API, isAdmin }) {
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [threshold, setThreshold] = useState(30);
  const [thresholdInput, setThresholdInput] = useState('30');
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [thresholdMsg, setThresholdMsg] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [qRes, sRes] = await Promise.allSettled([
        authFetch(API + '/api/analytics/quality-by-camera'),
        authFetch(API + '/api/settings'),
      ]);
      if (qRes.status === 'fulfilled' && qRes.value.ok) setRows(await qRes.value.json());
      if (sRes.status === 'fulfilled' && sRes.value.ok) {
        const s = await sRes.value.json();
        const t = s.face_quality_threshold != null ? Number(s.face_quality_threshold) : 30;
        setThreshold(t);
        setThresholdInput(String(t));
      }
    } finally { setLoading(false); }
  };

  const saveThreshold = async () => {
    const val = parseInt(thresholdInput, 10);
    if (isNaN(val) || val < 0 || val > 100) {
      setThresholdMsg('Enter a value between 0 and 100');
      return;
    }
    setSavingThreshold(true);
    setThresholdMsg('');
    try {
      const res = await authFetch(API + '/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ face_quality_threshold: val }),
      });
      if (res.ok) {
        setThreshold(val);
        setThresholdMsg('Saved — takes effect on next face detection');
      } else {
        setThresholdMsg('Save failed');
      }
    } finally {
      setSavingThreshold(false);
    }
  };

  useEffect(() => { load(); }, []);

  const maxTotal = Math.max(...rows.map(r => r.total_events), 1);

  return (
    <div className="card quality-dashboard">
      <div className="card-title-row">
        <h3><BarChart3 size={14} /> Face Quality by Camera</h3>
        <button className="icon-btn" onClick={load} disabled={loading}
          title="Refresh" aria-label="Refresh quality data">
          <RefreshCw size={13} className={loading ? 'spinning' : ''} />
        </button>
      </div>

      {isAdmin && (
        <div className="quality-threshold-panel">
          <div className="quality-threshold-label">
            <SlidersHorizontal size={13} />
            <span>Face Quality Threshold</span>
            <span className="quality-threshold-hint">
              Faces scoring below this value are flagged as low-quality. Current: <b>{threshold}</b>/100
            </span>
          </div>
          <div className="quality-threshold-controls">
            <input
              type="range" min="0" max="100" step="1"
              value={thresholdInput || threshold}
              onChange={e => setThresholdInput(e.target.value)}
              className="quality-threshold-slider"
            />
            <input
              type="number" min="0" max="100"
              value={thresholdInput}
              onChange={e => setThresholdInput(e.target.value)}
              className="quality-threshold-num"
            />
            <button className="save-btn" onClick={saveThreshold} disabled={savingThreshold}>
              <Save size={12} /> {savingThreshold ? 'Saving…' : 'Save'}
            </button>
          </div>
          {thresholdMsg && (
            <div className="quality-threshold-msg">{thresholdMsg}</div>
          )}
        </div>
      )}

      <p className="quality-desc">
        Cameras with high low-quality percentage may need cleaning, repositioning, or lighting adjustment.
      </p>

      {rows.length === 0 ? (
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>No event data yet.</p>
      ) : (
        <div className="quality-table-wrap">
          <table className="quality-table">
            <thead>
              <tr>
                <th>Camera</th>
                <th>Total Events</th>
                <th>High Quality</th>
                <th>Low Quality</th>
                <th>Low %</th>
                <th>Avg Quality</th>
                <th>Volume</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const bad = row.low_quality_pct > 30;
                const warn = row.low_quality_pct > 15 && !bad;
                return (
                  <tr key={row.camera_name} className={bad ? 'row-danger' : warn ? 'row-warn' : ''}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {bad   ? <AlertTriangle size={12} style={{ color: 'var(--danger)' }} /> :
                         warn  ? <AlertTriangle size={12} style={{ color: 'var(--warning)' }} /> :
                                 <CheckCircle2  size={12} style={{ color: 'var(--success)' }} />}
                        {row.camera_name}
                      </div>
                    </td>
                    <td>{row.total_events}</td>
                    <td style={{ color: 'var(--success)' }}>{row.high_quality}</td>
                    <td style={{ color: row.low_quality > 0 ? 'var(--danger)' : 'inherit' }}>{row.low_quality}</td>
                    <td>
                      <span className={`quality-pct-badge ${bad ? 'danger' : warn ? 'warn' : 'ok'}`}>
                        {row.low_quality_pct}%
                      </span>
                    </td>
                    <td>{(row.avg_face_quality * 100).toFixed(0)}%</td>
                    <td>
                      <div className="quality-vol-bar">
                        <div style={{ width: `${(row.total_events / maxTotal) * 100}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="quality-legend">
        <span><span className="legend-dot" style={{ background: '#22c55e' }} /> Good (&lt;15% low)</span>
        <span><span className="legend-dot" style={{ background: '#f59e0b' }} /> Warning (15-30%)</span>
        <span><span className="legend-dot" style={{ background: '#ef4444' }} /> Poor (&gt;30%)</span>
      </div>
    </div>
  );
}
