import React, { Suspense, lazy } from 'react';
import { Activity, Camera, Map } from 'lucide-react';
import { ZonesPanel } from './EnterprisePanels';
import { API } from './apiConfig';
import { toast } from './useToast';

const CamerasManagementPro = lazy(() => import('./CamerasManagementPro'));
const CameraHealthPanel = lazy(() => import('./CameraHealthPanel'));

export default function CamerasView({
  authFetch,
  autoEditCameraId,
  cameraSubView,
  cameraView,
  cameras,
  currentUser,
  isAdmin,
  loadCameras,
  setAutoEditCameraId,
  setCameraSubView,
  setCameraView,
  showConfirm,
  t,
  token,
}) {
  const createCamera = async (data) => {
    const response = await authFetch(API + '/api/cameras', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (response.ok) {
      toast.success(t('cameraCreated'));
      loadCameras();
    } else {
      const error = await response.json().catch(() => ({}));
      toast.error(error.detail || t('failedToCreateCamera'));
    }
  };

  const updateCamera = async (id, data) => {
    const response = await authFetch(API + `/api/cameras/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (response.ok) {
      toast.success(t('cameraUpdated'));
      loadCameras();
    } else {
      const error = await response.json().catch(() => ({}));
      toast.error(error.detail || t('failedToUpdateCamera'));
    }
  };

  const deleteCamera = (id) => {
    showConfirm(t('deleteCamera'), async () => {
      const response = await authFetch(API + `/api/cameras/${id}`, { method: 'DELETE' });
      if (response.ok) {
        toast.success(t('cameraDeleted'));
        loadCameras();
      } else {
        toast.error(t('failedToDeleteCamera'));
      }
    });
  };

  return (
    <>
      <div className="device-nav-wrap">
        <div className="attendance-subtabs" role="tablist" aria-label="Device views">
          <button
            className={cameraView === 'cameras' ? 'active' : ''}
            onClick={() => setCameraView('cameras')}
            role="tab"
            aria-selected={cameraView === 'cameras'}
          >
            <Camera size={14} /> Cameras
          </button>
          <button
            className={cameraView === 'zones' ? 'active' : ''}
            onClick={() => setCameraView('zones')}
            role="tab"
            aria-selected={cameraView === 'zones'}
          >
            <Map size={14} /> Zones
          </button>
        </div>

        {cameraView === 'cameras' && (
          <div className="camera-subtabs" role="tablist" aria-label="Camera sub-views">
            <button
              className={cameraSubView === 'list' ? 'active' : ''}
              onClick={() => setCameraSubView('list')}
              role="tab"
              aria-selected={cameraSubView === 'list'}
            >
              <Camera size={12} /> Camera List
            </button>
            <button
              className={cameraSubView === 'health' ? 'active' : ''}
              onClick={() => setCameraSubView('health')}
              role="tab"
              aria-selected={cameraSubView === 'health'}
            >
              <Activity size={12} /> Camera Health
            </button>
          </div>
        )}
      </div>

      {cameraView === 'zones' ? (
        <ZonesPanel token={token} userRole={currentUser?.role} />
      ) : cameraSubView === 'health' ? (
        <Suspense fallback={null}>
          <CameraHealthPanel authFetch={authFetch} API={API} />
        </Suspense>
      ) : (
        <CamerasManagementPro
          cameras={cameras}
          apiBase={API}
          authFetch={authFetch}
          token={token}
          autoEditCameraId={autoEditCameraId}
          onAutoEditHandled={() => setAutoEditCameraId(null)}
          createCamera={createCamera}
          updateCamera={updateCamera}
          deleteCamera={deleteCamera}
          canEdit={isAdmin}
          canDelete={isAdmin}
          t={t}
        />
      )}
    </>
  );
}
