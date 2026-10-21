import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BellRing, Check, CheckCircle2, Clock3, Filter, Search, ShieldAlert, UserCheck, Video, Archive, X } from 'lucide-react';

const COPY = {
  ru: {
    title: 'Центр тревог', hint: 'Очередь тревог, назначение операторов и контроль обработки.', queue: 'Очередь тревог', details: 'Карточка тревоги',
    search: 'Поиск по событию, человеку или устройству…', all: 'Все', active: 'Активные', new: 'Новые', progress: 'В работе', closed: 'Закрытые',
    critical: 'Критично', attention: 'Требует внимания', normal: 'Обычный', priority: 'Приоритет', status: 'Статус', operator: 'Оператор', comment: 'Комментарий',
    save: 'Сохранить', acknowledge: 'Принять в работу', closeAlarm: 'Закрыть тревогу', reopen: 'Открыть снова', selected: 'Выбрано',
    openVideo: 'Открыть видео', openArchive: 'Открыть архив', openAccess: 'Событие доступа', source: 'Источник', time: 'Время', elapsed: 'Прошло',
    noAlarms: 'Тревог по выбранным условиям нет.', bulkAcknowledge: 'Принять выбранные', bulkClose: 'Закрыть выбранные', unknown: 'Неизвестная персона',
    commentHint: 'Опишите выполненные действия или решение…', unassigned: 'Не назначен', close: 'Закрыть', minutes: 'мин', hours: 'ч',
  },
  en: {
    title: 'Alarm Center', hint: 'Alarm queue, operator assignment, and response tracking.', queue: 'Alarm queue', details: 'Alarm card',
    search: 'Search event, person, or device…', all: 'All', active: 'Active', new: 'New', progress: 'In progress', closed: 'Closed',
    critical: 'Critical', attention: 'Needs attention', normal: 'Normal', priority: 'Priority', status: 'Status', operator: 'Operator', comment: 'Comment',
    save: 'Save', acknowledge: 'Acknowledge', closeAlarm: 'Close alarm', reopen: 'Reopen', selected: 'Selected',
    openVideo: 'Open video', openArchive: 'Open archive', openAccess: 'Access event', source: 'Source', time: 'Time', elapsed: 'Elapsed',
    noAlarms: 'No alarms match the selected filters.', bulkAcknowledge: 'Acknowledge selected', bulkClose: 'Close selected', unknown: 'Unknown person',
    commentHint: 'Describe the action taken or the decision…', unassigned: 'Unassigned', close: 'Close', minutes: 'min', hours: 'h',
  },
  hy: {
    title: 'Տագնապների կենտրոն', hint: 'Տագնապների հերթ, օպերատորի նշանակում և արձագանքի վերահսկում։', queue: 'Տագնապների հերթ', details: 'Տագնապի քարտ',
    search: 'Որոնել իրադարձություն, անձ կամ սարք…', all: 'Բոլորը', active: 'Ակտիվ', new: 'Նոր', progress: 'Ընթացքի մեջ', closed: 'Փակված',
    critical: 'Կրիտիկական', attention: 'Ուշադրություն է պահանջում', normal: 'Սովորական', priority: 'Առաջնահերթություն', status: 'Կարգավիճակ', operator: 'Օպերատոր', comment: 'Մեկնաբանություն',
    save: 'Պահպանել', acknowledge: 'Ընդունել աշխատանքի', closeAlarm: 'Փակել տագնապը', reopen: 'Կրկին բացել', selected: 'Ընտրված է',
    openVideo: 'Բացել տեսանյութը', openArchive: 'Բացել արխիվը', openAccess: 'Մուտքի իրադարձություն', source: 'Աղբյուր', time: 'Ժամանակ', elapsed: 'Անցել է',
    noAlarms: 'Ընտրված պայմաններով տագնապներ չկան։', bulkAcknowledge: 'Ընդունել ընտրվածները', bulkClose: 'Փակել ընտրվածները', unknown: 'Անհայտ անձ',
    commentHint: 'Նշեք կատարված գործողությունը կամ որոշումը…', unassigned: 'Նշանակված չէ', close: 'Փակել', minutes: 'ր', hours: 'ժ',
  },
};

function elapsed(value, t) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes} ${t.minutes}`;
  return `${Math.floor(minutes / 60)} ${t.hours} ${minutes % 60} ${t.minutes}`;
}

export default function AlarmCenterPanel({ events, lang, user, metadata, onUpdate, getSeverity, getTitle, getTime, onOpenVideo, onOpenArchive, onOpenAccess, onClose }) {
  const t = COPY[lang] || COPY.en;
  const [view, setView] = useState('active');
  const [query, setQuery] = useState('');
  const [severity, setSeverity] = useState('all');
  const [checked, setChecked] = useState([]);
  const [focusedId, setFocusedId] = useState('');
  const [draft, setDraft] = useState({ assignee: '', comment: '', priority: 'attention' });

  const alarms = useMemo(() => events.filter(event => getSeverity(event) !== 'normal').map(event => {
    const id = String(event?.id || `${event?.event_type || 'alarm'}-${event?.created_at || ''}-${event?.device_name || ''}`);
    const meta = metadata[id] || {};
    return { id, event, meta, status: meta.status || 'new', priority: meta.priority || getSeverity(event) };
  }), [events, metadata, getSeverity]);

  const visible = useMemo(() => alarms.filter(item => {
    const needle = query.trim().toLowerCase();
    const matchesQuery = !needle || [getTitle(item.event), item.event.person_name, item.event.device_name, item.event.event_type].some(value => String(value || '').toLowerCase().includes(needle));
    const matchesView = view === 'all' || (view === 'active' ? item.status !== 'closed' : item.status === view);
    return matchesQuery && matchesView && (severity === 'all' || item.priority === severity);
  }), [alarms, getTitle, query, severity, view]);

  const focused = visible.find(item => item.id === focusedId) || alarms.find(item => item.id === focusedId) || visible[0] || null;

  useEffect(() => {
    if (!focused) {
      setFocusedId('');
      return;
    }
    if (focused.id !== focusedId) setFocusedId(focused.id);
  }, [focused, focusedId]);

  useEffect(() => {
    if (!focused) return;
    setDraft({ assignee: focused.meta.assignee || '', comment: focused.meta.comment || '', priority: focused.priority });
  }, [focused?.id, focused?.meta.assignee, focused?.meta.comment, focused?.priority]);

  const updateFocused = patch => {
    if (!focused) return;
    onUpdate(focused.id, { ...patch, assignee: draft.assignee.trim(), comment: draft.comment.trim(), priority: draft.priority });
  };
  const toggleChecked = id => setChecked(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  const updateChecked = status => {
    checked.forEach(id => onUpdate(id, { status, assignee: status === 'in_progress' ? (metadata[id]?.assignee || user?.username || 'admin') : metadata[id]?.assignee || '' }));
    setChecked([]);
  };
  const statusText = status => ({ new: t.new, in_progress: t.progress, closed: t.closed }[status] || t.new);
  const priorityText = priority => ({ critical: t.critical, attention: t.attention, normal: t.normal }[priority] || t.attention);

  return (
    <div className="alarm-center-overlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="alarm-center-dialog" role="dialog" aria-modal="true" aria-label={t.title}>
        <header className="alarm-center-header">
          <div><span className="alarm-center-icon"><BellRing size={21} /></span><div><p>{t.queue}</p><h2>{t.title}</h2><small>{t.hint}</small></div></div>
          <button className="sc-dialog-close" onClick={onClose} aria-label={t.close}><X size={20} /></button>
        </header>
        <div className="alarm-center-tools">
          <label className="alarm-center-search"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={t.search} /></label>
          <div className="alarm-center-tabs">{[['active', t.active], ['new', t.new], ['in_progress', t.progress], ['closed', t.closed], ['all', t.all]].map(([value, label]) => <button key={value} className={view === value ? 'is-active' : ''} onClick={() => setView(value)}>{label}</button>)}</div>
          <label className="alarm-center-severity"><Filter size={15} /><select value={severity} onChange={event => setSeverity(event.target.value)}><option value="all">{t.all}</option><option value="critical">{t.critical}</option><option value="attention">{t.attention}</option><option value="normal">{t.normal}</option></select></label>
        </div>
        <div className="alarm-center-workspace">
          <aside className="alarm-center-queue">
            <div className="alarm-center-queue-head"><span>{t.selected}: {checked.length}</span><div><button onClick={() => updateChecked('in_progress')} disabled={!checked.length}><Check size={14} /> {t.bulkAcknowledge}</button><button onClick={() => updateChecked('closed')} disabled={!checked.length}><CheckCircle2 size={14} /> {t.bulkClose}</button></div></div>
            <div className="alarm-center-list">
              {visible.map(item => <article className={`alarm-center-row ${item.priority}${focused?.id === item.id ? ' is-active' : ''}`} key={item.id} onClick={() => setFocusedId(item.id)}>
                <input type="checkbox" checked={checked.includes(item.id)} onClick={event => event.stopPropagation()} onChange={() => toggleChecked(item.id)} aria-label={getTitle(item.event)} />
                <span className="alarm-center-severity-dot"><AlertTriangle size={16} /></span>
                <div><strong>{getTitle(item.event)}</strong><small>{item.event.person_name || t.unknown} · {item.event.device_name || 'ACS'}</small><span><Clock3 size={12} /> {getTime(item.event.created_at)} · {elapsed(item.event.created_at, t)}</span></div>
                <b className={`alarm-center-status ${item.status}`}>{statusText(item.status)}</b>
              </article>)}
              {!visible.length && <div className="alarm-center-empty"><ShieldAlert size={33} /><strong>{t.noAlarms}</strong></div>}
            </div>
          </aside>
          <section className="alarm-center-details">
            {!focused ? <div className="alarm-center-empty"><BellRing size={33} /><strong>{t.noAlarms}</strong></div> : <>
              <div className="alarm-center-detail-head"><span className={`alarm-center-severity-dot ${focused.priority}`}><AlertTriangle size={19} /></span><div><p>{t.details}</p><h3>{getTitle(focused.event)}</h3><small>{focused.event.person_name || t.unknown} · {focused.event.device_name || 'ACS'}</small></div><b className={`alarm-center-status ${focused.status}`}>{statusText(focused.status)}</b></div>
              <div className="alarm-center-meta"><div><small>{t.source}</small><strong>{focused.event.device_name || 'ACS'}</strong></div><div><small>{t.time}</small><strong>{getTime(focused.event.created_at)}</strong></div><div><small>{t.elapsed}</small><strong>{elapsed(focused.event.created_at, t)}</strong></div></div>
              <div className="alarm-center-form">
                <label>{t.priority}<select value={draft.priority} onChange={event => setDraft(current => ({ ...current, priority: event.target.value }))}><option value="critical">{t.critical}</option><option value="attention">{t.attention}</option><option value="normal">{t.normal}</option></select></label>
                <label>{t.operator}<input value={draft.assignee} onChange={event => setDraft(current => ({ ...current, assignee: event.target.value }))} placeholder={user?.username || t.unassigned} /></label>
                <label className="wide">{t.comment}<textarea value={draft.comment} onChange={event => setDraft(current => ({ ...current, comment: event.target.value }))} placeholder={t.commentHint} /></label>
              </div>
              <div className="alarm-center-links"><button onClick={onOpenVideo}><Video size={16} /> {t.openVideo}</button><button onClick={onOpenArchive}><Archive size={16} /> {t.openArchive}</button><button onClick={onOpenAccess}><UserCheck size={16} /> {t.openAccess}</button></div>
              <footer className="alarm-center-footer"><button className="alarm-center-save" onClick={() => updateFocused({})}><Check size={16} /> {t.save}</button>{focused.status !== 'closed' && <button className="alarm-center-ack" onClick={() => updateFocused({ status: 'in_progress', assignee: draft.assignee.trim() || user?.username || 'admin' })}><CheckCircle2 size={16} /> {t.acknowledge}</button>}<button className={focused.status === 'closed' ? 'alarm-center-reopen' : 'alarm-center-close'} onClick={() => updateFocused({ status: focused.status === 'closed' ? 'new' : 'closed' })}>{focused.status === 'closed' ? t.reopen : t.closeAlarm}</button></footer>
            </>}
          </section>
        </div>
      </section>
    </div>
  );
}
