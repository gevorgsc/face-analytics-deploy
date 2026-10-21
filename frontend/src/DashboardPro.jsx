// ============================================================
// DashboardPro.jsx - GSC Face Analytics Pro
// Ultra-professional enterprise dashboard
// ============================================================

import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  Camera, Users, Crown, Briefcase, ShieldAlert, Activity,
  TrendingUp, TrendingDown, Eye, Zap, Clock, AlertTriangle
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Area, AreaChart, CartesianGrid
} from 'recharts';
import { mediaUrl } from './mediaUrl';

// ---------- Helpers ----------
function img(API, path) {
  return mediaUrl(API, path);
}

function thumbImage(API, item) {
  return img(API, item?.crop_image_path || item?.preview_image || item?.image_path || item?.original_image_path);
}

function previewImage(API, item) {
  return img(API, item?.original_image_path || item?.image_path || item?.crop_image_path || item?.preview_image);
}

const PLACEHOLDER_SVG = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">' +
  '<rect width="120" height="120" fill="#1f2937"/>' +
  '<circle cx="60" cy="45" r="20" fill="#374151"/>' +
  '<ellipse cx="60" cy="95" rx="32" ry="22" fill="#374151"/>' +
  '</svg>'
)}`;

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-US', {
    timeZone: 'Asia/Yerevan',
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
}

function formatRelative(value) {
  if (!value) return '-';
  const diff = Date.now() - new Date(value).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function displayPersonName(item) {
  if (!item) return 'Unknown Person';
  if (item.person?.full_name) return item.person.full_name;
  if (item.full_name) return item.full_name;
  if (item.display_name) return item.display_name;
  if (item.person_name && item.person_name !== 'Unknown Person') return item.person_name;
  const id = item.person_id || item.id;
  return id ? `Unknown #${id}` : 'Unknown Person';
}

// ---------- KPI Card with Sparkline ----------
function KpiCard({ icon: Icon, title, value, trend, sparkData, color = 'primary', onClick }) {
  const trendIsUp = trend > 0;
  const trendIsDown = trend < 0;

  return (
    <div className={`kpi-card kpi-${color} ${onClick ? 'kpi-clickable' : ''}`} onClick={onClick}>
      <div className="kpi-head">
        <div className={`kpi-icon kpi-icon-${color}`}>
          <Icon size={18} />
        </div>
        {trend !== undefined && trend !== null && (
          <span className={`kpi-trend ${trendIsUp ? 'up' : trendIsDown ? 'down' : 'flat'}`}>
            {trendIsUp ? <TrendingUp size={12} /> : trendIsDown ? <TrendingDown size={12} /> : null}
            {Math.abs(trend)}%
          </span>
        )}
      </div>

      <div className="kpi-body">
        <p className="kpi-title">{title}</p>
        <h2 className="kpi-value">{value}</h2>
      </div>

      {sparkData && sparkData.length > 0 && (
        <div className="kpi-spark">
          <ResponsiveContainer width="100%" height={36}>
            <AreaChart data={sparkData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`spark-${color}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="currentColor" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="count"
                stroke="currentColor"
                strokeWidth={1.8}
                fill={`url(#spark-${color})`}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ---------- Chart Card Wrapper ----------
function ChartCard({ title, badge, children }) {
  return (
    <div className="card chart-card-pro">
      <div className="card-title-row">
        <h3>{title}</h3>
        {badge && <span>{badge}</span>}
      </div>
      {children}
    </div>
  );
}

// ---------- Custom Tooltip ----------
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="custom-chart-tooltip">
      <p className="tooltip-label">{label}</p>
      <p className="tooltip-value">
        <span className="tooltip-dot" />
        {payload[0].value} events
      </p>
    </div>
  );
}

// ---------- Camera Health Tile ----------
function CameraHealthTile({ camera, online, onClick }) {
  // `online` = live RTSP worker status (undefined = not yet fetched в†’ show is_active as fallback)
  const isLive    = online === true;
  const isOffline = online === false;
  const statusClass = isLive ? 'online' : isOffline ? 'offline' : (camera.is_active ? 'online' : 'offline');
  return (
    <div className={`cam-tile ${statusClass}`} onClick={onClick}>
      <div className="cam-tile-head">
        <div className={`cam-status-dot ${statusClass === 'online' ? 'on' : 'off'}`} />
        <div className="cam-tile-info">
          <b>{camera.name}</b>
          <small>{camera.location || camera.ip_address}</small>
        </div>
        {online !== undefined && (
          <span className={`cam-live-badge ${isLive ? 'live-on' : 'live-off'}`}>
            {isLive ? 'LIVE' : 'OFFLINE'}
          </span>
        )}
      </div>

      <div className="cam-tile-meta">
        <span className={`cam-flag ${camera.ai_enabled ? 'on' : ''}`}>
          <Zap size={10} /> DET
        </span>
        <span className={`cam-flag ${camera.live_enabled ? 'on' : ''}`}>
          <Eye size={10} /> LIVE
        </span>
      </div>
    </div>
  );
}

// ---------- Live Feed Item ----------
function LiveFeedItem({ event, API, setPreviewImage, openPersonHistory, t }) {
  const personType = event.person?.person_type || 'unknown';
  return (
    <div className={`live-feed-item type-${personType}`}>
      <div className="lfi-img-wrap">
        <img
          src={thumbImage(API, event) || PLACEHOLDER_SVG}
          onError={e => { e.currentTarget.src = PLACEHOLDER_SVG; e.currentTarget.onerror = null; }}
          onClick={() => setPreviewImage(previewImage(API, event))}
          alt=""
        />
        <span className={`lfi-type-dot type-${personType}`} />
      </div>

      <div className="lfi-body">
        <b onClick={() => openPersonHistory?.(event.person_id)}>
          {displayPersonName(event)}
        </b>
        <p>
          <Camera size={10} /> {event.camera_name || 'Camera'}
        </p>
        <small>
          <Clock size={10} /> {formatRelative(event.created_at)}
        </small>
        {event.is_low_quality && (
          <span className="low-quality-badge">{t('lowQualityBadge')}</span>
        )}
      </div>
    </div>
  );
}

// ============================================================
// MAIN DASHBOARD
// ============================================================
function QualityWidget({ API, authFetch }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!authFetch) return;
    authFetch(API + '/api/analytics/quality-stats?days=7')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d.cameras); })
      .catch(() => {});
  }, [authFetch]);

  if (!data || data.length === 0) return null;

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3 style={{ marginBottom: 12, fontSize: 14, color: 'var(--muted)' }}>
        Face Quality by Camera (7 days)
      </h3>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
              <th style={{ padding: '4px 8px' }}>Camera</th>
              <th style={{ padding: '4px 8px', textAlign: 'center' }}>Total</th>
              <th style={{ padding: '4px 8px', textAlign: 'center' }}>Good</th>
              <th style={{ padding: '4px 8px', textAlign: 'center' }}>Low Q %</th>
              <th style={{ padding: '4px 8px', textAlign: 'center' }}>Avg Score</th>
              <th style={{ padding: '4px 8px' }}>Quality Bar</th>
            </tr>
          </thead>
          <tbody>
            {data.map(row => (
              <tr key={row.camera} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 8px', fontWeight: 600 }}>{row.camera}</td>
                <td style={{ padding: '6px 8px', textAlign: 'center' }}>{row.total}</td>
                <td style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--success)' }}>{row.good_quality}</td>
                <td style={{ padding: '6px 8px', textAlign: 'center', color: row.low_quality_pct > 30 ? 'var(--danger)' : 'var(--muted)' }}>
                  {row.low_quality_pct}%
                </td>
                <td style={{ padding: '6px 8px', textAlign: 'center' }}>{row.avg_quality}</td>
                <td style={{ padding: '6px 8px', minWidth: 120 }}>
                  <div style={{ background: 'var(--bg-2)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${100 - row.low_quality_pct}%`,
                      background: row.low_quality_pct > 30 ? '#ef4444' : row.low_quality_pct > 15 ? '#f59e0b' : '#22c55e',
                      transition: 'width 0.4s',
                    }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


export default function DashboardPro({
  stats, events, cameras, openStatSection, delEvent,
  setPreviewImage, canDelete, openPersonHistory, t, API, authFetch,
}) {
  const activeCams = (cameras || []).filter(c => c.is_active).length;
  const totalCams = cameras?.length || stats?.total_cameras || 0;
  const latest = events.slice(0, 10);
  const healthCameras = (cameras || []).slice(0, 8);

  // Live camera health status (online/offline from worker pool)
  const [healthStatus, setHealthStatus] = useState({});
  useEffect(() => {
    if (!authFetch) return;
    const fetch_ = () =>
      authFetch(API + '/api/cameras/health-status')
        .then(r => r.ok ? r.json() : [])
        .then(list => {
          const map = {};
          list.forEach(c => { map[c.id] = c.online; });
          setHealthStatus(map);
        })
        .catch(() => {});
    fetch_();
    const iv = setInterval(fetch_, 60000);
    return () => clearInterval(iv);
  }, []);

  // ----- Sparkline data from hourly -----
  const hourly = stats?.hourly || [];
  const sparkEvents = hourly.slice(-12);

  // ----- Widget drag-drop order -----
  const DEFAULT_ORDER = ['events','cameras','persons','vip','employee','blacklist','today','quality'];
  const [widgetOrder, setWidgetOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dash_widget_order') || 'null') || DEFAULT_ORDER; }
    catch { return DEFAULT_ORDER; }
  });
  const dragWidget = useRef(null);
  const onWidgetDragStart = (id) => { dragWidget.current = id; };
  const onWidgetDrop = (targetId) => {
    if (!dragWidget.current || dragWidget.current === targetId) return;
    setWidgetOrder(prev => {
      const arr = [...prev];
      const from = arr.indexOf(dragWidget.current), to = arr.indexOf(targetId);
      if (from < 0 || to < 0) return prev;
      arr.splice(from, 1); arr.splice(to, 0, dragWidget.current);
      localStorage.setItem('dash_widget_order', JSON.stringify(arr));
      return arr;
    });
    dragWidget.current = null;
  };

  // Trend % (last 6h vs previous 6h)
  const trend = useMemo(() => {
    if (hourly.length < 12) return null;
    const recent = hourly.slice(-6).reduce((s, h) => s + (h.count || 0), 0);
    const prev = hourly.slice(-12, -6).reduce((s, h) => s + (h.count || 0), 0);
    if (prev === 0) return recent > 0 ? 100 : 0;
    return Math.round(((recent - prev) / prev) * 100);
  }, [hourly]);

  // Low quality ratio
  const lowQualityRatio = useMemo(() => {
    const total = stats?.total_events || 0;
    const low = stats?.low_quality_count || 0;
    if (!total) return 0;
    return Math.round((low / total) * 100);
  }, [stats]);

  return (
    <>
      {/* ======== HERO ======== */}
      <div className="card dash-hero-pro">
        <div className="hero-content">
          <span className="hero-kicker">
            <span className="live-dot" />
            ENTERPRISE FACE ANALYTICS
          </span>
          <h2>{t('realtime')}</h2>
          <p>
            Live detection - Identity grouping - Attendance -
            Quality filtering - Security alerts - all in one command center.
          </p>
          <div className="hero-actions">
            <button className="save-btn" onClick={() => openStatSection('events', 'all')}>
              <Camera size={16} /> {t('faceEvents')}
            </button>
            <button className="ghost-btn" onClick={() => openStatSection('persons', 'all')}>
              <Users size={16} /> {t('personsDb')}
            </button>
            <button className="ghost-btn" onClick={() => openStatSection('search')}>
              <Activity size={16} /> {t('search')}
            </button>
          </div>
        </div>

        <div className="hero-panel-pro">
          <div className="radar-ring-pro">
            <Camera size={32} />
          </div>
          <div className="hero-panel-stat">
            <strong>{events.length}</strong>
            <small>{t('latestCaptures')}</small>
          </div>
          <div className="hero-panel-meta">
            <span className="top-status online"><span /> WebSocket Live</span>
            <span className="hero-time">
              <Clock size={11} /> Asia/Yerevan
            </span>
          </div>
        </div>
      </div>

      {/* ======== KPI ROW (drag-drop reorderable) ======== */}
      {(() => {
        const WIDGETS = {
          events:    <KpiCard icon={Camera}      title={t('totalEvents')}       value={stats?.total_events ?? 0}        trend={trend} sparkData={sparkEvents} color="primary"  onClick={() => openStatSection('events','all')} />,
          cameras:   <KpiCard icon={Activity}    title={t('activeCameras')}     value={`${activeCams}/${totalCams}`}    color={activeCams===totalCams&&totalCams>0?'success':'warning'} onClick={() => openStatSection('cameras')} />,
          persons:   <KpiCard icon={Users}       title={t('registeredPersons')} value={stats?.total_persons ?? 0}       color="info"    onClick={() => openStatSection('persons','all')} />,
          employee:  <KpiCard icon={Briefcase}   title={t('employees')}         value={stats?.employee_count ?? 0}      color="success" onClick={() => openStatSection('persons','employee')} />,
          vip:       <KpiCard icon={Crown}       title={t('vipClients')}        value={stats?.vip_count ?? 0}           color="vip"     onClick={() => openStatSection('persons','vip')} />,
          blacklist: <KpiCard icon={ShieldAlert} title={t('blacklist')}         value={stats?.blacklist_count ?? 0}     color="danger"  onClick={() => openStatSection('persons','blacklist')} />,
          today:     <KpiCard icon={Eye}         title={t('todayEvents')}       value={stats?.today_events ?? 0}        color="info"    onClick={() => openStatSection('events','today')} />,
          quality:   <KpiCard icon={AlertTriangle} title={t('lowQuality')}     value={`${stats?.low_quality_count ?? 0}`} trend={lowQualityRatio > 0 ? -lowQualityRatio : null} color="warning" onClick={() => openStatSection('events','low_quality')} />,
        };
        return (
          <div className="kpi-grid">
            {widgetOrder.filter(id => WIDGETS[id]).map(id => (
              <div key={id} className="kpi-drag-wrap"
                draggable
                onDragStart={() => onWidgetDragStart(id)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => onWidgetDrop(id)}
              >
                {WIDGETS[id]}
                <div className="kpi-drag-handle" title="Drag to reorder">⠿</div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* ======== CHARTS ROW ======== */}
      <div className="charts-grid-pro">
        <ChartCard title={t('hourly')} badge="24H">
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={stats?.hourly || []} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="hourly-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
              <XAxis dataKey="hour" stroke="var(--muted-2)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} stroke="var(--muted-2)" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--primary)', strokeDasharray: '4 4' }} />
              <Area
                type="monotone"
                dataKey="count"
                stroke="var(--primary)"
                strokeWidth={2.5}
                fill="url(#hourly-grad)"
                isAnimationActive={true}
                animationDuration={800}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t('topCameras')} badge="TOP">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={stats?.top_cameras || []} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="bar-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={1} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.6} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" vertical={false} />
              <XAxis dataKey="camera" stroke="var(--muted-2)" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} stroke="var(--muted-2)" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--card-2)' }} />
              <Bar
                dataKey="count"
                fill="url(#bar-grad)"
                radius={[8, 8, 0, 0]}
                isAnimationActive={true}
                animationDuration={800}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ======== CAMERA HEALTH + LIVE FEED ======== */}
      <div className="bottom-grid-pro">
        <div className="card camera-health-pro">
          <div className="card-title-row">
            <h3>{t('camerasTitle')}</h3>
            <span>{activeCams} ACTIVE</span>
          </div>
          <div className="cam-tile-grid">
            {(healthCameras.length ? healthCameras : [
              { id: 'demo', name: 'Camera 01', ip_address: '172.16.11.197', location: 'Main entrance', is_active: true, ai_enabled: true, live_enabled: true }
            ]).map(c => (
              <CameraHealthTile
                key={c.id}
                camera={c}
                online={healthStatus[c.id]}
                onClick={() => openStatSection('cameras')}
              />
            ))}
          </div>
        </div>

        <div className="card live-feed-pro">
          <div className="card-title-row">
            <h3>{t('latestCaptures')}</h3>
            <span className="live-badge">
              <span className="live-pulse-dot" />
              LIVE
            </span>
          </div>
          <div className="live-feed-list">
            {latest.length === 0 ? (
              <div className="empty-feed">
                <Camera size={32} />
                <p>Waiting for events...</p>
              </div>
            ) : (
              latest.map(e => (
                <LiveFeedItem
                  key={e.id}
                  event={e}
                  API={API}
                  setPreviewImage={setPreviewImage}
                  openPersonHistory={openPersonHistory}
                  t={t}
                />
              ))
            )}
          </div>
        </div>
      </div>

      <QualityWidget API={API} authFetch={authFetch} />
    </>
  );
}
