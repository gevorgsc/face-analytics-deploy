// ============================================================
// PersonHistoryModalPro.jsx - GSC Face Analytics Pro
// Modern history modal with heatmap, camera breakdown, timeline
// ============================================================

import React, { useEffect, useMemo, useState } from 'react';
import {
  X, Camera as CameraIcon, Clock, Calendar, Activity,
  TrendingUp, MapPin, Crown, Briefcase, ShieldAlert, User,
  AlertTriangle, History, Merge, Route, ArrowDown, ArrowUp, Phone
} from 'lucide-react';
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

function formatTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-US', {
    timeZone: 'Asia/Yerevan',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
}

function getDateKey(value) {
  if (!value) return 'unknown';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Yerevan',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(value));
}

function getDateLabel(dateKey, t) {
  if (dateKey === 'unknown') return t('unknown');
  const today = getDateKey(new Date());
  const yesterday = getDateKey(new Date(Date.now() - 86400000));
  if (dateKey === today) return t('today');
  if (dateKey === yesterday) return t('yesterday');
  const [y, m, d] = dateKey.split('-');
  return new Date(`${y}-${m}-${d}`).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

function TypeIcon({ type, size = 12 }) {
  switch (type) {
    case 'employee':  return <Briefcase size={size} />;
    case 'vip':       return <Crown size={size} />;
    case 'blacklist': return <ShieldAlert size={size} />;
    default:          return <User size={size} />;
  }
}

// ============================================================
// MAIN
// ============================================================
export default function PersonHistoryModalPro({
  person, events, serverStats, totalEvents, loading, loadingMore, hasMore, onLoadMore,
  onClose, setPreviewImage, t, API, onMerge, authFetch,
}) {
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [merging, setMerging]   = useState(false);
  const [activeTab, setActiveTab] = useState('history'); // 'history' | 'journey'
  const [journey, setJourney]   = useState(null);
  const [journeyLoading, setJourneyLoading] = useState(false);

  useEffect(() => {
    setActiveTab('history');
    setJourney(null);
    setMergeTargetId('');
  }, [person?.id]);

  useEffect(() => {
    let cancelled = false;
    if (activeTab === 'journey' && !journey && person?.id && authFetch) {
      setJourneyLoading(true);
      authFetch(API + `/api/persons/${person.id}/journey?limit=200`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (!cancelled && d) setJourney(d); })
        .finally(() => { if (!cancelled) setJourneyLoading(false); });
    }
    return () => { cancelled = true; };
  }, [activeTab, journey, person?.id, authFetch, API]);
  // ----- Stats -----
  const stats = useMemo(() => {
    if (!events || events.length === 0) {
      return {
        total: Number.isFinite(totalEvents) ? totalEvents : 0,
        today: serverStats?.today_events || 0,
        week: serverStats?.last_7_days || 0,
        lowQ: serverStats?.low_quality_events || 0,
        cameraBreakdown: (serverStats?.camera_counts || []).map(item => ({
          name: item.camera,
          count: item.count,
        })),
        hourly: Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 })),
        firstSeen: null, lastSeen: null,
      };
    }

    const todayKey = getDateKey(new Date());
    const weekAgo = Date.now() - 7 * 86400000;

    const cameraMap = {};
    const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
    let todayCount = 0;
    let weekCount = 0;
    let lowQCount = 0;

    events.forEach(e => {
      const cam = e.camera_name || 'Unknown';
      cameraMap[cam] = (cameraMap[cam] || 0) + 1;

      if (e.created_at) {
        const t = new Date(e.created_at);
        const hour = Number(new Intl.DateTimeFormat('en-US', {
          timeZone: 'Asia/Yerevan', hour: '2-digit', hour12: false,
        }).format(t));
        if (hour >= 0 && hour < 24) hourly[hour].count++;

        if (getDateKey(t) === todayKey) todayCount++;
        if (t.getTime() >= weekAgo) weekCount++;
      }

      if (e.is_low_quality) lowQCount++;
    });

    const cameraBreakdown = serverStats?.camera_counts?.length
      ? serverStats.camera_counts.map(item => ({ name: item.camera, count: item.count }))
      : Object.entries(cameraMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

    // Sort events by time
    const sorted = events.slice().sort(
      (a, b) => new Date(a.created_at) - new Date(b.created_at)
    );

    return {
      total: Number.isFinite(totalEvents) ? totalEvents : events.length,
      today: serverStats?.today_events ?? todayCount,
      week: serverStats?.last_7_days ?? weekCount,
      lowQ: serverStats?.low_quality_events ?? lowQCount,
      cameraBreakdown,
      hourly,
      firstSeen: sorted[0]?.created_at,
      lastSeen: sorted[sorted.length - 1]?.created_at,
    };
  }, [events, serverStats, totalEvents]);

  // Group events by day
  const dayGroups = useMemo(() => {
    if (!events || !events.length) return [];
    const groups = {};
    events.forEach(e => {
      const key = getDateKey(e.created_at);
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    });
    const keys = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    return keys.map(k => ({
      key: k,
      entries: groups[k].sort((a, b) =>
        new Date(b.created_at) - new Date(a.created_at)
      ),
    }));
  }, [events]);

  const personType = person?.person_type || 'unknown';
  const maxHourly = Math.max(...stats.hourly.map(h => h.count), 1);

  return (
    <div className="modal-bg phm-bg" onClick={onClose}>
      <div className="modal-card phm-card" onClick={e => e.stopPropagation()}>
        {/* ===== HEADER ===== */}
        <div className={`phm-header type-${personType}`}>
          <div className="phm-header-content">
            <img
              src={img(API, person?.preview_image) || undefined}
              onClick={() => setPreviewImage(img(API, person?.preview_image))}
              alt={person?.full_name}
              className="phm-avatar"
            />

            <div className="phm-header-info">
              <span className={`phm-type-badge type-${personType}`}>
                <TypeIcon type={personType} size={11} />
                {personType?.toUpperCase()}
              </span>
              <h2>{person?.full_name || t('unnamedPerson')}</h2>

              <div className="phm-header-meta">
                {person?.department && (
                  <span><MapPin size={11} /> {person.department}</span>
                )}
                {person?.phone && (
                  <span><Phone size={11} /> {person.phone}</span>
                )}
                <span className="phm-face-id">{t('faceId')} #{person?.id}</span>
              </div>
            </div>
          </div>

          {onMerge && person?.person_type === 'unknown' && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginRight: 8 }}>
              <input
                type="number"
                placeholder={t('targetId')}
                value={mergeTargetId}
                onChange={e => setMergeTargetId(e.target.value)}
                style={{ width: 90, fontSize: 12, padding: '4px 6px' }}
              />
              <button
                className="save-btn"
                style={{ fontSize: 12, padding: '4px 10px' }}
                disabled={merging || !mergeTargetId}
                onClick={async () => {
                  if (!mergeTargetId) return;
                  setMerging(true);
                  await onMerge(person.id, Number(mergeTargetId));
                  setMerging(false);
                  onClose();
                }}
                title={t('mergeUnknownHint')}
              >
                <Merge size={13} />
                {merging ? '...' : t('mergeInto')}
              </button>
            </div>
          )}
          <button className="phm-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* ===== TABS ===== */}
        <div className="phm-tabs">
          <button className={activeTab === 'history' ? 'active' : ''} onClick={() => setActiveTab('history')}>
            <History size={13} /> {t('history')}
          </button>
          <button className={activeTab === 'journey' ? 'active' : ''} onClick={() => setActiveTab('journey')}>
            <Route size={13} /> {t('crossCameraJourney')}
          </button>
        </div>

        {/* ===== JOURNEY TAB ===== */}
        {activeTab === 'journey' && (
          <div className="phm-journey">
            {journeyLoading && <div className="phm-loading">{t('loadingJourney')}</div>}
            {!journeyLoading && journey && (
              <>
                <div className="journey-header">
                  <span>{journey.total_hops} {t('cameraAppearances')}</span>
                </div>
                <div className="journey-timeline">
                  {journey.hops.map((hop, i) => (
                    <div key={hop.event_id} className="journey-hop">
                      <div className="journey-hop-line">
                        <div className="journey-dot" />
                        {i < journey.hops.length - 1 && <div className="journey-connector" />}
                      </div>
                      <div className="journey-hop-content">
                        {hop.crop_image_path && (
                          <img
                            src={img(API, hop.crop_image_path)}
                            onClick={() => setPreviewImage(img(API, hop.crop_image_path))}
                            className="journey-thumb"
                            alt=""
                          />
                        )}
                        <div className="journey-hop-info">
                          <b>{hop.camera_name}</b>
                          <span className="journey-time">
                            {hop.created_at ? new Date(hop.created_at).toLocaleString('en-US', {
                              timeZone: 'Asia/Yerevan', month: 'short', day: 'numeric',
                              hour: '2-digit', minute: '2-digit', hour12: false,
                            }) : '-'}
                          </span>
                          {hop.direction && hop.direction !== 'both' && (
                            <span className={`journey-dir journey-dir-${hop.direction}`}>
                              {hop.direction === 'in' ? <ArrowDown size={10} /> : <ArrowUp size={10} />}
                              {hop.direction.toUpperCase()}
                            </span>
                          )}
                          {hop.confidence && (
                            <span className="journey-conf">{(hop.confidence * 100).toFixed(0)}%</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {!journeyLoading && !journey && (
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>{t('noJourneyData')}</div>
            )}
          </div>
        )}

        {/* ===== STATS / CHARTS / TIMELINE ===== */}
        <div style={activeTab === 'journey' ? { display: 'none' } : {}}>

        {/* ===== STATS ===== */}
        <div className="phm-stats">
          <div className="phm-stat">
            <div className="phm-stat-icon stat-primary"><Activity size={16} /></div>
            <div>
              <small>{t('totalVisits')}</small>
              <b>{stats.total}</b>
            </div>
          </div>
          <div className="phm-stat">
            <div className="phm-stat-icon stat-success"><TrendingUp size={16} /></div>
            <div>
              <small>{t('today')}</small>
              <b>{stats.today}</b>
            </div>
          </div>
          <div className="phm-stat">
            <div className="phm-stat-icon stat-info"><Calendar size={16} /></div>
            <div>
              <small>{t('last7Days')}</small>
              <b>{stats.week}</b>
            </div>
          </div>
          <div className="phm-stat">
            <div className="phm-stat-icon stat-warning"><AlertTriangle size={16} /></div>
            <div>
              <small>{t('lowQualityBadge')}</small>
              <b>{stats.lowQ}</b>
            </div>
          </div>
        </div>

        {/* ===== CHARTS ===== */}
        <div className="phm-charts">
          {/* Hourly heatmap */}
          <div className="phm-chart">
            <h3>{t('activityByHour')}</h3>
            <div className="phm-hourly-grid">
              {stats.hourly.map(h => {
                const intensity = h.count / maxHourly;
                return (
                  <div
                    key={h.hour}
                    className="phm-hour-cell"
                    style={{
                      background: h.count > 0
                        ? `rgba(37, 99, 235, ${0.15 + intensity * 0.85})`
                        : 'var(--card-2)',
                    }}
                    title={`${h.hour}:00 - ${h.count} ${t('eventsLabel')}`}
                  >
                    <small>{h.hour}</small>
                    {h.count > 0 && <b>{h.count}</b>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Camera breakdown */}
          <div className="phm-chart">
            <h3>{t('cameraDistribution')}</h3>
            {stats.cameraBreakdown.length > 0 ? (
              <div className="phm-cam-list">
                {stats.cameraBreakdown.map((c, i) => {
                  const percent = (c.count / Math.max(stats.total, 1)) * 100;
                  return (
                    <div key={c.name} className="phm-cam-row">
                      <div className="phm-cam-info">
                        <CameraIcon size={11} />
                        <span className="phm-cam-name">{c.name}</span>
                        <b>{c.count}</b>
                      </div>
                      <div className="phm-cam-bar">
                        <div
                          className="phm-cam-bar-fill"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="phm-no-data">{t('noData')}</div>
            )}
          </div>
        </div>

        {/* ===== TIMELINE ===== */}
        <div className="phm-timeline-section">
          <h3>
            <History size={16} /> {t('visitTimeline')}
          </h3>

          {loading && (
            <div className="phm-loading">{t('loadingHistory')}</div>
          )}

          {!loading && dayGroups.length === 0 && (
            <div className="phm-no-data">{t('noVisitsYet')}</div>
          )}

          {!loading && dayGroups.map(group => (
            <div key={group.key} className="phm-day-group">
              <div className="phm-day-label">
                <Calendar size={12} />
                <span>{getDateLabel(group.key, t)}</span>
                <small>{group.entries.length} {t('eventsLabel')}</small>
              </div>

              <div className="phm-day-entries">
                {group.entries.map(e => (
                  <div key={e.id} className="phm-entry">
                    <div className="phm-entry-time">
                      <Clock size={11} />
                      {formatTime(e.created_at)}
                    </div>
                    <div className="phm-entry-content">
                      <img
                        src={thumbImage(API, e)}
                        onClick={() => setPreviewImage(previewImage(API, e))}
                        alt=""
                      />
                      <div className="phm-entry-info">
                        <div className="phm-entry-meta">
                          <span><CameraIcon size={10} /> {e.camera_name || t('camera')}</span>
                          {e.confidence && (
                            <span><Activity size={10} /> {(e.confidence * 100).toFixed(0)}%</span>
                          )}
                          {e.face_quality && (
                            <span>Q:{Number(e.face_quality).toFixed(1)}</span>
                          )}
                        </div>
                        {e.is_low_quality && (
                          <span className="phm-low-q">
                            <AlertTriangle size={9} /> {t('lowQualityBadge')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!loading && hasMore && (
            <button
              type="button"
              className="phm-load-more"
              onClick={onLoadMore}
              disabled={loadingMore}
            >
              {loadingMore ? t('loadingHistory') : t('loadMore')}
            </button>
          )}
        </div>
        </div>{/* end history-content wrapper */}
      </div>
    </div>
  );
}
