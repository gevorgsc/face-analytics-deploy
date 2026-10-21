// ============================================================
// AttendanceTimelinePro.jsx - GSC Face Analytics Pro
// Enterprise vertical timeline for attendance
// ============================================================

import React, { useMemo } from 'react';
import {
  Clock, Camera as CameraIcon, History, AlertTriangle,
  Crown, Briefcase, ShieldAlert, User, Calendar,
  Activity, Users, TrendingUp, ArrowDown, ArrowUp
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

const PLACEHOLDER_SVG = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">' +
  '<rect width="120" height="120" fill="#1f2937"/>' +
  '<circle cx="60" cy="45" r="20" fill="#374151"/>' +
  '<ellipse cx="60" cy="95" rx="32" ry="22" fill="#374151"/>' +
  '</svg>'
)}`;

function formatTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-US', {
    timeZone: 'Asia/Yerevan',
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

function getDateKey(value) {
  if (!value) return 'unknown';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Yerevan',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(value));
}

function getDateLabel(dateKey) {
  if (dateKey === 'unknown') return 'Unknown';
  const today = getDateKey(new Date());
  const yesterday = getDateKey(new Date(Date.now() - 86400000));
  if (dateKey === today) return 'Today';
  if (dateKey === yesterday) return 'Yesterday';
  const [y, m, d] = dateKey.split('-');
  return new Date(`${y}-${m}-${d}`).toLocaleString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

function getDayName(dateKey) {
  if (dateKey === 'unknown') return '';
  const [y, m, d] = dateKey.split('-');
  return new Date(`${y}-${m}-${d}`).toLocaleString('en-US', { weekday: 'long', timeZone: 'UTC' });
}

function TypeIcon({ type, size = 11 }) {
  switch (type) {
    case 'employee':  return <Briefcase size={size} />;
    case 'vip':       return <Crown size={size} />;
    case 'blacklist': return <ShieldAlert size={size} />;
    default:          return <User size={size} />;
  }
}

function TimelineEntry({ entry, setPreviewImage, openPersonHistory, t, API, isFirst, isLast }) {
  const personType = entry.person_type || 'unknown';
  const isLowQuality = !!entry.is_low_quality;

  return (
    <div className={`atp-entry type-${personType}`}>
      <div className="atp-time-col">
        <div className="atp-time">{formatTime(entry.created_at)}</div>
        <div className="atp-relative">{formatRelative(entry.created_at)}</div>
      </div>

      <div className="atp-rail">
        <div className={`atp-rail-line ${isFirst ? 'first' : ''} ${isLast ? 'last' : ''}`} />
        <div className={`atp-dot type-${personType}`}>
          <TypeIcon type={personType} size={10} />
        </div>
      </div>

      <div className={`atp-content type-${personType} ${isLowQuality ? 'is-low-q' : ''}`}>
        <div className="atp-content-img">
          <img
            src={thumbImage(API, entry) || PLACEHOLDER_SVG}
            onError={e => { e.currentTarget.src = PLACEHOLDER_SVG; e.currentTarget.onerror = null; }}
            onClick={() => setPreviewImage(previewImage(API, entry))}
            alt=""
          />
          {isLowQuality && (
            <span className="atp-lowq"><AlertTriangle size={9} /> LOW Q</span>
          )}
        </div>

        <div className="atp-content-body">
          <div className="atp-title-row">
            <b
              className="atp-title clickable-name"
              onClick={() => openPersonHistory?.(entry.person_id)}
            >
              {entry.title || 'Unknown Person'}
            </b>
            <span className={`atp-type-pill type-${personType}`}>
              <TypeIcon type={personType} size={9} />
              {personType?.toUpperCase()}
            </span>
            {entry.direction === 'in' && (
              <span className="atp-dir-badge atp-dir-in" title="Entered">
                <ArrowDown size={9} /> IN
              </span>
            )}
            {entry.direction === 'out' && (
              <span className="atp-dir-badge atp-dir-out" title="Exited">
                <ArrowUp size={9} /> OUT
              </span>
            )}
          </div>

          <div className="atp-meta">
            {entry.camera_name && (
              <span className="atp-meta-item">
                <CameraIcon size={11} />
                {entry.camera_name}
              </span>
            )}
            {entry.confidence && (
              <span className="atp-meta-item">
                <Activity size={11} />
                {(entry.confidence * 100).toFixed(0)}% match
              </span>
            )}
            {entry.face_quality && (
              <span className="atp-meta-item">
                Q:{Number(entry.face_quality).toFixed(1)}
              </span>
            )}
          </div>

          {isLowQuality && entry.quality_reason && (
            <div className="atp-reason">
              <AlertTriangle size={10} />
              {entry.quality_reason}
            </div>
          )}

          <button
            className="atp-history-btn"
            onClick={() => openPersonHistory?.(entry.person_id)}
          >
            <History size={11} />
            {t('history')}
          </button>
        </div>
      </div>
    </div>
  );
}

function DayGroup({ dateKey, entries, setPreviewImage, openPersonHistory, t, API }) {
  const uniquePersons = new Set(entries.map(e => e.person_id).filter(Boolean)).size;

  return (
    <div className="atp-day-group">
      <div className="atp-day-header">
        <div className="atp-day-label">
          <Calendar size={14} />
          <div>
            <b>{getDateLabel(dateKey)}</b>
            <small>{getDayName(dateKey)}</small>
          </div>
        </div>
        <div className="atp-day-stats">
          <span className="atp-day-stat">
            <Activity size={11} />
            <b>{entries.length}</b> events
          </span>
          <span className="atp-day-stat">
            <Users size={11} />
            <b>{uniquePersons}</b> persons
          </span>
        </div>
      </div>

      <div className="atp-entries">
        {entries.map((entry, idx) => (
          <TimelineEntry
            key={entry.id}
            entry={entry}
            setPreviewImage={setPreviewImage}
            openPersonHistory={openPersonHistory}
            t={t}
            API={API}
            isFirst={idx === 0}
            isLast={idx === entries.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

function EmptyAttendance() {
  return (
    <div className="atp-empty">
      <Activity size={42} />
      <h3>No attendance records</h3>
      <p>Visits and attendance events will appear here.</p>
    </div>
  );
}

export default function AttendanceTimelinePro({
  attendance, setPreviewImage, openPersonHistory, t, API,
}) {
  const grouped = useMemo(() => {
    if (!attendance || attendance.length === 0) return [];
    const groups = {};
    for (const entry of attendance) {
      const key = getDateKey(entry.created_at);
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry);
    }
    const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    return sortedKeys.map(key => ({
      key,
      entries: groups[key].sort((a, b) =>
        new Date(b.created_at) - new Date(a.created_at)
      ),
    }));
  }, [attendance]);

  const stats = useMemo(() => {
    if (!attendance || attendance.length === 0) return null;
    const today = getDateKey(new Date());
    const todayEvents = attendance.filter(e => getDateKey(e.created_at) === today);
    return {
      total: attendance.length,
      todayCount: todayEvents.length,
      uniqueToday: new Set(todayEvents.map(e => e.person_id).filter(Boolean)).size,
      uniqueTotal: new Set(attendance.map(e => e.person_id).filter(Boolean)).size,
    };
  }, [attendance]);

  if (!attendance || attendance.length === 0) return <EmptyAttendance />;

  return (
    <>
      {stats && (
        <div className="atp-stats-bar">
          <div className="atp-stat-card">
            <div className="atp-stat-icon"><Activity size={16} /></div>
            <div><small>TODAY</small><b>{stats.todayCount}</b><span>events</span></div>
          </div>
          <div className="atp-stat-card">
            <div className="atp-stat-icon stat-success"><Users size={16} /></div>
            <div><small>UNIQUE TODAY</small><b>{stats.uniqueToday}</b><span>persons</span></div>
          </div>
          <div className="atp-stat-card">
            <div className="atp-stat-icon stat-info"><TrendingUp size={16} /></div>
            <div><small>TOTAL</small><b>{stats.total}</b><span>events</span></div>
          </div>
          <div className="atp-stat-card">
            <div className="atp-stat-icon stat-vip"><User size={16} /></div>
            <div><small>ALL PERSONS</small><b>{stats.uniqueTotal}</b><span>unique</span></div>
          </div>
        </div>
      )}

      <div className="atp-timeline">
        {grouped.map(group => (
          <DayGroup
            key={group.key}
            dateKey={group.key}
            entries={group.entries}
            setPreviewImage={setPreviewImage}
            openPersonHistory={openPersonHistory}
            t={t}
            API={API}
          />
        ))}
      </div>
    </>
  );
}
