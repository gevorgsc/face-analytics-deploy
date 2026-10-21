/**
 * useAppData — extracts all data-fetching state out of App.jsx.
 *
 * Before: App.jsx had 45 useState calls + all fetch logic inline.
 * After:  App.jsx calls this hook and gets clean, organized state + actions.
 */

import { useState, useCallback, useRef } from 'react';
import { apiFetch } from './apiClient';
import { toast } from './useToast';

const EVENTS_PAGE_SIZE = 100;

export function useAppData({ token, API, t, isAdmin }) {
  // ── Events ──────────────────────────────────────────────────────────────────
  const [events,        setEvents]        = useState([]);
  const [eventsPage,    setEventsPage]    = useState(1);
  const [eventsTotal,   setEventsTotal]   = useState(0);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError,   setEventsError]   = useState(null);

  // ── Persons (lightweight list for dashboard/search/map) ────────────────────
  const [persons,        setPersons]        = useState([]);
  const [personsLoading, setPersonsLoading] = useState(false);
  const [personsError,   setPersonsError]   = useState(null);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const [stats, setStats] = useState(null);

  // ── Attendance ─────────────────────────────────────────────────────────────
  const [attendance,       setAttendance]       = useState([]);
  const [attendancePerson, setAttendancePerson] = useState('all');
  const [attendanceGroup,  setAttendanceGroup]  = useState('all');
  const [attendanceView,   setAttendanceView]   = useState('timeline');
  const [inoutFilter,      setInoutFilter]      = useState('inside');
  const [inoutRefreshAt,   setInoutRefreshAt]   = useState(0);

  // ── Users / cameras / audit ────────────────────────────────────────────────
  const [usersList, setUsersList] = useState([]);
  const [cameras,   setCameras]   = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditView, setAuditView] = useState('logs');

  // ── Person history ─────────────────────────────────────────────────────────
  const [personHistory,       setPersonHistory]       = useState(null);
  const [historyLoading,      setHistoryLoading]      = useState(false);
  const [historyLoadingMore,  setHistoryLoadingMore]  = useState(false);

  // ── Refs to prevent stale closures in callbacks ────────────────────────────
  const eventsPageRef      = useRef(eventsPage);
  const attendancePersonRef = useRef(attendancePerson);
  const attendanceGroupRef  = useRef(attendanceGroup);
  eventsPageRef.current       = eventsPage;
  attendancePersonRef.current = attendancePerson;
  attendanceGroupRef.current  = attendanceGroup;

  // ── Main load (tab-aware) ──────────────────────────────────────────────────
  const load = useCallback(async (tab) => {
    if (!token) return;

    const qs = new URLSearchParams();
    if (attendancePersonRef.current !== 'all') qs.set('person_id', attendancePersonRef.current);
    if (attendanceGroupRef.current  !== 'all') qs.set('person_type', attendanceGroupRef.current);

    const needsEvents     = ['dashboard', 'events'].includes(tab);
    const needsPersons    = ['dashboard', 'register', 'attendance', 'search', 'map'].includes(tab);
    const needsStats      = tab === 'dashboard';
    const needsAttendance = tab === 'attendance';

    if (needsEvents)  { setEventsLoading(true);  setEventsError(null); }
    if (needsPersons) { setPersonsLoading(true); setPersonsError(null); }

    try {
      const page = eventsPageRef.current;
      const [er, pr, sr, ar] = await Promise.all([
        needsEvents     ? apiFetch(API + `/api/events?limit=${EVENTS_PAGE_SIZE}&offset=${(page - 1) * EVENTS_PAGE_SIZE}`) : Promise.resolve(null),
        needsPersons    ? apiFetch(API + '/api/persons?limit=500')                                                         : Promise.resolve(null),
        needsStats      ? apiFetch(API + '/api/stats')                                                                     : Promise.resolve(null),
        needsAttendance ? apiFetch(API + '/api/attendance?limit=200&' + qs.toString())                                     : Promise.resolve(null),
      ]);

      if ([er, pr, sr, ar].some(r => r?.status === 401)) return false; // signal logout needed

      if (er) {
        if (!er.ok) setEventsError('Failed to load events');
        else {
          const e = await er.json();
          setEvents(Array.isArray(e) ? e : []);
          setEventsTotal(Number(er.headers.get('X-Total-Count') || (Array.isArray(e) ? e.length : 0)));
        }
      }
      if (pr) {
        if (!pr.ok) setPersonsError('Failed to load persons');
        else { const p = await pr.json(); setPersons(Array.isArray(p) ? p : []); }
      }
      if (sr) { const s = await sr.json(); setStats(s && !s.detail ? s : null); }
      if (ar) { const a = await ar.json(); setAttendance(Array.isArray(a) ? a : []); }
      return true;
    } catch {
      toast.error(t('connectionError'));
      if (needsEvents)  setEventsError('Connection error');
      if (needsPersons) setPersonsError('Connection error');
      return true;
    } finally {
      if (needsEvents)  setEventsLoading(false);
      if (needsPersons) setPersonsLoading(false);
    }
  }, [token, API, t]);

  // ── Secondary loaders ─────────────────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await apiFetch(API + '/api/users');
      const data = await res.json();
      if (res.ok) setUsersList(data);
    } catch { /* non-critical */ }
  }, [isAdmin, API]);

  const loadCameras = useCallback(async () => {
    try {
      const res = await apiFetch(API + '/api/cameras');
      const data = await res.json();
      if (res.ok) setCameras(Array.isArray(data) ? data : []);
      return data;
    } catch { return []; }
  }, [API]);

  const loadAuditLogs = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await apiFetch(API + '/api/audit-logs?limit=300');
      const data = await res.json();
      setAuditLogs(res.ok && Array.isArray(data) ? data : []);
    } catch { setAuditLogs([]); }
  }, [isAdmin, API]);

  const openPersonHistory = useCallback(async (personId) => {
    if (!personId) { toast.error('Person ID not found'); return; }
    setHistoryLoading(true);
    setPersonHistory(null);
    try {
      const res = await apiFetch(`${API}/api/persons/${personId}/history?limit=50`);
      if (res.ok) setPersonHistory(await res.json());
    } catch { /* ignore */ }
    finally { setHistoryLoading(false); }
  }, [API]);

  const loadMoreHistory = useCallback(async (personId, currentOffset) => {
    if (!personId) return;
    setHistoryLoadingMore(true);
    try {
      const res = await apiFetch(`${API}/api/persons/${personId}/history?limit=50&offset=${currentOffset}`);
      if (res.ok) {
        const data = await res.json();
        setPersonHistory(prev => prev ? {
          ...prev,
          events: [...(prev.events || []), ...(data.events || [])],
          has_more: data.has_more,
        } : data);
      }
    } catch { /* ignore */ }
    finally { setHistoryLoadingMore(false); }
  }, [API]);

  // ── Reset on logout ────────────────────────────────────────────────────────
  const resetAll = useCallback(() => {
    setEvents([]); setPersons([]); setAttendance([]);
    setStats(null); setUsersList([]); setCameras([]);
    setPersonHistory(null); setAuditLogs([]);
    setEventsPage(1); setEventsTotal(0);
  }, []);

  return {
    // Events
    events, setEvents, eventsPage, setEventsPage, eventsTotal, setEventsTotal,
    eventsLoading, eventsError,
    // Persons
    persons, setPersons, personsLoading, personsError,
    // Stats / cameras / users / audit
    stats, cameras, usersList, auditLogs, setAuditLogs,
    // Attendance
    attendance, attendancePerson, setAttendancePerson,
    attendanceGroup, setAttendanceGroup,
    attendanceView, setAttendanceView,
    inoutFilter, setInoutFilter,
    inoutRefreshAt, setInoutRefreshAt,
    auditView, setAuditView,
    // Person history
    personHistory, setPersonHistory, historyLoading, historyLoadingMore,
    // Actions
    load, loadUsers, loadCameras, loadAuditLogs,
    openPersonHistory, loadMoreHistory, resetAll,
  };
}

// ── UI-only state hook (tabs, modals, notifications) ─────────────────────────
export function useUIState() {
  const [tab,              setTab]              = useState('dashboard');
  const [mobileMenuOpen,   setMobileMenuOpen]   = useState(false);
  const [settingsOpen,     setSettingsOpen]     = useState(false);
  const [previewImage,     setPreviewImage]     = useState(null);
  const [confirmState,     setConfirmState]     = useState(null);
  const [searchResults,    setSearchResults]    = useState(null);
  const [searching,        setSearching]        = useState(false);
  const [showBulkImport,   setShowBulkImport]   = useState(false);
  const [autoEditCameraId, setAutoEditCameraId] = useState(null);
  const [showExportMenu,   setShowExportMenu]   = useState(false);
  const [cameraView,       setCameraView]       = useState('cameras');
  const [cameraSubView,    setCameraSubView]    = useState('list');
  const [eventAdminView,   setEventAdminView]   = useState('notifications');
  const [personViewFilter, setPersonViewFilter] = useState('all');
  const [personHistory,    setPersonHistoryUI]  = useState(null);
  const [occupancyWsData,  setOccupancyWsData]  = useState(null);
  const [notifications,    setNotifications]    = useState([]);
  const [notifOpen,        setNotifOpen]        = useState(false);
  const unreadCount = notifications.filter(n => !n.read).length;

  const showConfirm = useCallback((message, action, options = {}) => {
    setConfirmState({
      message,
      onConfirm: async () => { setConfirmState(null); await action(); },
      confirmLabel: options.confirmLabel,
      cancelLabel:  options.cancelLabel,
      danger:       options.danger,
    });
  }, []);

  const dismissNotif = useCallback((id) =>
    setNotifications(prev => prev.filter(n => n.id !== id)), []);

  const markAllRead = useCallback(() =>
    setNotifications(prev => prev.map(n => ({ ...n, read: true }))), []);

  const addNotification = useCallback((notif) =>
    setNotifications(prev => [{ id: Date.now(), read: false, ts: Date.now(), ...notif }, ...prev].slice(0, 50)), []);

  return {
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
    personHistory: personHistory, setPersonHistory: setPersonHistoryUI,
    occupancyWsData, setOccupancyWsData,
    notifications, setNotifications, notifOpen, setNotifOpen, unreadCount,
    dismissNotif, markAllRead, addNotification,
  };
}
