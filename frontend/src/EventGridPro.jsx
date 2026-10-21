// EventGridPro.jsx - GSC Face Analytics Pro - Enterprise Face Events

import React, { useState, useMemo, useCallback, useRef, useEffect, memo } from 'react';
import {
  Trash2, Clock, Camera as CameraIcon, History, AlertTriangle,
  Crown, Briefcase, ShieldAlert, User, EyeOff, Eye,
  Filter, Search, X, Calendar, CheckSquare, Square, Download, XCircle,
  Mars, Venus, ArrowUpDown, ChevronDown, RefreshCw, WifiOff,
} from 'lucide-react';
import { mediaUrl } from './mediaUrl';

// -- Helpers -----------------------------------------------------------------

function img(API, path) { return mediaUrl(API, path); }

function thumbImage(API, item) {
  return img(API, item?.crop_image_path || item?.preview_image || item?.image_path || item?.original_image_path);
}
function previewImage(API, item) {
  return img(API, item?.original_image_path || item?.image_path || item?.crop_image_path || item?.preview_image);
}

const PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">' +
  '<rect width="120" height="120" fill="#1f2937"/>' +
  '<circle cx="60" cy="45" r="20" fill="#374151"/>' +
  '<ellipse cx="60" cy="95" rx="32" ry="22" fill="#374151"/>' +
  '</svg>'
)}`;

function imgWithFallback(API, item) {
  return [item?.crop_image_path, item?.preview_image, item?.image_path, item?.original_image_path]
    .filter(Boolean).map(p => img(API, p));
}

function handleImgError(e, API, item) {
  const tried = parseInt(e.currentTarget.dataset.triedIndex || '0');
  const sources = imgWithFallback(API, item);
  const next = tried + 1;
  if (next < sources.length) {
    e.currentTarget.dataset.triedIndex = next;
    e.currentTarget.src = sources[next];
  } else {
    e.currentTarget.src = PLACEHOLDER;
    e.currentTarget.onerror = null;
  }
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-US', {
    timeZone: 'Asia/Yerevan', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

const DATE_FILTERS = [
  { key: 'all',   label: 'All time' },
  { key: 'today', label: 'Today' },
  { key: 'week',  label: 'This week' },
];

function inDateRange(created_at, range, customFrom, customTo) {
  if (!created_at) return true;
  const d = new Date(created_at);
  if (range === 'custom') {
    if (customFrom && d < new Date(customFrom)) return false;
    if (customTo) {
      const to = new Date(customTo);
      to.setHours(23, 59, 59, 999);
      if (d > to) return false;
    }
    return true;
  }
  if (range === 'all') return true;
  const now = Date.now();
  if (range === 'today') return d.getTime() >= new Date().setHours(0, 0, 0, 0);
  if (range === 'week')  return d.getTime() >= now - 7 * 24 * 3600 * 1000;
  return true;
}

function toDateInputValue(date) {
  if (!date) return '';
  const d = new Date(date);
  return d.toISOString().split('T')[0];
}

function formatRelative(value) {
  if (!value) return '-';
  const sec = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

function displayPersonName(item) {
  if (!item) return 'Unknown';
  if (item.person?.full_name) return item.person.full_name;
  if (item.full_name) return item.full_name;
  if (item.display_name) return item.display_name;
  if (item.person_name && item.person_name !== 'Unknown Person') return item.person_name;
  const id = item.person_id || item.id;
  return id ? `Unknown #${id}` : 'Unknown';
}

// -- Type Icon & Badge --------------------------------------------------------

function TypeIcon({ type, size = 11 }) {
  const icons = { employee: Briefcase, vip: Crown, blacklist: ShieldAlert };
  const Icon = icons[type] || User;
  return <Icon size={size} />;
}

const TYPE_LABELS = { employee: 'EMPLOYEE', vip: 'VIP', blacklist: 'BLACKLIST', unknown: 'UNKNOWN' };

// -- Single Event Card --------------------------------------------------------

const EventCard = memo(function EventCard({ event, delEvent, setPreviewImage, canDelete, openPersonHistory, t, API, isSelected, onToggleSelect }) {
  const personType = event.person?.person_type || 'unknown';
  const isLowQ = !!event.is_low_quality;
  const confidence = event.confidence ? Math.round(event.confidence * 100) : null;
  const faceQuality = event.face_quality != null ? Number(event.face_quality).toFixed(1) : null;
  const name = displayPersonName(event);

  return (
    <div className={`ecard type-${personType} ${isLowQ ? 'ecard-lowq' : ''} ${isSelected ? 'ecard-selected' : ''}`}>

      {/* Checkbox */}
      <button className="ecard-checkbox" onClick={e => { e.stopPropagation(); onToggleSelect(event.id); }}>
        {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
      </button>

      {/* Image */}
      <div className="ecard-img-wrap">
        <img
          src={thumbImage(API, event) || PLACEHOLDER}
          onError={e => handleImgError(e, API, event)}
          onClick={() => setPreviewImage(previewImage(API, event))}
          alt=""
          className="ecard-img"
        />

        {/* Overlays */}
        <span className={`ecard-badge type-${personType}`}>
          <TypeIcon type={personType} size={9} />
          {TYPE_LABELS[personType] || personType.toUpperCase()}
        </span>

        <span className="ecard-time">
          <Clock size={9} />
          {formatRelative(event.created_at)}
        </span>

        {isLowQ && (
          <span className="ecard-lowq-badge">
            <AlertTriangle size={9} />
            LOW Q
          </span>
        )}

        {canDelete && (
          <button
            className="ecard-del"
            onClick={e => { e.stopPropagation(); delEvent(event.id); }}
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="ecard-body">
        <b className="ecard-name" onClick={() => openPersonHistory?.(event.person_id)}>
          {name}
        </b>

        <div className="ecard-camera">
          <CameraIcon size={10} />
          {event.camera_name || 'Camera'}
        </div>

        {/* Metrics */}
        <div className="ecard-metrics">
          {confidence != null && (
            <span className="ecard-metric ecard-metric-match" title="Match confidence">
              <small>MATCH</small>
              <b>{confidence}%</b>
            </span>
          )}
          {faceQuality != null && (
            <span className={`ecard-metric ecard-metric-q ${isLowQ ? 'lowq' : ''}`} title="Face quality">
              <small>QUAL</small>
              <b>{faceQuality}</b>
            </span>
          )}
          {(event.age || event.gender) && (
            <span
              className={`ecard-metric ecard-ag ${event.gender === 'Female' ? 'ecard-ag-f' : event.gender === 'Male' ? 'ecard-ag-m' : ''}`}
              title={`${event.gender || ''} ${event.age ? event.age + ' yr' : ''}`}
            >
              {event.gender === 'Male'   && <Mars  size={11} />}
              {event.gender === 'Female' && <Venus size={11} />}
              {event.age && <b>{event.age}</b>}
              {!event.gender && event.age && <small>yr</small>}
            </span>
          )}
        </div>

        {isLowQ && event.quality_reason && (
          <div className="ecard-reason">
            <AlertTriangle size={9} />
            {event.quality_reason.replace(/_/g, ' ')}
          </div>
        )}

        <div className="ecard-footer">
          <small>{formatDateTime(event.created_at)}</small>
          <button className="ecard-hist" onClick={() => openPersonHistory?.(event.person_id)}>
            <History size={10} />
            {t('history')}
          </button>
        </div>
      </div>
    </div>
  );
});

// -- Filter Bar ---------------------------------------------------------------

const FILTERS = [
  { key: 'all',       label: 'All' },
  { key: 'employee',  label: 'Employees' },
  { key: 'vip',       label: 'VIP' },
  { key: 'blacklist', label: 'Blacklist' },
  { key: 'unknown',   label: 'Unknown' },
];

const AGE_RANGES = [
  { key: 'all',   label: 'All Ages' },
  { key: '0-18',  label: '0–18' },
  { key: '19-30', label: '19–30' },
  { key: '31-45', label: '31–45' },
  { key: '46-60', label: '46–60' },
  { key: '60+',   label: '60+' },
];

const GENDER_OPTIONS = [
  { key: 'all',    label: 'All Genders' },
  { key: 'Male',   label: 'Male' },
  { key: 'Female', label: 'Female' },
];

const DIRECTION_OPTIONS = [
  { key: 'all',  label: 'All Directions' },
  { key: 'in',   label: 'IN' },
  { key: 'out',  label: 'OUT' },
  { key: 'both', label: 'BOTH' },
];

const CONFIDENCE_OPTIONS = [
  { key: 0,   label: 'Any Match' },
  { key: 0.5, label: '≥ 50%' },
  { key: 0.7, label: '≥ 70%' },
  { key: 0.8, label: '≥ 80%' },
  { key: 0.9, label: '≥ 90%' },
];

function DateRangePicker({ dateRange, setDateRange, customFrom, setCustomFrom, customTo, setCustomTo }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [open]);

  const label = useMemo(() => {
    if (dateRange === 'today') return 'Today';
    if (dateRange === 'week')  return 'This week';
    if (dateRange === 'custom') {
      if (customFrom && customTo) return `${customFrom} → ${customTo}`;
      if (customFrom) return `From ${customFrom}`;
      if (customTo)   return `Until ${customTo}`;
      return 'Custom';
    }
    return 'All time';
  }, [dateRange, customFrom, customTo]);

  const isActive = dateRange !== 'all';

  return (
    <div className="date-range-wrap" ref={ref}>
      <button
        className={`date-range-btn ${isActive ? 'active' : ''}`}
        onClick={() => setOpen(v => !v)}
      >
        <Calendar size={13} />
        <span>{label}</span>
        <ChevronDown size={12} style={{ opacity: 0.6 }} />
      </button>

      {open && (
        <div className="date-range-dropdown">
          {/* Quick presets */}
          <div className="drp-presets">
            {[
              { key: 'all',   label: 'All time' },
              { key: 'today', label: 'Today' },
              { key: 'week',  label: 'This week' },
            ].map(p => (
              <button
                key={p.key}
                className={`drp-preset ${dateRange === p.key ? 'active' : ''}`}
                onClick={() => { setDateRange(p.key); setCustomFrom(''); setCustomTo(''); setOpen(false); }}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="drp-divider" />

          {/* Custom range inputs */}
          <div className="drp-custom">
            <span className="drp-custom-label">Custom range</span>
            <div className="drp-inputs">
              <div className="drp-input-wrap">
                <label>From</label>
                <input
                  type="date"
                  value={customFrom}
                  max={customTo || undefined}
                  onChange={e => { setCustomFrom(e.target.value); setDateRange('custom'); }}
                />
              </div>
              <span className="drp-arrow">→</span>
              <div className="drp-input-wrap">
                <label>To</label>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom || undefined}
                  onChange={e => { setCustomTo(e.target.value); setDateRange('custom'); }}
                />
              </div>
            </div>
            {dateRange === 'custom' && (customFrom || customTo) && (
              <button
                className="drp-clear"
                onClick={() => { setDateRange('all'); setCustomFrom(''); setCustomTo(''); }}
              >
                <X size={11} /> Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FilterBar({
  active, setActive, hideLowQ, setHideLowQ, counts, lowQCount,
  cameras, cameraFilter, setCameraFilter,
  search, setSearch,
  dateRange, setDateRange, customFrom, setCustomFrom, customTo, setCustomTo,
  visibleCount, totalEvents,
  ageFilter, setAgeFilter,
  genderFilter, setGenderFilter,
  directionFilter, setDirectionFilter,
  minConfidence, setMinConfidence,
  onClearAll,
}) {
  const hasAdvanced = ageFilter !== 'all' || genderFilter !== 'all' ||
    directionFilter !== 'all' || minConfidence > 0;

  return (
    <div className="egrid-filterbar">

      {/* Row 1: type chips + controls */}
      <div className="egrid-filterbar-row">
        <div className="egrid-type-filters">
          {FILTERS.map(f => (
            <button
              key={f.key}
              className={`egrid-filter-btn ${active === f.key ? 'active' : ''} ${f.key !== 'all' ? `filter-${f.key}` : ''}`}
              onClick={() => setActive(f.key)}
            >
              {f.label}
              <span className="egrid-filter-count">
                {f.key === 'all' ? (totalEvents || counts.total) : (counts[f.key] || 0)}
              </span>
            </button>
          ))}
        </div>

        <div className="egrid-filterbar-right">
          <span className="egrid-loaded-count" title="Loaded and visible face events">
            {visibleCount} / {totalEvents || counts.total} events
          </span>
          {cameras && cameras.length > 1 && (
            <select className="egrid-camera-select" value={cameraFilter} onChange={e => setCameraFilter(e.target.value)}>
              <option value="all">All Cameras</option>
              {cameras.map(cam => <option key={cam} value={cam}>{cam}</option>)}
            </select>
          )}
          <button
            className={`egrid-lowq-toggle ${hideLowQ ? 'hiding' : ''}`}
            onClick={() => setHideLowQ(!hideLowQ)}
            title={hideLowQ ? 'Show low-quality' : 'Hide low-quality'}
          >
            {hideLowQ ? <Eye size={13} /> : <EyeOff size={13} />}
            Low Q
            {lowQCount > 0 && <span className="egrid-lowq-count">{lowQCount}</span>}
          </button>
        </div>
      </div>

      {/* Row 2: search + date */}
      <div className="egrid-filterbar-row egrid-search-row">
        <div className="egrid-search-wrap">
          <Search size={13} className="egrid-search-icon" />
          <input
            className="egrid-search-input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by person name..."
          />
          {search && (
            <button className="egrid-search-clear" onClick={() => setSearch('')}>
              <X size={12} />
            </button>
          )}
        </div>

        <DateRangePicker
          dateRange={dateRange}
          setDateRange={setDateRange}
          customFrom={customFrom}
          setCustomFrom={setCustomFrom}
          customTo={customTo}
          setCustomTo={setCustomTo}
        />
      </div>

      {/* Row 3: age / gender / direction / confidence */}
      <div className="egrid-filterbar-row egrid-adv-row">
        <div className="egrid-adv-filters">

          <div className={`egrid-adv-pill ${ageFilter !== 'all' ? 'active' : ''}`}>
            <User size={11} />
            <select value={ageFilter} onChange={e => setAgeFilter(e.target.value)}>
              {AGE_RANGES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>

          <div className={`egrid-adv-pill ${genderFilter !== 'all' ? 'active' : ''}`}>
            <Mars size={11} />
            <select value={genderFilter} onChange={e => setGenderFilter(e.target.value)}>
              {GENDER_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>

          <div className={`egrid-adv-pill ${directionFilter !== 'all' ? 'active' : ''}`}>
            <ArrowUpDown size={11} />
            <select value={directionFilter} onChange={e => setDirectionFilter(e.target.value)}>
              {DIRECTION_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>

          <div className={`egrid-adv-pill ${minConfidence > 0 ? 'active' : ''}`}>
            <Filter size={11} />
            <select value={minConfidence} onChange={e => setMinConfidence(Number(e.target.value))}>
              {CONFIDENCE_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </div>

        </div>

        {(hasAdvanced || hideLowQ || cameraFilter !== 'all' || search || dateRange !== 'all') && (
          <button className="egrid-clear-all-btn" onClick={onClearAll}>
            <X size={11} /> Clear all
          </button>
        )}
      </div>

    </div>
  );
}

// -- Main Export --------------------------------------------------------------

// -- Bulk action bar ----------------------------------------------------------

function BulkBar({ selected, total, onSelectAll, onClear, onDeleteSelected, onExportSelected, canDelete }) {
  if (selected.size === 0) return null;
  return (
    <div className="egrid-bulk-bar">
      <span className="egrid-bulk-count">
        <CheckSquare size={14} />
        {selected.size} selected
      </span>
      <button className="egrid-bulk-btn" onClick={onSelectAll}>
        Select all {total}
      </button>
      <button className="egrid-bulk-btn" onClick={onClear}>
        <XCircle size={13} /> Clear
      </button>
      <div className="egrid-bulk-sep" />
      <button className="egrid-bulk-btn egrid-bulk-export" onClick={onExportSelected}>
        <Download size={13} /> Export CSV
      </button>
      {canDelete && (
        <button className="egrid-bulk-btn egrid-bulk-delete" onClick={onDeleteSelected}>
          <Trash2 size={13} /> Delete selected
        </button>
      )}
    </div>
  );
}

// -- Main Export --------------------------------------------------------------

function pageItems(current, total) {
  if (total <= 10) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, 2, total - 1, total, current - 1, current, current + 1]);
  const ordered = [...pages].filter(p => p >= 1 && p <= total).sort((a, b) => a - b);
  const result = [];
  for (const page of ordered) {
    const prev = result[result.length - 1];
    if (prev && page - prev > 1) result.push('...');
    result.push(page);
  }
  return result;
}

function PaginationBar({ page, pageSize, totalEvents, visibleCount, onPageChange }) {
  const totalPages = Math.max(1, Math.ceil((totalEvents || 0) / pageSize));
  const start = totalEvents === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(totalEvents, (page - 1) * pageSize + visibleCount);
  if (totalPages <= 1) return null;

  return (
    <div className="egrid-pagination">
      <span className="egrid-page-summary">{start}-{end} / {totalEvents}</span>
      <div className="egrid-page-buttons">
        {pageItems(page, totalPages).map((item, index) => (
          item === '...' ? (
            <span key={`ellipsis-${index}`} className="egrid-page-ellipsis">...</span>
          ) : (
            <button
              key={item}
              className={`egrid-page-btn ${item === page ? 'active' : ''}`}
              onClick={() => onPageChange(item)}
            >
              {item}
            </button>
          )
        ))}
      </div>
    </div>
  );
}

export default function EventGridPro({
  events,
  cameras,
  page = 1,
  pageSize = 100,
  totalEvents = 0,
  onPageChange = () => {},
  delEvent,
  setPreviewImage,
  canDelete,
  openPersonHistory,
  loading = false,
  error = null,
  onRetry,
  t,
  API,
}) {
  const [typeFilter, setTypeFilter] = useState('all');
  const [hideLowQ, setHideLowQ] = useState(true);
  const [cameraFilter, setCameraFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState('all');
  const [ageFilter, setAgeFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [directionFilter, setDirectionFilter] = useState('all');
  const [minConfidence, setMinConfidence] = useState(0);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [selected, setSelected] = useState(new Set());

  const clearAllFilters = useCallback(() => {
    setTypeFilter('all'); setHideLowQ(true); setCameraFilter('all');
    setSearch(''); setDateRange('all'); setCustomFrom(''); setCustomTo('');
    setAgeFilter('all'); setGenderFilter('all');
    setDirectionFilter('all'); setMinConfidence(0);
    setSelected(new Set());
  }, []);

  const toggleSelect = useCallback((id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const clearSelected = useCallback(() => setSelected(new Set()), []);

  const handleDeleteSelected = useCallback(async () => {
    if (!confirm(`Delete ${selected.size} events?`)) return;
    for (const id of selected) await delEvent(id);
    setSelected(new Set());
  }, [selected, delEvent]);

  const handleExportCSV = useCallback(() => {
    const rows = [['ID', 'Person', 'Type', 'Camera', 'Confidence', 'Age', 'Gender', 'Created At']];
    const toExport = filtered.filter(e => selected.has(e.id));
    for (const e of toExport) {
      rows.push([
        e.id,
        displayPersonName(e),
        e.person?.person_type || 'unknown',
        e.camera_name || '',
        e.confidence ? Math.round(e.confidence * 100) + '%' : '',
        e.age || '',
        e.gender || '',
        e.created_at || '',
      ]);
    }
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `events_export_${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }, [selected]);

  const counts = useMemo(() => {
    if (!events) return { total: 0 };
    const c = { total: events.length };
    for (const e of events) {
      const pt = e.person?.person_type || 'unknown';
      c[pt] = (c[pt] || 0) + 1;
    }
    return c;
  }, [events]);

  const lowQCount = useMemo(
    () => (events || []).filter(e => e.is_low_quality).length,
    [events]
  );

  const filtered = useMemo(() => {
    if (!events) return [];
    let result = events;
    if (typeFilter !== 'all') result = result.filter(e => (e.person?.person_type || 'unknown') === typeFilter);
    if (cameraFilter !== 'all') result = result.filter(e => e.camera_name === cameraFilter);
    if (hideLowQ) result = result.filter(e => !e.is_low_quality);
    if (dateRange !== 'all') result = result.filter(e => inDateRange(e.created_at, dateRange, customFrom, customTo));
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(e => displayPersonName(e).toLowerCase().includes(q));
    }
    if (genderFilter !== 'all')
      result = result.filter(e => e.gender === genderFilter);
    if (ageFilter !== 'all') {
      result = result.filter(e => {
        if (e.age == null) return false;
        const a = Number(e.age);
        if (ageFilter === '0-18')  return a <= 18;
        if (ageFilter === '19-30') return a >= 19 && a <= 30;
        if (ageFilter === '31-45') return a >= 31 && a <= 45;
        if (ageFilter === '46-60') return a >= 46 && a <= 60;
        if (ageFilter === '60+')   return a > 60;
        return true;
      });
    }
    if (directionFilter !== 'all')
      result = result.filter(e => e.direction === directionFilter);
    if (minConfidence > 0)
      result = result.filter(e => e.confidence != null && e.confidence >= minConfidence);
    return result;
  }, [events, typeFilter, cameraFilter, hideLowQ, dateRange, customFrom, customTo,
      search, ageFilter, genderFilter, directionFilter, minConfidence]);

  if (error) {
    return (
      <div className="egrid-empty">
        <WifiOff size={40} style={{ opacity: .4 }} />
        <h3>Failed to load events</h3>
        <p style={{ color: 'var(--muted)' }}>{error}</p>
        {onRetry && (
          <button className="ghost-btn" onClick={onRetry} style={{ marginTop: 8 }}>
            <RefreshCw size={13} /> Try again
          </button>
        )}
      </div>
    );
  }

  if (loading && (!events || events.length === 0)) {
    return (
      <div className="egrid-empty">
        <RefreshCw size={36} className="spin" style={{ opacity: .4 }} />
        <p style={{ color: 'var(--muted)', marginTop: 12 }}>Loading events…</p>
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <div className="egrid-empty">
        <CameraIcon size={40} />
        <h3>No face events yet</h3>
        <p>Waiting for camera captures...</p>
      </div>
    );
  }

  return (
    <div className={`egrid-root${loading ? ' egrid-refreshing' : ''}`}>
      {loading && events && events.length > 0 && (
        <div className="egrid-loading-bar"><RefreshCw size={12} className="spin" /> Refreshing…</div>
      )}
      <FilterBar
        active={typeFilter}
        setActive={setTypeFilter}
        hideLowQ={hideLowQ}
        setHideLowQ={setHideLowQ}
        counts={counts}
        lowQCount={lowQCount}
        cameras={cameras}
        cameraFilter={cameraFilter}
        setCameraFilter={setCameraFilter}
        search={search}
        setSearch={setSearch}
        dateRange={dateRange}
        setDateRange={setDateRange}
        customFrom={customFrom}
        setCustomFrom={setCustomFrom}
        customTo={customTo}
        setCustomTo={setCustomTo}
        ageFilter={ageFilter}
        setAgeFilter={setAgeFilter}
        genderFilter={genderFilter}
        setGenderFilter={setGenderFilter}
        directionFilter={directionFilter}
        setDirectionFilter={setDirectionFilter}
        minConfidence={minConfidence}
        setMinConfidence={setMinConfidence}
        visibleCount={filtered.length}
        totalEvents={totalEvents}
        onClearAll={clearAllFilters}
      />

      {filtered.length === 0 ? (
        <div className="egrid-empty-filtered">
          <Filter size={28} />
          <p>No events match the current filter</p>
          <button onClick={clearAllFilters}>
            Clear all filters
          </button>
        </div>
      ) : (
        <>
          <BulkBar
            selected={selected}
            total={filtered.length}
            onSelectAll={() => setSelected(new Set(filtered.map(e => e.id)))}
            onClear={clearSelected}
            onDeleteSelected={handleDeleteSelected}
            onExportSelected={handleExportCSV}
            canDelete={canDelete}
          />
          <div className="egrid-grid">
            {filtered.map(e => (
              <EventCard
                key={e.id}
                event={e}
                delEvent={delEvent}
                setPreviewImage={setPreviewImage}
                canDelete={canDelete}
                openPersonHistory={openPersonHistory}
                t={t}
                API={API}
                isSelected={selected.has(e.id)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
          <PaginationBar
            page={page}
            pageSize={pageSize}
            totalEvents={totalEvents}
            visibleCount={events.length}
            onPageChange={onPageChange}
          />
        </>
      )}
    </div>
  );
}
