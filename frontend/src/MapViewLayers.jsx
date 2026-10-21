import React, { useEffect, useRef, useState } from 'react';
import { Camera } from 'lucide-react';
import { mediaUrl } from './mediaUrl';

// в”Ђв”Ђ Helpers в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

function fmtTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-US', {
    timeZone: 'Asia/Yerevan', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

function dirColor(dir) {
  if (dir === 'in')  return '#10b981';
  if (dir === 'out') return '#ef4444';
  return '#3b82f6';
}
function dirLabel(dir) {
  if (dir === 'in')  return 'Entrance';
  if (dir === 'out') return 'Exit';
  return 'Both';
}
function dirShortLabel(dir) {
  if (dir === 'in')  return 'IN';
  if (dir === 'out') return 'OUT';
  return 'IN/OUT';
}

function mapImageUrl(API, path) {
  if (!path) return '';
  const normalized = path.startsWith('/media/') ? path : `/media/${path.replace(/^\/+/, '')}`;
  return mediaUrl(API, normalized);
}

// в”Ђв”Ђ Camera SVG Marker в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

function CameraMarker({ cam, isPath, stepIndex, isLast, onDragStart, editMode, isHovered, onHover, onCamClick, viewMode, online, eventCount, highlight }) {
  const color = isLast ? '#10b981' : isPath ? '#f59e0b' : dirColor(cam.direction);
  const r = isLast ? 17 : isPath ? 15 : 13;
  const MAX_LABEL = 18;
  const labelText = (cam.name || '').length > MAX_LABEL ? (cam.name || '').slice(0, MAX_LABEL - 1) + 'вЂ¦' : (cam.name || '');
  const nameLen = labelText.length;
  const statusColor = online === true ? '#10b981' : online === false ? '#ef4444' : '#6b7280';

  return (
    <g
      transform={`translate(${cam._px},${cam._py})`}
      style={{
        cursor: editMode ? 'grab' : viewMode ? 'pointer' : 'default',
        pointerEvents: (viewMode || editMode) ? 'all' : 'none',
      }}
      onMouseDown={editMode ? (e) => { e.stopPropagation(); onDragStart(e, cam); } : undefined}
      onClick={viewMode && onCamClick ? (e) => { e.stopPropagation(); onCamClick(cam); } : undefined}
      onMouseEnter={() => onHover(cam.id)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Highlight ring (quick-search) */}
      {highlight && (
        <circle r={r + 10} fill="none" stroke="#6366f1" strokeWidth={2} opacity={0}>
          <animate attributeName="r"       from={r + 4} to={r + 18} dur="1.2s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.7" to="0" dur="1.2s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Pulse ring */}
      {isLast && (
        <circle r={28} fill="none" stroke="#10b981" strokeWidth={1.5} opacity={0}>
          <animate attributeName="r"       from="16" to="30" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.5" to="0" dur="2s" repeatCount="indefinite" />
        </circle>
      )}

      {/* Drop shadow */}
      <circle r={r + 2} fill="rgba(0,0,0,.35)" cx={1} cy={2} />

      {/* Main circle */}
      <circle r={r} fill={color} stroke="#fff" strokeWidth={2} />

      {/* Step number or camera icon */}
      {isPath && stepIndex != null ? (
        <text textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize={10} fontWeight="800">
          {stepIndex + 1}
        </text>
      ) : (
        <g>
          <rect x={-6} y={-4} width={9} height={7} rx={1.5} fill="none" stroke="#fff" strokeWidth={1.4} />
          <circle cx={-1.5} cy={-0.5} r={2} fill="none" stroke="#fff" strokeWidth={1.2} />
          <polygon points="3,-4 8,-6 8,6 3,4" fill="rgba(255,255,255,.85)" />
        </g>
      )}

      {/* Name label (always show when in path or hovered) */}
      {(isHovered || isPath) && (
        <g>
          <rect x={-(nameLen * 3.4 + 7)} y={r + 5} width={nameLen * 6.8 + 14} height={15} rx={4} fill="rgba(0,0,0,.72)" />
          <text y={r + 15} textAnchor="middle" fill="#fff" fontSize={9.5} fontWeight={600}>{labelText}</text>
        </g>
      )}

      {/* Direction badge on hover */}
      {isHovered && !isPath && (
        <g>
          <rect x={-18} y={r + 22} width={36} height={13} rx={3} fill={dirColor(cam.direction)} opacity={.92} />
          <text y={r + 31} textAnchor="middle" fill="#fff" fontSize={8.5} fontWeight={600}>{dirLabel(cam.direction)}</text>
        </g>
      )}

      {/* Online/offline status dot */}
      {online != null && (
        <circle cx={r - 1} cy={-(r - 1)} r={4.5} fill={statusColor} stroke="#fff" strokeWidth={1.2} />
      )}

      {/* Event count badge */}
      {eventCount > 0 && !isPath && (
        <g>
          <rect x={r - 4} y={r - 4} width={Math.max(13, String(eventCount).length * 6 + 5)} height={10} rx={5} fill="#1e293b" opacity={.88} />
          <text x={r + Math.max(13, String(eventCount).length * 6 + 5) / 2 - 4} y={r + 4} textAnchor="middle" fill="#f8fafc" fontSize={7} fontWeight={700}>{eventCount > 99 ? '99+' : eventCount}</text>
        </g>
      )}
    </g>
  );
}

// в”Ђв”Ђ Animated Path Lines в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

function PathLines({ steps }) {
  if (steps.length < 2) return null;
  return (
    <g>
      <defs>
        <marker id="mvp-arrow" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">
          <path d="M0,0 L0,7 L7,3.5 z" fill="#f59e0b" />
        </marker>
      </defs>
      {steps.slice(0, -1).map((s, i) => (
        <line
          key={i}
          x1={s._px} y1={s._py} x2={steps[i + 1]._px} y2={steps[i + 1]._py}
          stroke="#f59e0b" strokeWidth={2.5} strokeDasharray="9 5" opacity={.85}
          markerEnd="url(#mvp-arrow)"
        />
      ))}
    </g>
  );
}

// в”Ђв”Ђ FOV Cone в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

function FovCone({ cam, angle = 70, rotation = 0, editMode, onRotate }) {
  const half = (angle / 2) * (Math.PI / 180);
  const rot  = rotation * (Math.PI / 180);
  const len  = 65;
  const x1 = Math.cos(rot - half) * len, y1 = Math.sin(rot - half) * len;
  const x2 = Math.cos(rot + half) * len, y2 = Math.sin(rot + half) * len;
  const d  = `M0,0 L${x1},${y1} A${len},${len} 0 0,1 ${x2},${y2} Z`;
  return (
    <g transform={`translate(${cam._px},${cam._py})`}
       style={{ pointerEvents: editMode ? 'all' : 'none' }}
       onWheel={editMode ? (e) => { e.stopPropagation(); onRotate(cam.id, e.deltaY > 0 ? 5 : -5); } : undefined}>
      <path d={d} fill="rgba(99,102,241,.1)" stroke="rgba(99,102,241,.35)" strokeWidth={1} />
    </g>
  );
}

// в”Ђв”Ђ Door Marker в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

function DoorMarker({ door, imgSize, tr, editMode, onDragStart, isHovered, onHover }) {
  if (door.map_x == null || door.map_y == null) return null;
  const px = door.map_x * imgSize.w;
  const py = door.map_y * imgSize.h;
  return (
    <g transform={`translate(${px},${py})`}
       style={{ cursor: editMode ? 'grab' : 'default', pointerEvents: editMode ? 'all' : 'none' }}
       onMouseDown={editMode ? (e) => { e.stopPropagation(); onDragStart(e, door); } : undefined}
       onMouseEnter={() => onHover(door.id)}
       onMouseLeave={() => onHover(null)}>
      <circle r={12} fill="#0f172a" stroke="#6366f1" strokeWidth={2} />
      <text textAnchor="middle" dominantBaseline="middle" fill="#6366f1" fontSize={12}>рџљЄ</text>
      {isHovered && (
        <g>
          <rect x={-((door.name.length * 3.5) + 7)} y={18} width={door.name.length * 7 + 14} height={15} rx={4} fill="rgba(0,0,0,.78)" />
          <text y={28} textAnchor="middle" fill="#fff" fontSize={9.5} fontWeight={600}>{door.name}</text>
        </g>
      )}
    </g>
  );
}

// в”Ђв”Ђ Camera Live Snapshot в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

function CamLiveThumb({ authFetch, API, cameraId }) {
  const [src,     setSrc]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);
  const urlRef    = useRef(null);
  const timerRef  = useRef(null);

  useEffect(() => {
    let active = true;
    const fetchSnap = async () => {
      try {
        const r = await authFetch(`${API}/api/cameras/${cameraId}/snapshot`);
        if (!active) return;
        if (!r.ok) { setError(true); setLoading(false); return; }
        const blob = await r.blob();
        if (!active) return;
        const url = URL.createObjectURL(blob);
        if (urlRef.current) URL.revokeObjectURL(urlRef.current);
        urlRef.current = url;
        setSrc(url);
        setError(false);
        setLoading(false);
      } catch {
        if (active) { setError(true); setLoading(false); }
      }
    };

    fetchSnap();
    timerRef.current = setInterval(fetchSnap, 4000);

    return () => {
      active = false;
      clearInterval(timerRef.current);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [cameraId, authFetch, API]);

  if (loading) return (
    <div className="mvp-cam-snap-ph">
      <span className="mvp-loader" style={{ width: 18, height: 18 }} />
    </div>
  );
  if (error) return (
    <div className="mvp-cam-snap-ph mvp-cam-snap-err">
      <Camera size={18} />
      <span>No feed</span>
    </div>
  );
  return <img src={src} className="mvp-cam-snap-img" alt="live" />;
}

// в”Ђв”Ђ Heatmap Layer в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ

function heatColor(ratio) {
  if (ratio < 0.4) return `rgba(59,130,246,${0.15 + ratio * 0.55})`;   // blue
  if (ratio < 0.72) return `rgba(245,158,11,${0.2 + ratio * 0.45})`;   // amber
  return `rgba(239,68,68,${0.28 + ratio * 0.42})`;                      // red
}

function HeatmapLayer({ cameras, heatData }) {
  if (!heatData) return null;
  const max = Math.max(...Object.values(heatData), 1);
  return (
    <g>
      {cameras.map(cam => {
        const count = heatData[cam.name] || 0;
        if (!count) return null;
        const ratio = count / max;
        return (
          <circle key={cam.id} cx={cam._px} cy={cam._py}
            r={22 + ratio * 55}
            fill={heatColor(ratio)}
          />
        );
      })}
    </g>
  );
}


export {
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
};
