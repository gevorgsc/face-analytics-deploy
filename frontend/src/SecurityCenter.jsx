import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Archive,
  AlertTriangle,
  BellRing,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  MessageSquareText,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Users,
  Video,
  WifiOff,
  X,
} from 'lucide-react';
import { API } from './apiConfig';
import { apiFetch } from './apiClient';
import { AcsLangSelector, I18nContext } from './i18n';
import CameraGridView from './CameraGridView';
import SdkArchivePanel from './SdkArchivePanel';
import AlarmCenterPanel from './AlarmCenterPanel';
import './SecurityCenter.css';

const SECURITY_COPY = {
  ru: {
    back: 'К модулям', center: 'Центр безопасности', systemOnline: 'Система онлайн', refresh: 'Обновить',
    eyebrow: 'ОПЕРАТИВНЫЙ ЦЕНТР', title: 'Единая картина безопасности',
    subtitle: 'Тревоги, события доступа, камеры и действия операторов — в одном рабочем окне.',
    acs: 'Управление доступом', activeIncidents: 'Активные инциденты', needsAttention: 'Требуют внимания', noIncidents: 'Новых инцидентов нет',
    controllersOnline: 'Контроллеры онлайн', acsConnected: 'Связь с ACS установлена', noData: 'Нет данных',
    camerasMonitored: 'Камеры под контролем', requiresCheck: 'требуют проверки', noCriticalErrors: 'Критичных ошибок нет',
    faceEvents: 'События лиц сегодня', faceRecent: 'Последние события Face Analytics',
    incidents: 'Инциденты и тревоги', openLog: 'Открыть журнал', noActiveIncidents: 'Нет активных инцидентов',
    noActiveIncidentsHint: 'Новые тревоги доступа будут отображаться здесь.', unknownPerson: 'Неизвестная персона', controller: 'Контроллер',
    deviceHealth: 'Состояние устройств', toCameras: 'К камерам', controllers: 'Контроллеры', cameras: 'Камеры',
    online: 'онлайн', normal: 'В норме', problem: 'проблема', services: 'Связь с сервисами', working: 'Работает',
    recentEvents: 'Последние события', allEvents: 'Все события', noEvents: 'События ещё не загружены',
    active: 'Активные', all: 'Все', closed: 'Закрытые', new: 'Новая', inProgress: 'В работе',
    incidentDetails: 'Карточка инцидента', status: 'Статус', responsible: 'Ответственный', comment: 'Комментарий',
    commentPlaceholder: 'Опишите принятое решение или результат проверки…', save: 'Сохранить', acknowledge: 'Принять в работу',
    closeIncident: 'Закрыть инцидент', reopen: 'Открыть снова', openAccessEvent: 'Открыть событие доступа',
    source: 'Источник', time: 'Время', noComment: 'Комментарий не добавлен', close: 'Закрыть',
    videoMonitoring: 'Видеонаблюдение', liveVideo: 'Live-видео', openVideo: 'Открыть видео', videoWall: 'Рабочее место видеонаблюдения',
    videoWallHint: 'Выберите камеры слева или перетащите их в нужные ячейки.', cameraCount: 'Камер доступно', archive: 'Видеоархив', archiveAction: 'Архив и экспорт',
  },
  en: {
    back: 'Back to modules', center: 'Security Center', systemOnline: 'System online', refresh: 'Refresh',
    eyebrow: 'OPERATIONAL CENTER', title: 'Unified security overview',
    subtitle: 'Alarms, access events, cameras, and operator actions in one workspace.',
    acs: 'Access control', activeIncidents: 'Active incidents', needsAttention: 'Need attention', noIncidents: 'No new incidents',
    controllersOnline: 'Controllers online', acsConnected: 'ACS connection established', noData: 'No data',
    camerasMonitored: 'Cameras monitored', requiresCheck: 'require review', noCriticalErrors: 'No critical errors',
    faceEvents: 'Face events today', faceRecent: 'Latest Face Analytics events',
    incidents: 'Incidents and alarms', openLog: 'Open log', noActiveIncidents: 'No active incidents',
    noActiveIncidentsHint: 'New access alarms will appear here.', unknownPerson: 'Unknown person', controller: 'Controller',
    deviceHealth: 'Device health', toCameras: 'To cameras', controllers: 'Controllers', cameras: 'Cameras',
    online: 'online', normal: 'Normal', problem: 'issue', services: 'Service connection', working: 'Working',
    recentEvents: 'Recent events', allEvents: 'All events', noEvents: 'Events have not loaded yet',
    active: 'Active', all: 'All', closed: 'Closed', new: 'New', inProgress: 'In progress',
    incidentDetails: 'Incident card', status: 'Status', responsible: 'Responsible', comment: 'Comment',
    commentPlaceholder: 'Describe the action taken or the inspection result…', save: 'Save', acknowledge: 'Acknowledge',
    closeIncident: 'Close incident', reopen: 'Reopen', openAccessEvent: 'Open access event',
    source: 'Source', time: 'Time', noComment: 'No comment added', close: 'Close',
    videoMonitoring: 'Video monitoring', liveVideo: 'Live video', openVideo: 'Open video', videoWall: 'Video monitoring workspace',
    videoWallHint: 'Select cameras on the left or drag them into grid cells.', cameraCount: 'Cameras available', archive: 'Video archive', archiveAction: 'Archive and export',
  },
  hy: {
    back: 'Դեպի մոդուլներ', center: 'Անվտանգության կենտրոն', systemOnline: 'Համակարգը առցանց է', refresh: 'Թարմացնել',
    eyebrow: 'ՕՊԵՐԱՏԻՎ ԿԵՆՏՐՈՆ', title: 'Անվտանգության միասնական պատկեր',
    subtitle: 'Տագնապները, մուտքի իրադարձությունները, տեսախցիկները և օպերատորների գործողությունները՝ մեկ պատուհանում։',
    acs: 'Մուտքի կառավարում', activeIncidents: 'Ակտիվ միջադեպեր', needsAttention: 'Պահանջում են ուշադրություն', noIncidents: 'Նոր միջադեպեր չկան',
    controllersOnline: 'Կարգավորիչներ առցանց', acsConnected: 'ACS կապը հաստատված է', noData: 'Տվյալներ չկան',
    camerasMonitored: 'Վերահսկվող տեսախցիկներ', requiresCheck: 'պահանջում են ստուգում', noCriticalErrors: 'Կրիտիկական սխալներ չկան',
    faceEvents: 'Դեմքի իրադարձություններն այսօր', faceRecent: 'Face Analytics-ի վերջին իրադարձությունները',
    incidents: 'Միջադեպեր և տագնապներ', openLog: 'Բացել մատյանը', noActiveIncidents: 'Ակտիվ միջադեպեր չկան',
    noActiveIncidentsHint: 'Մուտքի նոր տագնապները կերևան այստեղ։', unknownPerson: 'Անհայտ անձ', controller: 'Կարգավորիչ',
    deviceHealth: 'Սարքերի վիճակ', toCameras: 'Դեպի տեսախցիկներ', controllers: 'Կարգավորիչներ', cameras: 'Տեսախցիկներ',
    online: 'առցանց', normal: 'Նորմալ է', problem: 'խնդիր', services: 'Ծառայությունների կապ', working: 'Աշխատում է',
    recentEvents: 'Վերջին իրադարձություններ', allEvents: 'Բոլոր իրադարձությունները', noEvents: 'Իրադարձությունները դեռ բեռնված չեն',
    active: 'Ակտիվ', all: 'Բոլորը', closed: 'Փակված', new: 'Նոր', inProgress: 'Ընթացքում',
    incidentDetails: 'Միջադեպի քարտ', status: 'Կարգավիճակ', responsible: 'Պատասխանատու', comment: 'Մեկնաբանություն',
    commentPlaceholder: 'Նշեք ձեռնարկված գործողությունը կամ ստուգման արդյունքը…', save: 'Պահպանել', acknowledge: 'Ընդունել աշխատանքի',
    closeIncident: 'Փակել միջադեպը', reopen: 'Կրկին բացել', openAccessEvent: 'Բացել մուտքի իրադարձությունը',
    source: 'Աղբյուր', time: 'Ժամանակ', noComment: 'Մեկնաբանություն չի ավելացվել', close: 'Փակել',
    videoMonitoring: 'Տեսահսկում', liveVideo: 'Ուղիղ տեսանյութ', openVideo: 'Բացել տեսանյութը', videoWall: 'Տեսահսկման աշխատանքային միջավայր',
    videoWallHint: 'Ընտրեք տեսախցիկները ձախ կողմում կամ քաշեք դրանք վանդակների մեջ։', cameraCount: 'Հասանելի տեսախցիկներ', archive: 'Տեսաարխիվ', archiveAction: 'Արխիվ և արտահանում',
  },
};

function eventSeverity(event) {
  const type = String(event?.event_type || '').toLowerCase();
  if (type.includes('denied') || type.includes('alarm') || type.includes('lockdown')) return 'critical';
  if (type.includes('manual') || type.includes('unknown')) return 'attention';
  return 'normal';
}

function eventTitle(event, lang) {
  const rawType = String(event?.event_type || '').toLowerCase().trim();
  const labels = {
    ru: { access_granted: 'Доступ разрешён', access_denied: 'Доступ запрещён', manual_lock: 'Ручная блокировка', manual_unlock: 'Ручная разблокировка', emergency_lockdown: 'Экстренная блокировка', emergency_open_all: 'Экстренное открытие всех дверей', emergency_open: 'Экстренное открытие', door_opened: 'Дверь открыта', door_closed: 'Дверь закрыта', alarm: 'Тревога' },
    en: { access_granted: 'Access granted', access_denied: 'Access denied', manual_lock: 'Manual lock', manual_unlock: 'Manual unlock', emergency_lockdown: 'Emergency lockdown', emergency_open_all: 'Emergency open all', emergency_open: 'Emergency open', door_opened: 'Door opened', door_closed: 'Door closed', alarm: 'Alarm' },
    hy: { access_granted: 'Մուտքը թույլատրված է', access_denied: 'Մուտքը մերժված է', manual_lock: 'Ձեռքով արգելափակում', manual_unlock: 'Ձեռքով ապաշրջափակում', emergency_lockdown: 'Արտակարգ արգելափակում', emergency_open_all: 'Բոլոր դռների արտակարգ բացում', emergency_open: 'Արտակարգ բացում', door_opened: 'Դուռը բաց է', door_closed: 'Դուռը փակ է', alarm: 'Տագնապ' },
  }[lang] || {};
  if (labels[rawType]) return labels[rawType];
  const type = rawType.replaceAll('_', ' ').trim();
  return type ? type.replace(/\b\w/g, letter => letter.toUpperCase()) : (SECURITY_COPY[lang] || SECURITY_COPY.en).recentEvents;
}

function eventTime(value, lang) {
  if (!value) return '—';
  const locale = lang === 'hy' ? 'hy-AM' : lang === 'ru' ? 'ru-RU' : 'en-GB';
  return new Date(value).toLocaleString(locale, {
    timeZone: 'Asia/Yerevan', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function incidentKey(event) {
  return String(event?.id || `${event?.event_type || 'incident'}-${event?.created_at || ''}-${event?.device_name || ''}`);
}

function readIncidentMeta() {
  try {
    return JSON.parse(window.localStorage.getItem('gsc-security-incidents') || '{}');
  } catch {
    return {};
  }
}

export default function SecurityCenter({ token, user, onBack, onOpenFace, onOpenAcs }) {
  const { lang } = React.useContext(I18nContext);
  const t = SECURITY_COPY[lang] || SECURITY_COPY.en;
  const alarmCenterLabel = { ru: 'Центр тревог', en: 'Alarm Center', hy: 'Տագնապների կենտրոն' }[lang] || 'Alarm Center';
  const [acsSummary, setAcsSummary] = useState({});
  const [acsEvents, setAcsEvents] = useState([]);
  const [cameraHealth, setCameraHealth] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [faceEvents, setFaceEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [incidentMeta, setIncidentMeta] = useState(readIncidentMeta);
  const [incidentView, setIncidentView] = useState('active');
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [incidentDraft, setIncidentDraft] = useState({ assignee: '', comment: '' });
  const [showVideoWall, setShowVideoWall] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [showAlarmCenter, setShowAlarmCenter] = useState(false);

  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [summaryRes, acsEventsRes, healthRes, faceEventsRes, camerasRes] = await Promise.allSettled([
      apiFetch(`${API}/api/acs/monitoring/summary`, { headers }),
      apiFetch(`${API}/api/acs/events/all?limit=40`, { headers }),
      apiFetch(`${API}/api/cameras/health-status`, { headers }),
      apiFetch(`${API}/api/events?limit=40`, { headers }),
      apiFetch(`${API}/api/cameras`, { headers }),
    ]);

    const readJson = async result => {
      if (result.status !== 'fulfilled' || !result.value.ok) return null;
      return result.value.json().catch(() => null);
    };
    const [summary, accessRows, healthRows, faceRows, cameraRows] = await Promise.all([
      readJson(summaryRes), readJson(acsEventsRes), readJson(healthRes), readJson(faceEventsRes), readJson(camerasRes),
    ]);
    if (summary) setAcsSummary(summary);
    if (Array.isArray(accessRows)) setAcsEvents(accessRows);
    if (Array.isArray(healthRows)) setCameraHealth(healthRows);
    if (Array.isArray(cameraRows)) setCameras(cameraRows);
    if (Array.isArray(faceRows?.items)) setFaceEvents(faceRows.items);
    else if (Array.isArray(faceRows)) setFaceEvents(faceRows);
    setUpdatedAt(new Date());
    setLoading(false);
  }, [headers]);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 30000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const incidents = useMemo(() => acsEvents
    .filter(event => eventSeverity(event) !== 'normal')
    .slice(0, 40), [acsEvents]);
  const incidentItems = useMemo(() => incidents.map(event => {
    const id = incidentKey(event);
    return { event, id, meta: incidentMeta[id] || {}, status: incidentMeta[id]?.status || 'new' };
  }), [incidents, incidentMeta]);
  const activeIncidentCount = incidentItems.filter(item => item.status !== 'closed').length;
  const visibleIncidents = incidentItems.filter(item => (
    incidentView === 'all' || (incidentView === 'closed' ? item.status === 'closed' : item.status !== 'closed')
  ));
  const selectedId = selectedIncident ? incidentKey(selectedIncident) : null;
  const selectedMeta = selectedId ? incidentMeta[selectedId] || {} : {};
  const selectedStatus = selectedMeta.status || 'new';
  const unhealthyCameras = cameraHealth.filter(camera => camera?.status && camera.status !== 'online');

  const statusLabel = status => ({ new: t.new, in_progress: t.inProgress, closed: t.closed }[status] || t.new);
  const updateIncident = (id, patch) => {
    setIncidentMeta(current => {
      const next = { ...current, [id]: { ...(current[id] || {}), ...patch, updatedAt: new Date().toISOString() } };
      window.localStorage.setItem('gsc-security-incidents', JSON.stringify(next));
      return next;
    });
  };
  const openIncident = event => {
    const meta = incidentMeta[incidentKey(event)] || {};
    setIncidentDraft({ assignee: meta.assignee || '', comment: meta.comment || '' });
    setSelectedIncident(event);
  };
  const saveIncident = patch => {
    if (!selectedId) return;
    updateIncident(selectedId, { ...patch, assignee: incidentDraft.assignee.trim(), comment: incidentDraft.comment.trim() });
  };

  return (
    <div className="security-center">
      <header className="sc-header">
        <button className="sc-brand" onClick={onBack} title={t.back}>
          <div><ShieldCheck size={23} /></div>
          <span><strong>{t.center}</strong><small>GSC LLC Enterprise</small></span>
        </button>
        <div className="sc-header-actions">
          <span className="sc-live"><i /> {t.systemOnline}</span>
          <span className="sc-time"><Clock3 size={15} /> {updatedAt ? updatedAt.toLocaleTimeString(lang === 'hy' ? 'hy-AM' : lang === 'ru' ? 'ru-RU' : 'en-GB') : '—'}</span>
          <AcsLangSelector />
          <span className="sc-user">{user?.username || 'admin'}</span>
          <button className="sc-refresh" onClick={refresh} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} /> {t.refresh}</button>
        </div>
      </header>

      <main className="sc-main">
        <section className="sc-intro">
          <div>
            <p>{t.eyebrow}</p>
            <h1>{t.title}</h1>
            <span>{t.subtitle}</span>
          </div>
          <div className="sc-quick-actions">
            <button onClick={onOpenAcs}><ShieldCheck size={17} /> {t.acs} <ChevronRight size={15} /></button>
            <button onClick={() => setShowAlarmCenter(true)}><BellRing size={17} /> {alarmCenterLabel} <ChevronRight size={15} /></button>
            <button onClick={() => setShowVideoWall(true)}><Video size={17} /> {t.liveVideo} <ChevronRight size={15} /></button>
            <button onClick={() => setShowArchive(true)}><Archive size={17} /> {t.archiveAction} <ChevronRight size={15} /></button>
            <button onClick={onOpenFace}><Camera size={17} /> Face Analytics Pro <ChevronRight size={15} /></button>
          </div>
        </section>

        <section className="sc-metrics">
          <article><Siren className="critical" /><div><span>{t.activeIncidents}</span><b>{activeIncidentCount}</b><small>{activeIncidentCount ? t.needsAttention : t.noIncidents}</small></div></article>
          <article><ShieldCheck className="success" /><div><span>{t.controllersOnline}</span><b>{acsSummary.active_controllers || 0}</b><small>{acsSummary.active_controllers ? t.acsConnected : t.noData}</small></div></article>
          <article><Camera className="primary" /><div><span>{t.camerasMonitored}</span><b>{cameras.length || cameraHealth.length}</b><small>{unhealthyCameras.length ? `${unhealthyCameras.length} ${t.requiresCheck}` : t.noCriticalErrors}</small></div></article>
          <article><Users className="warning" /><div><span>{t.faceEvents}</span><b>{faceEvents.length}</b><small>{t.faceRecent}</small></div></article>
        </section>

        <section className="sc-grid">
          <article className="sc-panel sc-incidents">
            <div className="sc-panel-head sc-incidents-head">
              <span><BellRing size={17} /> {t.incidents}</span>
              <div className="sc-incidents-actions">
                <div className="sc-filter-tabs" aria-label={t.incidents}>
                  {['active', 'all', 'closed'].map(view => <button key={view} className={incidentView === view ? 'is-active' : ''} onClick={() => setIncidentView(view)}>{t[view]}</button>)}
                </div>
                <button className="sc-open-log" onClick={() => setShowAlarmCenter(true)}>{t.openLog} <ChevronRight size={14} /></button>
              </div>
            </div>
            {!visibleIncidents.length ? (
              <div className="sc-empty"><CheckCircle2 size={34} /><strong>{t.noActiveIncidents}</strong><span>{t.noActiveIncidentsHint}</span></div>
            ) : <div className="sc-scroll-list sc-incidents-list">{visibleIncidents.map(({ event, id, status }) => (
              <button className={`sc-incident ${eventSeverity(event)}`} key={id} onClick={() => openIncident(event)}>
                <span className="sc-severity"><AlertTriangle size={16} /></span>
                <div><strong>{eventTitle(event, lang)}</strong><small>{event.person_name || t.unknownPerson} · {event.device_name || t.controller}</small></div>
                <span className={`sc-incident-status ${status}`}>{statusLabel(status)}</span>
                <time>{eventTime(event.created_at, lang)}</time>
              </button>
            ))}</div>}
          </article>

          <article className="sc-panel sc-health">
            <div className="sc-panel-head"><span><Activity size={17} /> {t.deviceHealth}</span><button onClick={() => setShowVideoWall(true)}>{t.openVideo} <ChevronRight size={14} /></button></div>
            <div className="sc-health-row"><span><i className="ok" /> {t.controllers}</span><b>{acsSummary.active_controllers || 0} {t.online}</b></div>
            <div className="sc-health-row"><span><i className={unhealthyCameras.length ? 'bad' : 'ok'} /> {t.cameras}</span><b>{unhealthyCameras.length ? `${unhealthyCameras.length} ${t.problem}` : t.normal}</b></div>
            <div className="sc-health-row"><span><i className="ok" /> {t.services}</span><b>{t.working}</b></div>
            {unhealthyCameras.slice(0, 3).map(camera => <div className="sc-device-warning" key={camera.id || camera.camera_id}><WifiOff size={14} /> {camera.name || `Камера ${camera.id || camera.camera_id}`}</div>)}
          </article>

          <article className="sc-panel sc-feed">
            <div className="sc-panel-head"><span><Clock3 size={17} /> {t.recentEvents}</span><button onClick={onOpenFace}>{t.allEvents} <ChevronRight size={14} /></button></div>
            <div className="sc-scroll-list sc-feed-list">{acsEvents.map(event => (
              <div className="sc-feed-row" key={event.id}><i className={eventSeverity(event)} /><div><strong>{event.person_name || t.unknownPerson}</strong><small>{eventTitle(event, lang)} · {event.device_name || 'ACS'}</small></div><time>{eventTime(event.created_at, lang)}</time></div>
            ))}</div>
            {!acsEvents.length && <div className="sc-empty compact">{t.noEvents}</div>}
          </article>
        </section>

        {selectedIncident && (
          <div className="sc-incident-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setSelectedIncident(null); }}>
            <section className="sc-incident-dialog" role="dialog" aria-modal="true" aria-label={t.incidentDetails}>
              <header>
                <div><span className={`sc-dialog-icon ${eventSeverity(selectedIncident)}`}><ShieldAlert size={20} /></span><div><p>{t.incidentDetails}</p><h2>{eventTitle(selectedIncident, lang)}</h2></div></div>
                <button className="sc-dialog-close" onClick={() => setSelectedIncident(null)} aria-label={t.close}><X size={20} /></button>
              </header>
              <div className="sc-incident-summary">
                <div><small>{t.source}</small><strong>{selectedIncident.device_name || t.controller}</strong></div>
                <div><small>{t.time}</small><strong>{eventTime(selectedIncident.created_at, lang)}</strong></div>
                <div><small>{t.status}</small><span className={`sc-incident-status ${selectedStatus}`}>{statusLabel(selectedStatus)}</span></div>
              </div>
              <div className="sc-status-options" aria-label={t.status}>
                {['new', 'in_progress', 'closed'].map(status => <button key={status} className={selectedStatus === status ? 'is-active' : ''} onClick={() => saveIncident({ status })}>{statusLabel(status)}</button>)}
              </div>
              <div className="sc-incident-form">
                <label><span>{t.responsible}</span><input value={incidentDraft.assignee} onChange={event => setIncidentDraft(current => ({ ...current, assignee: event.target.value }))} placeholder={user?.username || 'admin'} /></label>
                <label><span>{t.comment}</span><textarea value={incidentDraft.comment} onChange={event => setIncidentDraft(current => ({ ...current, comment: event.target.value }))} placeholder={t.commentPlaceholder} /></label>
              </div>
              <footer>
                <div className="sc-dialog-links">
                  <button className="sc-dialog-link" onClick={onOpenAcs}><ClipboardCheck size={16} /> {t.openAccessEvent}</button>
                  <button className="sc-dialog-link" onClick={() => { setSelectedIncident(null); setShowVideoWall(true); }}><Video size={16} /> {t.openVideo}</button>
                </div>
                <div>
                  {selectedStatus !== 'closed' && <button className="sc-dialog-secondary" onClick={() => saveIncident({ status: 'in_progress', assignee: incidentDraft.assignee.trim() || user?.username || 'admin' })}><Check size={16} /> {t.acknowledge}</button>}
                  <button className={selectedStatus === 'closed' ? 'sc-dialog-secondary' : 'sc-dialog-danger'} onClick={() => saveIncident({ status: selectedStatus === 'closed' ? 'new' : 'closed' })}>{selectedStatus === 'closed' ? t.reopen : t.closeIncident}</button>
                  <button className="sc-dialog-primary" onClick={() => saveIncident({})}><MessageSquareText size={16} /> {t.save}</button>
                </div>
              </footer>
            </section>
          </div>
        )}

        {showAlarmCenter && <AlarmCenterPanel
          events={acsEvents}
          lang={lang}
          user={user}
          metadata={incidentMeta}
          onUpdate={updateIncident}
          getSeverity={eventSeverity}
          getTitle={event => eventTitle(event, lang)}
          getTime={value => eventTime(value, lang)}
          onOpenVideo={() => { setShowAlarmCenter(false); setShowVideoWall(true); }}
          onOpenArchive={() => { setShowAlarmCenter(false); setShowArchive(true); }}
          onOpenAccess={() => { setShowAlarmCenter(false); onOpenAcs(); }}
          onClose={() => setShowAlarmCenter(false)}
        />}

        {showVideoWall && (
          <div className="sc-video-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setShowVideoWall(false); }}>
            <section className="sc-video-dialog" role="dialog" aria-modal="true" aria-label={t.videoWall}>
              <header>
                <div><span className="sc-video-icon"><Video size={20} /></span><div><p>{t.videoMonitoring}</p><h2>{t.videoWall}</h2><small>{t.videoWallHint}</small></div></div>
                <div className="sc-video-header-actions"><button className="sc-video-archive-button" onClick={() => setShowArchive(true)}><Archive size={15} /> {t.archive}</button><span>{t.cameraCount}: <b>{cameras.length}</b></span><button className="sc-dialog-close" onClick={() => setShowVideoWall(false)} aria-label={t.close}><X size={20} /></button></div>
              </header>
              <div className="sc-video-body">
                {cameras.length ? <CameraGridView cameras={cameras} token={token} /> : <div className="sc-empty"><Camera size={34} /><strong>{t.noData}</strong><span>{t.videoWallHint}</span></div>}
              </div>
            </section>
          </div>
        )}
        {showArchive && <SdkArchivePanel cameras={cameras} token={token} lang={lang} onClose={() => setShowArchive(false)} />}
      </main>
    </div>
  );
}
