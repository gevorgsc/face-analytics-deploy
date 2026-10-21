import React, { Suspense, lazy, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { useAppData, useUIState } from './useAppData';
import './style.css';
import './ui_overhaul.css';
import './AcsModules.css';
import { toast } from './useToast';
import ToastContainer from './ToastContainer';
import LoginScreenPro from './LoginScreenPro';
import AppOverlays from './AppOverlays';
import AppSidebar from './AppSidebar';
import AppHeader from './AppHeader';
import EventAdminView from './EventAdminView';
import PersonsView from './PersonsView';
import AttendanceView from './AttendanceView';
import CamerasView from './CamerasView';
import AuditView from './AuditView';
import DashboardView from './DashboardView';
import {
  AnalyticsView,
  FloorMapView,
  LiveView,
  RegisterView,
  SearchView,
  UsersView,
} from './SimpleViews';
import { mediaUrl } from './mediaUrl';
import { SkeletonEventGrid } from './Skeletons';
import { requestNotificationPermission } from './alertSound';
import { API } from './apiConfig';
import { apiFetch } from './apiClient';
import { useAppSettings } from './useAppSettings';
import { useAppWebSocket } from './useAppWebSocket';
import { useAuthSession } from './useAuthSession';
import { useLicenseStatus } from './useLicenseStatus';
import { I18N, I18nContext, LangSelector } from './i18n';
import { useAppStore } from './store';
import AppLauncher from './AppLauncher';
const AcsApp = lazy(() => import('./AcsApp'));
const SecurityCenter = lazy(() => import('./SecurityCenter'));
const VisitorKiosk = lazy(() => import('./VisitorKiosk'));

const EventGridPro = lazy(() => import('./EventGridPro'));
const BulkImportModal      = lazy(() => import('./BulkImportModal'));

const EVENTS_PAGE_SIZE = 100;

function img(path) {
  return mediaUrl(API, path);
}

function thumbImage(item) {
  return img(item?.crop_image_path || item?.preview_image || item?.image_path || item?.original_image_path);
}

function getPreviewPath(item) {
  return img(item?.original_image_path || item?.image_path || item?.crop_image_path || item?.preview_image);
}

function formatDateTime(value) {
  if (!value) return "-";

  return new Date(value).toLocaleString("en-US", {
    timeZone: "Asia/Yerevan",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function displayPersonName(item) {
  if (!item) return "Unknown Person";

  if (item.person?.full_name) return item.person.full_name;
  if (item.full_name) return item.full_name;
  if (item.display_name) return item.display_name;
  if (item.person_name && item.person_name !== "Unknown Person") return item.person_name;

  const id = item.person_id || item.id;
  return id ? `Unknown #${id}` : "Unknown Person";
}

function Card({ children, className = '', onClick }) {
  return (
    <div className={'card ' + className} onClick={onClick}>
      {children}
    </div>
  );
}

function Stat({ icon: Icon, title, value, onClick }) {
  return (
    <Card className={onClick ? 'stat-card stat-card-click' : 'stat-card'} onClick={onClick}>
      <div className="stat">
        <Icon />
        <div>
          <p>{title}</p>
          <h2>{value}</h2>
        </div>
      </div>
    </Card>
  );
}

export default function App() {
  // Global prefs from Zustand store
  const theme    = useAppStore(s => s.theme);
  const setTheme = useAppStore(s => s.setTheme);
  const storedLang = useAppStore(s => s.lang);
  const persistLang = useAppStore(s => s.setLang);
  const [lang, setLiveLang] = React.useState(storedLang);
  const auth     = useAppStore(s => s.auth);
  const setAuth  = useAppStore(s => s.setAuth);
  const clearAuth = useAppStore(s => s.logout);

  // Keep the visible interface in local React state as well as in persisted
  // preferences. This makes a language selection render immediately instead
  // of waiting for the next page load to hydrate it from localStorage.
  useEffect(() => {
    setLiveLang(current => current === storedLang ? current : storedLang);
  }, [storedLang]);

  const setLang = useCallback((nextLang) => {
    const normalized = ['hy', 'ru', 'en'].includes(nextLang) ? nextLang : 'en';
    setLiveLang(normalized);
    persistLang(normalized);
  }, [persistLang]);

  const t = useCallback(key => I18N[lang]?.[key] || I18N.en[key] || key, [lang]);

  const token       = auth?.access_token;
  const currentUser = auth?.user;
  const isAdmin     = currentUser?.role === 'admin';
  const canOperate  = ['admin', 'operator'].includes(currentUser?.role);
  const canDelete   = isAdmin;

  // License and module selection

  // Data hook: app data and loaders
  const data = useAppData({ token, API, t, isAdmin });

  // UI hook: tabs, modals, notifications
  const ui = useUIState();

  // Destructure for backward compat with the rest of App.jsx
  const {
    events, setEvents, eventsPage, setEventsPage, eventsTotal, setEventsTotal,
    eventsLoading, eventsError,
    persons, personsLoading, personsError,
    stats, cameras, usersList, auditLogs,
    attendance, attendancePerson, setAttendancePerson,
    attendanceGroup, setAttendanceGroup,
    attendanceView, setAttendanceView,
    inoutFilter, setInoutFilter,
    inoutRefreshAt, setInoutRefreshAt,
    auditView, setAuditView,
    personHistory, setPersonHistory, historyLoading, historyLoadingMore,
    loadUsers, loadCameras, loadAuditLogs,
    openPersonHistory, loadMoreHistory, resetAll,
  } = data;

  const {
    tab, setTab,
    mobileMenuOpen, setMobileMenuOpen,
    settingsOpen, setSettingsOpen,
    previewImage, setPreviewImage,
    confirmState, setConfirmState, showConfirm,
    searchResults, setSearchResults,
    searching, setSearching,
    showBulkImport, setShowBulkImport,
    autoEditCameraId, setAutoEditCameraId,
    showExportMenu, setShowExportMenu,
    cameraView, setCameraView,
    cameraSubView, setCameraSubView,
    eventAdminView, setEventAdminView,
    personViewFilter, setPersonViewFilter,
    occupancyWsData, setOccupancyWsData,
    notifications, setNotifications, notifOpen, setNotifOpen, unreadCount,
  } = ui;

  const soundEnabled = useAppStore(s => s.soundEnabled);
  const setSoundEnabled = useAppStore(s => s.setSoundEnabled);
  const eventPopupEnabled = useAppStore(s => s.eventPopupEnabled);
  const setEventPopupEnabled = useAppStore(s => s.setEventPopupEnabled);
  const eventSoundSettings = useAppStore(s => s.eventSoundSettings);
  const setEventSoundSettings = useAppStore(s => s.setEventSoundSettings);

  const authFetch = apiFetch;

  const {
    licenseStatus,
    licenseLoading,
    appSection,
    setAppSection,
    selectAppSection,
    activateLicense,
    activateLicenseCode,
  } = useLicenseStatus({ token, authFetch });

  const resetAuthenticatedData = useCallback(() => {
    resetAll();
  }, [resetAll]);

  const logout = useCallback(async () => {
    const accessToken = auth?.access_token;
    const refreshToken = auth?.refresh_token;
    if (accessToken) {
      try {
        await authFetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken || '' }),
          skipAuthRefresh: true,
        });
      } catch {
        // Local logout must still complete when the API is unavailable.
      }
    }
    clearAuth();
    resetAuthenticatedData();
    setAppSection(null);
  }, [auth?.access_token, auth?.refresh_token, authFetch, clearAuth, resetAuthenticatedData, setAppSection]);

  useAppSettings(token);
  useAuthSession({
    token,
    refreshToken: auth?.refresh_token,
    clearAuth,
    logout,
    t,
  });

  const downloadExport = async (endpoint, fallbackName) => {
    if (!isAdmin) {
      toast.warn(t('exportAdminOnly'));
      return;
    }

    try {
      const res = await authFetch(API + endpoint);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.detail || t('exportFailed'));
        return;
      }

      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') || '';
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const filename = match?.[1] || fallbackName;

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      toast.success(t('exportDownloaded'));
    } catch (e) {
      toast.error(t('exportConnectionFailed'));
    }
  };

  // Data loader aliases for the existing screen code
  // Data hook: app data and loaders
  const load = useCallback(() => data.load(tab), [data, tab]);

  // Delegate paginated history loading to useAppData.
  const loadMorePersonHistory = useCallback(async () => {
    const personId = personHistory?.person?.id;
    const offset   = personHistory?.events?.length || 0;
    if (!personId || historyLoadingMore || !personHistory?.pagination?.has_more) return;
    await data.loadMoreHistory(personId, offset);
  }, [data, historyLoadingMore, personHistory]);

  const { wsStatus, liveAlert, liveMapEvent } = useAppWebSocket({
    auth,
    API,
    authFetch,
    eventPopupEnabled,
    soundEnabled,
    eventSoundSettings,
    load,
    loadCameras,
    setAutoEditCameraId,
    setInoutRefreshAt,
    setOccupancyWsData,
    setNotifications,
    setTab,
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-lang', lang);
  }, [lang]);

  useEffect(() => {
    if (!auth) return;

    load();

    const pollTimer = setInterval(() => {
      // Skip polling when WebSocket is live; WS already triggers load() on new events
      if (wsStatus === 'connected') return;
      if (['dashboard', 'attendance', 'events', 'persons'].includes(tab)) {
        load();
      }
    }, 30000); // 30s fallback polling (only when WS disconnected)

    return () => clearInterval(pollTimer);
  }, [attendancePerson, attendanceGroup, auth, tab, wsStatus, eventsPage]);

  useEffect(() => {
    if (tab === 'users') loadUsers();
    if (tab === 'cameras' || tab === 'live-view') loadCameras();
    if (tab === 'audit') loadAuditLogs();
  }, [tab, auth]);

  const onLogin = data => {
    setAuth(data);
    setTab('dashboard');
    // Request browser notification permission after login
    requestNotificationPermission();
  };

  const requestLogout = () => {
    showConfirm(t('logoutConfirm'), logout, {
      confirmLabel: t('logoutConfirmAction'),
      cancelLabel: t('cancel'),
      danger: false,
    });
  };

  const updateFace = async (id, file) => {
    if (!canOperate) { toast.warn(t('viewerCannotEdit')); return; }
    const fd = new FormData();
    fd.append('file', file);
    const res = await authFetch(API + `/api/persons/${id}/update-face`, { method: 'POST', body: fd });
    if (res.ok) { toast.success(t('faceUpdated')); load(); }
    else { const d = await res.json().catch(() => ({})); toast.error(d.detail || t('faceUpdateFailed')); }
  };

  const updatePerson = async (id, patch) => {
    if (!canOperate) {
      toast.warn(t('viewerCannotEdit'));
      return;
    }

    await authFetch(API + '/api/persons/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });

    load();
  };

  const deletePerson = id => {
    if (!canDelete) { toast.warn(t('adminOnlyDeletePersons')); return; }
    showConfirm(t('deletePersonConfirm'), async () => {
      await authFetch(API + '/api/persons/' + id, { method: 'DELETE' });
      load();
    });
  };

  const delEvent = id => {
    if (!canDelete) { toast.warn(t('adminOnlyDeleteEvents')); return; }
    showConfirm(t('deleteEventConfirm'), async () => {
      await authFetch(API + '/api/events/' + id, { method: 'DELETE' });
      load();
    });
  };

  const searchByPicture = async file => {
    if (!file) {
      toast.warn('Choose image');
      return;
    }

    setSearching(true);
    setSearchResults(null);

    const fd = new FormData();
    fd.append('file', file);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      const res = await authFetch(API + '/api/search/by-picture?limit=300&threshold=0.25', {
        method: 'POST',
        body: fd,
        signal: controller.signal
      });

      clearTimeout(timeout);

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.detail || 'Search failed');
      } else {
        setSearchResults(data);
      }
    } catch (e) {
      toast.error('Search timeout or backend busy. Try smaller image.');
    } finally {
      setSearching(false);
    }
  };

  const openStatSection = (section, filter = 'all') => {
    if (section === 'events') {
      setTab('events');
      return;
    }

    if (section === 'persons') {
      setPersonViewFilter(filter);
      setTab('persons');
      return;
    }

    if (section === 'attendance') {
      setAttendanceGroup(filter);
      setTab('attendance');
      return;
    }

    if (section === 'cameras') {
      setTab('cameras');
      return;
    }

    if (section === 'inout') {
      setInoutFilter(filter !== 'all' ? filter : 'inside');
      setTab('inout');
      return;
    }

    setTab(section);
  };

  const uniqueEventCameras = [...new Set(events.map(e => e.camera_name).filter(Boolean))].sort();

  const visiblePersons =
    personViewFilter === 'all'
      ? persons
      : persons.filter(p => p.person_type === personViewFilter);

  if (window.location.pathname.replace(/\/+$/, '') === '/visitor-kiosk') {
    return <Suspense fallback={<div className="al-empty">Loading visitor kiosk...</div>}><VisitorKiosk /></Suspense>;
  }

  if (!auth) {
    return (
      <I18nContext.Provider value={{ lang, setLang }}>
        <ToastContainer />
        <LoginScreenPro
          API={API}
          onLogin={onLogin}
          theme={theme}
          setTheme={setTheme}
          t={t}
          langSelector={<LangSelector />}
        />
      </I18nContext.Provider>
    );
  }

  // Launcher screen
  if (appSection === null) {
    return (
      <I18nContext.Provider value={{ lang, setLang }}>
        <ToastContainer />
        <AppLauncher
          user={currentUser}
          licenseStatus={licenseStatus}
          licenseLoading={licenseLoading}
          onActivateLicense={activateLicense}
          onActivateLicenseCode={activateLicenseCode}
          onSelect={selectAppSection}
          onLogout={logout}
        />
      </I18nContext.Provider>
    );
  }

  // ACS section
  if (appSection === 'acs') {
    return (
      <I18nContext.Provider value={{ lang, setLang }}>
        <ToastContainer />
        <Suspense fallback={<div className="acs-loading-main">Loading...</div>}>
          <AcsApp
            token={token}
            user={currentUser}
            isAdmin={isAdmin}
            onBack={() => setAppSection(null)}
            onLogout={logout}
          />
        </Suspense>
      </I18nContext.Provider>
    );
  }

  if (appSection === 'security') {
    return (
      <I18nContext.Provider value={{ lang, setLang }}>
        <ToastContainer />
        <Suspense fallback={<div className="acs-loading-main">Loading...</div>}>
          <SecurityCenter
            token={token}
            user={currentUser}
            onBack={() => setAppSection(null)}
            onOpenFace={() => setAppSection('face')}
            onOpenAcs={() => setAppSection('acs')}
          />
        </Suspense>
      </I18nContext.Provider>
    );
  }

  // Face Analytics section
  return (
    <I18nContext.Provider value={{ lang, setLang }}>
    <div className="app">
      <ToastContainer />
      <AppOverlays
        authFetch={authFetch}
        canOperate={canOperate}
        confirmState={confirmState}
        eventPopupEnabled={eventPopupEnabled}
        historyLoading={historyLoading}
        historyLoadingMore={historyLoadingMore}
        liveAlert={liveAlert}
        load={load}
        loadMorePersonHistory={loadMorePersonHistory}
        personHistory={personHistory}
        previewImage={previewImage}
        setConfirmState={setConfirmState}
        setPersonHistory={setPersonHistory}
        setPreviewImage={setPreviewImage}
        t={t}
      />

      {/* Mobile hamburger button */}
      <button
        className="mobile-hamburger"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        aria-label="Toggle menu"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {mobileMenuOpen ? (
            <>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </>
          ) : (
            <>
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </>
          )}
        </svg>
      </button>

      {/* Backdrop */}
      <div
        className={`sidebar-backdrop ${mobileMenuOpen ? 'open' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
      />

      <AppSidebar
        isAdmin={isAdmin}
        mobileMenuOpen={mobileMenuOpen}
        openStatSection={openStatSection}
        setAppSection={setAppSection}
        setMobileMenuOpen={setMobileMenuOpen}
        setSettingsOpen={setSettingsOpen}
        setTab={setTab}
        settingsOpen={settingsOpen}
        tab={tab}
        t={t}
        wsStatus={wsStatus}
      />

      <main>
        <AppHeader
          currentUser={currentUser}
          notifications={notifications}
          notifOpen={notifOpen}
          requestLogout={requestLogout}
          setNotifOpen={setNotifOpen}
          setNotifications={setNotifications}
          setSoundEnabled={setSoundEnabled}
          setTheme={setTheme}
          soundEnabled={soundEnabled}
          t={t}
          tab={tab}
          theme={theme}
          unreadCount={unreadCount}
          wsStatus={wsStatus}
        />

        <div className={`main-content${['map', 'live-view'].includes(tab) ? ' main-content-full' : ''}`}>

        {tab === 'dashboard' && (
          <DashboardView
            authFetch={authFetch}
            cameras={cameras}
            canDelete={canDelete}
            delEvent={delEvent}
            events={events}
            inoutRefreshAt={inoutRefreshAt}
            isAdmin={isAdmin}
            occupancyWsData={occupancyWsData}
            openPersonHistory={openPersonHistory}
            openStatSection={openStatSection}
            setPreviewImage={setPreviewImage}
            stats={stats}
            t={t}
          />
        )}

        {tab === 'events' && (
          <Suspense fallback={<SkeletonEventGrid />}>
            <EventGridPro
              events={events}
              cameras={uniqueEventCameras}
              page={eventsPage}
              pageSize={EVENTS_PAGE_SIZE}
              totalEvents={eventsTotal}
              onPageChange={setEventsPage}
              delEvent={delEvent}
              setPreviewImage={setPreviewImage}
              canDelete={canDelete}
              openPersonHistory={openPersonHistory}
              loading={eventsLoading}
              error={eventsError}
              onRetry={load}
              t={t}
              API={API}
            />
          </Suspense>
        )}

        {tab === 'event-admin' && isAdmin && (
          <EventAdminView
            authFetch={authFetch}
            eventAdminView={eventAdminView}
            eventPopupEnabled={eventPopupEnabled}
            eventSoundSettings={eventSoundSettings}
            isAdmin={isAdmin}
            setEventAdminView={setEventAdminView}
            setEventPopupEnabled={setEventPopupEnabled}
            setEventSoundSettings={setEventSoundSettings}
            t={t}
            token={auth?.access_token}
            userRole={currentUser?.role}
          />
        )}

        {showBulkImport && canOperate && (
          <Suspense fallback={null}>
            <BulkImportModal
              authFetch={authFetch}
              API={API}
              onClose={() => setShowBulkImport(false)}
              onDone={() => { load(); setShowBulkImport(false); }}
            />
          </Suspense>
        )}

        {tab === 'persons' && (
          <PersonsView
            API={API}
            authFetch={authFetch}
            canDelete={canDelete}
            canOperate={canOperate}
            deletePerson={deletePerson}
            load={load}
            openPersonHistory={openPersonHistory}
            personViewFilter={personViewFilter}
            personsError={personsError}
            personsLoading={personsLoading}
            setPersonViewFilter={setPersonViewFilter}
            setPreviewImage={setPreviewImage}
            setShowBulkImport={setShowBulkImport}
            setTab={setTab}
            t={t}
            updateFace={updateFace}
            updatePerson={updatePerson}
            visiblePersons={visiblePersons}
            Card={Card}
          />
        )}

        {tab === 'register' && (
          <RegisterView
            authFetch={authFetch}
            canOperate={canOperate}
            events={events}
            load={load}
            t={t}
            Card={Card}
          />
        )}

        {tab === 'attendance' && (
          <AttendanceView
            attendance={attendance}
            attendanceGroup={attendanceGroup}
            attendancePerson={attendancePerson}
            attendanceView={attendanceView}
            authFetch={authFetch}
            currentUser={currentUser}
            downloadExport={downloadExport}
            inoutFilter={inoutFilter}
            inoutRefreshAt={inoutRefreshAt}
            isAdmin={isAdmin}
            openPersonHistory={openPersonHistory}
            setAttendanceGroup={setAttendanceGroup}
            setAttendancePerson={setAttendancePerson}
            setAttendanceView={setAttendanceView}
            setPreviewImage={setPreviewImage}
            setShowExportMenu={setShowExportMenu}
            showExportMenu={showExportMenu}
            t={t}
            token={auth?.access_token}
            visiblePersons={visiblePersons}
            Card={Card}
          />
        )}

        {tab === 'analytics' && (
          <AnalyticsView authFetch={authFetch} t={t} />
        )}

        {tab === 'map' && (
          <FloorMapView
            authFetch={authFetch}
            currentUser={currentUser}
            liveMapEvent={liveMapEvent}
            persons={persons}
          />
        )}


        {tab === 'search' && (
          <SearchView
            searchByPicture={searchByPicture}
            searching={searching}
            searchResults={searchResults}
            setPreviewImage={setPreviewImage}
            openPersonHistory={openPersonHistory}
            t={t}
            API={API}
          />
        )}

        {tab === 'live-view' && (
          <LiveView cameras={cameras} token={auth?.access_token} />
        )}

        {tab === 'cameras' && (
          <CamerasView
            authFetch={authFetch}
            autoEditCameraId={autoEditCameraId}
            cameraSubView={cameraSubView}
            cameraView={cameraView}
            cameras={cameras}
            currentUser={currentUser}
            isAdmin={isAdmin}
            loadCameras={loadCameras}
            setAutoEditCameraId={setAutoEditCameraId}
            setCameraSubView={setCameraSubView}
            setCameraView={setCameraView}
            showConfirm={showConfirm}
            t={t}
            token={auth?.access_token}
          />
        )}

        {tab === 'users' && isAdmin && (
          <UsersView
            authFetch={authFetch}
            currentUser={currentUser}
            isAdmin={isAdmin}
            loadUsers={loadUsers}
            showConfirm={showConfirm}
            usersList={usersList}
          />
        )}

        {tab === 'audit' && isAdmin && (
          <AuditView
            auditLogs={auditLogs}
            auditView={auditView}
            authFetch={authFetch}
            isAdmin={isAdmin}
            loadAuditLogs={loadAuditLogs}
            logout={logout}
            setAuditView={setAuditView}
            t={t}
            token={auth?.access_token}
          />
        )}




        </div>{/* /main-content */}
      </main>
    </div>
    </I18nContext.Provider>
  );
}

class ErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '40px', textAlign: 'center', color: '#f87171' }}>
          <h2>Something went wrong</h2>
          <pre style={{ fontSize: '12px', color: '#9ca3af', marginTop: '12px' }}>
            {this.state.error?.message}
          </pre>
          <button
            style={{ marginTop: '20px', padding: '8px 20px', cursor: 'pointer' }}
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <Suspense fallback={<div className="history-loading">Loading...</div>}>
      <App />
    </Suspense>
  </ErrorBoundary>
);
