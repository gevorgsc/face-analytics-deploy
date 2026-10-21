import React from 'react';
import { Edit3, MapPin, Plus, Trash2, Upload } from 'lucide-react';
import { mapImageUrl } from './MapViewLayers';

export function MapEmptyState({
  API,
  canEditMaps,
  newAreaFile,
  newAreaName,
  setNewAreaFile,
  setNewAreaName,
  uploadMap,
  uploading,
}) {
  return (
    <div className="mvp-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ maxWidth: '420px', width: '100%', padding: '40px', textAlign: 'center' }}>
        <div className="mvp-empty-icon" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'center' }}>
          <MapPin size={48} color="var(--primary)" />
        </div>
        <h2 style={{ marginBottom: '8px' }}>{canEditMaps ? 'Create First Area' : 'No Areas Yet'}</h2>
        <p className="muted" style={{ marginBottom: '24px' }}>
          {canEditMaps
            ? 'Enter an area name and upload an image to begin.'
            : 'An admin or operator can create the first area.'}
        </p>

        {canEditMaps && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <input
              className="ep-input"
              placeholder="Area name"
              value={newAreaName}
              onChange={event => setNewAreaName(event.target.value)}
            />

            <label className={`enterprise-file-picker ${newAreaFile ? 'has-file' : ''}`} style={{ padding: '15px' }}>
              <input
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={event => setNewAreaFile(event.target.files?.[0] || null)}
              />
              <Upload size={16} />
              <span>{newAreaFile ? newAreaFile.name : 'Upload area image'}</span>
            </label>

            <button
              className="save-btn"
              style={{ justifyContent: 'center' }}
              disabled={uploading || !newAreaName.trim() || !newAreaFile}
              onClick={() => uploadMap(newAreaFile, newAreaName)}
            >
              {uploading ? 'Creating...' : 'Create Area'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function MapAreasList({
  API,
  canDeleteMaps,
  canEditMaps,
  deleteMap,
  handleFileDrop,
  maps,
  selectedMap,
  setAreaName,
  setMode,
  setPathPerson,
  setSelectedMap,
  setShowAreaEditor,
}) {
  return (
    <div className="mvp-section">
      <div className="mvp-section-hd">
        <MapPin size={12} /> Areas
        {canEditMaps && (
          <label htmlFor="mvp-add-map" className="mvp-icon-btn ml-auto" title="Upload new area">
            <Plus size={13} />
            <input id="mvp-add-map" type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileDrop} />
          </label>
        )}
      </div>
      <div className="mvp-map-list">
        {maps.map(map => (
          <div
            key={map.id}
            className={`mvp-map-row${selectedMap?.id === map.id ? ' active' : ''}`}
            onClick={() => { setSelectedMap(map); setShowAreaEditor(false); }}
          >
            <img
              src={mapImageUrl(API, map.image_path)}
              alt={map.name}
              className="mvp-map-thumb"
              onError={event => { event.currentTarget.style.opacity = '.2'; }}
            />
            <div className="mvp-map-meta">
              <span>{map.name}</span>
              <small>{map.cameras?.length || 0} cams</small>
            </div>
            {canEditMaps && (
              <button
                className="mvp-map-edit-btn"
                title="Edit area"
                onClick={event => {
                  event.stopPropagation();
                  setSelectedMap(map);
                  setAreaName(map.name || '');
                  setMode('edit');
                  setPathPerson(null);
                  setShowAreaEditor(true);
                }}
              >
                <Edit3 size={10} />
              </button>
            )}
            {canDeleteMaps && (
              <button className="mvp-del-btn" title="Delete" onClick={event => { event.stopPropagation(); deleteMap(map.id); }}>
                <Trash2 size={10} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
