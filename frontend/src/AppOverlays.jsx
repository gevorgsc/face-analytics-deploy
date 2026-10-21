import React, { lazy } from 'react';
import ConfirmModal from './ConfirmModal';
import { API } from './apiConfig';
import { useTr } from './i18n';
import { mediaUrl } from './mediaUrl';
import { toast } from './useToast';

const PersonHistoryModalPro = lazy(() => import('./PersonHistoryModalPro'));

function LiveAlert({ data }) {
  const t = useTr();
  const img = path => mediaUrl(API, path);
  const title =
    data.person_type === 'vip'
      ? t('vipDetectedLabel')
      : data.person_type === 'blacklist'
      ? t('blacklistAlertLabel')
      : data.person_type === 'employee'
      ? t('employeeDetectedLabel')
      : t('unknownPersonLabel');

  return (
    <div className={`live-alert ${data.person_type}`}>
      <img src={img(data.crop_image || data.image)} />

      <div>
        <h2>{data.is_low_quality ? t('lowQualityFace') : title}</h2>
        <h3>{data.person_name}</h3>
        <p>{data.camera_name}</p>

        {data.is_low_quality ? (
          <span className="low-quality-badge">{t('lowQualityBadge')}: {data.quality_reason}</span>
        ) : null}
        {data.confidence && <span>{t('match')}:  {(data.confidence * 100).toFixed(1)}%</span>}
      </div>
    </div>
  );
}

export default function AppOverlays({
  authFetch,
  canOperate,
  confirmState,
  eventPopupEnabled,
  historyLoading,
  historyLoadingMore,
  liveAlert,
  load,
  loadMorePersonHistory,
  personHistory,
  previewImage,
  setConfirmState,
  setPersonHistory,
  setPreviewImage,
  t,
}) {
  return (
    <>
      {eventPopupEnabled && liveAlert && <LiveAlert data={liveAlert} />}

      {previewImage && (
        <div className="image-modal" onClick={() => setPreviewImage(null)}>
          <img src={previewImage} />
        </div>
      )}

      {confirmState && (
        <ConfirmModal
          message={confirmState.message}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
          confirmLabel={confirmState.confirmLabel}
          cancelLabel={confirmState.cancelLabel}
          danger={confirmState.danger}
        />
      )}

      {personHistory && (
        <PersonHistoryModalPro
          person={personHistory.person}
          events={personHistory.events || []}
          serverStats={personHistory.stats}
          totalEvents={personHistory.stats?.total_events}
          loading={historyLoading}
          loadingMore={historyLoadingMore}
          hasMore={Boolean(personHistory.pagination?.has_more)}
          onLoadMore={loadMorePersonHistory}
          onClose={() => setPersonHistory(null)}
          setPreviewImage={setPreviewImage}
          authFetch={authFetch}
          t={t}
          API={API}
          onMerge={canOperate ? async (sourceId, targetId) => {
            const response = await authFetch(API + `/api/persons/${targetId}/merge/${sourceId}`, { method: 'POST' });
            if (response.ok) {
              toast.success(`Merged into person #${targetId}`);
              load();
            } else {
              const data = await response.json().catch(() => ({}));
              toast.error(data.detail || 'Merge failed');
            }
          } : null}
        />
      )}

      {historyLoading && <div className="history-loading">{t('loadingHistory')}</div>}
    </>
  );
}
