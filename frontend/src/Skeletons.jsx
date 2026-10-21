// ============================================================
// Skeletons.jsx - GSC Face Analytics Pro
// Loading skeletons for all main views
// ============================================================

import React from 'react';

export function SkeletonKpi() {
  return (
    <div className="skel-kpi">
      <div className="skel skel-square" />
      <div className="skel-lines">
        <div className="skel skel-line short" />
        <div className="skel skel-line big" />
      </div>
    </div>
  );
}

export function SkeletonEvent() {
  return (
    <div className="skel-event">
      <div className="skel skel-image" />
      <div className="skel-lines">
        <div className="skel skel-line" />
        <div className="skel skel-line medium" />
        <div className="skel skel-line short" />
      </div>
    </div>
  );
}

export function SkeletonPerson() {
  return (
    <div className="skel-person">
      <div className="skel-person-head">
        <div className="skel skel-avatar" />
        <div className="skel-lines">
          <div className="skel skel-line" />
          <div className="skel skel-line medium" />
          <div className="skel skel-line short" />
        </div>
      </div>
      <div className="skel skel-block" />
    </div>
  );
}

export function SkeletonCamera() {
  return (
    <div className="skel-camera">
      <div className="skel skel-line medium" />
      <div className="skel skel-line short" />
      <div className="skel skel-block-sm" />
    </div>
  );
}

// Grids
export function SkeletonDashboard() {
  return (
    <>
      <div className="skel skel-hero" />
      <div className="kpi-grid">
        {Array.from({ length: 7 }).map((_, i) => <SkeletonKpi key={i} />)}
      </div>
      <div className="charts-grid-pro">
        <div className="skel skel-chart" />
        <div className="skel skel-chart" />
      </div>
    </>
  );
}

export function SkeletonEventGrid({ count = 8 }) {
  return (
    <div className="egrid-grid">
      {Array.from({ length: count }).map((_, i) => <SkeletonEvent key={i} />)}
    </div>
  );
}

export function SkeletonPersonGrid({ count = 6 }) {
  return (
    <div className="persons-pro-grid">
      {Array.from({ length: count }).map((_, i) => <SkeletonPerson key={i} />)}
    </div>
  );
}

export function SkeletonCameraGrid({ count = 4 }) {
  return (
    <div className="cmp-grid">
      {Array.from({ length: count }).map((_, i) => <SkeletonCamera key={i} />)}
    </div>
  );
}
