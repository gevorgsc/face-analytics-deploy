import React, { Suspense, lazy } from 'react';
import { Bell, DoorOpen, Link2, ShieldAlert } from 'lucide-react';
import EventNotificationSettings from './EventNotificationSettings';
import { AlertsPanel, WebhooksPanel } from './EnterprisePanels';
import { API } from './apiConfig';

const DoorsPanel = lazy(() => import('./DoorsPanel'));
const AccessControlPanel = lazy(() => import('./AccessControlPanel'));

export default function EventAdminView({
  authFetch,
  eventAdminView,
  eventPopupEnabled,
  eventSoundSettings,
  isAdmin,
  setEventAdminView,
  setEventPopupEnabled,
  setEventSoundSettings,
  t,
  token,
  userRole,
}) {
  if (!isAdmin) return null;

  return (
    <>
      <div className="attendance-subtabs" role="tablist" aria-label="Events views">
        <button
          className={eventAdminView === 'notifications' ? 'active' : ''}
          onClick={() => setEventAdminView('notifications')}
          role="tab"
          aria-selected={eventAdminView === 'notifications'}
        >
          <Bell size={14} /> {t('notifications')}
        </button>
        <button
          className={eventAdminView === 'alarm' ? 'active' : ''}
          onClick={() => setEventAdminView('alarm')}
          role="tab"
          aria-selected={eventAdminView === 'alarm'}
        >
          <ShieldAlert size={14} /> Alarm Rules
        </button>
        <button
          className={eventAdminView === 'webhooks' ? 'active' : ''}
          onClick={() => setEventAdminView('webhooks')}
          role="tab"
          aria-selected={eventAdminView === 'webhooks'}
        >
          <Link2 size={14} /> {t('webhooks')}
        </button>
        <button
          className={eventAdminView === 'doors' ? 'active' : ''}
          onClick={() => setEventAdminView('doors')}
          role="tab"
          aria-selected={eventAdminView === 'doors'}
        >
          <DoorOpen size={14} /> Doors / Relays
        </button>
        <button
          className={eventAdminView === 'acs' ? 'active' : ''}
          onClick={() => setEventAdminView('acs')}
          role="tab"
          aria-selected={eventAdminView === 'acs'}
        >
          <ShieldAlert size={14} /> Access Control
        </button>
      </div>

      {eventAdminView === 'notifications' ? (
        <EventNotificationSettings
          settings={eventSoundSettings}
          setSettings={setEventSoundSettings}
          eventPopupEnabled={eventPopupEnabled}
          setEventPopupEnabled={setEventPopupEnabled}
        />
      ) : eventAdminView === 'webhooks' ? (
        <WebhooksPanel token={token} userRole={userRole} />
      ) : eventAdminView === 'doors' ? (
        <Suspense fallback={<div className="loading-placeholder">Loading...</div>}>
          <DoorsPanel authFetch={authFetch} API={API} isAdmin={isAdmin} />
        </Suspense>
      ) : eventAdminView === 'acs' ? (
        <Suspense fallback={<div className="loading-placeholder">Loading...</div>}>
          <AccessControlPanel token={token} isAdmin={isAdmin} />
        </Suspense>
      ) : (
        <AlertsPanel token={token} userRole={userRole} />
      )}
    </>
  );
}
