// AcsApp.jsx - Standalone Access Controller section with its own sidebar + navigation

import React, { Suspense, lazy, useState, useEffect, useCallback, useRef } from 'react';
import {
  ShieldCheck, Server, DoorOpen, List, LayoutDashboard,
  LogOut, Wifi, WifiOff, RefreshCw, X,
  LockOpen, Lock, AlertTriangle, CheckCircle, Activity, Users,
  AlertOctagon, XCircle, Bell, Contact, UserPlus, Shield, CalendarCheck,
  Clock, ArrowRight, UserCheck,
  Ban, KeyRound, UserX, MapPin, ClipboardList, Calendar,
  Building2, BarChart2, Copy, Camera, Smartphone, BarChart3, Upload,
  Moon, Sun, ChevronDown, ChevronRight, Search, Command,
  TrendingUp, TrendingDown, Minus, HelpCircle, BookOpen,
} from 'lucide-react';
import { API } from './apiConfig';
import { apiFetch } from './apiClient';
import { useAppStore } from './store';
import { AcsAutoTranslator, useAcsTr, AcsLangSelector } from './i18n';

// ── Animated counter hook ─────────────────────────────────────────────────────
function useAnimatedCounter(target, duration = 750) {
  const [value, setValue] = useState(0);
  const prevRef = useRef(0);
  useEffect(() => {
    const from = prevRef.current;
    prevRef.current = target;
    if (from === target) return;
    const start = Date.now();
    let raf;
    const tick = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setValue(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

// ── Real-time clock hook ──────────────────────────────────────────────────────
function useClock(tz = 'Asia/Yerevan') {
  const [time, setTime] = useState('');
  useEffect(() => {
    const fmt = () => new Date().toLocaleTimeString('en-US', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
    setTime(fmt());
    const id = setInterval(() => setTime(fmt()), 1000);
    return () => clearInterval(id);
  }, [tz]);
  return time;
}

const AccessControlPanel    = lazy(() => import('./AccessControlPanel'));
const PersonManagement      = lazy(() => import('./PersonManagement'));
const AcsCredentialHealth   = lazy(() => import('./AcsCredentialHealth'));
const AcsEventRetrieval     = lazy(() => import('./AcsEventRetrieval'));
const AccessLevels          = lazy(() => import('./AccessLevels'));
const VisitorManagement     = lazy(() => import('./VisitorManagement'));
const RealTimeMonitoring    = lazy(() => import('./RealTimeMonitoring'));
const AttendanceDashboard   = lazy(() => import('./AttendanceDashboard'));

// Extended ACS modules (Features 1, 3–15)
const AcsAntiPassback       = lazy(() => import('./AcsAntiPassback'));
const AcsDualAuth           = lazy(() => import('./AcsDualAuth'));
const AcsTailgating         = lazy(() => import('./AcsTailgating'));
const AcsGuardTour          = lazy(() => import('./AcsGuardTour'));
const AcsMustering          = lazy(() => import('./AcsMustering'));
const AcsAccessRequests     = lazy(() => import('./AcsAccessRequests'));
const AcsHolidayCalendar    = lazy(() => import('./AcsHolidayCalendar'));
const AcsLiftConfig         = lazy(() => import('./AcsLiftConfig'));
const AcsAuditReport        = lazy(() => import('./AcsAuditReport'));
const AcsBulkImport         = lazy(() => import('./AcsBulkImport'));
const AcsPolicyTemplates    = lazy(() => import('./AcsPolicyTemplates'));
const AcsDoorCamera         = lazy(() => import('./AcsDoorCamera'));
const AcsMobileCards        = lazy(() => import('./AcsMobileCards'));
const AcsOccupancy          = lazy(() => import('./AcsOccupancy'));
const AcsAnalyticsDashboard = lazy(() => import('./AcsAnalyticsDashboard'));

// ── Command Palette (Ctrl + K) ────────────────────────────────────────────────
function CommandPalette({ nav, activeTab, onSelect, onClose, t }) {
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);

  const filtered = q.trim()
    ? nav.filter(n =>
        n.label.toLowerCase().includes(q.toLowerCase()) ||
        (n.section || '').toLowerCase().includes(q.toLowerCase()) ||
        (n.description || '').toLowerCase().includes(q.toLowerCase()) ||
        (n.keywords || '').toLowerCase().includes(q.toLowerCase())
      )
    : nav;

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setCursor(0); }, [q]);

  const go = (id) => { onSelect(id); onClose(); };

  const handleKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
    else if (e.key === 'Enter' && filtered[cursor]) go(filtered[cursor].id);
    else if (e.key === 'Escape') onClose();
  };

  return (
    <div className="acs-cmd-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="acs-cmd-palette">
        <div className="acs-cmd-search">
          <Search size={15} />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={handleKey}
            placeholder={t('acsSearchNavigation')}
            className="acs-cmd-input"
          />
          {q && <button className="acs-cmd-clear" onClick={() => setQ('')}><X size={13} /></button>}
        </div>
        <div className="acs-cmd-results">
          {filtered.length === 0 ? (
            <div className="acs-cmd-empty">{t('acsNoResults')} "<strong>{q}</strong>"</div>
          ) : filtered.map((item, i) => (
            <button
              key={item.id}
              className={`acs-cmd-item${i === cursor ? ' focused' : ''}${activeTab === item.id ? ' current' : ''}`}
              onClick={() => go(item.id)}
              onMouseEnter={() => setCursor(i)}
            >
              <span className="acs-cmd-icon"><item.Icon size={15} /></span>
              <span className="acs-cmd-label">
                <strong>{item.label}</strong>
                {item.description && <small>{item.description}</small>}
              </span>
              {item.section && <span className="acs-cmd-section">{item.section}</span>}
              {item.beta && <span className="acs-nav-beta">{t('acsBeta')}</span>}
              {activeTab === item.id && <span className="acs-cmd-active-dot" />}
            </button>
          ))}
        </div>
        <div className="acs-cmd-footer">
          <span><kbd>↑↓</kbd> {t('acsNavigate')}</span>
          <span><kbd>Enter</kbd> {t('acsOpen')}</span>
          <span><kbd>Esc</kbd> {t('acsClose')}</span>
        </div>
      </div>
    </div>
  );
}

function PageHelpDrawer({ title, section, description, steps, onClose, onDashboard, onSearch, t }) {
  return (
    <div className="acs-help-overlay" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <aside className="acs-help-drawer" role="dialog" aria-modal="true" aria-label={t('acsHelpButton')}>
        <div className="acs-help-drawer-head">
          <span className="acs-help-drawer-icon"><BookOpen size={19} /></span>
          <div>
            <small>{section || t('acsOverview')}</small>
            <h2>{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={t('acsClose')}><X size={17} /></button>
        </div>
        <p className="acs-help-purpose">{description}</p>
        <div className="acs-help-content">
          <h3>{t('acsHelpHowToStart')}</h3>
          <ol>
            {steps.map((step, index) => (
              <li key={`${index}-${step}`}>
                <span>{index + 1}</span>
                <p>{step}</p>
              </li>
            ))}
          </ol>
        </div>
        <div className="acs-help-note">
          <HelpCircle size={15} />
          <span>{t('acsHelpNothingHidden')}</span>
        </div>
        <div className="acs-help-actions">
          <button type="button" className="ghost-btn" onClick={onDashboard}>{t('acsHelpGoDashboard')}</button>
          <button type="button" className="save-btn" onClick={onSearch}><Search size={14} />{t('acsHelpFindFunction')}</button>
        </div>
      </aside>
    </div>
  );
}

// ── Shared confirm dialog ──────────────────────────────────────────────────────

function ConfirmDialog({ message, danger, onConfirm, onCancel }) {
  return (
    <div className="pm-dialog-overlay" onMouseDown={e => e.target === e.currentTarget && onCancel()}>
      <div className="pm-dialog">
        <div className="pm-dialog-header">
          <strong>{danger ? 'Confirm' : 'Notice'}</strong>
          <button className="pm-dialog-close" onClick={onCancel}><X size={16} /></button>
        </div>
        <div className="pm-dialog-body">
          <p className="pm-dialog-msg">{message}</p>
        </div>
        <div className="pm-dialog-footer">
          <button className="ghost-btn" onClick={onCancel}>Cancel</button>
          <button className={danger ? 'danger-btn' : 'save-btn'} onClick={onConfirm}>
            {danger ? 'Confirm' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Emergency button ──────────────────────────────────────────────────────────

function EmergencyBtn({ command, label, isDanger }) {
  const [busy,    setBusy]    = useState(false);
  const [result,  setResult]  = useState(null);
  const [confirm, setConfirm] = useState(false);

  const fire = async () => {
    setBusy(true); setResult(null); setConfirm(false);
    try {
      const res = await apiFetch(`/api/acs/emergency/${command}`, { method: 'POST' });
      const d = await res.json();
      setResult({ ok: res.ok, msg: res.ok ? `Sent to ${d.devices?.length||0} device(s)` : (d.detail||'Failed') });
    } catch (e) {
      setResult({ ok: false, msg: String(e) });
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="acs-emg-btn-wrap">
        <button
          className={isDanger ? 'acs-emg-btn danger' : 'acs-emg-btn safe'}
          onClick={() => setConfirm(true)}
          disabled={busy}
        >
          {busy ? '…' : label}
        </button>
        {result && (
          <span className={`acs-emg-result ${result.ok ? 'ok' : 'err'}`}>{result.msg}</span>
        )}
      </div>
      {confirm && (
        <ConfirmDialog
          message={`Send "${label}" to ALL active ACS devices?`}
          danger={isDanger}
          onConfirm={fire}
          onCancel={() => setConfirm(false)}
        />
      )}
    </>
  );
}


// ── ACS Access Logs ───────────────────────────────────────────────────────────

function AcsOperationsDashboard({ onNavigate }) {
  const t = useAcsTr();
  const tr = (key, values = {}) => Object.entries(values).reduce(
    (value, [name, replacement]) => value.replaceAll(`{${name}}`, String(replacement)),
    t(key),
  );
  const [devices, setDevices] = useState([]);
  const [deviceStatus, setDeviceStatus] = useState({});
  const [events, setEvents] = useState([]);
  const [monitoring, setMonitoring] = useState({});
  const [attendance, setAttendance] = useState(null);
  const [persons, setPersons] = useState([]);
  const [levels, setLevels] = useState([]);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Yerevan' });
      const responses = await Promise.all([
        apiFetch('/api/acs'),
        apiFetch('/api/acs/events/all?limit=50'),
        apiFetch('/api/acs/monitoring/summary'),
        apiFetch('/api/attd/today'),
        apiFetch('/api/acs/person-management/persons'),
        apiFetch(`/api/attd/calculation-summary?date_from=${today}&date_to=${today}`),
        apiFetch('/api/acs/levels'),
      ]);
      const [deviceRes, eventRes, monitoringRes, attendanceRes, personRes, calculationRes, levelRes] = responses;
      if (!deviceRes.ok || !eventRes.ok || !monitoringRes.ok) {
        throw new Error(t('acsDashLoadError'));
      }

      const deviceRows = await deviceRes.json();
      setDevices(deviceRows);
      setEvents(await eventRes.json());
      setMonitoring(await monitoringRes.json());
      if (attendanceRes.ok) setAttendance(await attendanceRes.json());
      if (personRes.ok) setPersons(await personRes.json());
      if (levelRes.ok) setLevels(await levelRes.json());
      if (calculationRes.ok) {
        const calculation = await calculationRes.json();
        setPendingRequests(calculation.pending_requests || 0);
      }

      const statuses = await Promise.allSettled(deviceRows.map(async device => {
        if (!device.is_active) return [device.id, { online: false, disabled: true }];
        const response = await apiFetch(`/api/acs/${device.id}/status`);
        return [device.id, response.ok ? await response.json() : { online: false }];
      }));
      setDeviceStatus(Object.fromEntries(statuses.map((result, index) => (
        result.status === 'fulfilled'
          ? result.value
          : [deviceRows[index].id, { online: false }]
      ))));
      setUpdatedAt(new Date());
    } catch (loadError) {
      setError(loadError?.message || t('acsDashLoadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  const enabledDevices = devices.filter(device => device.is_active);
  const onlineDevices = enabledDevices.filter(device => deviceStatus[device.id]?.online).length;
  const offlineDevices = enabledDevices.length - onlineDevices;
  const syncedPersons = persons.filter(person => person.acs_sync_status === 'synced').length;
  const syncIssues = persons.filter(person => ['error', 'pending'].includes(person.acs_sync_status)).length;
  const attendanceSummary = attendance?.summary || {};
  const presentToday = (attendanceSummary.present || 0) + (attendanceSummary.late || 0);
  const attendanceTotal = attendance?.total || 0;
  const attentionCount = [offlineDevices, syncIssues, monitoring.unknown_today || 0, pendingRequests]
    .filter(value => value > 0).length;
  const attentionSummary = attentionCount
    ? tr('acsDashAttentionCount', { count: attentionCount })
    : t('acsDashAttentionNone');

  const fmtDate = value => value ? new Date(value).toLocaleString('en-US', {
    timeZone: 'Asia/Yerevan', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }) : '-';

  const quickLinks = [
    { id: 'doorcfg', label: t('acsDashCheckDoorsLive'), detail: t('acsDashCheckDoorsDetail'), Icon: Activity },
    { id: 'persons', label: t('acsDashManagePeople'), detail: t('acsDashManagePeopleDetail'), Icon: Users },
    { id: 'levels', label: t('acsDashSetAccessRights'), detail: t('acsDashSetAccessDetail'), Icon: Shield },
    { id: 'access-logs', label: t('acsDashViewPassHistory'), detail: t('acsDashPassHistoryDetail'), Icon: List },
  ];
  const setupSteps = [
    {
      id: 'devices',
      number: 1,
      title: t('acsSetupController'),
      detail: devices.length
        ? tr('acsSetupControllerReady', { count: devices.length })
        : t('acsSetupControllerDetail'),
      done: devices.length > 0,
      Icon: Server,
    },
    {
      id: 'persons',
      number: 2,
      title: t('acsSetupPeople'),
      detail: persons.length
        ? tr('acsSetupPeopleReady', { count: persons.length })
        : t('acsSetupPeopleDetail'),
      done: persons.length > 0,
      Icon: Users,
    },
    {
      id: 'levels',
      number: 3,
      title: t('acsSetupAccess'),
      detail: levels.length
        ? tr('acsSetupAccessReady', { count: levels.length })
        : t('acsSetupAccessDetail'),
      done: levels.length > 0,
      Icon: Shield,
    },
    {
      id: 'doorcfg',
      number: 4,
      title: t('acsSetupMonitor'),
      detail: t('acsSetupMonitorDetail'),
      done: devices.length > 0 && persons.length > 0 && levels.length > 0,
      Icon: Activity,
    },
  ];
  const setupDone = setupSteps.filter(step => step.done).length;

  return (
    <div className="acs-dashboard acs-operations-dashboard">
      <div className="acs-dash-header">
        <div>
          <h2>{t('acsDashTitle')}</h2>
          <p>{t('acsDashSubtitle')}</p>
        </div>
        <div className="acs-dash-refresh">
          <span>{updatedAt ? tr('acsDashUpdated', { time: updatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }) : t('acsDashLoadingStatus')}</span>
          <button className="ghost-btn" onClick={load} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> {t('acsDashRefreshStatus')}
          </button>
        </div>
      </div>

      {error && <div className="acs-dash-error"><AlertTriangle size={15} />{error}</div>}

      {!loading && !error && (
        <div className="acs-dash-headline">
          <div className="acs-dash-hl-left">
            <span className="acs-dash-hl-num">{(monitoring.granted_today || 0) + (monitoring.denied_today || 0)}</span>
            <span className="acs-dash-hl-label">{t('acsDashDoorEventsToday')}</span>
          </div>
          <div className="acs-dash-hl-bar-wrap">
            <div className="acs-dash-hl-bar">
              <div className="acs-dash-hl-seg green" style={{ flex: monitoring.granted_today || 0 }} title={`${monitoring.granted_today || 0} ${t('acsDashGranted')}`} />
              <div className="acs-dash-hl-seg red"   style={{ flex: monitoring.denied_today  || 0 }} title={`${monitoring.denied_today  || 0} ${t('acsDashDenied')}`} />
            </div>
            <div className="acs-dash-hl-legend">
              <span><span className="acs-dash-hl-dot green" />{monitoring.granted_today || 0} {t('acsDashGranted')}</span>
              <span><span className="acs-dash-hl-dot red"   />{monitoring.denied_today  || 0} {t('acsDashDenied')}</span>
            </div>
          </div>
          <div className="acs-dash-hl-right">
            <span className="acs-dash-hl-online">{onlineDevices}/{devices.length}</span>
            <span className="acs-dash-hl-sublabel">{t('acsDashControllersAvailable')}</span>
          </div>
        </div>
      )}

      <div className="acs-dash-stats">
        <DashboardMetric Icon={Server} tone="blue" value={onlineDevices} total={devices.length} label={t('acsDashOnlineControllers')} onClick={() => onNavigate('devices')} />
        <DashboardMetric Icon={CheckCircle} tone="green" value={monitoring.granted_today || 0} label={t('acsDashAllowedToday')} onClick={() => onNavigate('doorcfg')} />
        <DashboardMetric Icon={XCircle} tone="red" value={monitoring.denied_today || 0} label={t('acsDashDeniedAlarm')} onClick={() => onNavigate('doorcfg')} />
        <DashboardMetric Icon={Users} tone="purple" value={syncedPersons} total={persons.length} label={t('acsDashPeopleSynced')} onClick={() => onNavigate('persons')} />
        <DashboardMetric Icon={UserCheck} tone="teal" value={presentToday} total={attendanceTotal} label={t('acsDashInsideToday')} onClick={() => onNavigate('attendance')} />
        <DashboardMetric Icon={Clock} tone="amber" value={pendingRequests} label={t('acsDashOpenRequests')} onClick={() => onNavigate('attendance')} />
      </div>

      <section className="acs-setup-guide" aria-label={t('acsSetupTitle')}>
        <div className="acs-setup-head">
          <div>
            <span className="acs-setup-kicker">{t('acsSetupStartHere')}</span>
            <h3>{t('acsSetupTitle')}</h3>
            <p>{t('acsSetupSubtitle')}</p>
          </div>
          <span className="acs-setup-progress">{setupDone}/4 {t('acsSetupReady')}</span>
        </div>
        <div className="acs-setup-steps">
          {setupSteps.map((step, index) => (
            <React.Fragment key={step.id}>
              <button
                type="button"
                className={`acs-setup-step${step.done ? ' done' : ''}`}
                onClick={() => onNavigate(step.id)}
              >
                <span className="acs-setup-step-icon">
                  {step.done ? <CheckCircle size={18} /> : <step.Icon size={18} />}
                </span>
                <span className="acs-setup-step-copy">
                  <small>{t('acsSetupStep')} {step.number}</small>
                  <strong>{step.title}</strong>
                  <span>{step.detail}</span>
                </span>
                <ArrowRight size={14} className="acs-setup-arrow" />
              </button>
              {index < setupSteps.length - 1 && <span className="acs-setup-connector" aria-hidden="true" />}
            </React.Fragment>
          ))}
        </div>
        <div className="acs-status-legend">
          <strong>{t('acsStatusLegend')}</strong>
          <span><i className="ok" />{t('acsStatusNormal')}</span>
          <span><i className="warn" />{t('acsStatusAttention')}</span>
          <span><i className="danger" />{t('acsStatusCritical')}</span>
          <span><i className="muted" />{t('acsStatusInactive')}</span>
        </div>
      </section>

      <div className="acs-dash-grid">
        <section className="acs-dash-section">
          <DashboardSectionHead title={t('acsDashNeedAttention')} subtitle={attentionSummary} action={t('acsDashReviewControllers')} onClick={() => onNavigate('devices')} />
          <div className="acs-health-list">
            <HealthRow Icon={Wifi} label={t('acsDashDoorControllers')} value={tr('acsDashOnlineOffline', { online: onlineDevices, offline: offlineDevices })} state={offlineDevices ? 'warn' : 'ok'} />
            <HealthRow Icon={Users} label={t('acsDashPeopleCredentials')} value={syncIssues ? tr('acsDashAttentionCount', { count: syncIssues }) : t('acsDashAllSynced')} state={syncIssues ? 'warn' : 'ok'} />
            <HealthRow Icon={UserCheck} label={t('acsDashInsideToday')} value={tr('acsDashPresentAbsent', { present: presentToday, absent: attendanceSummary.absent || 0 })} />
            <HealthRow Icon={AlertTriangle} label={t('acsDashUnknownAttempts')} value={tr('acsDashToday', { count: monitoring.unknown_today || 0 })} state={monitoring.unknown_today ? 'warn' : 'ok'} />
          </div>
        </section>

        <section className="acs-dash-section">
          <DashboardSectionHead title={t('acsDashQuickActions')} subtitle={t('acsDashCommonTasks')} />
          <div className="acs-quick-grid">
            {quickLinks.map(({ id, label, detail, Icon }) => (
              <button key={id} onClick={() => onNavigate(id)}>
                <span className="acs-quick-icon"><Icon size={17} /></span>
                <span><strong>{label}</strong><small>{detail}</small></span>
                <ArrowRight size={14} />
              </button>
            ))}
          </div>
        </section>
      </div>

      <section className="acs-dash-section">
        <DashboardSectionHead title={t('acsDashDoorControllers')} subtitle={t('acsDashDoorControllersDetail')} action={t('acsDashOpenLiveMonitoring')} onClick={() => onNavigate('doorcfg')} />
        {devices.length === 0 ? <p className="acs-empty">{t('acsDashNoControllers')}</p> : (
          <div className="acs-dash-device-grid">
            {devices.map(device => {
              const online   = Boolean(deviceStatus[device.id]?.online);
              const doors    = deviceStatus[device.id]?.doors || [];
              const openDoors = doors.filter(d => d.status === 'open').length;
              return (
                <button
                  key={device.id}
                  className={`acs-dash-device-card acs-device-btn ${!device.is_active ? 'inactive' : ''}`}
                  onClick={() => onNavigate('doorcfg')}
                  title={t('acsDashOpenLiveMonitoring')}
                >
                  <div className={`acs-device-pulse ${online ? 'online' : device.is_active ? 'offline' : 'disabled'}`}>
                    <ShieldCheck size={16} />
                  </div>
                  <div className="acs-device-info">
                    <strong>{device.name}</strong>
                    <span>{device.ip_address} · <em>{(device.control_mode || 'isapi').toUpperCase()}</em> · {tr('acsDashDoorCount', { count: device.door_count })}</span>
                  </div>
                  <div className="acs-device-status-wrap">
                    <span className={`acs-status ${online ? 'online' : device.is_active ? 'offline' : 'disabled'}`}>
                      {online ? <Wifi size={10} /> : <WifiOff size={10} />}
                      {online ? t('acsDashOnline') : device.is_active ? t('acsDashOffline') : t('acsDashDisabled')}
                    </span>
                    {online && openDoors > 0 && (
                      <span className="acs-device-open-doors">{tr('acsDashOpenCount', { count: openDoors })}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="acs-dash-section">
        <DashboardSectionHead title={t('acsDashLatestDoorActivity')} subtitle={t('acsDashLatestDoorDetail')} action={t('acsDashViewLiveActivity')} onClick={() => onNavigate('doorcfg')} />
        {events.length === 0 ? <p className="acs-empty">{t('acsDashNoDoorActivity')}</p> : (
          <div className="acs-dash-events">
            {events.slice(0, 10).map(event => {
              const denied  = event.event_type === 'access_denied' || event.event_type === 'alarm';
              const granted = event.event_type === 'access_granted' || event.event_type === 'manual_unlock';
              const name    = event.person_name || event.card_number || t('acsDashUnknownCardHolder');
              const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
              return (
                <div className={`acs-dash-event ${denied ? 'ev-denied' : granted ? 'ev-granted' : ''}`} key={event.id}>
                  <div className={`acs-ev-avatar ${denied ? 'denied' : granted ? 'granted' : 'neutral'}`}>
                    {initials || '?'}
                  </div>
                  <div className="acs-dash-event-main">
                    <strong>{name}</strong>
                    <span>{event.device_name || t('acsDashController')} · {t('acsDashDoor')} {event.door_no ?? '-'}</span>
                  </div>
                  <span className={`acs-badge ${denied ? 'acs-badge-red' : granted ? 'acs-badge-green' : 'acs-badge-gray'}`}>
                    {granted ? t('acsDashAllowedToday') : denied ? t('acsDashDeniedAlarm') : t('acsDashOtherEvent')}
                  </span>
                  <time>{fmtDate(event.created_at)}</time>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="acs-emg-bar">
        <div className="acs-emg-info">
          <AlertOctagon size={20} className="acs-emg-icon" />
          <div><div className="acs-emg-title">{t('acsDashEmergencyActions')}</div><div className="acs-emg-sub">{t('acsDashEmergencyDescription')}</div></div>
        </div>
        <div className="acs-emg-actions">
          <EmergencyBtn command="lockdown" label={t('acsDashLockAllDoors')} isDanger />
          <EmergencyBtn command="open_all" label={t('acsDashOpenAllDoors')} isDanger={false} />
        </div>
      </div>
    </div>
  );
}

function DashboardMetric({ Icon, tone, value, total, label, onClick, trend }) {
  const animVal   = useAnimatedCounter(value  ?? 0);
  const animTotal = useAnimatedCounter(total  ?? 0);
  return (
    <button className="acs-stat-card acs-metric-card" onClick={onClick}>
      <div className={`acs-stat-icon ${tone}`}><Icon size={20} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="acs-stat-val">
          {animVal}
          {total !== undefined && <small style={{ fontWeight: 500, fontSize: '0.55em', opacity: 0.65 }}> / {animTotal}</small>}
          {trend === 'up'   && <TrendingUp   size={13} style={{ marginLeft: 6, color: 'var(--success)', verticalAlign: 'middle' }} />}
          {trend === 'down' && <TrendingDown size={13} style={{ marginLeft: 6, color: 'var(--danger)',  verticalAlign: 'middle' }} />}
        </div>
        <div className="acs-stat-label">{label}</div>
      </div>
    </button>
  );
}

function DashboardSectionHead({ title, subtitle, action, onClick }) {
  return (
    <div className="acs-dash-section-head">
      <div><h3>{title}</h3><span>{subtitle}</span></div>
      {action && <button onClick={onClick}>{action} <ArrowRight size={13} /></button>}
    </div>
  );
}

function HealthRow({ Icon, label, value, state = '' }) {
  return <div className="acs-health-row"><span><Icon size={15} /> {label}</span><strong className={state}>{value}</strong></div>;
}

const EVENT_BADGE_CLASS = ev => {
  if (!ev) return 'acs-badge-gray';
  if (ev.includes('denied') || ev === 'alarm') return 'acs-badge-red';
  if (ev.includes('unlock') || ev.includes('granted')) return 'acs-badge-green';
  if (ev.includes('door')) return 'acs-badge-blue';
  return 'acs-badge-gray';
};

function AcsLogs() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState(100);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/acs/events/all?limit=${limit}`);
      if (res.ok) setEvents(await res.json());
    } finally { setLoading(false); }
  }, [limit]);

  useEffect(() => { load(); }, [load]);

  const fmtDate = v => v ? new Date(v).toLocaleString('en-US', {
    timeZone: 'Asia/Yerevan', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }) : '—';

  return (
    <div className="acs-panel">
      <div className="acs-panel-header">
        <div className="acs-panel-title"><List size={18} /> Access Logs</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={limit} onChange={e => setLimit(Number(e.target.value))}>
            {[50, 100, 200, 500].map(v => <option key={v} value={v}>Last {v}</option>)}
          </select>
          <button className="ghost-btn" onClick={load} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh Status
          </button>
        </div>
      </div>

      {loading ? (
        <div className="acs-loading-main">Loading…</div>
      ) : events.length === 0 ? (
        <div className="acs-empty-pro" style={{ margin: 0 }}>
          <List size={36} />
          <h3>No access events yet</h3>
          <p>Events will appear here once controllers start recording activity.</p>
        </div>
      ) : (
        <div className="acs-table-wrap">
          <table className="acs-table">
            <thead>
              <tr>
                <th>#</th><th>Time</th><th>Device</th><th>Door</th>
                <th>Type</th><th>Verify Mode</th><th>Person / Card</th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev, i) => (
                <tr key={ev.id}>
                  <td style={{ color: 'var(--muted)', fontSize: 11 }}>{i + 1}</td>
                  <td className="acs-td-time">{fmtDate(ev.created_at)}</td>
                  <td>{ev.device_name || '—'}</td>
                  <td>Door {ev.door_no ?? '—'}</td>
                  <td>
                    <span className={`acs-badge ${EVENT_BADGE_CLASS(ev.event_type)}`}>
                      {ev.event_type?.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--muted)' }}>{ev.verify_mode || '—'}</td>
                  <td>{ev.person_name || ev.card_number || <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── ACS Live Events hook (WebSocket) ─────────────────────────────────────────

function useAcsLiveEvents(token) {
  const [events, setEvents] = useState([]);
  const [badges, setBadges] = useState({ logs: 0, dashboard: 0 });
  const [personRefreshAt, setPersonRefreshAt] = useState(0);
  const [deptRefreshAt, setDeptRefreshAt] = useState(0);
  const [wsStatus, setWsStatus] = useState('connecting');

  useEffect(() => {
    if (!token) return;
    let ws, reconnectTimer, stopped = false;
    let attempts = 0;

    const connect = async () => {
      setWsStatus('connecting');
      try {
        const r = await apiFetch('/api/ws-url');
        if (!r.ok || stopped) return;
        const d = await r.json();
        const origin = API || window.location.origin;
        const u = new URL(d.url, origin);
        u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(u.toString());
        ws.onopen  = () => { attempts = 0; setWsStatus('connected'); };
        ws.onmessage = (msg) => {
          try {
            const ev = JSON.parse(msg.data);
            if (ev.type === 'acs_person_updated' || ev.type === 'acs_person_deleted') {
              setPersonRefreshAt(Date.now());
              return;
            }
            if (ev.type === 'acs_department_updated') {
              setDeptRefreshAt(Date.now());
              return;
            }
            if (ev.type?.startsWith('acs_')) {
              setEvents(prev => [ev, ...prev].slice(0, 30));
              setBadges(b => ({ ...b, logs: b.logs + 1, dashboard: b.dashboard + 1 }));
            }
          } catch (_) {}
        };
        ws.onclose = () => {
          if (!stopped) {
            setWsStatus(attempts === 0 ? 'disconnected' : 'reconnecting');
            const delay = Math.min(Math.pow(2, attempts) * 1000, 30000);
            attempts++;
            reconnectTimer = setTimeout(connect, delay);
          }
        };
      } catch (_) {
        if (!stopped) { setWsStatus('disconnected'); reconnectTimer = setTimeout(connect, 3000); }
      }
    };
    connect();
    return () => { stopped = true; clearTimeout(reconnectTimer); ws?.close(); };
  }, [token]);

  const clearBadge = useCallback((tabId) =>
    setBadges(b => ({ ...b, [tabId]: 0 })), []);

  return { events, badges, clearBadge, personRefreshAt, deptRefreshAt, wsStatus };
}

// ── ACS Live ticker bar ───────────────────────────────────────────────────────

function AcsLiveBar({ events }) {
  if (!events || events.length === 0) return null;
  const latest = events[0];
  const isAlert = latest.type === 'acs_access_denied' || latest.success === false;
  return (
    <div className={`acs-live-bar ${isAlert ? 'alert' : 'ok'}`}>
      <Bell size={12} />
      <span>
        {latest.type === 'acs_face_unlock'   ? `Unlock: ${latest.person_name || 'Unknown'} → Door ${latest.door_no}` :
         latest.type === 'acs_access_denied' ? `DENIED: ${latest.person_name || 'Unknown'}` :
         latest.type === 'acs_emergency'     ? `EMERGENCY: ${latest.command}` :
         `ACS: ${latest.type?.replace('acs_', '')}`}
      </span>
    </div>
  );
}


// ── ACS App (full layout) ─────────────────────────────────────────────────────

const ACS_NAV = [
  { id: 'dashboard',        label: 'Dashboard',            Icon: LayoutDashboard, section: null         },
  { id: 'doorcfg',          label: 'Real Time Monitoring', Icon: Activity,        section: 'Doors'      },
  { id: 'devices',          label: 'Device Management',    Icon: Server,          section: 'Doors'      },
  { id: 'persons',          label: 'Person Management',    Icon: Contact,         section: 'PeopleAccess' },
  { id: 'levels',           label: 'Access Levels',        Icon: Shield,          section: 'PeopleAccess' },
  { id: 'credential-health',label: 'Credential Health',     Icon: UserCheck,       section: 'PeopleAccess' },
  { id: 'visitors',         label: 'Visitor Management',   Icon: UserPlus,        section: 'PeopleAccess' },
  { id: 'bulk-import',      label: 'Bulk Import',          Icon: Upload,          section: 'PeopleAccess' },
  { id: 'attendance',       label: 'Attendance',           Icon: CalendarCheck,   section: 'Workforce'  },
  { id: 'access-requests',  label: 'Access Requests',      Icon: ClipboardList,   section: 'Workforce'  },
  { id: 'anti-passback',    label: 'Anti-Passback',        Icon: Ban,             section: 'Security', beta: true },
  { id: 'dual-auth',        label: 'Dual Auth',            Icon: KeyRound,        section: 'Security', beta: true },
  { id: 'tailgating',       label: 'Tailgating',           Icon: UserX,           section: 'Security', beta: true },
  { id: 'guard-tour',       label: 'Guard Tour',           Icon: MapPin,          section: 'Security', beta: true },
  { id: 'mustering',        label: 'Mustering',            Icon: Users,           section: 'Security'   },
  { id: 'access-logs',      label: 'Access Logs',          Icon: List,            section: 'Insights'   },
  { id: 'analytics',        label: 'Analytics',            Icon: TrendingUp,      section: 'Insights'   },
  { id: 'audit-report',     label: 'Audit Report',         Icon: BarChart2,       section: 'Insights'   },
  { id: 'occupancy',        label: 'Zone Occupancy',       Icon: BarChart3,       section: 'Insights', beta: true },
  { id: 'policy-templates', label: 'Policy Templates',     Icon: Copy,            section: 'Settings'   },
  { id: 'door-camera',      label: 'Door Camera',          Icon: Camera,          section: 'Settings', beta: true },
  { id: 'holidays',         label: 'Holidays',             Icon: Calendar,        section: 'Settings', beta: true },
  { id: 'lift',             label: 'Lift Config',          Icon: Building2,       section: 'Settings', beta: true },
  { id: 'mobile-cards',     label: 'Mobile Cards',         Icon: Smartphone,      section: 'Settings', beta: true },
];

const ACS_NAV_TEXT = {
  dashboard: 'acsNavHome', devices: 'acsNavControllers', doorcfg: 'acsNavLiveDoors',
  persons: 'acsNavPeople', 'credential-health': 'acsNavCredentialCheck', levels: 'acsNavAccessRules',
  visitors: 'acsNavVisitors', 'bulk-import': 'acsNavImportPeople', attendance: 'acsNavAttendance',
  'access-requests': 'acsNavRequests', 'anti-passback': 'acsNavAntiPassback', 'dual-auth': 'acsNavDualAuth',
  tailgating: 'acsNavTailgating', 'guard-tour': 'acsNavGuardTour', mustering: 'acsNavMustering',
  'audit-report': 'acsNavAudit', occupancy: 'acsNavOccupancy', 'access-logs': 'acsNavHistory',
  analytics: 'acsNavAnalytics', holidays: 'acsNavHolidays', lift: 'acsNavLift',
  'policy-templates': 'acsNavPolicies', 'door-camera': 'acsNavDoorCamera', 'mobile-cards': 'acsNavMobileCards',
};
const ACS_SECTION_TEXT = {
  Doors: 'acsSectionDoors', PeopleAccess: 'acsSectionPeopleAccess', Workforce: 'acsSectionWorkforce',
  Security: 'acsSecurity', Insights: 'acsSectionInsights', Settings: 'acsSettings',
};

const TAB_HELP_TEXT = {
  dashboard: 'acsHelpDashboard',
  devices: 'acsHelpDevices',
  doorcfg: 'acsHelpMonitoring',
  persons: 'acsHelpPersons',
  'credential-health': 'acsHelpCredentials',
  levels: 'acsHelpLevels',
  visitors: 'acsHelpVisitors',
  'bulk-import': 'acsHelpBulkImport',
  attendance: 'acsHelpAttendance',
  'access-requests': 'acsHelpRequests',
  'anti-passback': 'acsHelpAntiPassback',
  'dual-auth': 'acsHelpDualAuth',
  tailgating: 'acsHelpTailgating',
  'guard-tour': 'acsHelpGuardTour',
  mustering: 'acsHelpMustering',
  'audit-report': 'acsHelpAudit',
  occupancy: 'acsHelpOccupancy',
  'access-logs': 'acsHelpLogs',
  analytics: 'acsHelpAnalytics',
  holidays: 'acsHelpHolidays',
  lift: 'acsHelpLift',
  'policy-templates': 'acsHelpPolicies',
  'door-camera': 'acsHelpDoorCamera',
  'mobile-cards': 'acsHelpMobileCards',
};

const TAB_GUIDE_TEXT = {
  dashboard: 'acsGuideDashboard',
  devices: 'acsGuideDevices',
  doorcfg: 'acsGuideMonitoring',
  persons: 'acsGuidePersons',
  'credential-health': 'acsGuideCredentials',
  levels: 'acsGuideLevels',
  visitors: 'acsGuideVisitors',
  'bulk-import': 'acsGuideBulkImport',
  attendance: 'acsGuideAttendance',
  'access-requests': 'acsGuideRequests',
  'anti-passback': 'acsGuideAntiPassback',
  'dual-auth': 'acsGuideDualAuth',
  tailgating: 'acsGuideTailgating',
  'guard-tour': 'acsGuideGuardTour',
  mustering: 'acsGuideMustering',
  'audit-report': 'acsGuideAudit',
  occupancy: 'acsGuideOccupancy',
  'access-logs': 'acsGuideLogs',
  analytics: 'acsGuideAnalytics',
  holidays: 'acsGuideHolidays',
  lift: 'acsGuideLift',
  'policy-templates': 'acsGuidePolicies',
  'door-camera': 'acsGuideDoorCamera',
  'mobile-cards': 'acsGuideMobileCards',
};

const TAB_SECTION = Object.fromEntries(ACS_NAV.map(({ id, section }) => [id, section]).filter(([,s]) => s));

const TAB_TITLE = {
  dashboard:          'Dashboard',
  devices:            'Device Management',
  doorcfg:            'Real Time Monitoring',
  persons:            'Person Management',
  'credential-health':'Credential & Apply Health',
  levels:             'Access Levels',
  visitors:           'Visitor Management',
  attendance:         'Time & Attendance',
  'bulk-import':      'Bulk Import',
  'access-requests':  'Access Requests',
  'anti-passback':    'Anti-Passback',
  'dual-auth':        'Dual Authentication',
  tailgating:         'Tailgating',
  'guard-tour':       'Guard Tour',
  mustering:          'Mustering',
  'audit-report':     'Audit Report',
  occupancy:          'Zone Occupancy',
  holidays:           'Holiday Calendar',
  lift:               'Lift Config',
  'policy-templates': 'Policy Templates',
  'door-camera':      'Door Camera',
  'mobile-cards':     'Mobile Cards',
  'access-logs':      'Access Logs',
  analytics:          'ACS Analytics',
};

export default function AcsApp({ token, user, isAdmin, onBack, onLogout }) {
  const t = useAcsTr();
  const [tab, setTab] = useState('dashboard');
  const [cmdOpen, setCmdOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState(() => {
    const defaults = { Security: true, Insights: true, Settings: true };
    try { return { ...defaults, ...JSON.parse(localStorage.getItem('acs-nav-collapsed-v2') || '{}') }; }
    catch { return defaults; }
  });

  const acsNav = ACS_NAV.map(item => ({
    ...item,
    label: t(ACS_NAV_TEXT[item.id]),
    sectionLabel: item.section ? t(ACS_SECTION_TEXT[item.section]) : null,
    description: t(TAB_HELP_TEXT[item.id]),
    guide: t(TAB_GUIDE_TEXT[item.id]).split('|').filter(Boolean),
  }));
  const paletteNav = acsNav.map(({ sectionLabel, ...item }) => ({ ...item, section: sectionLabel }));
  const activeNav = acsNav.find(item => item.id === tab);

  const isFullHeight = tab === 'persons' || tab === 'doorcfg';
  const theme   = useAppStore(s => s.theme);
  const setTheme = useAppStore(s => s.setTheme);
  const clock   = useClock('Asia/Yerevan');
  const { badges, clearBadge, personRefreshAt, deptRefreshAt, wsStatus, events: liveEvents } = useAcsLiveEvents(token);

  const handleTabChange = useCallback((id) => {
    setTab(id);
    setHelpOpen(false);
    clearBadge(id);
    const section = TAB_SECTION[id];
    if (section) {
      setCollapsedSections(prev => {
        if (!prev[section]) return prev;
        const next = { ...prev, [section]: false };
        localStorage.setItem('acs-nav-collapsed-v2', JSON.stringify(next));
        return next;
      });
    }
  }, [clearBadge]);

  const toggleSection = useCallback((section) => {
    setCollapsedSections(prev => {
      const next = { ...prev, [section]: !prev[section] };
      localStorage.setItem('acs-nav-collapsed-v2', JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setCmdOpen(c => !c); }
      if (e.key === 'Escape') {
        setCmdOpen(false);
        setHelpOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="acs-app">
      <AcsAutoTranslator />

      {/* Sidebar — same structure as Face Analytics Pro */}
      <aside className="enterprise-sidebar">
        <button
          type="button"
          className="sidebar-logo acs-launcher-logo"
          onClick={onBack}
          title={t('acsBackToLauncher')}
          aria-label={t('acsBackToLauncher')}
        >
          <div className="sidebar-logo-icon">
            <ShieldCheck size={22} style={{ color: 'white', position: 'relative', zIndex: 1 }} />
          </div>
          <div className="sidebar-logo-text">
            <strong>{t('acsAccessController')}</strong>
            <span>{t('acsEnterprise')}</span>
            <div className="sidebar-logo-badge">
              <span className="slb-dot" />
              {t('acsSecurePlatform')}
            </div>
          </div>
        </button>
        <div className="sidebar-nav-divider" />

        <button className="acs-cmd-trigger" onClick={() => setCmdOpen(true)}>
          <Search size={13} />
          <span>{t('acsSearchNavigation')}</span>
          <kbd><Command size={10} /> K</kbd>
        </button>

        <nav>
          {(() => {
            let lastSection = null;
            return acsNav.map(({ id, label, Icon, section, sectionLabel, beta }) => {
              const showHeader = section !== lastSection;
              lastSection = section;
              const sectionKey = section || 'Overview';
              const isCollapsed = !!collapsedSections[sectionKey];
              const badge = badges[id] || 0;
              return (
                <React.Fragment key={id}>
                  {showHeader && (
                    <button
                      className="nav-section-label nav-section-toggle"
                      onClick={() => toggleSection(sectionKey)}
                    >
                      <span>{sectionLabel || t('acsOverview')}</span>
                      {isCollapsed
                        ? <ChevronRight size={11} />
                        : <ChevronDown  size={11} />
                      }
                    </button>
                  )}
                  {!isCollapsed && (
                    <button
                      className={tab === id ? 'active' : ''}
                      onClick={() => handleTabChange(id)}
                      aria-current={tab === id ? 'page' : undefined}
                    >
                      <Icon size={16} /><span>{label}</span>
                      {beta && <span className="acs-nav-beta">{t('acsBeta')}</span>}
                      {badge > 0 && <span className="acs-nav-badge">{badge > 99 ? '99+' : badge}</span>}
                    </button>
                  )}
                </React.Fragment>
              );
            });
          })()}
        </nav>

        <div className="sidebar-status">
          <div className={`ws-status ws-${wsStatus}`}>
            <span className="ws-dot"></span>
            {wsStatus === 'connected'    && t('acsLive')}
            {wsStatus === 'connecting'   && t('wsConnecting')}
            {wsStatus === 'reconnecting' && t('wsReconnecting')}
            {wsStatus === 'disconnected' && t('wsDisconnected')}
          </div>
          <div><span className="pulse-dot green"></span> Asia/Yerevan</div>
        </div>
        <div className="powered">GSC LLC · {t('acsAccessController')}</div>

      </aside>

      {cmdOpen && (
        <CommandPalette
          nav={paletteNav}
          t={t}
          activeTab={tab}
          onSelect={handleTabChange}
          onClose={() => setCmdOpen(false)}
        />
      )}

      {helpOpen && activeNav && (
        <PageHelpDrawer
          t={t}
          title={activeNav.label}
          section={activeNav.sectionLabel}
          description={activeNav.description}
          steps={activeNav.guide}
          onClose={() => setHelpOpen(false)}
          onDashboard={() => handleTabChange('dashboard')}
          onSearch={() => {
            setHelpOpen(false);
            setCmdOpen(true);
          }}
        />
      )}

      {/* Main — same structure as Face Analytics Pro */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <header className="enterprise-header">
          <div>
            <div className="page-eyebrow acs-breadcrumb">
              <span>{t('acsAccessController')}</span>
              {activeNav?.section && (
                <>
                  <ChevronRight size={11} style={{ opacity: .45, flexShrink: 0 }} />
                  <span>{activeNav.sectionLabel}</span>
                </>
              )}
            </div>
            <h1 className="acs-page-title">{activeNav?.label || t('acsDashboard')}</h1>
            <p className="acs-page-help">{activeNav?.description}</p>
          </div>
          <div className="topbar-actions">
            <div className="acs-header-clock">
              <Clock size={12} />
              <span>{clock}</span>
              <span className="acs-clock-tz">YER</span>
            </div>
            <span className={`top-status ws-status-badge ws-${wsStatus}`}>
              <span></span>
              {wsStatus === 'connected'    && t('acsLive')}
              {wsStatus === 'connecting'   && t('wsConnectingShort')}
              {wsStatus === 'reconnecting' && t('wsReconnectingShort')}
              {wsStatus === 'disconnected' && t('wsOffline')}
            </span>
            <button
              type="button"
              className={`top-icon-btn acs-help-trigger${helpOpen ? ' active' : ''}`}
              onClick={() => setHelpOpen(open => !open)}
              title={t('acsHelpButton')}
              aria-label={t('acsHelpButton')}
              aria-expanded={helpOpen}
            >
              <HelpCircle size={16} />
              <span>{t('acsHelpButton')}</span>
            </button>
            <AcsLangSelector />
            <button
              className="top-icon-btn"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title={theme === 'dark' ? t('lightMode') : t('darkMode')}
            >
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <span className={`role-badge role-${user?.role || 'viewer'}`} title="Current access role">
              {user?.role || 'viewer'}
            </span>
            <button className="top-logout-btn" onClick={onLogout} title={t('logout')}>
              <LogOut size={16} /> {t('logout')}
            </button>
          </div>
        </header>

        <AcsLiveBar events={liveEvents} />
        <div className={`main-content${isFullHeight ? ' main-content-full' : ''}`}
             style={isFullHeight ? { flex: 1, minHeight: 0, overflow: 'hidden', padding: 0 } : {}}>
          <Suspense fallback={<div className="acs-loading-main">Loading…</div>}>
            <div key={tab} className="acs-tab-page">
            {tab === 'dashboard'         && <AcsOperationsDashboard onNavigate={handleTabChange} />}
            {tab === 'devices'           && <AccessControlPanel token={token} isAdmin={isAdmin} />}
            {tab === 'doorcfg'           && <RealTimeMonitoring token={token} />}
            {tab === 'persons'           && <PersonManagement token={token} isAdmin={isAdmin} refreshTrigger={personRefreshAt} deptRefreshTrigger={deptRefreshAt} />}
            {tab === 'credential-health' && <AcsCredentialHealth />}
            {tab === 'levels'            && <AccessLevels token={token} isAdmin={isAdmin} />}
            {tab === 'visitors'          && <VisitorManagement token={token} isAdmin={isAdmin} />}
            {tab === 'attendance'        && <AttendanceDashboard token={token} isAdmin={isAdmin} canOperate />}
            {tab === 'bulk-import'       && <AcsBulkImport token={token} isAdmin={isAdmin} />}
            {tab === 'access-requests'   && <AcsAccessRequests token={token} isAdmin={isAdmin} />}
            {tab === 'anti-passback'     && <AcsAntiPassback token={token} isAdmin={isAdmin} />}
            {tab === 'dual-auth'         && <AcsDualAuth token={token} isAdmin={isAdmin} />}
            {tab === 'tailgating'        && <AcsTailgating token={token} isAdmin={isAdmin} />}
            {tab === 'guard-tour'        && <AcsGuardTour token={token} isAdmin={isAdmin} />}
            {tab === 'mustering'         && <AcsMustering token={token} isAdmin={isAdmin} />}
            {tab === 'audit-report'      && <AcsAuditReport token={token} isAdmin={isAdmin} />}
            {tab === 'occupancy'         && <AcsOccupancy token={token} isAdmin={isAdmin} />}
            {tab === 'holidays'          && <AcsHolidayCalendar token={token} isAdmin={isAdmin} />}
            {tab === 'lift'              && <AcsLiftConfig token={token} isAdmin={isAdmin} />}
            {tab === 'policy-templates'  && <AcsPolicyTemplates token={token} isAdmin={isAdmin} />}
            {tab === 'door-camera'       && <AcsDoorCamera token={token} isAdmin={isAdmin} />}
            {tab === 'mobile-cards'      && <AcsMobileCards token={token} isAdmin={isAdmin} />}
            {tab === 'access-logs'       && <AcsEventRetrieval />}
            {tab === 'analytics'         && <AcsAnalyticsDashboard token={token} />}
            </div>
          </Suspense>
        </div>
      </main>
    </div>
  );
}
