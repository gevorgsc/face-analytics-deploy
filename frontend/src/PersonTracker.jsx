/**
 * PersonTracker.jsx — Full person tracking system
 *
 * Find person:  Upload photo (face search)  |  Search by name
 * Shows:        Entry point · Current location · Predicted next · Path on map
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Upload, Search, X, MapPin, Clock, Navigation, Camera,
  TrendingUp, User, ChevronRight, ZoomIn, ZoomOut, Home,
  AlertCircle, CheckCircle, Activity, Eye, Crosshair
} from 'lucide-react';
import { mediaUrl } from './mediaUrl';

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60)  return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: 'Asia/Yerevan', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

function fmtDateTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'Asia/Yerevan', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function mapImageUrl(API, path) {
  if (!path) return '';
  const normalized = path.startsWith('/media/') ? path : `/media/${path.replace(/^\/+/, '')}`;
  return mediaUrl(API, normalized);
}

function ptypeColor(t) {
  if (t === 'employee')  return '#3b82f6';
  if (t === 'vip')       return '#f59e0b';
  if (t === 'blacklist') return '#ef4444';
  return '#94a3b8';
}

// ── Map subcomponent ───────────────────────────────────────────────────────────

function TrackMap({ API, token, mapData, cameras, pathSteps, currentCam, predictedCam, entryCam }) {
  const imgRef  = useRef(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [tr, setTr] = useState({ x: 0, y: 0, scale: 1 });
  const panRef  = useRef(null);

  const updateSize = () => {
    if (imgRef.current) setImgSize({ w: imgRef.current.naturalWidth || imgRef.current.clientWidth, h: imgRef.current.naturalHeight || imgRef.current.clientHeight });
  };

  useEffect(() => {
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  useEffect(() => {
    const onMove = (e) => {
      if (panRef.current) setTr(t => ({ ...t, x: e.clientX - panRef.current.ox, y: e.clientY - panRef.current.oy }));
    };
    const onUp = () => { panRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const onWheel = (e) => {
    e.preventDefault();
    setTr(t => ({ ...t, scale: Math.max(0.2, Math.min(6, t.scale * (e.deltaY > 0 ? 0.88 : 1.14))) }));
  };

  const onPanStart = (e) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      panRef.current = { ox: e.clientX - tr.x, oy: e.clientY - tr.y };
    }
  };

  const enriched = cameras.map(c => ({
    ...c,
    _px: (c.map_x ?? 0.5) * imgSize.w,
    _py: (c.map_y ?? 0.5) * imgSize.h,
  }));

  const steps = useMemo(() => pathSteps.map(s => {
    const cam = enriched.find(c => c.name === s.camera || c.id === s.camera_id);
    return { ...s, _px: cam?._px ?? s.x * imgSize.w, _py: cam?._py ?? s.y * imgSize.h };
  }), [pathSteps, enriched, imgSize]);

  const imgSrc = mapData ? mapImageUrl(API, mapData.image_path) : '';

  if (!mapData) return (
    <div className="trk-no-map"><MapPin size={28} /><p>No floor map with placed cameras</p></div>
  );

  return (
    <div className="trk-map-wrap">
      {/* Zoom controls */}
      <div className="trk-map-ctrl">
        <button onClick={() => setTr(t => ({ ...t, scale: Math.min(6, t.scale * 1.3) }))}><ZoomIn size={13} /></button>
        <span>{Math.round(tr.scale * 100)}%</span>
        <button onClick={() => setTr(t => ({ ...t, scale: Math.max(0.2, t.scale / 1.3) }))}><ZoomOut size={13} /></button>
        <button onClick={() => setTr({ x: 0, y: 0, scale: 1 })}><Home size={13} /></button>
      </div>

      <div className="trk-map-canvas" onWheel={onWheel} onMouseDown={onPanStart}>
        <div className="trk-map-clip">
          <div style={{ transform: `translate(${tr.x}px,${tr.y}px) scale(${tr.scale})`, transformOrigin: '0 0', lineHeight: 0 }}>
            <img ref={imgRef} src={imgSrc} alt="map" draggable={false}
              style={{ display: 'block', maxWidth: 'none', userSelect: 'none', pointerEvents: 'none' }}
              onLoad={updateSize}
            />

            {imgSize.w > 0 && (
              <svg style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible', pointerEvents: 'none' }}
                width={imgSize.w} height={imgSize.h} viewBox={`0 0 ${imgSize.w} ${imgSize.h}`}>

                <defs>
                  <marker id="trk-arrow" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">
                    <path d="M0,0 L0,7 L7,3.5 z" fill="#f59e0b" />
                  </marker>
                </defs>

                {/* Path lines */}
                {steps.length > 1 && steps.slice(0, -1).map((s, i) => (
                  <line key={i}
                    x1={s._px} y1={s._py} x2={steps[i+1]._px} y2={steps[i+1]._py}
                    stroke="#f59e0b" strokeWidth={2.5} strokeDasharray="9 5" opacity={.8}
                    markerEnd="url(#trk-arrow)"
                  />
                ))}

                {/* Predicted line (dashed blue) */}
                {steps.length > 0 && predictedCam && (() => {
                  const lastStep  = steps[steps.length - 1];
                  const predCamObj = enriched.find(c => c.name === predictedCam);
                  if (!predCamObj) return null;
                  return (
                    <line
                      x1={lastStep._px} y1={lastStep._py}
                      x2={predCamObj._px} y2={predCamObj._py}
                      stroke="#6366f1" strokeWidth={2} strokeDasharray="6 6" opacity={.6}
                    />
                  );
                })()}

                {/* Camera markers */}
                {enriched.map(cam => {
                  const isCurrent   = cam.name === currentCam;
                  const isPredicted = cam.name === predictedCam;
                  const isEntry     = cam.name === entryCam && !isCurrent;
                  const stepIdx     = steps.findIndex(s => s.camera === cam.name || s.camera_id === cam.id);
                  const isOnPath    = stepIdx >= 0;

                  let color = '#64748b';
                  if (isCurrent)   color = '#10b981';
                  else if (isEntry)    color = '#3b82f6';
                  else if (isPredicted) color = '#6366f1';
                  else if (isOnPath)   color = '#f59e0b';

                  return (
                    <g key={cam.id} transform={`translate(${cam._px},${cam._py})`}>
                      {isCurrent && (
                        <circle r={26} fill="none" stroke="#10b981" strokeWidth={1.5} opacity={0}>
                          <animate attributeName="r"       from="16" to="30" dur="2s" repeatCount="indefinite" />
                          <animate attributeName="opacity" from="0.5" to="0"  dur="2s" repeatCount="indefinite" />
                        </circle>
                      )}
                      {isPredicted && (
                        <circle r={20} fill="none" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4 3" opacity={.7}>
                          <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="6s" repeatCount="indefinite" />
                        </circle>
                      )}
                      <circle r={14} fill={color} stroke="#fff" strokeWidth={2} cx={1} cy={2} opacity={.25} />
                      <circle r={14} fill={color} stroke="#fff" strokeWidth={2} />
                      {isOnPath
                        ? <text textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={10} fontWeight="800">{stepIdx + 1}</text>
                        : (
                          <g>
                            <rect x={-6} y={-4} width={9} height={7} rx={1.5} fill="none" stroke="#fff" strokeWidth={1.4} />
                            <circle cx={-1.5} cy={-0.5} r={2} fill="none" stroke="#fff" strokeWidth={1.2} />
                            <polygon points="3,-4 8,-6 8,6 3,4" fill="rgba(255,255,255,.85)" />
                          </g>
                        )
                      }
                      <rect x={-(cam.name.length * 3.3 + 7)} y={17} width={cam.name.length * 6.6 + 14} height={14} rx={3} fill="rgba(0,0,0,.65)" />
                      <text y={27} textAnchor="middle" fill="#fff" fontSize={9.5} fontWeight={600}>{cam.name}</text>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="trk-map-legend">
        <span><span className="trk-dot" style={{ background: '#3b82f6' }} /> Entry</span>
        <span><span className="trk-dot" style={{ background: '#f59e0b' }} /> Path</span>
        <span><span className="trk-dot" style={{ background: '#10b981' }} /> Now</span>
        <span><span className="trk-dot" style={{ background: '#6366f1' }} /> Predicted</span>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function PersonTracker({ authFetch, API, token, persons = [] }) {

  // Find person
  const [findMode,    setFindMode]    = useState('search'); // 'search' | 'upload'
  const [searchQ,     setSearchQ]     = useState('');
  const [uploading,   setUploading]   = useState(false);
  const [uploadResults, setUploadResults] = useState(null); // [{person, confidence}]
  const fileRef = useRef(null);

  // Tracked person
  const [person,      setPerson]      = useState(null);
  const [prediction,  setPrediction]  = useState(null);
  const [pathData,    setPathData]    = useState(null);
  const [pathHours,   setPathHours]   = useState(24);
  const [loading,     setLoading]     = useState(false);

  // Maps
  const [maps,        setMaps]        = useState([]);
  const [selectedMap, setSelectedMap] = useState(null);

  // ── Load maps ────────────────────────────────────────────────────────────

  useEffect(() => {
    authFetch(`${API}/api/maps`).then(r => r.ok ? r.json() : []).then(data => {
      setMaps(Array.isArray(data) ? data : []);
      if (data.length) setSelectedMap(data[0]);
    });
  }, []);

  // ── Track person ─────────────────────────────────────────────────────────

  const trackPerson = useCallback(async (p, hours = 24) => {
    setPerson(p);
    setLoading(true);
    setPathData(null);
    setPrediction(null);

    const [pathRes, predRes] = await Promise.all([
      authFetch(`${API}/api/maps/person-path/${p.id}?hours=${hours}`),
      authFetch(`${API}/api/maps/person-prediction/${p.id}`),
    ]);

    if (pathRes.ok) setPathData(await pathRes.json());
    if (predRes.ok) setPrediction(await predRes.json());
    setLoading(false);
  }, [authFetch, API]);

  const refresh = useCallback(() => {
    if (person) trackPerson(person, pathHours);
  }, [person, pathHours, trackPerson]);

  useEffect(() => {
    if (person) trackPerson(person, pathHours);
  }, [pathHours]);

  // ── Upload photo search ───────────────────────────────────────────────────

  const searchByPhoto = useCallback(async (file) => {
    setUploading(true);
    setUploadResults(null);
    const form = new FormData();
    form.append('file', file);
    const res = await authFetch(`${API}/api/search/by-picture?limit=5&threshold=0.25`, { method: 'POST', body: form });
    if (res.ok) {
      const data = await res.json();
      setUploadResults(Array.isArray(data) ? data : []);
    }
    setUploading(false);
  }, [authFetch, API]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) searchByPhoto(file);
    e.target.value = '';
  };

  // ── Computed map data ─────────────────────────────────────────────────────

  const mapCameras = useMemo(() => selectedMap?.cameras || [], [selectedMap]);

  const pathSteps = useMemo(() => {
    if (!pathData || !selectedMap) return [];
    return (pathData.path || []).filter(s => s.map_id === selectedMap.id);
  }, [pathData, selectedMap]);

  const filteredPersons = persons.filter(p =>
    !searchQ || (p.full_name || '').toLowerCase().includes(searchQ.toLowerCase())
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="trk-root">

      {/* ── LEFT PANEL ─────────────────────────────────────────── */}
      <aside className="trk-aside">

        {/* Find person */}
        <div className="trk-section">
          <div className="trk-section-hd"><Crosshair size={12} /> Find Person</div>

          {/* Mode toggle */}
          <div className="trk-mode-tabs">
            <button className={findMode === 'search' ? 'active' : ''} onClick={() => setFindMode('search')}>
              <Search size={11} /> Name
            </button>
            <button className={findMode === 'upload' ? 'active' : ''} onClick={() => setFindMode('upload')}>
              <Upload size={11} /> Photo
            </button>
          </div>

          {/* Search by name */}
          {findMode === 'search' && (
            <div>
              <div className="trk-search-row">
                <Search size={11} />
                <input
                  className="trk-search-input"
                  placeholder="Search by name..."
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                />
                {searchQ && <button onClick={() => setSearchQ('')}><X size={11} /></button>}
              </div>
              <div className="trk-person-list">
                {filteredPersons.slice(0, 40).map(p => (
                  <button key={p.id} className={`trk-person-row${person?.id === p.id ? ' active' : ''}`}
                    onClick={() => { trackPerson(p, pathHours); setSearchQ(p.full_name || ''); }}>
                    {p.preview_image
                      ? <img src={mediaUrl(API, p.preview_image)} className="trk-avatar" alt="" onError={e => { e.target.style.display='none'; }} />
                      : <div className="trk-avatar trk-avatar-ph"><User size={11} /></div>
                    }
                    <div>
                      <span>{p.full_name || `Unknown #${p.id}`}</span>
                      <small style={{ color: ptypeColor(p.person_type) }}>{p.person_type}</small>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Search by photo */}
          {findMode === 'upload' && (
            <div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
              <button
                className="trk-upload-btn"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? <span className="trk-spinner" /> : <Upload size={14} />}
                {uploading ? 'Searching...' : 'Upload Photo to Search'}
              </button>

              {uploadResults && (
                <div className="trk-upload-results">
                  {uploadResults.length === 0
                    ? <p className="trk-empty-note">No match found</p>
                    : uploadResults.map((r, i) => (
                      <button key={i}
                        className={`trk-person-row${person?.id === r.person?.id ? ' active' : ''}`}
                        onClick={() => r.person && trackPerson(r.person, pathHours)}
                      >
                        {r.person?.preview_image
                          ? <img src={mediaUrl(API, r.person.preview_image)} className="trk-avatar" alt="" onError={e => { e.target.style.display='none'; }} />
                          : <div className="trk-avatar trk-avatar-ph"><User size={11} /></div>
                        }
                        <div>
                          <span>{r.person?.full_name || `Unknown #${r.person?.id}`}</span>
                          <small style={{ color: ptypeColor(r.person?.person_type) }}>{r.person?.person_type}</small>
                        </div>
                        <span className="trk-conf">{Math.round((r.confidence || r.similarity || 0) * 100)}%</span>
                      </button>
                    ))
                  }
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tracking info */}
        {person && (
          <div className="trk-section trk-section-grow">

            {/* Person card */}
            <div className="trk-person-card">
              {person.preview_image
                ? <img src={mediaUrl(API, person.preview_image)} className="trk-avatar-lg" alt="" onError={e => { e.target.style.display='none'; }} />
                : <div className="trk-avatar-lg trk-avatar-ph"><User size={20} /></div>
              }
              <div>
                <strong>{person.full_name || `Unknown #${person.id}`}</strong>
                <small style={{ color: ptypeColor(person.person_type) }}>{person.person_type}</small>
              </div>
              <button className="trk-del-btn" onClick={() => { setPerson(null); setPrediction(null); setPathData(null); setSearchQ(''); setUploadResults(null); }}>
                <X size={12} />
              </button>
            </div>

            {/* Time range */}
            <div className="trk-hours-row">
              <Clock size={11} />
              <select className="trk-sel" value={pathHours} onChange={e => setPathHours(Number(e.target.value))}>
                <option value={1}>Last 1 hour</option>
                <option value={4}>Last 4 hours</option>
                <option value={8}>Last 8 hours</option>
                <option value={24}>Last 24 hours</option>
                <option value={72}>Last 3 days</option>
              </select>
              {loading && <span className="trk-spinner" />}
              <button className="trk-refresh-btn" onClick={refresh} title="Refresh">↻</button>
            </div>

            {/* Stats row */}
            {prediction && (
              <div className="trk-stats-row">
                <div className="trk-stat">
                  <strong>{prediction.today_stops || 0}</strong>
                  <span>Cameras</span>
                </div>
                <div className="trk-stat">
                  <strong>{prediction.today_events || 0}</strong>
                  <span>Events</span>
                </div>
                <div className="trk-stat">
                  <strong>{pathSteps.length}</strong>
                  <span>On map</span>
                </div>
              </div>
            )}

            {/* Location cards */}
            {prediction && (
              <div className="trk-location-cards">

                {/* Entry */}
                <div className="trk-loc-card trk-loc-entry">
                  <div className="trk-loc-icon"><Navigation size={13} /></div>
                  <div>
                    <span className="trk-loc-label">Entry point</span>
                    <strong>{prediction.entry_camera || '—'}</strong>
                    {prediction.entry_time && <small>{fmtDateTime(prediction.entry_time)}</small>}
                  </div>
                </div>

                {/* Current */}
                <div className="trk-loc-card trk-loc-now">
                  <div className="trk-loc-icon trk-pulse-dot" />
                  <div>
                    <span className="trk-loc-label">Current location</span>
                    <strong>{prediction.current_camera || '—'}</strong>
                    {prediction.last_seen && <small>{timeAgo(prediction.last_seen)}</small>}
                  </div>
                </div>

                {/* Predicted */}
                <div className="trk-loc-card trk-loc-pred">
                  <div className="trk-loc-icon"><TrendingUp size={13} /></div>
                  <div>
                    <span className="trk-loc-label">Predicted next</span>
                    <strong>{prediction.predicted_next || 'Unknown'}</strong>
                    {prediction.prediction_confidence > 0 && (
                      <small>{prediction.prediction_confidence}% confidence</small>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Path timeline */}
            {pathSteps.length > 0 && (
              <>
                <div className="trk-section-hd" style={{ marginTop: 8 }}><Activity size={11} /> Today's path</div>
                <div className="trk-timeline">
                  {pathSteps.map((s, i) => (
                    <div key={i} className="trk-tl-row">
                      <div className="trk-tl-dot" style={{ background: s.camera === prediction?.current_camera ? '#10b981' : '#f59e0b' }} />
                      {i < pathSteps.length - 1 && <div className="trk-tl-line" />}
                      <div className="trk-tl-info">
                        <span>{s.camera}</span>
                        <small>{fmtTime(s.time)}</small>
                      </div>
                    </div>
                  ))}
                  {prediction?.predicted_next && (
                    <div className="trk-tl-row trk-tl-predicted">
                      <div className="trk-tl-dot" style={{ background: '#6366f1', opacity: .6 }} />
                      <div className="trk-tl-info">
                        <span>{prediction.predicted_next}</span>
                        <small>predicted</small>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {!loading && pathSteps.length === 0 && pathData && (
              <p className="trk-empty-note">No detections on any mapped camera in this period</p>
            )}
          </div>
        )}

        {!person && (
          <div className="trk-section trk-empty-state">
            <Crosshair size={28} />
            <p>Select a person to start tracking their movement across cameras</p>
          </div>
        )}
      </aside>

      {/* ── MAP AREA ───────────────────────────────────────────── */}
      <div className="trk-map-area">

        {/* Map selector */}
        {maps.length > 1 && (
          <div className="trk-map-tabs">
            {maps.map(m => (
              <button key={m.id} className={selectedMap?.id === m.id ? 'active' : ''} onClick={() => setSelectedMap(m)}>
                <MapPin size={11} /> {m.name}
              </button>
            ))}
          </div>
        )}

        <TrackMap
          API={API}
          token={token}
          mapData={selectedMap}
          cameras={mapCameras}
          pathSteps={pathSteps}
          currentCam={prediction?.current_camera}
          predictedCam={prediction?.predicted_next}
          entryCam={prediction?.entry_camera}
        />
      </div>
    </div>
  );
}
