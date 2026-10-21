// ============================================================
// PersonCardPro.jsx - GSC Face Analytics Pro
// Enterprise person cards
// ============================================================

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Save, UserX, History, Crown, Briefcase, ShieldAlert, User,
  Phone, Building2, FileText, Eye, Calendar, Clock, Edit3, X, RefreshCw, GitMerge, WifiOff,
  ChevronLeft, ChevronRight, Images, Search, Filter,
} from 'lucide-react';
import { mediaUrl } from './mediaUrl';
import PersonMergeModal from './PersonMergeModal';

// ---------- Helpers ----------
function img(API, path) {
  return mediaUrl(API, path);
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
    hour: '2-digit', minute: '2-digit',
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

// ---------- Type Icon ----------
function TypeIcon({ type, size = 12 }) {
  switch (type) {
    case 'employee':  return <Briefcase size={size} />;
    case 'vip':       return <Crown size={size} />;
    case 'blacklist': return <ShieldAlert size={size} />;
    default:          return <User size={size} />;
  }
}

// ---------- Single Person Card ----------
function PersonCard({ p, updatePerson, deletePerson, updateFace, setPreviewImage, canOperate, canDelete, openPersonHistory, t, API, onMerge, authFetch }) {
  const [v, setV] = useState(p);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [faceUpdating, setFaceUpdating] = useState(false);
  const faceInputRef = useRef(null);
  const [photos, setPhotos] = useState(null);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [photosLoading, setPhotosLoading] = useState(false);

  const loadPhotos = async () => {
    if (photos !== null || photosLoading) return;
    setPhotosLoading(true);
    try {
      const res = await authFetch(`${API}/api/persons/${p.id}/history?limit=20`);
      if (res.ok) {
        const data = await res.json();
        const imgs = (data.events || [])
          .map(e => e.crop_image_path || e.image_path)
          .filter(Boolean)
          .slice(0, 12);
        setPhotos(imgs);
        setPhotoIdx(0);
      }
    } finally {
      setPhotosLoading(false);
    }
  };

  const handleFaceUpdate = async (file) => {
    if (!file) return;
    setFaceUpdating(true);
    try { await updateFace(p.id, file); }
    finally { setFaceUpdating(false); }
  };

  // Only sync from prop when NOT in edit mode - prevents overwriting in-progress edits
  useEffect(() => {
    if (!editMode) setV(p);
  }, [p, editMode]);

  const handleSave = async () => {
    setSaving(true);
    try { await updatePerson(p.id, v); setEditMode(false); }
    finally { setSaving(false); }
  };

  const handleCancel = () => {
    setV(p);
    setEditMode(false);
  };

  const personType = v.person_type || 'unknown';

  return (
    <div className={`person-card-pro type-${personType} ${editMode ? 'edit-mode' : ''}`}>
      {/* HEADER - Image + Badge + Quick stats */}
      <div className="pcp-header">
        <div className="pcp-image-wrap">
          {photos && photos.length > 1 ? (
            <div className="pcp-carousel">
              <img
                src={img(API, photos[photoIdx]) || PLACEHOLDER_SVG}
                onError={e => { e.currentTarget.src = PLACEHOLDER_SVG; e.currentTarget.onerror = null; }}
                onClick={() => setPreviewImage(img(API, photos[photoIdx]))}
                alt={p.full_name}
              />
              <button className="pcp-carousel-btn left"
                onClick={e => { e.stopPropagation(); setPhotoIdx(i => (i - 1 + photos.length) % photos.length); }}>
                <ChevronLeft size={14} />
              </button>
              <button className="pcp-carousel-btn right"
                onClick={e => { e.stopPropagation(); setPhotoIdx(i => (i + 1) % photos.length); }}>
                <ChevronRight size={14} />
              </button>
              <span className="pcp-carousel-count">{photoIdx + 1}/{photos.length}</span>
            </div>
          ) : (
            <img
              src={(photos && photos[0] ? img(API, photos[0]) : null) || img(API, p.preview_image) || PLACEHOLDER_SVG}
              onError={e => { e.currentTarget.src = PLACEHOLDER_SVG; e.currentTarget.onerror = null; }}
              onClick={() => setPreviewImage(img(API, p.preview_image))}
              alt={p.full_name}
            />
          )}
          <span className={`pcp-type-badge type-${personType}`}>
            <TypeIcon type={personType} size={11} />
            {personType?.toUpperCase()}
          </span>
          {(p.seen_count || 0) > 1 && photos === null && (
            <button className="pcp-photos-btn" onClick={e => { e.stopPropagation(); loadPhotos(); }}
                    title={`${p.seen_count} captures — click to browse`}>
              {photosLoading ? <RefreshCw size={11} className="spin" /> : <Images size={11} />}
              {photosLoading ? '' : p.seen_count}
            </button>
          )}
        </div>

        <div className="pcp-header-info">
          <h3 className="pcp-name" title={p.full_name}>
            {p.full_name || 'Unnamed Person'}
          </h3>

          {p.department && (
            <p className="pcp-dept">
              <Building2 size={11} />
              {p.department}
            </p>
          )}

          <div className="pcp-quick-stats">
            <div className="pcp-stat">
              <Eye size={11} />
              <span><b>{p.seen_count || 0}</b> seen</span>
            </div>
            <div className="pcp-stat">
              <Clock size={11} />
              <span>{formatRelative(p.last_seen)}</span>
            </div>
          </div>

          <div className="pcp-face-id">FACE ID #{p.id}</div>
        </div>
      </div>

      {/* BODY - Edit form or display view */}
      {editMode ? (
        <div className="pcp-edit-form">
          <div className="pcp-field">
            <label>Full Name</label>
            <input
              value={v.full_name || ''}
              onChange={e => setV({ ...v, full_name: e.target.value })}
              placeholder={t('fullName')}
            />
          </div>

          <div className="pcp-field-row">
            <div className="pcp-field">
              <label>Type</label>
              <select
                value={v.person_type}
                onChange={e => setV({ ...v, person_type: e.target.value })}
              >
                <option value="employee">Employee</option>
                <option value="vip">VIP Client</option>
                <option value="blacklist">Blacklist</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>

            <div className="pcp-field">
              <label>Department</label>
              <input
                value={v.department || ''}
                onChange={e => setV({ ...v, department: e.target.value })}
                placeholder={t('departmentCompany')}
              />
            </div>
          </div>

          <div className="pcp-field">
            <label>Phone</label>
            <input
              value={v.phone || ''}
              onChange={e => setV({ ...v, phone: e.target.value })}
              placeholder={t('phone')}
            />
          </div>

          <div className="pcp-field">
            <label>Notes</label>
            <textarea
              value={v.notes || ''}
              onChange={e => setV({ ...v, notes: e.target.value })}
              placeholder={t('notes')}
              rows={2}
            />
          </div>
        </div>
      ) : (
        <div className="pcp-display-info">
          {p.phone && (
            <div className="pcp-info-row">
              <Phone size={12} />
              <span>{p.phone}</span>
            </div>
          )}
          {p.notes && (
            <div className="pcp-info-row notes-row">
              <FileText size={12} />
              <span title={p.notes}>{p.notes}</span>
            </div>
          )}
          {!p.phone && !p.notes && (
            <div className="pcp-info-row empty">
              <span>No additional info</span>
            </div>
          )}
        </div>
      )}

      {/* TIMELINE FOOTER */}
      <div className="pcp-timeline">
        <div className="pcp-timeline-item">
          <Calendar size={10} />
          <div>
            <small>First seen</small>
            <b>{formatDateTime(p.first_seen)}</b>
          </div>
        </div>
        <div className="pcp-timeline-item">
          <Clock size={10} />
          <div>
            <small>Last seen</small>
            <b>{formatDateTime(p.last_seen)}</b>
          </div>
        </div>
      </div>

      {/* ACTIONS */}
      <div className="pcp-actions">
        <button
          className="pcp-action-btn pcp-history"
          onClick={() => openPersonHistory?.(p.id)}
        >
          <History size={13} />
          {t('history')}
        </button>

        {canOperate && !editMode && (
          <>
            <button
              className="pcp-action-btn pcp-edit"
              onClick={() => setEditMode(true)}
            >
              <Edit3 size={13} />
              Edit
            </button>
            <button
              className="pcp-action-btn pcp-edit"
              onClick={() => faceInputRef.current?.click()}
              disabled={faceUpdating}
              title="Update face photo"
            >
              <RefreshCw size={13} />
              {faceUpdating ? '...' : 'Face'}
            </button>
            <input
              ref={faceInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => handleFaceUpdate(e.target.files?.[0])}
            />
          </>
        )}

        {canOperate && editMode && (
          <>
            <button
              className="pcp-action-btn pcp-cancel"
              onClick={handleCancel}
            >
              <X size={13} />
              Cancel
            </button>
            <button
              className="pcp-action-btn pcp-save"
              onClick={handleSave}
              disabled={saving}
            >
              <Save size={13} />
              {saving ? 'Saving...' : 'Save'}
            </button>
          </>
        )}

        {onMerge && !editMode && (
          <button className="pcp-action-btn pcp-merge" onClick={onMerge} title="Merge with another person">
            <GitMerge size={13} />
          </button>
        )}
        {canDelete && !editMode && (
          <button
            className="pcp-action-btn pcp-delete"
            onClick={() => deletePerson(p.id)}
            title="Delete"
          >
            <UserX size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

// ---------- Empty State ----------
function EmptyPersons({ t }) {
  return (
    <div className="persons-empty">
      <User size={42} />
      <h3>No persons registered</h3>
      <p>Register your first person using a face event or upload.</p>
    </div>
  );
}

// ============================================================
// MAIN — server-side paginated, searchable, filterable
// ============================================================
const PAGE_SIZE = 50;
const TYPE_OPTIONS = [
  { value: '',          label: 'All' },
  { value: 'employee',  label: 'Employees' },
  { value: 'vip',       label: 'VIP' },
  { value: 'blacklist', label: 'Blacklist' },
];

export default function PersonsGridPro({
  // legacy props — still accepted for backward-compat when parent passes persons directly
  persons: personsProp,
  updatePerson, deletePerson, updateFace, setPreviewImage,
  canOperate, canDelete, openPersonHistory, t, API, authFetch,
  loading: loadingProp = false, error: errorProp = null, onRetry,
  // When true, use server-side pagination instead of the prop array
  serverPagination = true,
}) {
  const [mergeTarget, setMergeTarget]   = useState(null);
  const [search, setSearch]             = useState('');
  const [typeFilter, setTypeFilter]     = useState('');
  const [offset, setOffset]             = useState(0);
  const [total, setTotal]               = useState(0);
  const [items, setItems]               = useState([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);
  const searchTimer                     = useRef(null);

  const fetchPage = useCallback(async (searchVal, typeVal, offsetVal) => {
    if (!serverPagination || !authFetch) return;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offsetVal),
      });
      if (searchVal.trim()) params.set('search', searchVal.trim());
      if (typeVal)          params.set('person_type', typeVal);
      const res = await authFetch(`${API}/api/persons?${params}`);
      if (!res.ok) { setError('Failed to load persons'); return; }
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
      setTotal(Number(res.headers?.get('X-Total-Count') || data.length));
    } catch (e) {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  }, [serverPagination, authFetch, API]);

  // Initial load + refresh when updatePerson changes
  useEffect(() => {
    if (serverPagination) fetchPage(search, typeFilter, offset);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverPagination, offset]);

  // Debounced search
  const handleSearch = (val) => {
    setSearch(val);
    setOffset(0);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchPage(val, typeFilter, 0), 350);
  };

  const handleType = (val) => {
    setTypeFilter(val);
    setOffset(0);
    fetchPage(search, val, 0);
  };

  const refresh = () => fetchPage(search, typeFilter, offset);

  // Fall back to prop-driven mode if serverPagination=false
  const displayItems = serverPagination ? items : (personsProp || []);
  const displayLoading = serverPagination ? loading : loadingProp;
  const displayError   = serverPagination ? error   : errorProp;
  const displayTotal   = serverPagination ? total   : displayItems.length;
  const pages          = Math.ceil(displayTotal / PAGE_SIZE);
  const currentPage    = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>

      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap',
        padding: '12px 16px', borderBottom: '1px solid var(--border)',
        background: 'var(--card)',
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 160 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', pointerEvents: 'none' }} />
          <input
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search by name, department…"
            style={{
              width: '100%', paddingLeft: 30, paddingRight: 10,
              height: 32, borderRadius: 7, border: '1px solid var(--border)',
              background: 'var(--bg)', fontSize: 12, color: 'var(--text)',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Type filter */}
        <div style={{ display: 'flex', gap: 4 }}>
          {TYPE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => handleType(opt.value)}
              style={{
                height: 32, padding: '0 12px', borderRadius: 7, fontSize: 11, fontWeight: 600,
                border: '1px solid var(--border)',
                background: typeFilter === opt.value ? 'var(--primary)' : 'var(--bg)',
                color:      typeFilter === opt.value ? '#fff' : 'var(--text)',
                cursor: 'pointer',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>
            {displayTotal} person{displayTotal !== 1 ? 's' : ''}
            {serverPagination && pages > 1 && ` · page ${currentPage}/${pages}`}
          </span>
          <button className="ghost-btn" onClick={refresh} disabled={displayLoading} style={{ height: 30 }}>
            <RefreshCw size={12} className={displayLoading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
        {displayError && (
          <div className="persons-empty">
            <WifiOff size={42} style={{ opacity: .35 }} />
            <h3>Failed to load persons</h3>
            <p style={{ color: 'var(--muted)' }}>{displayError}</p>
            <button className="ghost-btn" onClick={refresh} style={{ marginTop: 8 }}>
              <RefreshCw size={13} /> Try again
            </button>
          </div>
        )}

        {!displayError && displayLoading && displayItems.length === 0 && (
          <div className="persons-empty">
            <RefreshCw size={36} className="spin" style={{ opacity: .35 }} />
            <p style={{ color: 'var(--muted)', marginTop: 12 }}>Loading persons…</p>
          </div>
        )}

        {!displayError && !displayLoading && displayItems.length === 0 && (
          <EmptyPersons t={t} />
        )}

        {displayItems.length > 0 && (
          <div className="persons-pro-grid">
            {displayItems.map(p => (
              <PersonCard
                key={p.id}
                p={p}
                updatePerson={() => refresh()}
                deletePerson={deletePerson}
                updateFace={updateFace}
                setPreviewImage={setPreviewImage}
                canOperate={canOperate}
                canDelete={canDelete}
                openPersonHistory={openPersonHistory}
                t={t}
                API={API}
                authFetch={authFetch}
                onMerge={canOperate ? () => setMergeTarget(p) : null}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Pagination ── */}
      {serverPagination && pages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '10px 16px', borderTop: '1px solid var(--border)',
          background: 'var(--card)',
        }}>
          <button
            className="ghost-btn"
            disabled={offset === 0 || displayLoading}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            style={{ height: 30 }}
          >
            <ChevronLeft size={14} /> Prev
          </button>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {offset + 1}–{Math.min(offset + PAGE_SIZE, displayTotal)} of {displayTotal}
          </span>
          <button
            className="ghost-btn"
            disabled={offset + PAGE_SIZE >= displayTotal || displayLoading}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            style={{ height: 30 }}
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      )}

      {mergeTarget && (
        <PersonMergeModal
          person={mergeTarget}
          authFetch={authFetch}
          API={API}
          persons={displayItems}
          onClose={() => setMergeTarget(null)}
          onMerged={() => { setMergeTarget(null); refresh(); }}
        />
      )}
    </div>
  );
}
