/**
 * AnalyticsDashboard.jsx - GSC Face Analytics Pro
 * Advanced analytics: Heatmap, Camera Activity, Repeat Visitors,
 * Demographics (Age/Gender), Type Distribution, Dwell Time, Visitor Flow.
 * Uses recharts for charts, custom CSS grid for the heatmap.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import {
  BarChart2, Camera, Users, Globe, TrendingUp,
  Clock, Route, RefreshCw, AlertCircle,
} from 'lucide-react';
import { mediaUrl } from './mediaUrl';

/* ── palette ────────────────────────────────────────────────────────────────── */
const C = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6', '#f97316'];
const TYPE_COLORS = { employee: '#10b981', vip: '#f59e0b', blacklist: '#ef4444', unknown: '#64748b' };
const GENDER_COLORS = { Male: '#2563eb', Female: '#ec4899', Unknown: '#94a3b8' };

/* ── sections ───────────────────────────────────────────────────────────────── */
const SECTIONS = [
  { id: 'heatmap',      label: 'Activity Heatmap',  icon: BarChart2  },
  { id: 'camera',       label: 'Camera Activity',   icon: Camera     },
  { id: 'visitors',     label: 'Repeat Visitors',   icon: Users      },
  { id: 'demographics', label: 'Demographics',      icon: Globe      },
  { id: 'distribution', label: 'Type Distribution', icon: TrendingUp },
  { id: 'dwell',        label: 'Dwell Time',        icon: Clock      },
  { id: 'flow',         label: 'Visitor Flow',      icon: Route      },
];

const PERIODS = [7, 14, 30, 90];

/* ── helpers ────────────────────────────────────────────────────────────────── */
function heatColor(count, max) {
  if (!max || count === 0) return 'transparent';
  const pct = count / max;
  const l = Math.round(95 - pct * 60);
  return `hsl(217, 91%, ${l}%)`;
}

function shortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function fmtMinutes(min) {
  if (min < 60) return `${min.toFixed(0)}m`;
  return `${(min / 60).toFixed(1)}h`;
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '8px 12px', fontSize: 12,
    }}>
      <p style={{ marginBottom: 4, color: 'var(--muted)', fontWeight: 600 }}>{label}</p>
      {payload.map((p, i) => (
        <div key={p.dataKey ?? i} style={{ color: p.color, display: 'flex', gap: 6 }}>
          <span>{p.name}:</span><strong>{p.value}</strong>
        </div>
      ))}
    </div>
  );
};

/* ── Heatmap ─────────────────────────────────────────────────────────────────── */
function HeatmapSection({ data }) {
  if (!data) return <EmptyState />;
  const { data: grid, days: dayLabels, hours, total_events, period_days } = data;
  if (!grid || !dayLabels) return <EmptyState msg="Heatmap data unavailable" />;
  const max = Math.max(...grid.flat(), 1);

  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <h3>Activity Heatmap</h3>
        <span className="analytics-badge">{total_events.toLocaleString()} events · last {period_days}d</span>
      </div>
      <div className="heatmap-wrap">
        <div className="heatmap-grid" style={{ '--cols': 25 }}>
          {/* corner */}
          <div className="heatmap-corner" />
          {/* hour headers */}
          {hours.map(h => (
            <div key={h} className="heatmap-hour-label">{h % 3 === 0 ? `${h}h` : ''}</div>
          ))}
          {/* rows */}
          {dayLabels.map((day, di) => (
            <React.Fragment key={day}>
              <div className="heatmap-day-label">{day}</div>
              {hours.map(h => {
                const count = grid[di][h];
                return (
                  <div
                    key={h}
                    className="heatmap-cell"
                    style={{ background: heatColor(count, max) }}
                    title={`${day} ${h}:00 — ${count} events`}
                  >
                    {count > 0 && max > 0 && count / max > 0.6 && (
                      <span className="heatmap-cell-label">{count}</span>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
        <div className="heatmap-legend">
          <span style={{ color: 'var(--muted)', fontSize: 11 }}>Low</span>
          <div className="heatmap-legend-bar">
            {[0, 0.2, 0.4, 0.6, 0.8, 1].map(pct => (
              <div
                key={pct}
                style={{ background: heatColor(Math.round(pct * max), max), flex: 1, height: '100%' }}
              />
            ))}
          </div>
          <span style={{ color: 'var(--muted)', fontSize: 11 }}>High</span>
        </div>
      </div>
    </div>
  );
}

/* ── Camera Activity ─────────────────────────────────────────────────────────── */
function CameraActivitySection({ data }) {
  if (!data) return <EmptyState />;
  if (!data.cameras?.length) return <EmptyState msg="No camera data for this period" />;
  const { cameras, days: dayList } = data;
  if (!dayList?.length) return <EmptyState msg="No date series data" />;

  const chartData = dayList.map(day => {
    const point = { date: shortDate(day) };
    cameras.forEach(cam => {
      const s = cam.series.find(x => x.date === day);
      point[cam.camera] = s?.count ?? 0;
    });
    return point;
  });

  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <h3>Camera Activity</h3>
        <span className="analytics-badge">{cameras.length} cameras · {dayList.length}d</span>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {cameras.map((cam, i) => (
            <Line
              key={cam.camera}
              type="monotone"
              dataKey={cam.camera}
              stroke={C[i % C.length]}
              dot={false}
              strokeWidth={2}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div className="camera-activity-table">
        <table>
          <thead>
            <tr>
              <th>Camera</th>
              <th>Total Events</th>
              <th>Peak Day</th>
            </tr>
          </thead>
          <tbody>
            {cameras.map((cam, i) => {
              const peak = [...cam.series].sort((a, b) => b.count - a.count)[0];
              return (
                <tr key={cam.camera}>
                  <td>
                    <span style={{ color: C[i % C.length], marginRight: 6 }}>●</span>
                    {cam.camera}
                  </td>
                  <td><strong>{cam.total.toLocaleString()}</strong></td>
                  <td>{peak ? `${shortDate(peak.date)} (${peak.count})` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Repeat Visitors ─────────────────────────────────────────────────────────── */
function RepeatVisitorsSection({ data, API }) {
  if (!data) return <EmptyState />;
  const { visitors = [], count = 0, period_days } = data;

  const chartData = visitors.slice(0, 12).map((v, i) => ({
    name: v.unknown_label || `Unknown #${v.person_id}`,
    visits: v.visit_count,
    cameras: v.camera_count,
  }));

  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <h3>Repeat Visitors</h3>
        <span className="analytics-badge">{count} unknown persons · last {period_days}d</span>
      </div>
      {count === 0 ? (
        <EmptyState msg="No repeat visitors detected" />
      ) : (
        <>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: 'var(--muted)' }}
                angle={-30}
                textAnchor="end"
                interval={0}
              />
              <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="visits" fill="#2563eb" radius={[4, 4, 0, 0]} name="Visits" />
            </BarChart>
          </ResponsiveContainer>

          <div className="repeat-visitors-list">
            {visitors.slice(0, 20).map((v, i) => (
              <div key={v.person_id} className="repeat-visitor-row">
                <span className="rv-rank">#{i + 1}</span>
                {v.preview_image && (
                  <img
                    src={mediaUrl(API, v.preview_image)}
                    className="rv-thumb"
                    alt=""
                    onError={e => { e.currentTarget.style.display = 'none'; }}
                  />
                )}
                {!v.preview_image && <div className="rv-thumb rv-thumb-placeholder" />}
                <div className="rv-info">
                  <strong>{v.unknown_label || `Unknown #${v.person_id}`}</strong>
                  <span>{v.cameras?.join(', ')}</span>
                </div>
                <div className="rv-stats">
                  <span className="rv-count">{v.visit_count} visits</span>
                  <span className="rv-last">{v.last_visit ? new Date(v.last_visit).toLocaleDateString() : ''}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Demographics ────────────────────────────────────────────────────────────── */
function DemographicsSection({ data }) {
  if (!data) return <EmptyState />;
  const { age_distribution = [], gender_distribution = [], total_with_age = 0, period_days } = data;

  const genderFiltered = gender_distribution.filter(g => g.count > 0);

  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <h3>Demographics</h3>
        <span className="analytics-badge">{total_with_age.toLocaleString()} events with age data · last {period_days}d</span>
      </div>
      {total_with_age === 0 ? (
        <EmptyState msg="No age/gender data. Enable ENABLE_AGE_GENDER=true in backend .env" />
      ) : (
        <div className="demographics-grid">
          <div>
            <h4 className="chart-subtitle">Age Distribution</h4>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={age_distribution} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="bucket" tick={{ fontSize: 12, fill: 'var(--muted)' }} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" name="People" radius={[4, 4, 0, 0]}>
                  {age_distribution.map((entry, i) => (
                    <Cell key={entry.bucket ?? i} fill={C[i % C.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div>
            <h4 className="chart-subtitle">Gender Distribution</h4>
            {genderFiltered.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={genderFiltered}
                      dataKey="count"
                      nameKey="gender"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ gender, percent }) => `${gender} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {genderFiltered.map((g, i) => (
                        <Cell key={g.gender ?? i} fill={GENDER_COLORS[g.gender] || C[i]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v, n) => [v, n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="gender-legend">
                  {genderFiltered.map((g, i) => (
                    <div key={g.gender} className="gender-legend-item">
                      <span style={{ background: GENDER_COLORS[g.gender] || C[i] }} className="legend-dot" />
                      <span>{g.gender}</span>
                      <strong>{g.count.toLocaleString()}</strong>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState msg="No gender data available" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Type Distribution ───────────────────────────────────────────────────────── */
function TypeDistributionSection({ data }) {
  if (!data) return <EmptyState />;
  if (!data.series?.length) return <EmptyState msg="No distribution data for this period" />;
  const { series, period_days } = data;

  const chartData = series.map(s => ({ ...s, date: shortDate(s.date) }));

  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <h3>Person Type Distribution</h3>
        <span className="analytics-badge">last {period_days}d</span>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <AreaChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
          <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Area type="monotone" dataKey="employee" stackId="1" stroke={TYPE_COLORS.employee} fill={TYPE_COLORS.employee} fillOpacity={0.6} name="Employee" />
          <Area type="monotone" dataKey="vip"      stackId="1" stroke={TYPE_COLORS.vip}      fill={TYPE_COLORS.vip}      fillOpacity={0.6} name="VIP" />
          <Area type="monotone" dataKey="blacklist" stackId="1" stroke={TYPE_COLORS.blacklist} fill={TYPE_COLORS.blacklist} fillOpacity={0.6} name="Blacklist" />
          <Area type="monotone" dataKey="unknown"  stackId="1" stroke={TYPE_COLORS.unknown}  fill={TYPE_COLORS.unknown}  fillOpacity={0.4} name="Unknown" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── Dwell Time ──────────────────────────────────────────────────────────────── */
function DwellTimeSection({ data }) {
  if (!data) return <EmptyState />;
  const { buckets = [], total_visits = 0, avg_dwell_minutes = 0, period_days } = data;

  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <h3>Dwell Time Distribution</h3>
        <span className="analytics-badge">
          {total_visits} visits · avg {fmtMinutes(avg_dwell_minutes)} · last {period_days}d
        </span>
      </div>
      {total_visits === 0 ? (
        <EmptyState msg="Not enough multi-event visits to calculate dwell time" />
      ) : (
        <>
          <div className="dwell-kpis">
            <div className="dwell-kpi">
              <span>Total Visits</span>
              <strong>{total_visits.toLocaleString()}</strong>
            </div>
            <div className="dwell-kpi">
              <span>Avg Dwell Time</span>
              <strong>{fmtMinutes(avg_dwell_minutes)}</strong>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={buckets} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="range" tick={{ fontSize: 12, fill: 'var(--muted)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Visits" radius={[4, 4, 0, 0]}>
                {buckets.map((b, i) => (
                  <Cell key={b.range ?? i} fill={C[i % C.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}

/* ── Visitor Flow ────────────────────────────────────────────────────────────── */
function VisitorFlowSection({ data }) {
  if (!data) return <EmptyState />;
  const { cameras = [], top_transitions = [], period_days } = data;

  const maxCount = Math.max(...top_transitions.map(t => t.count), 1);

  return (
    <div className="analytics-card">
      <div className="analytics-card-header">
        <h3>Cross-Camera Visitor Flow</h3>
        <span className="analytics-badge">last {period_days}d</span>
      </div>
      {!top_transitions?.length ? (
        <EmptyState msg="No cross-camera movements detected in this period" />
      ) : (
        <>
          <h4 className="chart-subtitle">Top Transitions (same person within 1 hour)</h4>
          <div className="flow-list">
            {top_transitions.map((t, i) => (
              <div key={`${t.from}-${t.to}-${i}`} className="flow-row">
                <div className="flow-cams">
                  <span className="flow-cam from">{t.from}</span>
                  <span className="flow-arrow">→</span>
                  <span className="flow-cam to">{t.to}</span>
                </div>
                <div className="flow-bar-wrap">
                  <div
                    className="flow-bar"
                    style={{ width: `${(t.count / maxCount) * 100}%` }}
                  />
                </div>
                <span className="flow-count">{t.count}</span>
              </div>
            ))}
          </div>

          {cameras.length > 1 && (
            <>
              <h4 className="chart-subtitle" style={{ marginTop: 24 }}>Flow Matrix</h4>
              <div className="flow-matrix-wrap">
                <table className="flow-matrix">
                  <thead>
                    <tr>
                      <th className="flow-matrix-corner">From → To</th>
                      {cameras.map(c => <th key={c}>{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {data.matrix.map(row => (
                      <tr key={row.from}>
                        <td className="flow-matrix-row-label">{row.from}</td>
                        {cameras.map(c => {
                          const val = row[c] || 0;
                          return (
                            <td
                              key={c}
                              className="flow-matrix-cell"
                              style={{
                                background: val > 0 ? `rgba(37, 99, 235, ${Math.min(val / maxCount * 0.8 + 0.1, 0.9)})` : 'transparent',
                                color: val / maxCount > 0.4 ? '#fff' : 'var(--text)',
                              }}
                            >
                              {val > 0 ? val : '·'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ── Empty state ─────────────────────────────────────────────────────────────── */
function EmptyState({ msg = 'No data for this period' }) {
  return (
    <div className="analytics-empty">
      <AlertCircle size={32} style={{ opacity: 0.3 }} />
      <p>{msg}</p>
    </div>
  );
}

/* ── Main export ─────────────────────────────────────────────────────────────── */
export default function AnalyticsDashboard({ authFetch, API }) {
  const [section, setSection] = useState('heatmap');
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [heatmapData,      setHeatmapData]      = useState(null);
  const [cameraData,       setCameraData]        = useState(null);
  const [visitorsData,     setVisitorsData]      = useState(null);
  const [ageGenderData,    setAgeGenderData]     = useState(null);
  const [distributionData, setDistributionData]  = useState(null);
  const [dwellData,        setDwellData]         = useState(null);
  const [flowData,         setFlowData]          = useState(null);

  const ENDPOINT_MAP = {
    heatmap:      d => `/api/analytics/heatmap?days=${d}`,
    camera:       d => `/api/analytics/camera-activity?days=${Math.min(d, 30)}`,
    visitors:     d => `/api/analytics/repeat-visitors?days=${d}`,
    demographics: d => `/api/analytics/age-gender?days=${d}`,
    distribution: d => `/api/analytics/type-distribution?days=${d}`,
    dwell:        d => `/api/analytics/dwell-time?days=${d}`,
    flow:         d => `/api/analytics/visitor-flow?days=${Math.min(d, 30)}`,
  };

  const SETTER_MAP = {
    heatmap:      setHeatmapData,
    camera:       setCameraData,
    visitors:     setVisitorsData,
    demographics: setAgeGenderData,
    distribution: setDistributionData,
    dwell:        setDwellData,
    flow:         setFlowData,
  };

  const fetchSection = useCallback(async (sec, d) => {
    if (!ENDPOINT_MAP[sec]) return;
    setLoading(true);
    setError(null);
    SETTER_MAP[sec](null);
    try {
      const url = ENDPOINT_MAP[sec](d);
      const res = await authFetch(API + url);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      const responseData = await res.json();
      SETTER_MAP[sec](responseData);
    } catch (e) {
      setError('Analytics load failed: ' + (e.message || String(e)));
    } finally {
      setLoading(false);
    }
  }, [authFetch, API]);

  useEffect(() => { fetchSection(section, days); }, [section, days]);

  const SectionIcon = SECTIONS.find(s => s.id === section)?.icon || BarChart2;

  return (
    <div className="analytics-dashboard">
      {/* Tabs */}
      <div className="analytics-tabs">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            className={`analytics-tab${section === s.id ? ' active' : ''}`}
            onClick={() => setSection(s.id)}
          >
            <s.icon size={13} />
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="analytics-controls">
        <div className="analytics-period-bar">
          <span className="period-label">Period:</span>
          {PERIODS.map(d => (
            <button
              key={d}
              className={`period-btn${days === d ? ' active' : ''}`}
              onClick={() => setDays(d)}
            >
              {d}d
            </button>
          ))}
        </div>
        <button
          className="period-btn"
          onClick={() => fetchSection(section, days)}
          title="Refresh"
          style={{ marginLeft: 8 }}
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Content */}
      <div className="analytics-content">
        {loading && (
          <div className="analytics-loading">
            <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
            <span>Loading analytics…</span>
          </div>
        )}

        {!loading && error && (
          <div className="analytics-error">
            <AlertCircle size={18} />
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {section === 'heatmap'      && <HeatmapSection      data={heatmapData} />}
            {section === 'camera'       && <CameraActivitySection data={cameraData} />}
            {section === 'visitors'     && <RepeatVisitorsSection  data={visitorsData}  API={API} />}
            {section === 'demographics' && <DemographicsSection   data={ageGenderData} />}
            {section === 'distribution' && <TypeDistributionSection data={distributionData} />}
            {section === 'dwell'        && <DwellTimeSection      data={dwellData} />}
            {section === 'flow'         && <VisitorFlowSection    data={flowData} />}
          </>
        )}
      </div>
    </div>
  );
}
