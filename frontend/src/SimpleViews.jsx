import React, { Suspense, lazy } from 'react';
import { API } from './apiConfig';

const AnalyticsDashboard = lazy(() => import('./AnalyticsDashboard'));
const CameraGridView = lazy(() => import('./CameraGridView'));
const MapView = lazy(() => import('./MapView'));
const RegisterPerson = lazy(() => import('./RegisterPerson'));
const SearchByPicturePro = lazy(() => import('./SearchByPicturePro'));
const UsersManagement = lazy(() => import('./UsersManagement'));

export function RegisterView({ authFetch, canOperate, events, load, t, Card }) {
  return canOperate ? (
    <RegisterPerson events={events} load={load} authFetch={authFetch} />
  ) : (
    <Card className="viewer-note">{t('viewerNote')}</Card>
  );
}

export function AnalyticsView({ authFetch, t }) {
  return (
    <Suspense fallback={<div className="loading-placeholder">Loading analytics...</div>}>
      <AnalyticsDashboard authFetch={authFetch} API={API} t={t} />
    </Suspense>
  );
}

export function FloorMapView({ authFetch, currentUser, liveMapEvent, persons }) {
  return (
    <Suspense fallback={<div className="loading-placeholder">Loading map...</div>}>
      <MapView
        authFetch={authFetch}
        API={API}
        persons={persons}
        liveEvent={liveMapEvent}
        currentUser={currentUser}
      />
    </Suspense>
  );
}

export function SearchView({
  openPersonHistory,
  searchByPicture,
  searchResults,
  searching,
  setPreviewImage,
  t,
}) {
  return (
    <SearchByPicturePro
      searchByPicture={searchByPicture}
      searching={searching}
      searchResults={searchResults}
      setPreviewImage={setPreviewImage}
      openPersonHistory={openPersonHistory}
      t={t}
      API={API}
    />
  );
}

export function LiveView({ cameras, token }) {
  return (
    <Suspense fallback={<div className="loading-placeholder">Loading live view...</div>}>
      <CameraGridView
        cameras={cameras.filter(camera => camera.is_active && camera.live_enabled)}
        token={token}
      />
    </Suspense>
  );
}

export function UsersView({
  authFetch,
  currentUser,
  isAdmin,
  loadUsers,
  showConfirm,
  usersList,
}) {
  if (!isAdmin) return null;

  return (
    <UsersManagement
      usersList={usersList}
      loadUsers={loadUsers}
      authFetch={authFetch}
      currentUser={currentUser}
      showConfirm={showConfirm}
    />
  );
}
