import { apiFetch } from './apiClient';
/**
 * MapView.jsx вЂ” Professional Floor Map В· Camera Placement В· Person Tracking
 *
 * Modes:  View (heatmap, legend)  |  Edit (drag cameras)  |  Track (path playback)
 * Extras: Zoom/pan В· Direction colors В· Animated path В· Step-by-step playback
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Upload, Camera, MapPin, Search, X, Clock,
  Navigation, Plus, Play, Pause,
  ChevronLeft, ChevronRight, Activity, Eye, User, TrendingUp,
  Download, AlertTriangle
} from 'lucide-react';
import { mediaUrl } from './mediaUrl';
import { toast } from './useToast';
import {
  CameraMarker,
  CamLiveThumb,
  DoorMarker,
  FovCone,
  HeatmapLayer,
  PathLines,
  dirColor,
  dirLabel,
  dirShortLabel,
  fmtTime,
  mapImageUrl,
} from './MapViewLayers';
import { MapAreasList, MapEmptyState } from './MapAreaPanels';
import MapToolbar from './MapToolbar';

// в”Ђв”Ђ Main Component в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

export default function MapView({ authFetch, API, persons = [], liveEvent, currentUser }) {
  const canEditMaps = ['admin', 'operator'].includes(currentUser?.role);
  const canDeleteMaps = currentUser?.role === 'admin';

  const [maps,        setMaps]        = useState([]);
  const [selectedMap, setSelectedMap] = useState(null);
  const [mode,        setMode]        = useState('view'); // view | edit | track
  const [uploading,   setUploading]   = useState(false);
  const [allCameras,  setAllCameras]  = useState([]);
  const [unplaced,    setUnplaced]    = useState([]);

  const [newAreaName, setNewAreaName] = useState('');
  const [newAreaFile, setNewAreaFile] = useState(null);
  const [areaName,    setAreaName]    = useState('');
  const [areaSaving,  setAreaSaving]  = useState(false);
  const [showAreaEditor, setShowAreaEditor] = useState(false);

  // Live event popups: { [uid]: { camName, image, personName, personType, px, py, ts } }
  const [livePopups,  setLivePopups]  = useState({});
  const [viewEvents,  setViewEvents]  = useState([]);

  // Track
  const [pathPerson,   setPathPerson]   = useState(null);
  const [pathData,     setPathData]     = useState(null);
  const [pathHours,    setPathHours]    = useState(72);
  const [personSearch, setPersonSearch] = useState('');
  const [pathLoading,  setPathLoading]  = useState(false);
  const [activeStep,   setActiveStep]   = useState(null);
  const [playing,      setPlaying]      = useState(false);
  const playRef = useRef(null);

  // Track вЂ” prediction + photo search + events
  const [prediction,    setPrediction]    = useState(null);
  const [trackFindMode, setTrackFindMode] = useState('search'); // 'search' | 'upload' | 'events'
  const [photoSearching, setPhotoSearching] = useState(false);
  const [photoResults,   setPhotoResults]   = useState(null);
  const photoFileRef = useRef(null);
  const [faceEvents,    setFaceEvents]    = useState([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showAllEvents, setShowAllEvents] = useState(false);

  // Edit
  const [placingCam, setPlacingCam] = useState(null);
  const [dragging,   setDragging]   = useState(null); // { cam, currentX, currentY }
  const [hoveredCam, setHoveredCam] = useState(null);

  // Zoom / pan вЂ” saved per-map in localStorage
  const [tr, setTr] = useState({ x: 0, y: 0, scale: 1 });
  const panRef = useRef(null);

  // Heatmap
  const [showHeatmap,   setShowHeatmap]   = useState(false);
  const [heatData,      setHeatData]      = useState(null);
  const [heatRefreshing, setHeatRefreshing] = useState(false);

  // Camera info popup (View mode click)
  const [camInfoPopup, setCamInfoPopup] = useState(null); // { cam, px, py }

  // Playback speed
  const [playSpeed, setPlaySpeed] = useState(1); // 0.5 | 1 | 2 | 3

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState(null); // map id

  // Popup timer refs (prevent setState-after-unmount leak)
  const popupTimersRef = useRef({});

  // Camera health  { [id]: { online: bool } }
  const [cameraHealth, setCameraHealth] = useState({});

  // Fullscreen
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Live occupancy counter
  const [occupancy, setOccupancy] = useState({ in: 0, out: 0 });

  // Heatmap time filter
  const [heatHours, setHeatHours] = useState(24);

  // View mode quick-search + last-seen highlight
  const [quickSearch,   setQuickSearch]   = useState('');
  const [highlightCam,  setHighlightCam]  = useState(null); // camera name

  // Multi-person tracking  [{ person, pathData, color }]
  const TRACK_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6'];
  const [trackedPersons, setTrackedPersons] = useState([]);

  // Drag-pan: distinguish click vs drag
  const dragPanStart = useRef(null); // { ox, oy, mx, my }
  const wasDragging  = useRef(false);

  // FOV cones  { [camId]: { angle: 70, rotation: 0 } }
  const [fovData, setFovData] = useState(() => {
    try { return JSON.parse(localStorage.getItem('mvp_fov') || '{}'); } catch { return {}; }
  });
  const [showFov, setShowFov] = useState(false);

  // Doors
  const [mapDoors,     setMapDoors]     = useState([]);
  const [hoveredDoor,  setHoveredDoor]  = useState(null);
  const [draggingDoor, setDraggingDoor] = useState(null);
  const [showDoors,    setShowDoors]    = useState(true);

  // Undo / Redo  [{ camId, prevMapId, prevX, prevY, nextX, nextY, nextMapId }]
  const [editHistory, setEditHistory] = useState([]);
  const [editFuture,  setEditFuture]  = useState([]);

  // Time-lapse heatmap
  const [timelapse,        setTimelapse]        = useState(false);
  const [tlData,           setTlData]           = useState(null); // { camName: { hour: count } }
  const [tlHour,           setTlHour]           = useState(null); // 0-23
  const [tlPlaying,        setTlPlaying]        = useState(false);
  const tlTimerRef = useRef(null);

  // Mini-map
  const [showMinimap, setShowMinimap] = useState(false);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  // Image
  const containerRef = useRef(null);
  const imgRef       = useRef(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });

  // Cleanup all popup timers on unmount
  useEffect(() => {
    return () => { Object.values(popupTimersRef.current).forEach(clearTimeout); };
  }, []);

  useEffect(() => {
    if (mode !== 'view') {
      setLivePopups({});
      setCamInfoPopup(null);
    }
  }, [mode]);

  useEffect(() => {
    setViewEvents([]);
    setLivePopups({});
    setShowAreaEditor(false);
    setCamInfoPopup(null);
  }, [selectedMap?.id]);

  // Per-map zoom: load saved transform when map changes
  useEffect(() => {
    if (!selectedMap?.id) return;
    try {
      const s = localStorage.getItem(`mvp_tr_${selectedMap.id}`);
      setTr(s ? JSON.parse(s) : { x: 0, y: 0, scale: 1 });
    } catch { setTr({ x: 0, y: 0, scale: 1 }); }
  }, [selectedMap?.id]);

  // Per-map zoom: persist when transform changes
  useEffect(() => {
    if (!selectedMap?.id) return;
    localStorage.setItem(`mvp_tr_${selectedMap.id}`, JSON.stringify(tr));
  }, [tr, selectedMap?.id]);

  // в”Ђв”Ђ Live event popup в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  useEffect(() => {
    if (mode !== 'view' || !liveEvent || !selectedMap || !imgSize.w) return;
    const cam = (selectedMap.cameras || []).find(c => c.name === liveEvent.camera_name);
    if (!cam || cam.map_x == null) return;

    const uid  = `${liveEvent.event_id || Date.now()}-${Math.random()}`;
    const px   = cam.map_x * imgSize.w;
    const py   = cam.map_y * imgSize.h;
    const eventKey = liveEvent.event_id || liveEvent.id || liveEvent.created_at || uid;
    const item = {
      uid,
      eventKey,
      camName:    liveEvent.camera_name,
      image:      mediaUrl(API, liveEvent.crop_image || liveEvent.image || null),
      personName: liveEvent.person_name || 'Unknown',
      personType: liveEvent.person_type || 'unknown',
      personId:   liveEvent.person_id || liveEvent.person?.id || null,
      previewImage: liveEvent.preview_image || liveEvent.person?.preview_image || liveEvent.crop_image || liveEvent.image || null,
      direction:  cam.direction || 'both',
      px, py,
      ts: Date.now(),
    };

    setLivePopups(prev => ({ ...prev, [uid]: item }));
    setViewEvents(prev => [item, ...prev.filter(ev => ev.eventKey !== eventKey)].slice(0, 12));

    // Auto-remove after 7 s вЂ” track timer to prevent setState-after-unmount
    const timerId = setTimeout(() => {
      setLivePopups(prev => { const n = { ...prev }; delete n[uid]; return n; });
      delete popupTimersRef.current[uid];
    }, 7000);
    popupTimersRef.current[uid] = timerId;
  }, [liveEvent, mode, selectedMap, imgSize.w, imgSize.h, API]);

  // в”Ђв”Ђ Bootstrap load в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  useEffect(() => {
    (async () => {
      const [mr, cr] = await Promise.all([
        authFetch(`${API}/api/maps`),
        authFetch(`${API}/api/cameras`),
      ]);
      if (mr.ok) {
        const data = await mr.json();
        setMaps(data);
        if (data.length) setSelectedMap(data[0]);
      }
      if (cr.ok) {
        const cams = await cr.json();
        setAllCameras(Array.isArray(cams) ? cams : []);
      }
    })();
  }, []);

  const reloadMaps = useCallback(async () => {
    const r = await authFetch(`${API}/api/maps`);
    if (!r.ok) return;
    const data = await r.json();
    setMaps(data);
    setSelectedMap(prev => data.find(m => m.id === prev?.id) || data[0] || null);
  }, [authFetch, API]);

  useEffect(() => {
    if (!selectedMap) return;
    const placed = new Set((selectedMap.cameras || []).map(c => c.id));
    setUnplaced(allCameras.filter(c => !placed.has(c.id)));
  }, [selectedMap, allCameras]);

  useEffect(() => {
    setAreaName(selectedMap?.name || '');
  }, [selectedMap?.id, selectedMap?.name]);

  // в”Ђв”Ђ Doors в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  const loadDoors = useCallback(async () => {
    const r = await authFetch(`${API}/api/doors`);
    if (r.ok) setMapDoors(await r.json());
  }, [authFetch, API]);

  useEffect(() => { loadDoors(); }, []);

  // в”Ђв”Ђ FOV data persist в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  useEffect(() => {
    localStorage.setItem('mvp_fov', JSON.stringify(fovData));
  }, [fovData]);

  const rotateFov = useCallback((camId, deltaDeg) => {
    setFovData(prev => {
      const cur = prev[camId] || { angle: 70, rotation: 0 };
      return { ...prev, [camId]: { ...cur, rotation: ((cur.rotation + deltaDeg) % 360 + 360) % 360 } };
    });
  }, []);

  // в”Ђв”Ђ Container size (for mini-map) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        setContainerSize({ w: e.contentRect.width, h: e.contentRect.height });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // в”Ђв”Ђ Time-lapse heatmap в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  const loadTlData = useCallback(async () => {
    const r = await authFetch(`${API}/api/stats/hourly-cameras`);
    if (r.ok) { setTlData(await r.json()); setTlHour(0); }
  }, [authFetch, API]);

  useEffect(() => {
    if (timelapse && !tlData) loadTlData();
    if (!timelapse) { setTlPlaying(false); clearInterval(tlTimerRef.current); }
  }, [timelapse]);

  useEffect(() => {
    if (!tlPlaying) { clearInterval(tlTimerRef.current); return; }
    tlTimerRef.current = setInterval(() => {
      setTlHour(h => { if (h >= 23) { setTlPlaying(false); return 23; } return h + 1; });
    }, 800);
    return () => clearInterval(tlTimerRef.current);
  }, [tlPlaying]);

  // Cleanup timelapse timer on unmount
  useEffect(() => () => clearInterval(tlTimerRef.current), []);

  // Current heatData: timelapse override or normal
  const activeHeatData = useMemo(() => {
    if (timelapse && tlData && tlHour != null) {
      const map = {};
      Object.entries(tlData).forEach(([cam, hours]) => { if (hours[tlHour]) map[cam] = hours[tlHour]; });
      return map;
    }
    return heatData;
  }, [timelapse, tlData, tlHour, heatData]);

  // в”Ђв”Ђ Camera health в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  const loadCameraHealth = useCallback(async () => {
    const r = await authFetch(`${API}/api/cameras/health-status`);
    if (!r.ok) return;
    const list = await r.json();
    const map = {};
    (Array.isArray(list) ? list : []).forEach(c => { map[c.id] = { online: c.online, hint: c.hint }; });
    setCameraHealth(map);
  }, [authFetch, API]);

  useEffect(() => {
    loadCameraHealth();
    const interval = setInterval(loadCameraHealth, 60000);
    return () => clearInterval(interval);
  }, []);

  // в”Ђв”Ђ Fullscreen в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // в”Ђв”Ђ Live occupancy counter в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  useEffect(() => {
    if (!liveEvent || mode !== 'view' || !selectedMap) return;
    const cam = (selectedMap.cameras || []).find(c => c.name === liveEvent.camera_name);
    if (!cam) return;
    setOccupancy(prev => ({
      in:  prev.in  + (cam.direction === 'in'  ? 1 : 0),
      out: prev.out + (cam.direction === 'out' ? 1 : 0),
    }));
  }, [liveEvent]);

  useEffect(() => { setOccupancy({ in: 0, out: 0 }); }, [selectedMap?.id]);

  // в”Ђв”Ђ Heatmap data в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  const loadHeatData = useCallback(async (hours) => {
    const h = hours ?? heatHours;
    setHeatRefreshing(true);
    try {
      const d = await authFetch(`${API}/api/stats?hours=${h}`).then(r => r.ok ? r.json() : null);
      if (!d?.top_cameras) return;
      const map = {};
      (d.top_cameras || []).forEach(({ camera, count }) => { map[camera] = count; });
      setHeatData(map);
    } finally {
      setHeatRefreshing(false);
    }
  }, [authFetch, API, heatHours]);

  useEffect(() => {
    if (showHeatmap) loadHeatData();
  }, [showHeatmap, heatHours]);

  // в”Ђв”Ђ Image size в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  const updateImgSize = useCallback(() => {
    if (!imgRef.current) return;
    const nw = imgRef.current.naturalWidth  || imgRef.current.clientWidth;
    const nh = imgRef.current.naturalHeight || imgRef.current.clientHeight;
    setImgSize({ w: nw, h: nh });
  }, []);

  useEffect(() => {
    window.addEventListener('resize', updateImgSize);
    return () => window.removeEventListener('resize', updateImgSize);
  }, [updateImgSize]);

  // в”Ђв”Ђ Zoom в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.88 : 1.14;
    setTr(t => ({ ...t, scale: Math.max(0.25, Math.min(6, t.scale * factor)) }));
  }, [mode]);

  const zoomIn  = () => setTr(t => ({ ...t, scale: Math.min(6, t.scale * 1.3) }));
  const zoomOut = () => setTr(t => ({ ...t, scale: Math.max(0.25, t.scale / 1.3) }));
  const resetView = () => {
    if (selectedMap?.id) localStorage.removeItem(`mvp_tr_${selectedMap.id}`);
    setTr({ x: 0, y: 0, scale: 1 });
  };

  // в”Ђв”Ђ Global mouse handlers (drag camera + pan) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  useEffect(() => {
    const onMove = (e) => {
      const pan = panRef.current;
      if (pan) {
        setTr(t => ({ ...t, x: e.clientX - pan.ox, y: e.clientY - pan.oy }));
      }
      // Regular drag-pan
      if (dragPanStart.current) {
        const dx = Math.abs(e.clientX - dragPanStart.current.mx);
        const dy = Math.abs(e.clientY - dragPanStart.current.my);
        if (dx > 4 || dy > 4) {
          wasDragging.current = true;
          setTr(t => ({ ...t, x: e.clientX - dragPanStart.current.ox, y: e.clientY - dragPanStart.current.oy }));
        }
      }
      if (dragging && imgRef.current) {
        const rect = imgRef.current.getBoundingClientRect();
        setDragging(prev => prev ? {
          ...prev,
          currentX: Math.max(0, Math.min(imgSize.w, (e.clientX - rect.left) / (rect.width  / imgSize.w))),
          currentY: Math.max(0, Math.min(imgSize.h, (e.clientY - rect.top)  / (rect.height / imgSize.h))),
        } : null);
      }
    };

    const onUp = (e) => {
      panRef.current = null;
      dragPanStart.current = null;
      if (dragging && imgRef.current) {
        const rect = imgRef.current.getBoundingClientRect();
        placeCamera(
          dragging.cam,
          Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
          Math.max(0, Math.min(1, (e.clientY - rect.top)  / rect.height)),
        );
        setDragging(null);
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup',   onUp);
    };
  }, [dragging, imgSize]);

  const handleCanvasMouseDown = useCallback((e) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      panRef.current = { ox: e.clientX - tr.x, oy: e.clientY - tr.y };
    } else if (e.button === 0 && !placingCam && !e.altKey) {
      // Regular left-click drag on empty canvas = pan
      dragPanStart.current = { ox: e.clientX - tr.x, oy: e.clientY - tr.y, mx: e.clientX, my: e.clientY };
      wasDragging.current = false;
    }
  }, [tr, placingCam]);

  // в”Ђв”Ђ Camera placement в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  const placeCamera = useCallback(async (cam, x, y) => {
    if (!selectedMap) return;
    const prevX = cam.map_x, prevY = cam.map_y, prevMapId = cam.map_id;
    await authFetch(`${API}/api/maps/camera/${cam.id}/position`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ map_id: selectedMap.id, x, y }),
    });
    setEditHistory(prev => [...prev.slice(-29), { camId: cam.id, prevMapId, prevX, prevY, nextMapId: selectedMap.id, nextX: x, nextY: y }]);
    setEditFuture([]);
    reloadMaps();
  }, [authFetch, API, selectedMap, reloadMaps]);

  const undoEdit = useCallback(async () => {
    const item = editHistory[editHistory.length - 1];
    if (!item) return;
    await authFetch(`${API}/api/maps/camera/${item.camId}/position`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ map_id: item.prevMapId, x: item.prevX, y: item.prevY }),
    });
    setEditHistory(prev => prev.slice(0, -1));
    setEditFuture(prev => [item, ...prev]);
    reloadMaps();
  }, [authFetch, API, editHistory, reloadMaps]);

  const redoEdit = useCallback(async () => {
    const item = editFuture[0];
    if (!item) return;
    await authFetch(`${API}/api/maps/camera/${item.camId}/position`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ map_id: item.nextMapId, x: item.nextX, y: item.nextY }),
    });
    setEditFuture(prev => prev.slice(1));
    setEditHistory(prev => [...prev, item]);
    reloadMaps();
  }, [authFetch, API, editFuture, reloadMaps]);

  const removeCamera = useCallback(async (cam) => {
    await authFetch(`${API}/api/maps/camera/${cam.id}/position`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ map_id: null }),
    });
    reloadMaps();
  }, [authFetch, API, reloadMaps]);

  const handleDragStart = useCallback((e, cam) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging({ cam, currentX: cam._px, currentY: cam._py });
  }, []);

  const handleMapClick = useCallback((e) => {
    if (wasDragging.current) { wasDragging.current = false; return; }
    if (!placingCam || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    placeCamera(placingCam,
      (e.clientX - rect.left) / rect.width,
      (e.clientY - rect.top)  / rect.height,
    );
    setPlacingCam(null);
  }, [placingCam, placeCamera]);

  // в”Ђв”Ђ Upload / Delete map в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  const uploadMap = useCallback(async (file, customName) => {
    if (!file) return;
    if (!canEditMaps) {
      toast.warn('Only admins or operators can upload areas');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      const name = (customName || file.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ')).trim();
      form.append('name', name);
      form.append('image', file);
      const res = await authFetch(`${API}/api/maps`, { method: 'POST', body: form });
      if (res.ok) {
        const nm = await res.json();
        setNewAreaName('');
        setNewAreaFile(null);
        await reloadMaps();
        setSelectedMap({ ...nm, cameras: [] });
        toast.success('Area uploaded');
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || 'Area upload failed');
      }
    } finally {
      setUploading(false);
    }
  }, [authFetch, API, reloadMaps, canEditMaps]);

  const handleFileDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0] || e.target?.files?.[0];
    if (file?.type?.startsWith('image/')) uploadMap(file);
  }, [uploadMap]);

  const deleteMap = useCallback(async (id) => {
    if (!canDeleteMaps) { toast.warn('Only admins can delete areas'); return; }
    setDeleteConfirm(id);
  }, [canDeleteMaps]);

  const confirmDeleteMap = useCallback(async (id) => {
    setDeleteConfirm(null);
    const res = await authFetch(`${API}/api/maps/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(err.detail || 'Failed to delete area');
      return;
    }
    toast.success('Area deleted');
    reloadMaps();
  }, [authFetch, API, reloadMaps]);

  const changeCameraDirection = useCallback(async (cam) => {
    const dirs = ['in', 'out', 'both'];
    const next = dirs[(dirs.indexOf(cam.direction) + 1) % 3];
    const res = await authFetch(`${API}/api/cameras/${cam.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction: next }),
    });
    if (res.ok) { reloadMaps(); toast.success(`Direction set to ${next}`); }
    else toast.error('Could not update direction');
  }, [authFetch, API, reloadMaps]);


  const saveAreaName = useCallback(async () => {
    if (!selectedMap || areaSaving) return;
    const name = areaName.trim();
    if (!name) {
      toast.warn('Area name is required');
      return;
    }
    if (name === selectedMap.name) return;
    setAreaSaving(true);
    try {
      const res = await authFetch(`${API}/api/maps/${selectedMap.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || 'Failed to rename area');
        return;
      }
      const updated = await res.json();
      setMaps(prev => prev.map(m => m.id === selectedMap.id ? { ...m, ...updated, cameras: m.cameras } : m));
      setSelectedMap(prev => prev?.id === selectedMap.id ? { ...prev, ...updated, cameras: prev.cameras } : prev);
      setShowAreaEditor(false);
      toast.success('Area renamed');
    } finally {
      setAreaSaving(false);
    }
  }, [authFetch, API, selectedMap, areaName, areaSaving]);

  // в”Ђв”Ђ Person path в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  const loadPath = useCallback(async (person, hours) => {
    if (!person?.id) { setPathLoading(false); return; }
    setPathLoading(true);
    setActiveStep(null);
    setPlaying(false);
    setPrediction(null);
    setPathData(null);
    try {
      const [pr, predr] = await Promise.all([
        authFetch(`${API}/api/maps/person-path/${person.id}?hours=${hours}`),
        authFetch(`${API}/api/maps/person-prediction/${person.id}`),
      ]);
      if (pr.ok) {
        const pd = await pr.json();
        if (import.meta.env.DEV && pd._debug) console.info('[MapPath]', pd._debug);
        setPathData(pd);
      }
      if (predr.ok) setPrediction(await predr.json());
    } catch (e) {
      console.error('[MapView] loadPath error:', e);
    } finally {
      setPathLoading(false);
    }
  }, [authFetch, API]);

  const startTrackingPerson = useCallback((person) => {
    if (!person?.id) return;
    setPathPerson(person);
    setMode('track');
    setTrackFindMode('events');
    setSelectedEvent(null);
    setPersonSearch(person.full_name || '');
  }, []);

  // в”Ђв”Ђ Keyboard shortcuts в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
      if (e.key === 'f' || e.key === 'F') { toggleFullscreen(); return; }
      if (e.key === 'Escape') { setCamInfoPopup(null); setDeleteConfirm(null); setShowAllEvents(false); return; }
      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey && mode === 'edit') { e.preventDefault(); undoEdit(); return; }
      if ((e.key === 'y' && (e.ctrlKey || e.metaKey)) || (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey)) {
        if (mode === 'edit') { e.preventDefault(); redoEdit(); return; }
      }
      if (mode !== 'track') return;
      if (e.key === ' ') {
        e.preventDefault();
        if (pathStepsRef.current.length > 1) {
          if (activeStepRef.current == null || activeStepRef.current >= pathStepsRef.current.length - 1) setActiveStep(0);
          setPlaying(p => !p);
        }
      }
      if (e.key === 'ArrowRight') { e.preventDefault(); setActiveStep(s => Math.min((pathStepsRef.current.length || 1) - 1, (s ?? -1) + 1)); setPlaying(false); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); setActiveStep(s => Math.max(0, (s ?? 0) - 1)); setPlaying(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, toggleFullscreen, undoEdit, redoEdit]);

  // ref to latest activeStep for use in keyboard handler
  const activeStepRef = useRef(activeStep);
  useEffect(() => { activeStepRef.current = activeStep; }, [activeStep]);

  useEffect(() => {
    if (pathPerson) loadPath(pathPerson, pathHours);
    else { setPathData(null); setActiveStep(null); setPlaying(false); setPrediction(null); }
  }, [pathPerson, pathHours]);

  const searchByPhoto = useCallback(async (file) => {
    setPhotoSearching(true);
    setPhotoResults(null);
    const form = new FormData();
    form.append('file', file);
    const r = await authFetch(`${API}/api/search/by-picture?limit=5&threshold=0.25`, { method: 'POST', body: form });
    if (r.ok) setPhotoResults(await r.json());
    setPhotoSearching(false);
  }, [authFetch, API]);

  const loadFaceEvents = useCallback(async () => {
    setEventsLoading(true);
    const r = await authFetch(`${API}/api/events?limit=80`);
    if (r.ok) setFaceEvents(await r.json());
    setEventsLoading(false);
  }, [authFetch, API]);

  useEffect(() => {
    if (trackFindMode === 'events' && !pathPerson) loadFaceEvents();
  }, [trackFindMode]);

  // в”Ђв”Ђ Computed в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  const mapCameras = selectedMap?.cameras || [];

  const enrichedCameras = useMemo(() => mapCameras.map(c => ({
    ...c,
    _px: (dragging?.cam?.id === c.id ? dragging.currentX : (c.map_x ?? 0.5) * imgSize.w),
    _py: (dragging?.cam?.id === c.id ? dragging.currentY : (c.map_y ?? 0.5) * imgSize.h),
  })), [mapCameras, dragging, imgSize]);

  const pathStepsAll = useMemo(() => {
    if (!pathData || !selectedMap) return [];
    return (pathData.path || [])
      .filter(s => s.map_id === selectedMap.id)
      .map(s => {
        const cam = enrichedCameras.find(c => c.id === s.camera_id || c.name === s.camera);
        return { ...s, _px: cam?._px ?? s.x * imgSize.w, _py: cam?._py ?? s.y * imgSize.h };
      });
  }, [pathData, selectedMap, enrichedCameras, imgSize]);

  // Step playback вЂ” defined after pathStepsAll so ref stays fresh
  const pathStepsRef = useRef(pathStepsAll);
  useEffect(() => { pathStepsRef.current = pathStepsAll; }, [pathStepsAll]);

  const speedMs = { 0.5: 1800, 1: 900, 2: 450, 3: 200 };

  useEffect(() => {
    if (!playing) return;
    playRef.current = setInterval(() => {
      const total = pathStepsRef.current.length;
      setActiveStep(prev => {
        const next = (prev == null ? -1 : prev) + 1;
        if (next >= total - 1) { setPlaying(false); return total - 1; }
        return next;
      });
    }, speedMs[playSpeed] ?? 900);
    return () => clearInterval(playRef.current);
  }, [playing, playSpeed]);

  const visibleSteps  = activeStep != null ? pathStepsAll.slice(0, activeStep + 1) : pathStepsAll;
  const pathCamSet    = new Set(visibleSteps.map(s => s.camera));
  const lastStep      = visibleSteps[visibleSteps.length - 1];

  const exportPath = useCallback(() => {
    if (!pathStepsAll.length) return;
    const name = pathPerson?.full_name || `id_${pathPerson?.id}`;
    const rows = ['Step,Camera,Time,Confidence'];
    pathStepsAll.forEach((s, i) => {
      rows.push(`${i + 1},"${s.camera}","${s.time || ''}",${s.confidence ? Math.round(s.confidence * 100) : ''}`);
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `path_${name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [pathStepsAll, pathPerson]);

  // в”Ђв”Ђ Multi-person tracking в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  const addToMultiTrack = useCallback(async (person) => {
    if (!person?.id) return;
    if (trackedPersons.some(t => t.person.id === person.id)) return;
    if (trackedPersons.length >= 4) { toast.warn('Max 4 persons at once'); return; }
    const color = TRACK_COLORS[trackedPersons.length % TRACK_COLORS.length];
    const r = await authFetch(`${API}/api/maps/person-path/${person.id}?hours=${pathHours}`);
    if (!r.ok) return;
    const pathData = await r.json();
    setTrackedPersons(prev => [...prev, { person, pathData, color }]);
  }, [authFetch, API, pathHours, trackedPersons]);

  const removeMultiTrack = useCallback((personId) => {
    setTrackedPersons(prev => prev.filter(t => t.person.id !== personId));
  }, []);

  // в”Ђв”Ђ Export map as PNG в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  const exportMapAsPng = useCallback(async () => {
    if (!imgRef.current || !selectedMap) return;
    const img = imgRef.current;
    const w = img.naturalWidth  || img.clientWidth;
    const h = img.naturalHeight || img.clientHeight;
    const canvas = document.createElement('canvas');
    canvas.width  = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    // Draw map image
    try {
      const r = await apiFetch(img.src);
      const blob = await r.blob();
      const bmpUrl = URL.createObjectURL(blob);
      await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => { ctx.drawImage(i, 0, 0, w, h); URL.revokeObjectURL(bmpUrl); resolve(); };
        i.onerror = reject;
        i.src = bmpUrl;
      });
    } catch { ctx.fillStyle = '#1e293b'; ctx.fillRect(0, 0, w, h); }

    // Draw SVG markers on top
    const svgEl = imgRef.current?.parentElement?.querySelector('svg');
    if (svgEl) {
      const svgStr = new XMLSerializer().serializeToString(svgEl);
      const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);
      await new Promise((resolve) => {
        const i = new Image();
        i.onload = () => { ctx.drawImage(i, 0, 0, w, h); URL.revokeObjectURL(svgUrl); resolve(); };
        i.onerror = resolve;
        i.src = svgUrl;
      });
    }

    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `map_${selectedMap.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }, [selectedMap]);

  // в”Ђв”Ђ View mode quick search в†’ highlight в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  const quickSearchPersons = useMemo(() => {
    if (!quickSearch.trim()) return [];
    return persons.filter(p =>
      (p.full_name || '').toLowerCase().includes(quickSearch.toLowerCase())
    ).slice(0, 8);
  }, [quickSearch, persons]);

  const filteredPersons = persons.filter(p =>
    !personSearch || (p.full_name || '').toLowerCase().includes(personSearch.toLowerCase())
  );

  // в”Ђв”Ђ Camera clustering (zoom-out) в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  const CLUSTER_THRESHOLD = 44; // px in screen space
  const clusters = useMemo(() => {
    if (tr.scale >= 0.65) return null; // not needed when zoomed in enough
    const used   = new Set();
    const result = [];
    enrichedCameras.forEach((cam, i) => {
      if (used.has(i)) return;
      const group = [cam];
      used.add(i);
      enrichedCameras.forEach((c, j) => {
        if (used.has(j)) return;
        const dx = (c._px - cam._px) * tr.scale, dy = (c._py - cam._py) * tr.scale;
        if (Math.hypot(dx, dy) < CLUSTER_THRESHOLD) { group.push(c); used.add(j); }
      });
      if (group.length > 1) {
        const cx = group.reduce((s, c) => s + c._px, 0) / group.length;
        const cy = group.reduce((s, c) => s + c._py, 0) / group.length;
        result.push({ x: cx, y: cy, count: group.length, cameras: group });
      } else {
        result.push({ x: cam._px, y: cam._py, count: 1, cameras: group });
      }
    });
    return result;
  }, [enrichedCameras, tr.scale]);

  const mapImgSrc = selectedMap ? mapImageUrl(API, selectedMap.image_path) : '';

  // в”Ђв”Ђ Empty state в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  if (maps.length === 0) {
    return (
      <MapEmptyState
        API={API}
        canEditMaps={canEditMaps}
        newAreaFile={newAreaFile}
        newAreaName={newAreaName}
        setNewAreaFile={setNewAreaFile}
        setNewAreaName={setNewAreaName}
        uploadMap={uploadMap}
        uploading={uploading}
      />
    );
  }
  // в”Ђв”Ђ Main layout в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

  return (
    <div className="mvp-root">

      {/* в”Ђв”Ђ LEFT PANEL в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */}
      <aside className="mvp-aside">

        {selectedMap && (
          <div className="mvp-section mvp-mode-section">
            <div className="mvp-mode-tabs">
              <button className={mode === 'view'  ? 'active' : ''} onClick={() => { setMode('view'); setPlacingCam(null); setShowAreaEditor(false); }}>
                <Eye size={12} /> View
              </button>
              <button className={mode === 'track' ? 'active' : ''} onClick={() => { setMode('track'); setPlacingCam(null); setShowAreaEditor(false); }}>
                <Navigation size={12} /> Track
              </button>
            </div>
          </div>
        )}

        <MapAreasList
          API={API}
          canDeleteMaps={canDeleteMaps}
          canEditMaps={canEditMaps}
          deleteMap={deleteMap}
          handleFileDrop={handleFileDrop}
          maps={maps}
          selectedMap={selectedMap}
          setAreaName={setAreaName}
          setMode={setMode}
          setPathPerson={setPathPerson}
          setSelectedMap={setSelectedMap}
          setShowAreaEditor={setShowAreaEditor}
        />
        {/* в”Ђв”Ђ VIEW MODE: stats + legend в”Ђв”Ђ */}
        {mode === 'view' && selectedMap && (
          <div className="mvp-section mvp-section-grow">
            <div className="mvp-stats-row">
              <div className="mvp-stat">
                <strong>{mapCameras.length}</strong>
                <span>Cameras</span>
              </div>
              <div className="mvp-stat">
                <strong style={{ color: '#10b981' }}>{occupancy.in}</strong>
                <span>IN today</span>
              </div>
              <div className="mvp-stat">
                <strong style={{ color: '#ef4444' }}>{occupancy.out}</strong>
                <span>OUT today</span>
              </div>
              <div className="mvp-stat">
                <strong style={{ color: occupancy.in - occupancy.out >= 0 ? '#10b981' : '#ef4444' }}>
                  {occupancy.in - occupancy.out >= 0 ? '+' : ''}{occupancy.in - occupancy.out}
                </strong>
                <span>Net</span>
              </div>
            </div>

            {/* Quick person search */}
            <div className="mvp-qs-row">
              <Search size={11} />
              <input
                className="mvp-search-input"
                placeholder="Find person on mapвЂ¦"
                value={quickSearch}
                onChange={e => { setQuickSearch(e.target.value); if (!e.target.value) setHighlightCam(null); }}
              />
              {quickSearch && <button className="mvp-clear-btn" onClick={() => { setQuickSearch(''); setHighlightCam(null); }}><X size={10} /></button>}
            </div>
            {quickSearchPersons.length > 0 && (
              <div className="mvp-qs-results">
                {quickSearchPersons.map(p => (
                  <button key={p.id} className="mvp-qs-row-item" onClick={async () => {
                    const r = await authFetch(`${API}/api/maps/person-prediction/${p.id}`);
                    if (r.ok) {
                      const pred = await r.json();
                      if (pred.current_camera) { setHighlightCam(pred.current_camera); setQuickSearch(p.full_name || ''); }
                      else toast.warn('No recent location found');
                    }
                  }}>
                    {p.preview_image
                      ? <img src={mediaUrl(API, p.preview_image)} className="mvp-avatar" alt="" onError={e => { e.target.style.display='none'; }} />
                      : <div className="mvp-avatar mvp-avatar-ph"><User size={10} /></div>
                    }
                    <span>{p.full_name || `#${p.id}`}</span>
                    <Navigation size={9} className="mvp-qs-nav" />
                  </button>
                ))}
              </div>
            )}
            {highlightCam && (
              <div className="mvp-qs-active">
                <span className="mvp-pulse-dot" style={{ background: '#6366f1', boxShadow: '0 0 0 0 rgba(99,102,241,.4)' }} />
                Last seen: <strong>{highlightCam}</strong>
                <button onClick={() => setHighlightCam(null)}><X size={9} /></button>
              </div>
            )}
            <div className="mvp-view-events">
              <div className="mvp-view-events-head">
                <div>
                  <span>Live Movement</span>
                  <small>Camera events on this floor</small>
                </div>
                <strong>{viewEvents.length}</strong>
              </div>
              <div className="mvp-view-flow">
                <span><i className="in" /> {viewEvents.filter(ev => ev.direction === 'in').length} IN</span>
                <span><i className="out" /> {viewEvents.filter(ev => ev.direction === 'out').length} OUT</span>
                <span><i className="both" /> {viewEvents.filter(ev => !['in', 'out'].includes(ev.direction)).length} IN/OUT</span>
              </div>
              <div className="mvp-view-event-list">
                {viewEvents.length === 0 && (
                  <div className="mvp-view-events-empty">
                    <Activity size={15} />
                    <span>Waiting for movement</span>
                    <small>New camera events will appear here in View mode.</small>
                  </div>
                )}
                {viewEvents.map(ev => (
                  <div key={ev.uid} className="mvp-view-event-row" style={{ '--event-color': dirColor(ev.direction) }}>
                    {ev.image
                      ? <img src={ev.image} className="mvp-view-event-thumb" alt="" onError={e => { e.target.style.display='none'; }} />
                      : <div className="mvp-view-event-thumb mvp-ev-thumb-ph"><User size={11} /></div>
                    }
                    <div className="mvp-view-event-info">
                      <div className="mvp-view-event-main">
                        <span className="mvp-ev-name">{ev.personName}</span>
                        <span className="mvp-view-dir-badge">{dirShortLabel(ev.direction)}</span>
                      </div>
                      <div className="mvp-view-event-meta">
                        <small><Camera size={9} /> {ev.camName}</small>
                        <small><Clock size={9} /> {fmtTime(ev.ts)}</small>
                      </div>
                    </div>
                    {ev.personId && (
                      <button
                        className="mvp-view-track-btn"
                        title={`Track ${ev.personName}`}
                        onClick={() => startTrackingPerson({
                          id: ev.personId,
                          full_name: ev.personName,
                          person_type: ev.personType,
                          preview_image: ev.previewImage,
                        })}
                      >
                        <Navigation size={11} /> Track
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* в”Ђв”Ђ EDIT MODE: unplaced + placed в”Ђв”Ђ */}
        {mode === 'edit' && selectedMap && (
          <div className="mvp-section mvp-section-grow">
            {showAreaEditor && (
              <div className="mvp-area-edit-card">
                <div className="mvp-area-edit-head">
                  <div>
                    <span>Area Name</span>
                    <small>Visible in Area list and map header</small>
                  </div>
                </div>
                <div className="mvp-area-name-row">
                  <input
                    className="mvp-area-name-input"
                    value={areaName}
                    maxLength={80}
                    onChange={e => setAreaName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveAreaName();
                    }}
                    placeholder="Area name"
                  />
                  <button
                    className="mvp-area-save-btn"
                    onClick={saveAreaName}
                    disabled={areaSaving || !areaName.trim() || areaName.trim() === selectedMap.name}
                  >
                    {areaSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            )}
            <div className="mvp-section-hd"><Camera size={12} /> Unplaced</div>
            <div className="mvp-cam-list">
              {unplaced.length === 0
                ? <p className="mvp-empty-note">All cameras placed вњ“</p>
                : unplaced.map(c => (
                  <button
                    key={c.id}
                    className={`mvp-unplaced-btn${placingCam?.id === c.id ? ' active' : ''}`}
                    onClick={() => setPlacingCam(placingCam?.id === c.id ? null : c)}
                  >
                    <span className="mvp-dir-dot" style={{ background: dirColor(c.direction) }} />
                    <div>
                      <span>{c.name}</span>
                      {c.location && <small>{c.location}</small>}
                    </div>
                    <span className="mvp-dir-badge" style={{ color: dirColor(c.direction) }}>{dirLabel(c.direction)}</span>
                  </button>
                ))
              }
            </div>

            {mapCameras.length > 0 && (
              <>
                <div className="mvp-section-hd" style={{ marginTop: 12 }}><Camera size={12} /> Placed</div>
                <div className="mvp-cam-list">
                  {enrichedCameras.map(c => (
                    <div key={c.id} className="mvp-placed-row">
                      <span className="mvp-dir-dot" style={{ background: dirColor(c.direction) }} />
                      <span className="mvp-placed-name">{c.name}</span>
                      <button
                        className="mvp-dir-cycle-btn"
                        style={{ color: dirColor(c.direction) }}
                        title={`Direction: ${dirLabel(c.direction)} вЂ” click to cycle`}
                        onClick={() => changeCameraDirection(c)}
                      >{dirShortLabel(c.direction)}</button>
                      <button className="mvp-del-btn" onClick={() => removeCamera(c)} title="Remove"><X size={10} /></button>
                    </div>
                  ))}
                </div>
              </>
            )}
            <p className="mvp-hint-text" style={{ marginTop: 10 }}>Drag placed cameras to move В· Click unplaced в†’ click map to place</p>
          </div>
        )}

        {/* в”Ђв”Ђ TRACK MODE в”Ђв”Ђ */}
        {mode === 'track' && selectedMap && (
          <div className="mvp-section mvp-section-grow">
            <div className="mvp-section-hd"><Navigation size={12} /> Track Person</div>

            {/* Find mode tabs */}
            {!pathPerson && (
              <div className="mvp-find-tabs">
                <button className={trackFindMode === 'search' ? 'active' : ''} onClick={() => setTrackFindMode('search')}>
                  <Search size={10} /> Name
                </button>
                <button className={trackFindMode === 'upload' ? 'active' : ''} onClick={() => setTrackFindMode('upload')}>
                  <Upload size={10} /> Photo
                </button>
                <button className={trackFindMode === 'events' ? 'active' : ''} onClick={() => setTrackFindMode('events')}>
                  <Camera size={10} /> Events
                </button>
              </div>
            )}

            {/* Name search */}
            {!pathPerson && trackFindMode === 'search' && (
              <>
                <div className="mvp-search-row">
                  <Search size={11} />
                  <input className="mvp-search-input" placeholder="Search person..."
                    value={personSearch} onChange={e => setPersonSearch(e.target.value)} />
                  {personSearch && <button className="mvp-clear-btn" onClick={() => { setPersonSearch(''); }}><X size={11} /></button>}
                </div>
                <div className="mvp-person-list">
                  {filteredPersons.slice(0, 50).map(p => (
                    <button key={p.id} className="mvp-person-row"
                      onClick={() => { setPathPerson(p); setPersonSearch(p.full_name || ''); }}>
                      {p.preview_image
                        ? <img src={mediaUrl(API, p.preview_image)} className="mvp-avatar" alt="" onError={e => { e.target.style.display='none'; }} />
                        : <div className="mvp-avatar mvp-avatar-ph"><User size={12} /></div>
                      }
                      <div>
                        <span>{p.full_name || `Unknown #${p.id}`}</span>
                        <small className={`mvp-ptype mvp-ptype-${p.person_type}`}>{p.person_type}</small>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* All Events button вЂ” visible in all find modes */}
            {!pathPerson && (
              <button className="mvp-all-events-btn" onClick={() => { setShowAllEvents(true); if (faceEvents.length === 0) loadFaceEvents(); }}>
                <Camera size={13} /> All Recent Events
              </button>
            )}

            {/* Photo upload search */}
            {!pathPerson && trackFindMode === 'upload' && (
              <>
                <input ref={photoFileRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) searchByPhoto(f); e.target.value = ''; }} />
                <button className="mvp-upload-search-btn" onClick={() => photoFileRef.current?.click()} disabled={photoSearching}>
                  {photoSearching ? <span className="mvp-loader" /> : <Upload size={13} />}
                  {photoSearching ? 'Searching...' : 'Upload Photo'}
                </button>
                {photoResults && (
                  <div className="mvp-person-list" style={{ marginTop: 6 }}>
                    {photoResults.length === 0
                      ? <p className="mvp-empty-note">No match found</p>
                      : photoResults.map((r, i) => (
                        <button key={i} className="mvp-person-row"
                          onClick={() => r.person && setPathPerson(r.person)}>
                          {r.person?.preview_image
                            ? <img src={mediaUrl(API, r.person.preview_image)} className="mvp-avatar" alt="" onError={e => { e.target.style.display='none'; }} />
                            : <div className="mvp-avatar mvp-avatar-ph"><User size={12} /></div>
                          }
                          <div>
                            <span>{r.person?.full_name || `Unknown #${r.person?.id}`}</span>
                            <small className={`mvp-ptype mvp-ptype-${r.person?.person_type}`}>{r.person?.person_type}</small>
                          </div>
                          <span className="mvp-match-conf">{Math.round((r.confidence || r.similarity || 0) * 100)}%</span>
                        </button>
                      ))
                    }
                  </div>
                )}
              </>
            )}

            {/* Face events browser */}
            {!pathPerson && trackFindMode === 'events' && (
              <div className="mvp-events-browser">
                <div className="mvp-events-hd">
                  <span>Recent detections</span>
                  <button className="mvp-events-refresh" onClick={loadFaceEvents} title="Refresh">
                    {eventsLoading ? <span className="mvp-loader" style={{ width: 10, height: 10 }} /> : 'в†»'}
                  </button>
                </div>
                <div className="mvp-events-list">
                  {eventsLoading && faceEvents.length === 0 && (
                    <p className="mvp-empty-note">Loading...</p>
                  )}
                  {!eventsLoading && faceEvents.length === 0 && (
                    <p className="mvp-empty-note">No events yet</p>
                  )}
                  {faceEvents.map(ev => {
                    const imgSrc = ev.crop_image || ev.image || ev.crop_image_path || ev.image_path;
                    const hasId  = ev.person_id || ev.person?.id;
                    const isSelected = selectedEvent?.id === ev.id;
                    return (
                      <button
                        key={ev.id}
                        className={`mvp-ev-row${!hasId ? ' mvp-ev-no-person' : ''}${isSelected ? ' mvp-ev-selected' : ''}`}
                        onClick={() => hasId && setSelectedEvent(isSelected ? null : ev)}
                      >
                        {imgSrc
                          ? <img src={mediaUrl(API, imgSrc)} className="mvp-ev-thumb" alt="" onError={e => { e.target.style.display='none'; }} />
                          : <div className="mvp-ev-thumb mvp-ev-thumb-ph"><User size={11} /></div>
                        }
                        <div className="mvp-ev-info">
                          <span className="mvp-ev-name">
                            {ev.person?.full_name || (ev.person_id ? `Unknown #${ev.person_id}` : 'Unknown')}
                          </span>
                          <small className="mvp-ev-cam">{ev.camera_name}</small>
                          <small className="mvp-ev-time">
                            {new Date(ev.created_at).toLocaleTimeString('en-US', { timeZone: 'Asia/Yerevan', hour: '2-digit', minute: '2-digit', hour12: false })}
                          </small>
                        </div>
                        <span className={`mvp-ev-badge mvp-ptype-${ev.person_type || 'unknown'}`}>
                          {(ev.person_type || 'unk').slice(0, 3)}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Selected event detail card */}
                {selectedEvent && (() => {
                  const ev     = selectedEvent;
                  const imgSrc = ev.crop_image || ev.image || ev.crop_image_path || ev.image_path;
                  const name   = ev.person?.full_name || `Unknown #${ev.person_id}`;
                  const pid    = ev.person_id || ev.person?.id;
                  return (
                    <div className="mvp-ev-detail">
                      <div className="mvp-ev-detail-head">
                        <span>Selected</span>
                        <button onClick={() => setSelectedEvent(null)}><X size={11} /></button>
                      </div>
                      <div className="mvp-ev-detail-body">
                        {imgSrc
                          ? <img src={mediaUrl(API, imgSrc)} className="mvp-ev-detail-img" alt="" onError={e => { e.target.style.display='none'; }} />
                          : <div className="mvp-ev-detail-img mvp-ev-thumb-ph"><User size={22} /></div>
                        }
                        <div className="mvp-ev-detail-info">
                          <strong>{name}</strong>
                          <span className={`mvp-ptype mvp-ptype-${ev.person_type || 'unknown'}`}>{ev.person_type || 'unknown'}</span>
                          <small><Camera size={9} /> {ev.camera_name}</small>
                          <small><Clock size={9} /> {new Date(ev.created_at).toLocaleTimeString('en-US', { timeZone:'Asia/Yerevan', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false })}</small>
                          {ev.confidence && <small>Conf: {Math.round(ev.confidence * 100)}%</small>}
                        </div>
                      </div>
                      <button
                        className="mvp-ev-track-btn"
                        onClick={() => {
                          const p = ev.person || {
                            id:           pid,
                            full_name:    ev.person?.full_name || null,
                            person_type:  ev.person_type || 'unknown',
                            preview_image: null,
                          };
                          startTrackingPerson(p);
                        }}
                      >
                        <Navigation size={13} /> Track {name}
                      </button>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Tracking panel */}
            {pathPerson && (
              <div className="mvp-track-panel">

                {/* Person card */}
                <div className="mvp-track-who">
                  {pathPerson.preview_image
                    ? <img src={mediaUrl(API, pathPerson.preview_image)} className="mvp-avatar-lg" alt="" onError={e => { e.target.style.display='none'; }} />
                    : <div className="mvp-avatar-lg mvp-avatar-ph"><User size={16} /></div>
                  }
                  <div>
                    <strong>{pathPerson.full_name || `Unknown #${pathPerson.id}`}</strong>
                    <small className={`mvp-ptype mvp-ptype-${pathPerson.person_type}`}>{pathPerson.person_type}</small>
                  </div>
                  <button className="mvp-del-btn" onClick={() => { setPathPerson(null); setPersonSearch(''); setPathData(null); setActiveStep(null); setPrediction(null); setPhotoResults(null); }}>
                    <X size={12} />
                  </button>
                </div>

                {/* Hours */}
                <div className="mvp-hours-row">
                  <Clock size={11} />
                  <select className="mvp-sel" value={pathHours} onChange={e => setPathHours(Number(e.target.value))}>
                    <option value={1}>Last 1 hour</option>
                    <option value={4}>Last 4 hours</option>
                    <option value={8}>Last 8 hours</option>
                    <option value={24}>Last 24 hours</option>
                    <option value={72}>Last 3 days</option>
                    <option value={168}>Last 7 days</option>
                  </select>
                  {pathLoading && <span className="mvp-loader" />}
                </div>

                {/* Location cards */}
                {prediction && (
                  <div className="mvp-loc-cards">
                    <div className="mvp-loc-card mvp-loc-entry">
                      <Navigation size={11} />
                      <div>
                        <span className="mvp-loc-lbl">Entry</span>
                        <strong>{prediction.entry_camera || 'вЂ”'}</strong>
                        {prediction.entry_time && <small>{new Date(prediction.entry_time).toLocaleTimeString('en-US', { timeZone:'Asia/Yerevan', hour:'2-digit', minute:'2-digit', hour12:false })}</small>}
                      </div>
                    </div>
                    <div className="mvp-loc-card mvp-loc-now">
                      <span className="mvp-pulse-dot" />
                      <div>
                        <span className="mvp-loc-lbl">Now</span>
                        <strong>{prediction.current_camera || 'вЂ”'}</strong>
                        {prediction.last_seen && <small>{(() => { const d = Math.floor((Date.now()-new Date(prediction.last_seen))/60000); return d < 60 ? `${d}m ago` : `${Math.floor(d/60)}h ago`; })()}</small>}
                      </div>
                    </div>
                    <div className="mvp-loc-card mvp-loc-pred">
                      <TrendingUp size={11} />
                      <div>
                        <span className="mvp-loc-lbl">Predicted</span>
                        <strong>{prediction.predicted_next || '?'}</strong>
                        {prediction.prediction_confidence > 0 && <small>{prediction.prediction_confidence}%</small>}
                      </div>
                    </div>
                  </div>
                )}

                {/* Stats */}
                {pathStepsAll.length > 0 && (
                  <div className="mvp-path-summary">
                    <span><strong>{pathStepsAll.length}</strong> stops</span>
                    <span><strong>{new Set(pathStepsAll.map(s => s.camera)).size}</strong> cams</span>
                    {prediction && <span><strong>{prediction.today_events || 0}</strong> events</span>}
                  </div>
                )}

                {/* Playback */}
                {pathStepsAll.length > 1 && (
                  <>
                    <div className="mvp-playback">
                      <button onClick={() => { setActiveStep(0); setPlaying(false); }}><ChevronLeft size={11} /></button>
                      <button onClick={() => { setActiveStep(s => Math.max(0, (s ?? 1) - 1)); setPlaying(false); }}>вЂ№</button>
                      <button className="mvp-play-btn" onClick={() => {
                        if (activeStep == null || activeStep >= pathStepsAll.length - 1) setActiveStep(0);
                        setPlaying(p => !p);
                      }}>
                        {playing ? <Pause size={12} /> : <Play size={12} />}
                        {playing ? 'Pause' : 'Play'}
                      </button>
                      <button onClick={() => { setActiveStep(s => Math.min(pathStepsAll.length - 1, (s ?? 0) + 1)); setPlaying(false); }}>вЂє</button>
                      <button onClick={() => { setActiveStep(pathStepsAll.length - 1); setPlaying(false); }}><ChevronRight size={11} /></button>
                      {activeStep != null && <span className="mvp-step-count">{activeStep + 1}/{pathStepsAll.length}</span>}
                    </div>
                    {/* Timeline scrubber */}
                    {pathStepsAll.length > 1 && (
                      <input type="range" className="mvp-timeline-scrubber"
                        min={0} max={pathStepsAll.length - 1}
                        value={activeStep ?? 0}
                        onChange={e => { setActiveStep(Number(e.target.value)); setPlaying(false); }}
                      />
                    )}
                    <div className="mvp-playback-opts">
                      <select
                        className="mvp-speed-sel"
                        value={playSpeed}
                        onChange={e => setPlaySpeed(Number(e.target.value))}
                        title="Playback speed"
                      >
                        <option value={0.5}>0.5Г—</option>
                        <option value={1}>1Г—</option>
                        <option value={2}>2Г—</option>
                        <option value={3}>3Г—</option>
                      </select>
                      <button className="mvp-export-btn" onClick={exportPath} title="Export path as CSV">
                        <Download size={11} /> CSV
                      </button>
                    </div>
                  </>
                )}

                {/* Multi-map indicator */}
                {(() => {
                  const otherCount = new Set(
                    (pathData?.path || []).filter(s => s.map_id !== selectedMap?.id).map(s => s.map_id)
                  ).size;
                  return otherCount > 0 ? (
                    <div className="mvp-other-maps-note">
                      <Navigation size={9} /> Path continues on {otherCount} other floor{otherCount > 1 ? 's' : ''} вЂ” switch map to view
                    </div>
                  ) : null;
                })()}

                {/* Step list */}
                {pathStepsAll.length > 0 ? (
                  <div className="mvp-step-list">
                    {pathStepsAll.map((s, i) => (
                      <button key={i}
                        className={`mvp-step-row${activeStep === i ? ' active' : ''}${activeStep != null && i > activeStep ? ' future' : ''}`}
                        onClick={() => { setActiveStep(i); setPlaying(false); }}>
                        <span className="mvp-step-num">{i + 1}</span>
                        <div className="mvp-step-info">
                          <span>{s.camera}</span>
                          <small>{fmtTime(s.time)}</small>
                        </div>
                        {i < pathStepsAll.length - 1 && <Activity size={9} className="mvp-step-arrow" />}
                      </button>
                    ))}
                    {prediction?.predicted_next && (
                      <div className="mvp-step-row" style={{ opacity: .45, cursor: 'default' }}>
                        <span className="mvp-step-num" style={{ background: '#6366f1' }}>?</span>
                        <div className="mvp-step-info">
                          <span>{prediction.predicted_next}</span>
                          <small>predicted</small>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  !pathLoading && pathData && (
                    <div className="mvp-track-empty">
                      <p>Not found on this map</p>
                      <small>
                        {pathData._debug?.events_in_range === 0
                          ? <>No events in last {pathHours < 24 ? `${pathHours}h` : `${pathHours/24}d`}.
                              {pathHours < 168 && <button style={{ background:'none', border:'none', color:'var(--accent)', cursor:'pointer', fontSize:10, padding:'0 3px', fontWeight:700 }} onClick={() => setPathHours(168)}>Try 7 days в†—</button>}
                            </>
                          : `${pathData._debug?.events_in_range || 0} events found but cameras not placed on map. Use Edit mode to place cameras.`
                        }
                      </small>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        )}

        {/* в”Ђв”Ђ MULTI-TRACK panel (Track mode) в”Ђв”Ђ */}
        {mode === 'track' && (trackedPersons.length > 0 || pathPerson) && (
          <div className="mvp-section" style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            <div className="mvp-section-hd"><Activity size={12} /> Compare Paths</div>
            {pathPerson && (
              <div className="mvp-mt-row">
                <span className="mvp-mt-dot" style={{ background: '#6366f1' }} />
                <span className="mvp-mt-name">{pathPerson.full_name || `#${pathPerson.id}`}</span>
                <span className="mvp-mt-label">primary</span>
              </div>
            )}
            {trackedPersons.map(t => (
              <div key={t.person.id} className="mvp-mt-row">
                <span className="mvp-mt-dot" style={{ background: t.color }} />
                <span className="mvp-mt-name">{t.person.full_name || `#${t.person.id}`}</span>
                <button className="mvp-del-btn" onClick={() => removeMultiTrack(t.person.id)}><X size={9} /></button>
              </div>
            ))}
            {pathPerson && trackedPersons.length < 4 && (
              <button className="mvp-mt-add-btn" onClick={() => {
                if (!pathPerson) return;
                addToMultiTrack(pathPerson);
              }} title="Add another person to compare">
                <Plus size={10} /> Add person to compare
              </button>
            )}
          </div>
        )}
      </aside>

      {/* в”Ђв”Ђ MAP CANVAS в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ */}
      <div className="mvp-canvas-wrap">

        {/* Toolbar */}
        <MapToolbar
          activeStep={activeStep}
          editFuture={editFuture}
          editHistory={editHistory}
          exportMapAsPng={exportMapAsPng}
          heatHours={heatHours}
          heatRefreshing={heatRefreshing}
          isFullscreen={isFullscreen}
          loadHeatData={loadHeatData}
          mode={mode}
          pathPerson={pathPerson}
          pathStepsAll={pathStepsAll}
          redoEdit={redoEdit}
          resetView={resetView}
          selectedMap={selectedMap}
          setHeatHours={setHeatHours}
          setShowDoors={setShowDoors}
          setShowFov={setShowFov}
          setShowHeatmap={setShowHeatmap}
          setShowMinimap={setShowMinimap}
          setTimelapse={setTimelapse}
          setTlHour={setTlHour}
          setTlPlaying={setTlPlaying}
          showDoors={showDoors}
          showFov={showFov}
          showHeatmap={showHeatmap}
          showMinimap={showMinimap}
          timelapse={timelapse}
          tlData={tlData}
          tlHour={tlHour}
          tlPlaying={tlPlaying}
          toggleFullscreen={toggleFullscreen}
          tr={tr}
          undoEdit={undoEdit}
          zoomIn={zoomIn}
          zoomOut={zoomOut}
        />

        {/* Map + SVG */}
        {selectedMap ? (
          <div
            ref={containerRef}
            className="mvp-canvas"
            style={{ cursor: placingCam ? 'crosshair' : dragging ? 'grabbing' : panRef.current ? 'grabbing' : 'default' }}
            onClick={handleMapClick}
            onWheel={handleWheel}
            onMouseDown={handleCanvasMouseDown}
          >
            {/* Clipped map layer вЂ” only the map+svg gets clipped */}
            <div className="mvp-canvas-clip">
            <div
              className="mvp-inner"
              style={{ transform: `translate(${tr.x}px,${tr.y}px) scale(${tr.scale})`, transformOrigin: '0 0' }}
            >
              <img
                ref={imgRef}
                src={mapImgSrc}
                alt={selectedMap.name}
                className="mvp-img"
                onLoad={updateImgSize}
                draggable={false}
              />

              {imgSize.w > 0 && (
                <svg className="mvp-svg" width={imgSize.w} height={imgSize.h} viewBox={`0 0 ${imgSize.w} ${imgSize.h}`}>

                  {/* Heatmap / timelapse */}
                  {(showHeatmap || timelapse) && <HeatmapLayer cameras={enrichedCameras} heatData={activeHeatData} />}

                  {/* FOV cones */}
                  {showFov && enrichedCameras.map(cam => (
                    <FovCone key={`fov-${cam.id}`} cam={cam}
                      angle={(fovData[cam.id]?.angle) ?? 70}
                      rotation={(fovData[cam.id]?.rotation) ?? 0}
                      editMode={mode === 'edit'}
                      onRotate={rotateFov}
                    />
                  ))}

                  {/* Door markers */}
                  {showDoors && mapDoors
                    .filter(d => d.map_id === selectedMap?.id && d.map_x != null)
                    .map(door => (
                      <DoorMarker key={door.id} door={door} imgSize={imgSize} tr={tr}
                        editMode={mode === 'edit'}
                        onDragStart={(e, d) => setDraggingDoor({ door: d, currentX: d.map_x * imgSize.w, currentY: d.map_y * imgSize.h })}
                        isHovered={hoveredDoor === door.id}
                        onHover={setHoveredDoor}
                      />
                    ))
                  }

                  {/* Collision detection (Edit mode) */}
                  {mode === 'edit' && enrichedCameras.map((cam, i) => {
                    const clash = enrichedCameras.some((c, j) => j !== i && Math.hypot(c._px - cam._px, c._py - cam._py) < 36);
                    return clash ? (
                      <circle key={`col-${cam.id}`} cx={cam._px} cy={cam._py} r={22}
                        fill="none" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 2" opacity={.75} />
                    ) : null;
                  })}

                  {/* Multi-track path lines */}
                  {trackedPersons.map(t => {
                    const steps = (t.pathData?.path || [])
                      .filter(s => s.map_id === selectedMap?.id)
                      .map(s => {
                        const cam = enrichedCameras.find(c => c.id === s.camera_id || c.name === s.camera);
                        return { ...s, _px: cam?._px ?? s.x * imgSize.w, _py: cam?._py ?? s.y * imgSize.h };
                      });
                    if (steps.length < 2) return null;
                    return (
                      <g key={t.person.id}>
                        <defs>
                          <marker id={`mt-arrow-${t.person.id}`} markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">
                            <path d="M0,0 L0,7 L7,3.5 z" fill={t.color} />
                          </marker>
                        </defs>
                        {steps.slice(0, -1).map((s, i) => (
                          <line key={i} x1={s._px} y1={s._py} x2={steps[i+1]._px} y2={steps[i+1]._py}
                            stroke={t.color} strokeWidth={2} strokeDasharray="7 4" opacity={.7}
                            markerEnd={`url(#mt-arrow-${t.person.id})`} />
                        ))}
                      </g>
                    );
                  })}

                  {/* Primary path lines */}
                  <PathLines steps={visibleSteps} />

                  {/* Animated playback dot */}
                  {mode === 'track' && playing && activeStep != null && activeStep > 0 && visibleSteps[activeStep - 1] && visibleSteps[activeStep] && (
                    <circle r={6} fill="#fff" stroke="#f59e0b" strokeWidth={2.5} opacity={.95}>
                      <animateMotion dur={`${(speedMs[playSpeed] ?? 900) / 1000}s`} fill="freeze"
                        path={`M${visibleSteps[activeStep-1]._px},${visibleSteps[activeStep-1]._py} L${visibleSteps[activeStep]._px},${visibleSteps[activeStep]._py}`}
                      />
                    </circle>
                  )}

                  {/* Cluster markers (low zoom) */}
                  {clusters && clusters.filter(cl => cl.count > 1).map((cl, i) => (
                    <g key={`cl-${i}`} transform={`translate(${cl.x},${cl.y})`}
                       style={{ cursor: 'pointer', pointerEvents: 'all' }}
                       onClick={() => { setTr(t => ({ x: -cl.x * t.scale + containerSize.w/2, y: -cl.y * t.scale + containerSize.h/2, scale: Math.min(1.2, t.scale * 2.5) })); }}>
                      <circle r={18} fill="#1e293b" stroke="#6366f1" strokeWidth={2} />
                      <text textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={11} fontWeight="800">{cl.count}</text>
                    </g>
                  ))}

                  {/* Camera markers */}
                  {(clusters ? clusters.filter(cl => cl.count === 1).map(cl => cl.cameras[0]) : enrichedCameras).map(cam => {
                    const visIdx = visibleSteps.findIndex(s => s.camera === cam.name || s.camera_id === cam.id);
                    const inVisible = visIdx >= 0;
                    const isLast = !!(lastStep && (lastStep.camera === cam.name || lastStep.camera_id === cam.id));
                    return (
                      <CameraMarker
                        key={cam.id}
                        cam={cam}
                        isPath={inVisible}
                        stepIndex={inVisible ? visIdx : null}
                        isLast={isLast}
                        onDragStart={handleDragStart}
                        editMode={mode === 'edit'}
                        viewMode={mode === 'view'}
                        isHovered={hoveredCam === cam.id}
                        onHover={setHoveredCam}
                        online={cameraHealth[cam.id]?.online}
                        eventCount={heatData?.[cam.name] ?? 0}
                        highlight={highlightCam === cam.name}
                        onCamClick={(c) => {
                          setCamInfoPopup(prev => prev?.cam?.id === c.id ? null : {
                            cam: c, px: c._px, py: c._py,
                          });
                        }}
                      />
                    );
                  })}
                </svg>
              )}
            </div>
            </div>{/* /mvp-canvas-clip */}

            {/* Edit mode remove buttons */}
            {mode === 'edit' && enrichedCameras.map(cam => (
              <button
                key={`rm-${cam.id}`}
                className="mvp-cam-rm"
                style={{ left: cam._px * tr.scale + tr.x + 11, top: cam._py * tr.scale + tr.y - 25 }}
                onClick={e => { e.stopPropagation(); removeCamera(cam); }}
                title={`Remove ${cam.name}`}
              >
                <X size={8} />
              </button>
            ))}

            {/* Active step popup (play / click step) */}
            {mode === 'track' && activeStep != null && visibleSteps[activeStep] && (() => {
              const step = visibleSteps[activeStep];
              const cam  = enrichedCameras.find(c => c.name === step.camera || c.id === step.camera_id);
              if (!cam) return null;
              const imgSrc = step.crop_image || step.image
                ? mediaUrl(API, step.crop_image || step.image)
                : null;
              const personName = pathPerson?.full_name || `Unknown #${pathPerson?.id}`;
              return (
                <div
                  className="mvp-live-popup"
                  style={{ left: (cam._px + 18) * tr.scale + tr.x, top: cam._py * tr.scale + tr.y }}
                >
                  {imgSrc
                    ? <img src={imgSrc} className="mvp-live-thumb" alt="" onError={e => { e.target.style.display='none'; }} />
                    : <div className="mvp-live-thumb mvp-live-thumb-ph"><User size={14} /></div>
                  }
                  <div className="mvp-live-info">
                    <span className="mvp-live-name">{personName}</span>
                    <small className="mvp-live-cam">{step.camera}</small>
                    <small className="mvp-live-cam">{fmtTime(step.time)}</small>
                    {step.confidence && <small className="mvp-live-cam">{Math.round(step.confidence * 100)}%</small>}
                  </div>
                </div>
              );
            })()}

            {/* Camera info popup (View mode click) */}
            {mode === 'view' && camInfoPopup && (() => {
              const { cam, px, py } = camInfoPopup;
              const todayCount = heatData?.[cam.name] ?? null;
              return (
                <div
                  className="mvp-cam-info-popup"
                  style={{ left: (px + 20) * tr.scale + tr.x, top: (py - 10) * tr.scale + tr.y }}
                >
                  <button className="mvp-cam-info-close" onClick={() => setCamInfoPopup(null)}><X size={9} /></button>
                  <CamLiveThumb authFetch={authFetch} API={API} cameraId={cam.id} />
                  <div className="mvp-cam-info-meta">
                    <strong>{cam.name}</strong>
                    <span className="mvp-cam-info-dir" style={{ color: dirColor(cam.direction) }}>
                      {dirLabel(cam.direction)}
                    </span>
                    {cam.location && <small>{cam.location}</small>}
                    {todayCount != null && (
                      <span className="mvp-cam-info-count"><Activity size={9} /> {todayCount} events</span>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Live event popups вЂ” fade-out handled by CSS animation after 6.5s */}
            {mode === 'view' && Object.entries(livePopups).map(([uid, p]) => (
              <div
                key={uid}
                className="mvp-live-popup"
                style={{
                  left: (p.px + 18) * tr.scale + tr.x,
                  top:  p.py * tr.scale + tr.y,
                }}
              >
                  {p.image
                    ? <img src={p.image} className="mvp-live-thumb" alt="" onError={e => { e.target.style.display='none'; }} />
                    : <div className="mvp-live-thumb mvp-live-thumb-ph"><User size={14} /></div>
                  }
                  <div className="mvp-live-info">
                    <span className="mvp-live-name">{p.personName}</span>
                    <span className={`mvp-live-type mvp-ptype-${p.personType}`}>{p.personType}</span>
                    <span className="mvp-live-cam">{p.camName}</span>
                  </div>
                </div>
            ))}
          </div>
        ) : (
          <div className="mvp-no-map"><MapPin size={32} /><p>Select a floor plan</p></div>
        )}

        {/* All Events Modal */}
        {showAllEvents && (
          <div className="mvp-events-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowAllEvents(false); }}>
            <div className="mvp-events-modal">
              <div className="mvp-events-modal-hd">
                <h3><Camera size={16} /> Recent Face Events</h3>
                <button onClick={() => setShowAllEvents(false)}><X size={16} /></button>
              </div>
              {eventsLoading && faceEvents.length === 0
                ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
                : (
                  <div className="mvp-events-modal-grid">
                    {faceEvents.map(ev => {
                      const imgSrc = ev.crop_image || ev.image || ev.crop_image_path || ev.image_path;
                      const hasId  = ev.person_id || ev.person?.id;
                      const name   = ev.person_name || ev.person?.full_name || (hasId ? `#${hasId}` : 'Unknown');
                      return (
                        <div
                          key={ev.id}
                          className={`mvp-ev-modal-card${!hasId ? ' no-person' : ''}`}
                          onClick={() => {
                            if (!hasId) return;
                            const p = ev.person || { id: ev.person_id, full_name: null, person_type: ev.person_type || 'unknown', preview_image: null };
                            setPathPerson(p);
                            setShowAllEvents(false);
                          }}
                        >
                          {imgSrc
                            ? <img src={mediaUrl(API, imgSrc)} className="mvp-ev-modal-img" alt="" onError={e => { e.target.style.display='none'; }} />
                            : <div className="mvp-ev-modal-img-ph"><User size={20} /></div>
                          }
                          <span className="mvp-ev-modal-name">{name}</span>
                          <span className="mvp-ev-modal-cam">{ev.camera_name}</span>
                          <span className="mvp-ev-modal-time">
                            {new Date(ev.created_at).toLocaleTimeString('en-US', { timeZone:'Asia/Yerevan', hour:'2-digit', minute:'2-digit', hour12:false })}
                          </span>
                          <span className={`mvp-ev-modal-type mvp-ptype-${ev.person_type || 'unknown'}`}>{ev.person_type || 'unknown'}</span>
                        </div>
                      );
                    })}
                  </div>
                )
              }
            </div>
          </div>
        )}

        {/* Mini-map */}
        {showMinimap && selectedMap && imgSize.w > 0 && (
          <div className="mvp-minimap"
            onClick={e => {
              const rect = e.currentTarget.getBoundingClientRect();
              const rx = (e.clientX - rect.left) / rect.width;
              const ry = (e.clientY - rect.top)  / rect.height;
              setTr(t => ({
                ...t,
                x: -(rx * imgSize.w - containerSize.w / (2 * t.scale)) * t.scale,
                y: -(ry * imgSize.h - containerSize.h / (2 * t.scale)) * t.scale,
              }));
            }}
          >
            <img src={mapImgSrc} alt="" className="mvp-minimap-img" draggable={false} />
            {/* Viewport rectangle */}
            <div className="mvp-minimap-viewport" style={{
              left:   `${Math.max(0, (-tr.x / (imgSize.w * tr.scale)) * 100).toFixed(1)}%`,
              top:    `${Math.max(0, (-tr.y / (imgSize.h * tr.scale)) * 100).toFixed(1)}%`,
              width:  `${Math.min(100, (containerSize.w / (imgSize.w * tr.scale)) * 100).toFixed(1)}%`,
              height: `${Math.min(100, (containerSize.h / (imgSize.h * tr.scale)) * 100).toFixed(1)}%`,
            }} />
          </div>
        )}

        {/* Placing hint */}
        {placingCam && (
          <div className="mvp-place-hint">
            Click on the map to place <strong>{placingCam.name}</strong>
            <button onClick={() => setPlacingCam(null)}><X size={11} /> Cancel</button>
          </div>
        )}

        {/* Path legend */}
        {mode === 'track' && pathStepsAll.length > 0 && (
          <div className="mvp-path-legend">
            <span>
              <svg width="22" height="8">
                <line x1="0" y1="4" x2="22" y2="4" stroke="#f59e0b" strokeWidth="2" strokeDasharray="7 4" />
              </svg>
              Path
            </span>
            <span><svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="#10b981" /></svg> Last seen</span>
            <span><svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="#f59e0b" /></svg> Visited</span>
            <span><svg width="12" height="12"><circle cx="6" cy="6" r="5" fill="#94a3b8" /></svg> Not visited</span>
          </div>
        )}
      </div>

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <div className="mvp-confirm-overlay" onClick={e => { if (e.target === e.currentTarget) setDeleteConfirm(null); }}>
          <div className="mvp-confirm-modal">
            <div className="mvp-confirm-icon"><AlertTriangle size={28} /></div>
            <h3>Delete Area?</h3>
            <p>This will remove the floor plan and unlink all cameras placed on it. This cannot be undone.</p>
            <div className="mvp-confirm-btns">
              <button className="mvp-confirm-cancel" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="mvp-confirm-delete" onClick={() => confirmDeleteMap(deleteConfirm)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
