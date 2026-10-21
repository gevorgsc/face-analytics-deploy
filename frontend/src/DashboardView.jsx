import React, { Suspense, lazy } from 'react';
import { API } from './apiConfig';
import { SkeletonDashboard } from './Skeletons';

const DashboardPro = lazy(() => import('./DashboardPro'));
const OccupancyWidget = lazy(() => import('./OccupancyWidget'));
const InOutWidget = lazy(() => import('./InOutWidget'));

export default function DashboardView({
  authFetch,
  cameras,
  canDelete,
  delEvent,
  events,
  inoutRefreshAt,
  isAdmin,
  occupancyWsData,
  openPersonHistory,
  openStatSection,
  setPreviewImage,
  stats,
  t,
}) {
  if (stats === null) return <SkeletonDashboard />;

  return (
    <>
      <DashboardPro
        stats={stats}
        events={events}
        cameras={cameras}
        openStatSection={openStatSection}
        delEvent={delEvent}
        setPreviewImage={setPreviewImage}
        canDelete={canDelete}
        openPersonHistory={openPersonHistory}
        t={t}
        API={API}
        authFetch={authFetch}
      />
      <Suspense fallback={null}>
        <OccupancyWidget
          authFetch={authFetch}
          API={API}
          isAdmin={isAdmin}
          wsData={occupancyWsData}
        />
      </Suspense>
      <Suspense fallback={null}>
        <InOutWidget
          authFetch={authFetch}
          API={API}
          setPreviewImage={setPreviewImage}
          openPersonHistory={openPersonHistory}
          onStatClick={filter => openStatSection('inout', filter)}
          refreshTrigger={inoutRefreshAt}
        />
      </Suspense>
    </>
  );
}
