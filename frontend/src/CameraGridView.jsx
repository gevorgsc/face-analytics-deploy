import { apiFetch } from './apiClient';
/**
 * CameraGridView.jsx — iVMS-style drag-and-drop live view
 * Left panel: camera list  |  Right: grid slots
 * Drag camera → drop into slot  OR  click camera → fills first empty slot
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  X, Maximize2, Minimize2, Grid, Video, VideoOff,
  Wifi, WifiOff, RefreshCw, Layers, ArrowDown, ArrowUp, Square
} from 'lucide-react';
import { API } from './apiConfig';

// Read default stream type from channel encoding (101=main, 102=sub, 103=third)
function camStreamType(camera) {
  const ch = Number(camera?.channel) || 101;
  if (ch >= 100) { const d = ch % 100; if (d === 2) return 1; if (d === 3) return 2; }
  return 0;
}

const LAYOUTS = [
  { label: '1×1', cols: 1, slots: 1  },
  { label: '2×2', cols: 2, slots: 4  },
  { label: '3×3', cols: 3, slots: 9  },
  { label: '4×4', cols: 4, slots: 16 },
];

function absoluteApiUrl(path) {
  return path?.startsWith('http') ? path : `${API}${path || ''}`;
}

async function signedStreamUrl(cameraId, token, streamType, signal) {
  const params = new URLSearchParams();
  if (streamType !== undefined && streamType !== null) params.set('stream_type', streamType);
  const res = await apiFetch(`${API}/api/cameras/${cameraId}/stream-url?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return absoluteApiUrl(data.url);
}

// ── WebRTC stream cell ─────────────────────────────────────────────────────────
// Low-latency (~100ms) P2P stream via aiortc signaling

function WebRTCStream({ camera, token, streamType }) {
  const videoRef = useRef(null);
  const pcRef    = useRef(null);
  const [status, setStatus] = useState('loading');
  const [errMsg, setErrMsg] = useState('');

  const connect = useCallback(async () => {
    setStatus('loading');
    setErrMsg('');
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        // Minimize jitter buffer for lowest latency on LAN
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
      });
      pcRef.current = pc;

      pc.ontrack = e => {
        if (videoRef.current && e.streams[0]) {
          videoRef.current.srcObject = e.streams[0];
          setStatus('ok');
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (['failed', 'disconnected', 'closed'].includes(pc.iceConnectionState)) {
          setStatus('error');
          setErrMsg('Connection lost');
        }
      };

      // Add transceiver to receive video
      pc.addTransceiver('video', { direction: 'recvonly' });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const res = await apiFetch(
        `${API}/api/webrtc/${camera.id}/offer?stream_type=${streamType}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sdp: offer.sdp, type: offer.type }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }

      const answer = await res.json();
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (e) {
      setStatus('error');
      setErrMsg(e.message || 'WebRTC failed');
    }
  }, [camera.id, token, streamType]);

  useEffect(() => {
    connect();
    return () => {
      pcRef.current?.close();
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [connect]);

  return (
    <>
      {status === 'loading' && (
        <div className="lv-connecting">
          <Wifi size={20} className="cg-spin" />
          <span>WebRTC connecting…</span>
        </div>
      )}
      {status === 'error' && (
        <div className="lv-connecting lv-err">
          <WifiOff size={20} />
          <span>{errMsg || 'WebRTC failed'}</span>
          <button onClick={connect}><RefreshCw size={11} /> Retry</button>
        </div>
      )}
      <video
        ref={videoRef}
        autoPlay playsInline muted
        className="lv-stream-img"
        style={{ display: status === 'ok' ? 'block' : 'none' }}
      />
    </>
  );
}

// ── MJPEG stream cell ──────────────────────────────────────────────────────────

function MjpegStream({ camera, token, streamType }) {
  const [status, setStatus] = useState('loading');
  const [src, setSrc]       = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setSrc('');
    signedStreamUrl(camera.id, token, streamType, controller.signal)
      .then(url => setSrc(url))
      .catch(e => {
        if (e.name !== 'AbortError') setStatus('error');
      });
    return () => controller.abort();
  }, [camera.id, token, streamType, reloadKey]);

  return (
    <>
      {status === 'loading' && (
        <div className="lv-connecting">
          <Wifi size={20} className="cg-spin" />
          <span>Connecting…</span>
        </div>
      )}
      {status === 'error' && (
        <div className="lv-connecting lv-err">
          <WifiOff size={20} />
          <span>Stream unavailable</span>
          <button onClick={() => { setStatus('loading'); setReloadKey(k => k + 1); }}>
            <RefreshCw size={11} /> Retry
          </button>
        </div>
      )}
      {src && (
        <img
          src={src}
          alt={camera.name}
          className="lv-stream-img"
          style={{ display: status === 'ok' ? 'block' : 'none' }}
          onLoad={() => setStatus('ok')}
          onError={() => setStatus('error')}
        />
      )}
    </>
  );
}

// ── Snapshot polling cell (ONVIF fallback) ─────────────────────────────────────

function SnapshotStream({ camera, token }) {
  const [status, setStatus] = useState('loading');
  const [imgSrc, setImgSrc] = useState(null);
  const activeRef = useRef(true);
  const timerRef  = useRef(null);
  const objRef    = useRef(null);

  const fetch_ = useCallback(async () => {
    if (!activeRef.current) return;
    try {
      const res = await apiFetch(`${API}/api/cameras/${camera.id}/snapshot`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(6000),
      });
      if (!activeRef.current) return;
      if (res.ok) {
        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        if (objRef.current) URL.revokeObjectURL(objRef.current);
        objRef.current = url;
        setImgSrc(url);
        setStatus('ok');
      } else {
        setStatus('error');
      }
    } catch { if (activeRef.current) setStatus('error'); }
    if (activeRef.current) timerRef.current = setTimeout(fetch_, 1500);
  }, [camera.id, token]);

  useEffect(() => {
    activeRef.current = true;
    fetch_();
    return () => {
      activeRef.current = false;
      clearTimeout(timerRef.current);
      if (objRef.current) URL.revokeObjectURL(objRef.current);
    };
  }, [fetch_]);

  return (
    <>
      {status === 'loading' && <div className="lv-connecting"><Wifi size={20} className="cg-spin" /><span>Connecting…</span></div>}
      {status === 'error'   && <div className="lv-connecting lv-err"><WifiOff size={20} /><span>Unavailable</span></div>}
      {imgSrc && <img src={imgSrc} alt={camera.name} className="lv-stream-img" style={{ display: status === 'ok' ? 'block' : 'none' }} />}
    </>
  );
}

// ── Single slot ────────────────────────────────────────────────────────────────

function LiveSlot({ slotIdx, camera, token, onDrop, onClear, onFullscreen, isDragOver, onDragOver, onDragLeave }) {
  const isEmpty = !camera;
  // Per-slot stream type: starts from camera default, user can override
  const [streamType, setStreamType] = useState(() => camStreamType(camera));

  // Reset when camera changes
  useEffect(() => { setStreamType(camStreamType(camera)); }, [camera?.id]);

  return (
    <div
      className={`lv-slot${isEmpty ? ' lv-slot-empty' : ''}${isDragOver ? ' lv-slot-dragover' : ''}`}
      onDragOver={e => { e.preventDefault(); onDragOver(slotIdx); }}
      onDragLeave={onDragLeave}
      onDrop={e => { e.preventDefault(); onDrop(slotIdx); }}
    >
      {isEmpty ? (
        <div className="lv-slot-placeholder">
          <Grid size={22} />
          <span>Drop camera here</span>
        </div>
      ) : (
        <>
          {(camera.snapshot_mode || 'hiksdk') === 'hiksdk'
            ? <MjpegStream camera={camera} token={token} streamType={streamType} />
            : <SnapshotStream camera={camera} token={token} />
          }

          {/* Overlay controls */}
          <div className="lv-slot-overlay">
            <div className="lv-slot-name">
              {camera.direction === 'in'  && <ArrowDown size={10} />}
              {camera.direction === 'out' && <ArrowUp   size={10} />}
              {camera.name}
            </div>
            <div className="lv-slot-btns">
              {/* Per-slot Main/Sub toggle (only for HikSDK) */}
              {(camera.snapshot_mode || 'hiksdk') === 'hiksdk' && (
                <button
                  className={`lv-slot-btn lv-slot-stream${streamType === 1 ? ' sub' : ''}`}
                  onClick={e => { e.stopPropagation(); setStreamType(t => t === 0 ? 1 : 0); }}
                  title={streamType === 0 ? 'Main stream — click to switch to Sub' : 'Sub stream — click to switch to Main'}
                >
                  <Layers size={11} />
                  <span>{streamType === 0 ? 'M' : 'S'}</span>
                </button>
              )}
              <button className="lv-slot-btn" onClick={() => onFullscreen(camera, streamType)} title="Fullscreen"><Maximize2 size={13} /></button>
              <button className="lv-slot-btn lv-slot-close" onClick={() => onClear(slotIdx)} title="Remove"><X size={13} /></button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Fullscreen overlay ─────────────────────────────────────────────────────────

function FullscreenOverlay({ camera, token, streamType, onClose }) {
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div className="lv-fs-overlay" onClick={onClose}>
      <div className="lv-fs-inner" onClick={e => e.stopPropagation()}>
        <button className="lv-fs-close" onClick={onClose}><X size={18} /></button>
        <div className="lv-fs-title">{camera.name}</div>
        {(camera.snapshot_mode || 'hiksdk') === 'hiksdk'
          ? <MjpegStream    camera={camera} token={token} streamType={streamType} />
          : <SnapshotStream camera={camera} token={token} />
        }
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function CameraGridView({ cameras, token }) {
  const activeCams = (cameras || []).filter(c => c.is_active && c.live_enabled);

  const [layoutIdx,   setLayoutIdx]   = useState(1);
  const [slots,       setSlots]       = useState(Array(4).fill(null));
  const [dragCamera,  setDragCamera]  = useState(null);
  const [dragOver,    setDragOver]    = useState(null);
  const [fullscreen,  setFullscreen]  = useState(null);

  const layout = LAYOUTS[layoutIdx];

  // Resize slot array when layout changes
  useEffect(() => {
    setSlots(prev => {
      const next = Array(layout.slots).fill(null);
      prev.slice(0, layout.slots).forEach((cam, i) => { next[i] = cam; });
      return next;
    });
  }, [layout.slots]);

  // Drag from camera list
  const handleDragStart = useCallback((cam) => setDragCamera(cam), []);
  const handleDragEnd   = useCallback(()      => { setDragCamera(null); setDragOver(null); }, []);

  // Drop into slot
  const handleDrop = useCallback((slotIdx) => {
    if (!dragCamera) return;
    setSlots(prev => {
      const next = [...prev];
      // Remove camera if already assigned elsewhere
      const existingIdx = next.findIndex(c => c?.id === dragCamera.id);
      if (existingIdx !== -1) next[existingIdx] = null;
      next[slotIdx] = dragCamera;
      return next;
    });
    setDragCamera(null);
    setDragOver(null);
  }, [dragCamera]);

  // Click camera in list → first empty slot
  const handleCameraClick = useCallback((cam) => {
    setSlots(prev => {
      // Already in a slot → remove it
      const existingIdx = prev.findIndex(c => c?.id === cam.id);
      if (existingIdx !== -1) {
        const next = [...prev];
        next[existingIdx] = null;
        return next;
      }
      // Add to first empty slot
      const emptyIdx = prev.findIndex(c => c === null);
      if (emptyIdx === -1) return prev;
      const next = [...prev];
      next[emptyIdx] = cam;
      return next;
    });
  }, []);

  const handleClear = useCallback((slotIdx) => {
    setSlots(prev => { const next = [...prev]; next[slotIdx] = null; return next; });
  }, []);

  const assignedIds = new Set(slots.filter(Boolean).map(c => c.id));

  return (
    <div className="lv-root">

      {/* Left camera list panel */}
      <div className="lv-panel">
        <div className="lv-panel-head">
          <Grid size={14} />
          <span>Cameras</span>
          <span className="lv-panel-count">{activeCams.length}</span>
        </div>

        <div className="lv-camera-list">
          {activeCams.length === 0 && (
            <div className="lv-panel-empty">No active cameras</div>
          )}
          {activeCams.map(cam => {
            const assigned = assignedIds.has(cam.id);
            return (
              <div
                key={cam.id}
                className={`lv-cam-item${assigned ? ' lv-cam-assigned' : ''}`}
                draggable
                onDragStart={() => handleDragStart(cam)}
                onDragEnd={handleDragEnd}
                onClick={() => handleCameraClick(cam)}
                title={assigned ? 'Click to remove from grid' : 'Click or drag to add to grid'}
              >
                <span className={`lv-cam-dot ${cam.is_active ? 'on' : 'off'}`} />
                <div className="lv-cam-info">
                  <span className="lv-cam-name">{cam.name}</span>
                  {cam.location && <span className="lv-cam-loc">{cam.location}</span>}
                </div>
                {cam.direction === 'in'  && <ArrowDown  size={10} className="lv-cam-dir" />}
                {cam.direction === 'out' && <ArrowUp    size={10} className="lv-cam-dir" />}
                {assigned && <span className="lv-cam-check">✓</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right side: toolbar + grid */}
      <div className="lv-main">
        <div className="lv-toolbar">
          {/* Layout selector */}
          <div className="lv-layout-btns">
            {LAYOUTS.map((l, i) => (
              <button
                key={l.label}
                className={`lv-tb-btn${layoutIdx === i ? ' active' : ''}`}
                onClick={() => setLayoutIdx(i)}
                title={l.label}
              >
                {l.label}
              </button>
            ))}
          </div>

          <div className="lv-tb-sep" />

          <div className="lv-tb-sep" />

          <button
            className="lv-tb-btn"
            onClick={() => setSlots(Array(layout.slots).fill(null))}
            title="Clear all slots"
          >
            <X size={12} /> Clear all
          </button>
        </div>

        {/* Grid */}
        <div
          className="lv-grid"
          style={{ gridTemplateColumns: `repeat(${layout.cols}, 1fr)` }}
        >
          {slots.map((cam, idx) => (
            <LiveSlot
              key={idx}
              slotIdx={idx}
              camera={cam}
              token={token}
              onDrop={handleDrop}
              onClear={handleClear}
              onFullscreen={(camera, streamType) => setFullscreen({ camera, streamType })}
              isDragOver={dragOver === idx}
              onDragOver={setDragOver}
              onDragLeave={() => setDragOver(null)}
            />
          ))}
        </div>
      </div>

      {fullscreen && (
        <FullscreenOverlay
          camera={fullscreen.camera}
          token={token}
          streamType={fullscreen.streamType}
          onClose={() => setFullscreen(null)}
        />
      )}
    </div>
  );
}
