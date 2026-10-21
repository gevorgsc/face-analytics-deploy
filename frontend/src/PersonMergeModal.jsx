import React, { useState, useEffect, useCallback } from 'react';
import { Search, X, GitMerge, User, AlertTriangle } from 'lucide-react';
import { mediaUrl } from './mediaUrl';
import { toast } from './useToast';

export default function PersonMergeModal({ person, authFetch, API, persons, onClose, onMerged }) {
  const [query,     setQuery]     = useState('');
  const [target,    setTarget]    = useState(null); // person to merge INTO
  const [merging,   setMerging]   = useState(false);
  const [confirm,   setConfirm]   = useState(false);

  const filtered = persons.filter(p =>
    p.id !== person.id &&
    (query === '' || (p.full_name || '').toLowerCase().includes(query.toLowerCase()))
  ).slice(0, 30);

  const doMerge = useCallback(async () => {
    if (!target) return;
    setMerging(true);
    try {
      // POST /api/persons/{target_id}/merge/{source_id}
      // target keeps its data, source (person) is absorbed
      const r = await authFetch(`${API}/api/persons/${target.id}/merge/${person.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        toast.error(err.detail || 'Merge failed');
        return;
      }
      toast.success(`Merged "${person.full_name || `#${person.id}`}" → "${target.full_name || `#${target.id}`}"`);
      onMerged?.();
      onClose();
    } finally {
      setMerging(false);
      setConfirm(false);
    }
  }, [authFetch, API, person, target, onMerged, onClose]);

  return (
    <div className="merge-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="merge-modal">
        <div className="merge-hd">
          <GitMerge size={18} />
          <h3>Merge Person</h3>
          <button onClick={onClose}><X size={16} /></button>
        </div>

        {/* Source person */}
        <div className="merge-source">
          <span className="merge-lbl">Merging (will be removed)</span>
          <div className="merge-person-card merge-source-card">
            {person.preview_image
              ? <img src={mediaUrl(API, person.preview_image)} className="merge-avatar" alt="" />
              : <div className="merge-avatar merge-avatar-ph"><User size={18} /></div>
            }
            <div>
              <strong>{person.full_name || `Unknown #${person.id}`}</strong>
              <small className={`mvp-ptype mvp-ptype-${person.person_type}`}>{person.person_type}</small>
            </div>
          </div>
        </div>

        <div className="merge-arrow">⬇ merge into ⬇</div>

        {/* Target search */}
        <span className="merge-lbl">Target (keeps all data + absorbs source events)</span>
        <div className="merge-search-row">
          <Search size={12} />
          <input className="merge-input" placeholder="Search target person…"
            value={query} onChange={e => { setQuery(e.target.value); setTarget(null); setConfirm(false); }} />
        </div>

        {!target && (
          <div className="merge-list">
            {filtered.length === 0 && <p className="merge-empty">No persons found</p>}
            {filtered.map(p => (
              <button key={p.id} className="merge-row" onClick={() => { setTarget(p); setConfirm(false); }}>
                {p.preview_image
                  ? <img src={mediaUrl(API, p.preview_image)} className="merge-avatar-sm" alt="" />
                  : <div className="merge-avatar-sm merge-avatar-ph"><User size={11} /></div>
                }
                <div>
                  <span>{p.full_name || `#${p.id}`}</span>
                  <small className={`mvp-ptype mvp-ptype-${p.person_type}`}>{p.person_type}</small>
                </div>
              </button>
            ))}
          </div>
        )}

        {target && (
          <div className="merge-target-card">
            <div className="merge-person-card">
              {target.preview_image
                ? <img src={mediaUrl(API, target.preview_image)} className="merge-avatar" alt="" />
                : <div className="merge-avatar merge-avatar-ph"><User size={18} /></div>
              }
              <div>
                <strong>{target.full_name || `#${target.id}`}</strong>
                <small className={`mvp-ptype mvp-ptype-${target.person_type}`}>{target.person_type}</small>
              </div>
              <button className="merge-change-btn" onClick={() => { setTarget(null); setConfirm(false); }}>Change</button>
            </div>

            {!confirm ? (
              <button className="merge-confirm-btn" onClick={() => setConfirm(true)}>
                <GitMerge size={14} /> Merge
              </button>
            ) : (
              <div className="merge-confirm-box">
                <div className="merge-warn"><AlertTriangle size={14} /> This cannot be undone. "{person.full_name}" will be deleted.</div>
                <div className="merge-confirm-btns">
                  <button className="merge-cancel-btn" onClick={() => setConfirm(false)}>Cancel</button>
                  <button className="merge-do-btn" onClick={doMerge} disabled={merging}>
                    {merging ? 'Merging…' : 'Confirm Merge'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
