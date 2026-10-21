﻿// InOutWidget.jsx - IN/OUT tracking widget + full-page view with filter tabs

import React, { useEffect, useState } from 'react';
import {
  ArrowDown, ArrowUp, Users, RefreshCw,
  Briefcase, Crown, ShieldAlert, User as UserIcon,
  Clock, ArrowRight,
} from 'lucide-react';
import { mediaUrl } from './mediaUrl';

function img(API, path) {
  return mediaUrl(API, path);
}

function formatRelative(value) {
  if (!value) return '-';
  const diff = Date.now() - new Date(value).getTime();
  const sec  = Math.floor(diff / 1000);
  if (sec < 60)  return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60)  return `${min}m ago`;
  const hr  = Math.floor(min / 60);
  if (hr  < 24)  return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function TypeIcon({ type, size = 10 }) {
  if (type === 'employee')  return <Briefcase  size={size} />;
  if (type === 'vip')       return <Crown      size={size} />;
  if (type === 'blacklist') return <ShieldAlert size={size} />;
  return <UserIcon size={size} />;
}

function PersonList({ persons, API, setPreviewImage, openPersonHistory, emptyMsg }) {
  if (!persons || persons.length === 0) {
    return <div className="inout-empty">{emptyMsg || 'No records.'}</div>;
  }
  return (
    <div className="inside-list-items">
      {persons.map(p => (
        <div key={p.id} className={`inside-item type-${p.person_type || 'unknown'}`}>
          <img
            src={img(API, p.preview_image)}
            onClick={() => setPreviewImage?.(img(API, p.preview_image))}
            alt=""
          />
          <div className="inside-item-info">
            <b onClick={() => openPersonHistory?.(p.id)}>
              {p.display_name || p.full_name || `Unknown #${p.id}`}
            </b>
            <p>
              <TypeIcon type={p.person_type || 'unknown'} />
              <span>{(p.person_type || 'unknown').toUpperCase()}</span>
              {p.camera_name && (
                <><span className="sep">-</span><span>{p.camera_name}</span></>
              )}
              <span className="sep">-</span>
              <Clock size={10} />
              <span>{formatRelative(p.last_seen)}</span>
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// -- Main component ------------------------------------------------------------

export default function InOutWidget({
  authFetch,
  API,
  setPreviewImage,
  openPersonHistory,
  fullPage      = false,
  defaultFilter = 'inside',  // 'inside' | 'entered' | 'exited'
  onStatClick,               // called with filter key when stat clicked in dashboard mode
  refreshTrigger = 0,        // increment from parent triggers a reload
}) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter]   = useState(defaultFilter);

  // Sync when parent changes defaultFilter (e.g. navigated from dashboard click)
  useEffect(() => { setFilter(defaultFilter); }, [defaultFilter]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authFetch(API + '/api/stats/in-out?limit=100');
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error("Failed to fetch IN/OUT stats", err);
    } finally {
      setLoading(false);
    }
  };

  // Initial load only — no polling
  useEffect(() => { load(); }, []);

  // Reload when parent signals a new in/out event arrived via WebSocket
  useEffect(() => {
    if (refreshTrigger) load();
  }, [refreshTrigger]);

  const handleStatClick = (f) => {
    if (fullPage) {
      setFilter(f);
    } else if (onStatClick) {
      onStatClick(f);
    }
  };

  const isClickable = fullPage || !!onStatClick;

  if (!data) {
    return (
      <div className={`card inout-widget${fullPage ? ' inout-widget-page' : ''}`}>
        <div className="card-title-row"><h3>IN / OUT Tracking</h3></div>
        <div className="inout-loading">Loading...</div>
      </div>
    );
  }

  const flowBalance = data.in_count_today - data.out_count_today;
  const flowTotal   = Math.max(data.in_count_today + data.out_count_today, 1);

  const activePersons = filter === 'entered'
    ? (data.entered_today_persons || [])
    : filter === 'exited'
    ? (data.exited_today_persons  || [])
    : (data.inside_persons        || []);

  const listLabel = filter === 'entered'
    ? `Entered Today (${data.in_count_today})`
    : filter === 'exited'
    ? `Exited Today (${data.out_count_today})`
    : `Currently Inside (${data.currently_inside})`;

  const emptyMsg = filter === 'entered'
    ? 'No one entered today yet.'
    : filter === 'exited'
    ? 'No one has exited today.'
    : 'No one is currently inside.';

  return (
    <div className={`card inout-widget${fullPage ? ' inout-widget-page' : ''}`}>
      <div className="card-title-row">
        <h3>IN / OUT Tracking - Today</h3>
        <button className="inout-refresh" onClick={load} disabled={loading} title="Refresh">
          <RefreshCw size={13} className={loading ? 'spinning' : ''} />
        </button>
      </div>

      {/* -- Top stat cards -- */}
      <div className="inout-stats">
        <div
          className={`inout-stat stat-in${filter === 'entered' && fullPage ? ' inout-stat-active' : ''}${isClickable ? ' inout-stat-clickable' : ''}`}
          onClick={() => handleStatClick('entered')}
          title={fullPage ? 'Show entered today' : 'View Entered'}
        >
          <div className="inout-stat-icon"><ArrowDown size={18} /></div>
          <div>
            <small>ENTERED</small>
            <b>{data.in_count_today}</b>
          </div>
          {!fullPage && onStatClick && <ArrowRight size={11} className="inout-nav-arrow" />}
        </div>

        <div
          className={`inout-stat stat-out${filter === 'exited' && fullPage ? ' inout-stat-active' : ''}${isClickable ? ' inout-stat-clickable' : ''}`}
          onClick={() => handleStatClick('exited')}
          title={fullPage ? 'Show exited today' : 'View Exited'}
        >
          <div className="inout-stat-icon"><ArrowUp size={18} /></div>
          <div>
            <small>EXITED</small>
            <b>{data.out_count_today}</b>
          </div>
          {!fullPage && onStatClick && <ArrowRight size={11} className="inout-nav-arrow" />}
        </div>

        <div
          className={`inout-stat stat-inside${filter === 'inside' && fullPage ? ' inout-stat-active' : ''}${isClickable ? ' inout-stat-clickable' : ''}`}
          onClick={() => handleStatClick('inside')}
          title={fullPage ? 'Show currently inside' : 'View Inside Now'}
        >
          <div className="inout-stat-icon"><Users size={18} /></div>
          <div>
            <small>INSIDE NOW</small>
            <b>{data.currently_inside}</b>
          </div>
          {!fullPage && onStatClick && <ArrowRight size={11} className="inout-nav-arrow" />}
        </div>
      </div>

      {/* -- Flow bar -- */}
      <div className="inout-flow">
        <div className="inout-flow-head">
          <span>Net Flow</span>
          <b className={flowBalance >= 0 ? 'positive' : 'negative'}>
            {flowBalance >= 0 ? '+' : ''}{flowBalance}
          </b>
        </div>
        <div className="inout-flow-bar">
          {data.in_count_today > 0 && (
            <div
              className="inout-flow-in"
              style={{ width: `${(data.in_count_today / flowTotal) * 100}%` }}
              title={`${data.in_count_today} entered`}
            />
          )}
          {data.out_count_today > 0 && (
            <div
              className="inout-flow-out"
              style={{ width: `${(data.out_count_today / flowTotal) * 100}%` }}
              title={`${data.out_count_today} exited`}
            />
          )}
        </div>
        <div className="inout-flow-legend">
          <span><span className="dot dot-in" /> IN</span>
          <span><span className="dot dot-out" /> OUT</span>
        </div>
      </div>

      {/* -- Filter tabs (full-page only) -- */}
      {fullPage && (
        <div className="inout-filter-tabs">
          <button
            className={filter === 'inside' ? 'active' : ''}
            onClick={() => setFilter('inside')}
          >
            <Users size={13} />
            Inside Now
            <span className="inout-tab-count">{data.currently_inside}</span>
          </button>
          <button
            className={filter === 'entered' ? 'active' : ''}
            onClick={() => setFilter('entered')}
          >
            <ArrowDown size={13} />
            Entered Today
            <span className="inout-tab-count">{data.in_count_today}</span>
          </button>
          <button
            className={filter === 'exited' ? 'active' : ''}
            onClick={() => setFilter('exited')}
          >
            <ArrowUp size={13} />
            Exited Today
            <span className="inout-tab-count">{data.out_count_today}</span>
          </button>
        </div>
      )}

      {/* -- Person list -- */}
      <div className="inside-list">
        <div className="inside-list-head">
          <span>{listLabel}</span>
        </div>
        <PersonList
          persons={activePersons}
          API={API}
          setPreviewImage={setPreviewImage}
          openPersonHistory={openPersonHistory}
          emptyMsg={emptyMsg}
        />
      </div>
    </div>
  );
}
