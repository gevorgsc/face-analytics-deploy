// ============================================================
// SearchByPicturePro.jsx - GSC Face Analytics Pro
// Enhanced face search with similarity visualization
// ============================================================

import React, { useState } from 'react';
import {
  Search, Upload, Image as ImageIcon, Camera as CameraIcon,
  History, Clock, AlertTriangle, Target, Sparkles,
  Crown, Briefcase, ShieldAlert, User
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

function displayPersonName(item) {
  if (!item) return 'Unknown Person';
  if (item.person?.full_name) return item.person.full_name;
  if (item.full_name) return item.full_name;
  if (item.display_name) return item.display_name;
  if (item.person_name && item.person_name !== 'Unknown Person') return item.person_name;
  const id = item.person_id || item.id;
  return id ? `Unknown #${id}` : 'Unknown Person';
}

function TypeIcon({ type, size = 11 }) {
  switch (type) {
    case 'employee':  return <Briefcase size={size} />;
    case 'vip':       return <Crown size={size} />;
    case 'blacklist': return <ShieldAlert size={size} />;
    default:          return <User size={size} />;
  }
}

// Similarity color level
function similarityLevel(score) {
  if (score >= 0.7) return 'high';
  if (score >= 0.5) return 'medium';
  if (score >= 0.35) return 'low';
  return 'weak';
}

// ---------- File Picker ----------
function SearchFilePicker({ onChange, label, t }) {
  const [preview, setPreview] = useState(null);
  const [name, setName] = useState('');

  const handleFile = (file) => {
    if (!file) return;
    setName(file.name);
    const reader = new FileReader();
    reader.onload = e => setPreview(e.target.result);
    reader.readAsDataURL(file);
    onChange(file);
  };

  return (
    <div className={`sbp-picker ${preview ? 'has-preview' : ''}`}>
      <label className="sbp-picker-label">
        <input
          type="file"
          accept="image/*"
          onChange={e => handleFile(e.target.files?.[0])}
        />
        {preview ? (
          <div className="sbp-preview">
            <img src={preview} alt="preview" />
            <div className="sbp-preview-overlay">
              <Upload size={20} />
              <span>Click to change</span>
            </div>
          </div>
        ) : (
          <div className="sbp-picker-empty">
            <div className="sbp-picker-icon">
              <ImageIcon size={28} />
            </div>
            <div>
              <b>{label}</b>
              <small>{name || 'JPG / PNG / WEBP - drop or click'}</small>
            </div>
          </div>
        )}
      </label>
    </div>
  );
}

// ---------- Single Result Card ----------
function ResultCard({ result, setPreviewImage, openPersonHistory, t, API }) {
  const score = result.score || 0;
  const percentage = (score * 100).toFixed(1);
  const level = similarityLevel(score);
  const personType = result.person_type || result.person?.person_type || 'unknown';
  const isLowQuality = !!result.is_low_quality;

  return (
    <div className={`sbp-result type-${personType} match-${level}`}>
      {/* Image */}
      <div className="sbp-result-img-wrap">
        <img
          src={thumbImage(API, result)}
          onClick={() => setPreviewImage(previewImage(API, result))}
          alt=""
        />
        <span className={`sbp-type-badge type-${personType}`}>
          <TypeIcon type={personType} size={10} />
          {personType?.toUpperCase()}
        </span>
        {isLowQuality && (
          <span className="sbp-lowq">
            <AlertTriangle size={10} />
            LOW Q
          </span>
        )}
      </div>

      {/* Body */}
      <div className="sbp-result-body">
        <b
          className="sbp-result-name clickable-name"
          onClick={() => openPersonHistory?.(result.person_id)}
        >
          {displayPersonName(result)}
        </b>

        <div className="sbp-result-meta">
          <span><CameraIcon size={10} /> {result.camera_name || 'Camera'}</span>
          <span><Clock size={10} /> {formatRelative(result.created_at)}</span>
        </div>

        {/* Similarity bar */}
        <div className="sbp-similarity">
          <div className="sbp-sim-head">
            <span className="sbp-sim-label">
              <Target size={10} /> {t('similarity')}
            </span>
            <span className={`sbp-sim-percent level-${level}`}>{percentage}%</span>
          </div>
          <div className="sbp-sim-bar">
            <div
              className={`sbp-sim-fill level-${level}`}
              style={{ width: `${Math.min(percentage, 100)}%` }}
            />
          </div>
        </div>

        {/* Quality */}
        {result.face_quality && (
          <div className="sbp-result-quality">
            {t('quality')}: <b>{Number(result.face_quality).toFixed(1)}</b>
          </div>
        )}

        <button
          className="sbp-history-btn"
          onClick={() => openPersonHistory?.(result.person_id)}
        >
          <History size={11} />
          {t('history')}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// MAIN
// ============================================================
export default function SearchByPicturePro({
  searchByPicture, searching, searchResults, setPreviewImage, openPersonHistory, t, API,
}) {
  const [file, setFile] = useState(null);

  const handleSearch = () => {
    if (file) searchByPicture(file);
  };

  // Sort results by score (high to low)
  const sortedResults = (searchResults?.results || [])
    .slice()
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  return (
    <>
      {/* SEARCH PANEL */}
      <div className="card sbp-panel">
        <div className="sbp-head">
          <div className="sbp-head-icon">
            <Sparkles size={20} />
          </div>
          <div>
            <h2>{t('search')}</h2>
            <p className="muted">{t('searchHint')}</p>
          </div>
        </div>

        <div className="sbp-body">
          <SearchFilePicker
            onChange={setFile}
            label={t('chooseImage')}
            t={t}
          />

          <button
            className="save-btn sbp-search-btn"
            disabled={searching || !file}
            onClick={handleSearch}
          >
            {searching ? (
              <>
                <span className="sbp-spinner" />
                {t('searching')}
              </>
            ) : (
              <>
                <Search size={16} />
                {t('search')}
              </>
            )}
          </button>
        </div>
      </div>

      {/* RESULTS */}
      {searchResults && (
        <>
          <div className="sbp-results-header">
            <h2>
              {t('results')}: <b>{searchResults.count || sortedResults.length}</b>
            </h2>
            {sortedResults.length > 0 && (
              <span className="sbp-results-info">
                Sorted by similarity
              </span>
            )}
          </div>

          {sortedResults.length === 0 ? (
            <div className="sbp-empty">
              <Search size={42} />
              <h3>No matches found</h3>
              <p>Try a clearer photo or different angle.</p>
            </div>
          ) : (
            <div className="sbp-results-grid">
              {sortedResults.map(r => (
                <ResultCard
                  key={r.id}
                  result={r}
                  setPreviewImage={setPreviewImage}
                  openPersonHistory={openPersonHistory}
                  t={t}
                  API={API}
                />
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
