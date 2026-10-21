import React from 'react';
import {
  DoorOpen,
  Download,
  Home,
  Layers,
  MapPin,
  Redo2,
  RefreshCw,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

export default function MapToolbar({
  activeStep,
  editFuture,
  editHistory,
  exportMapAsPng,
  heatHours,
  heatRefreshing,
  isFullscreen,
  loadHeatData,
  mode,
  pathPerson,
  pathStepsAll,
  redoEdit,
  resetView,
  selectedMap,
  setHeatHours,
  setShowDoors,
  setShowFov,
  setShowHeatmap,
  setShowMinimap,
  setTimelapse,
  setTlHour,
  setTlPlaying,
  showDoors,
  showFov,
  showHeatmap,
  showMinimap,
  timelapse,
  tlData,
  tlHour,
  tlPlaying,
  toggleFullscreen,
  tr,
  undoEdit,
  zoomIn,
  zoomOut,
}) {
  return (
    <div className="mvp-toolbar">
      <div className="mvp-tb-left">
        <MapPin size={13} />
        <span className="mvp-tb-name">{selectedMap?.name}</span>
        {mode === 'edit' && <span className="mvp-badge badge-edit">Edit Mode</span>}
        {mode === 'track' && pathPerson && (
          <span className="mvp-badge badge-track">
            Tracking: {pathPerson.full_name || `#${pathPerson.id}`}
            {activeStep != null && ` - Step ${activeStep + 1}/${pathStepsAll.length}`}
          </span>
        )}
      </div>

      <div className="mvp-tb-right">
        <button className={`mvp-tb-btn${showHeatmap ? ' active' : ''}`} onClick={() => { setShowHeatmap(v => !v); setTimelapse(false); }} title="Heatmap">
          <Layers size={13} /> Heat
        </button>
        {showHeatmap && (
          <>
            <select className="mvp-heat-sel" value={heatHours} onChange={e => setHeatHours(Number(e.target.value))}>
              <option value={1}>1h</option>
              <option value={24}>24h</option>
              <option value={168}>7d</option>
            </select>
            <button className="mvp-tb-btn" onClick={() => loadHeatData()} title="Refresh" disabled={heatRefreshing}>
              <RefreshCw size={13} className={heatRefreshing ? 'mvp-spin' : ''} />
            </button>
          </>
        )}

        <button className={`mvp-tb-btn${timelapse ? ' active' : ''}`} onClick={() => { setTimelapse(v => !v); setShowHeatmap(false); }} title="Time-lapse heatmap">
          TL
        </button>
        {timelapse && tlData && (
          <div className="mvp-tl-ctrl">
            <button onClick={() => setTlPlaying(p => !p)}>{tlPlaying ? 'Pause' : 'Play'}</button>
            <input
              type="range"
              min={0}
              max={23}
              value={tlHour ?? 0}
              onChange={e => { setTlHour(Number(e.target.value)); setTlPlaying(false); }}
            />
            <span>{String(tlHour ?? 0).padStart(2, '0')}:00</span>
          </div>
        )}

        <button className={`mvp-tb-btn${showFov ? ' active' : ''}`} onClick={() => setShowFov(v => !v)} title="Camera FOV cones (scroll wheel on cone to rotate)">
          FOV
        </button>
        <button className={`mvp-tb-btn${showDoors ? ' active' : ''}`} onClick={() => setShowDoors(v => !v)} title="Door markers">
          <DoorOpen size={13} />
        </button>
        <button className={`mvp-tb-btn${showMinimap ? ' active' : ''}`} onClick={() => setShowMinimap(v => !v)} title="Mini-map">
          Map
        </button>

        {mode === 'edit' && (
          <>
            <button className="mvp-tb-btn" onClick={undoEdit} disabled={!editHistory.length} title="Undo (Ctrl+Z)">
              <Undo2 size={13} />
            </button>
            <button className="mvp-tb-btn" onClick={redoEdit} disabled={!editFuture.length} title="Redo (Ctrl+Y)">
              <Redo2 size={13} />
            </button>
          </>
        )}

        <button className="mvp-tb-btn" onClick={exportMapAsPng} title="Export PNG"><Download size={13} /></button>
        <div className="mvp-zoom-ctrl">
          <button onClick={zoomOut}><ZoomOut size={13} /></button>
          <span>{Math.round(tr.scale * 100)}%</span>
          <button onClick={zoomIn}><ZoomIn size={13} /></button>
          <button onClick={resetView}><Home size={13} /></button>
        </div>
        <button className={`mvp-tb-btn${isFullscreen ? ' active' : ''}`} onClick={toggleFullscreen} title="Fullscreen (F)">
          {isFullscreen ? 'Exit' : 'Full'}
        </button>
      </div>
    </div>
  );
}
