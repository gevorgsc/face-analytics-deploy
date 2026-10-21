import { apiFetch } from './apiClient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronRight, Circle,
  Bell, Clock3, DoorOpen, Filter, History, KeyRound, ListFilter, Lock, LockOpen,
  PanelRightOpen, RefreshCw, Search, Server, ShieldAlert, UserRound, Users,
  Volume2, VolumeX, Wifi, WifiOff, X,
} from 'lucide-react';
import { API } from './apiConfig';
import { mediaUrl } from './mediaUrl';
import { playEventSound, requestNotificationPermission, sendBrowserNotification } from './alertSound';
import { useAcsTr } from './i18n';

const REFRESH_MS = 3000;

function eventLabel(type) {
  return String(type || 'access_event').replaceAll('_', ' ');
}

function eventTone(event) {
  const type = String(event?.event_type || '');
  if (type.includes('denied') || type === 'alarm') return 'danger';
  if (type.includes('granted') || type.includes('unlock')) return 'success';
  if (type.includes('lock')) return 'warning';
  return 'neutral';
}

function formatTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-US', {
    timeZone: 'Asia/Yerevan',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function doorKey(deviceId, doorNo) {
  return `${deviceId}:${doorNo}`;
}

function credentialType(event) {
  const mode = String(event?.verify_mode || '').toLowerCase();
  if (mode.includes('face')) return 'face';
  if (mode.includes('finger')) return 'fingerprint';
  if (mode.includes('card')) return 'card';
  if (mode.includes('pw') || mode.includes('pin')) return 'pin';
  if (mode === 'manual') return 'manual';
  return 'other';
}

function RtmFilterSelect({ value, onChange, options, label }) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const selected = options.find(option => option.value === value) || options[0];

  useEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return undefined;
    }

    const updateMenuPosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = Math.min(360, Math.max(180, window.innerWidth - 24));
      const left = Math.min(
        Math.max(12, rect.left),
        Math.max(12, window.innerWidth - width - 12),
      );
      const measuredHeight = menuRef.current?.getBoundingClientRect().height || 0;
      const menuHeight = measuredHeight || Math.min(320, Math.max(180, window.innerHeight - 24));
      const below = rect.bottom + 8;
      const top = below + menuHeight <= window.innerHeight - 12
        ? below
        : Math.max(12, rect.top - menuHeight - 8);
      setMenuStyle({
        position: 'fixed',
        top,
        left,
        width,
        maxWidth: `calc(100vw - 24px)`,
        zIndex: 2000,
      });
    };

    const frame = window.requestAnimationFrame(updateMenuPosition);
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open]);

  return (
    <div
      className="rtm-filter-select"
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        ref={triggerRef}
        className={open ? 'open' : ''}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(current => !current)}
      >
        <span>{selected.label}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div ref={menuRef} className="rtm-filter-menu" role="listbox" style={menuStyle || undefined}>
          {options.map(option => {
            const active = option.value === value;
            return (
              <button
                type="button"
                role="option"
                aria-selected={active}
                className={active ? 'active' : ''}
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                {active && <Check size={15} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function RealTimeMonitoring({ token }) {
  const t = useAcsTr();
  const [devices, setDevices] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [events, setEvents] = useState([]);
  const [selectedDoor, setSelectedDoor] = useState(null);
  const [search, setSearch] = useState('');
  const [eventFilter, setEventFilter] = useState('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [commandBusy, setCommandBusy] = useState('');
  const [commandResult, setCommandResult] = useState(null);
  const [pollingEvents, setPollingEvents] = useState(false);
  const [summary, setSummary] = useState({});
  const [commandHistory, setCommandHistory] = useState([]);
  const [eventSearch, setEventSearch] = useState('');
  const [credentialFilter, setCredentialFilter] = useState('all');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [eventDrawerOpen, setEventDrawerOpen] = useState(false);
  const [controllersExpanded, setControllersExpanded] = useState(false);
  const [expandedDevices, setExpandedDevices] = useState({});
  const [centerView, setCenterView] = useState('doors');
  const latestEventId = useRef(0);
  const announcedEventId = useRef(0);

  const headers = useMemo(
    () => ({ Authorization: `Bearer ${token}` }),
    [token],
  );

  const loadDevices = useCallback(async () => {
    const response = await apiFetch(`${API}/api/acs`, { headers });
    if (!response.ok) return [];
    const rows = await response.json();
    setDevices(rows);
    setSelectedDoor(current => {
      if (current && rows.some(device => device.id === current.deviceId)) return current;
      return null;
    });
    return rows;
  }, [headers]);

  const loadStatuses = useCallback(async rows => {
    const source = rows || [];
    const results = await Promise.all(source.map(async device => {
      if (!device.is_active) {
        return [device.id, { online: false, message: 'Device disabled' }];
      }
      try {
        const response = await apiFetch(`${API}/api/acs/${device.id}/status`, { headers });
        const data = await response.json().catch(() => ({}));
        return [device.id, response.ok ? data : {
          online: false,
          message: data.detail || `HTTP ${response.status}`,
        }];
      } catch (error) {
        return [device.id, { online: false, message: String(error.message || error) }];
      }
    }));
    setStatuses(Object.fromEntries(results));
  }, [headers]);

  const loadInitialEvents = useCallback(async () => {
    const response = await apiFetch(`${API}/api/acs/events/all?limit=150`, { headers });
    if (!response.ok) return;
    const rows = await response.json();
    setEvents(rows);
    latestEventId.current = rows.reduce((max, event) => Math.max(max, event.id || 0), 0);
  }, [headers]);

  const loadMonitoringMeta = useCallback(async () => {
    const [summaryResponse, historyResponse] = await Promise.all([
      apiFetch(`${API}/api/acs/monitoring/summary`, { headers }),
      apiFetch(`${API}/api/acs/monitoring/command-history?limit=12`, { headers }),
    ]);
    if (summaryResponse.ok) setSummary(await summaryResponse.json());
    if (historyResponse.ok) setCommandHistory(await historyResponse.json());
  }, [headers]);

  const loadNewEvents = useCallback(async () => {
    const response = await apiFetch(
      `${API}/api/acs/events/live?since_id=${latestEventId.current}&limit=100`,
      { headers },
    );
    if (!response.ok) return;
    const data = await response.json();
    if (data.events?.length) {
      setEvents(current => {
        const known = new Set(current.map(event => event.id));
        const incoming = data.events.filter(event => !known.has(event.id));
        return [...incoming, ...current].slice(0, 300);
      });
    }
    latestEventId.current = Math.max(latestEventId.current, data.latest_id || 0);
  }, [headers]);

  const refreshAll = useCallback(async (showSpinner = true) => {
    if (showSpinner) setRefreshing(true);
    try {
      const rows = await loadDevices();
      const active = rows.filter(device => device.is_active);
      await Promise.all(active.map(device => apiFetch(
        `${API}/api/acs/cfg/poll-events/${device.id}?hours_back=1`,
        { method: 'POST', headers },
      ).catch(() => null)));
      await Promise.all([loadStatuses(rows), loadInitialEvents(), loadMonitoringMeta()]);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [headers, loadDevices, loadInitialEvents, loadMonitoringMeta, loadStatuses]);

  useEffect(() => {
    let stopped = false;
    const start = async () => {
      setLoading(true);
      const rows = await loadDevices();
      if (stopped) return;
      await Promise.all([loadStatuses(rows), loadInitialEvents(), loadMonitoringMeta()]);
      if (!stopped) setLoading(false);
    };
    start();
    return () => { stopped = true; };
  }, [loadDevices, loadInitialEvents, loadMonitoringMeta, loadStatuses]);

  useEffect(() => {
    if (!token) return undefined;
    let socket;
    let stopped = false;
    let reconnectTimer;
    const connect = async () => {
      try {
        const response = await apiFetch(`${API}/api/ws-url`, { headers });
        if (!response.ok || stopped) return;
        const data = await response.json();
        const url = new URL(data.url, API || window.location.origin);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(url.toString());
        socket.onmessage = message => {
          try {
            const event = JSON.parse(message.data);
            if (event.type === 'acs_event' || event.type === 'acs_events_polled') {
              loadInitialEvents();
              loadMonitoringMeta();
            }
          } catch (_) {}
        };
        socket.onclose = () => {
          if (!stopped) reconnectTimer = window.setTimeout(connect, 2500);
        };
      } catch (_) {
        if (!stopped) reconnectTimer = window.setTimeout(connect, 2500);
      }
    };
    connect();
    return () => {
      stopped = true;
      window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [headers, loadInitialEvents, loadMonitoringMeta, token]);

  useEffect(() => {
    const newest = events[0];
    if (!newest || newest.id <= announcedEventId.current) return;
    if (!announcedEventId.current) {
      announcedEventId.current = newest.id;
      return;
    }
    announcedEventId.current = newest.id;
    const important = eventTone(newest) === 'danger' || !newest.person_id;
    if (important && soundEnabled) playEventSound('warning_alarm');
    if (important) {
      sendBrowserNotification(
        newest.person_name || 'Unknown access event',
        `${newest.device_name || 'Controller'} / Door ${newest.door_no || '-'}`,
      );
    }
  }, [events, soundEnabled]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = window.setInterval(() => refreshAll(false), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [autoRefresh, refreshAll]);

  const doors = useMemo(
    () => devices.flatMap(device =>
      Array.from({ length: device.door_count || 1 }, (_, index) => ({
        device,
        doorNo: index + 1,
        status: statuses[device.id],
      }))),
    [devices, statuses],
  );

  const visibleDoors = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return doors;
    return doors.filter(({ device, doorNo }) =>
      `${device.name} ${device.location || ''} ${device.ip_address} door ${doorNo}`
        .toLowerCase()
        .includes(term));
  }, [doors, search]);

  const filteredEvents = useMemo(() => events.filter(event => {
    if (
      event.event_type === 'access_event'
      && !event.verify_mode
      && !event.person_id
      && !event.card_number
    ) return false;
    if (selectedDoor && (
      event.device_id !== selectedDoor.deviceId
      || Number(event.door_no || 0) !== selectedDoor.doorNo
    )) return false;
    if (eventFilter === 'granted' && eventTone(event) !== 'success') return false;
    if (eventFilter === 'denied' && eventTone(event) !== 'danger') return false;
    if (eventFilter === 'manual' && !String(event.event_type || '').startsWith('manual_')) return false;
    if (credentialFilter !== 'all' && credentialType(event) !== credentialFilter) return false;
    const term = eventSearch.trim().toLowerCase();
    if (term && ![
      event.person_name, event.card_number, event.device_name,
      event.verify_mode, event.event_type,
    ].some(value => String(value || '').toLowerCase().includes(term))) return false;
    return true;
  }), [credentialFilter, eventFilter, eventSearch, events, selectedDoor]);

  const selected = selectedDoor
    ? doors.find(item =>
      item.device.id === selectedDoor.deviceId && item.doorNo === selectedDoor.doorNo)
    : null;

  const toggleDoor = useCallback((deviceId, doorNo) => {
    setCenterView('doors');
    setSelectedDoor(current => (
      current?.deviceId === deviceId && current?.doorNo === doorNo
        ? null
        : { deviceId, doorNo }
    ));
  }, []);

  const runCommand = async command => {
    if (!selected) return;
    if (
      ['stay_open', 'stay_close'].includes(command)
      && !window.confirm(`Confirm ${command.replace('_', ' ')} for ${selected.device.name} / Door ${selected.doorNo}?`)
    ) return;
    const key = `${selected.device.id}:${selected.doorNo}:${command}`;
    setCommandBusy(key);
    setCommandResult(null);
    try {
      const response = await apiFetch(
        `${API}/api/acs/${selected.device.id}/doors/${selected.doorNo}/${command}`,
        { method: 'POST', headers },
      );
      const data = await response.json().catch(() => ({}));
      setCommandResult({
        ok: response.ok,
        message: response.ok ? data.message || 'Command completed' : data.detail || 'Command failed',
      });
      await Promise.all([loadStatuses(devices), loadNewEvents()]);
      loadMonitoringMeta();
    } catch (error) {
      setCommandResult({ ok: false, message: String(error.message || error) });
    } finally {
      setCommandBusy('');
    }
  };

  const runEmergency = async command => {
    const label = command === 'open_all' ? 'OPEN ALL DOORS' : 'LOCK DOWN ALL DOORS';
    if (!window.confirm(`Emergency command: ${label}. Continue?`)) return;
    setCommandBusy(`emergency:${command}`);
    try {
      const response = await apiFetch(`${API}/api/acs/emergency/${command}`, {
        method: 'POST',
        headers,
      });
      const data = await response.json().catch(() => ({}));
      setCommandResult({
        ok: response.ok,
        message: response.ok ? `${label} completed` : data.detail || 'Emergency command failed',
      });
      await refreshAll(false);
    } finally {
      setCommandBusy('');
    }
  };

  const pullControllerEvents = async () => {
    setPollingEvents(true);
    setCommandResult(null);
    try {
      const active = devices.filter(device => device.is_active);
      const results = await Promise.all(active.map(async device => {
        const response = await apiFetch(
          `${API}/api/acs/cfg/poll-events/${device.id}?hours_back=1`,
          { method: 'POST', headers },
        );
        return response.ok;
      }));
      await loadInitialEvents();
      setCommandResult({
        ok: results.every(Boolean),
        message: `Events pulled from ${results.filter(Boolean).length}/${active.length} controller(s)`,
      });
    } finally {
      setPollingEvents(false);
    }
  };

  return (
    <div className="rtm-page">
      <div className="rtm-toolbar">
        <div className="rtm-live-title">
          <span className="rtm-live-dot" />
          <div>
            <strong>Real-Time Monitoring</strong>
            <small>Live door status, remote control and access events</small>
          </div>
        </div>
        <div className="rtm-toolbar-actions">
          <button
            className="rtm-icon-action"
            title={soundEnabled ? 'Disable event sounds' : 'Enable event sounds'}
            onClick={async () => {
              setSoundEnabled(value => !value);
              await requestNotificationPermission();
            }}
          >
            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
          <button className="rtm-mobile-events" onClick={() => setEventDrawerOpen(true)}>
            <PanelRightOpen size={14} /> Events
          </button>
          <label className="rtm-auto-refresh">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={event => setAutoRefresh(event.target.checked)}
            />
            Auto refresh
          </label>
          <button onClick={pullControllerEvents} disabled={pollingEvents}>
            <Activity size={14} className={pollingEvents ? 'spin' : ''} />
            Pull Events
          </button>
          <button onClick={() => refreshAll(true)} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <div className="rtm-summary-grid">
        <div><Server /><span><b>{summary.active_controllers || 0}</b><small>Active Controllers</small></span></div>
        <div><DoorOpen /><span><b>{doors.filter(item => item.status?.door_sensor_status?.[item.doorNo - 1]).length}</b><small>Open Doors</small></span></div>
        <div className="success"><CheckCircle2 /><span><b>{summary.granted_today || 0}</b><small>Granted Today</small></span></div>
        <div className="danger"><ShieldAlert /><span><b>{summary.denied_today || 0}</b><small>Denied Today</small></span></div>
        <div className="warning"><Users /><span><b>{summary.unknown_today || 0}</b><small>Unknown Today</small></span></div>
      </div>

      <div className="rtm-workspace">
        <aside className="rtm-resources">
          <div className="rtm-panel-head">
            <span><Server size={15} /> Resources</span>
            <b>{doors.length}</b>
          </div>
          <div className="rtm-search">
            <Search size={15} />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search doors" />
          </div>
          <button
            type='button'
            className={'rtm-tree-root ' + (selectedDoor === null ? 'active' : '')}
            onClick={() => {
              setCenterView('doors');
              setSelectedDoor(null);
              setControllersExpanded(current => !current);
            }}
            aria-expanded={controllersExpanded}
          >
            <ChevronRight
              size={14}
              className={controllersExpanded ? 'expanded' : ''}
            />
            <Server size={15} />
            <span>All Controllers</span>
            <b>{devices.length}</b>
          </button>
          <button
            type="button"
            className={'rtm-tree-root rtm-tree-commands ' + (centerView === 'commands' ? 'active' : '')}
            onClick={() => {
              setCenterView('commands');
              setSelectedDoor(null);
            }}
          >
            <History size={14} />
            <span>{t('Recent Operator Commands')}</span>
            <b>{commandHistory.length}</b>
          </button>
          {controllersExpanded && (
            <div className='rtm-tree'>
              {devices.map(device => {
                const status = statuses[device.id];
                const deviceExpanded = Boolean(expandedDevices[device.id]);
                return (
                  <div className='rtm-tree-device' key={device.id}>
                    <button
                      type='button'
                      className='rtm-tree-device-title'
                      onClick={() => setExpandedDevices(current => ({
                        ...current,
                        [device.id]: !current[device.id],
                      }))}
                      aria-expanded={deviceExpanded}
                    >
                      <ChevronRight
                        size={13}
                        className={deviceExpanded ? 'expanded' : ''}
                      />
                      {status?.online ? <Wifi size={13} /> : <WifiOff size={13} />}
                      <span>{device.name}</span>
                    </button>
                    {deviceExpanded && Array.from(
                      { length: device.door_count || 1 },
                      (_, index) => index + 1,
                    )
                      .filter(doorNo => visibleDoors.some(item =>
                        item.device.id === device.id && item.doorNo === doorNo))
                      .map(doorNo => {
                        const active = selectedDoor?.deviceId === device.id
                          && selectedDoor?.doorNo === doorNo;
                        return (
                          <button
                            type='button'
                            key={doorNo}
                            className={active ? 'active' : ''}
                            onClick={() => toggleDoor(device.id, doorNo)}
                          >
                            <DoorOpen size={14} />
                            <span>Door {doorNo}</span>
                          </button>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          )}
        </aside>

        <main className={`rtm-center ${centerView === 'commands' ? 'commands-view' : ''}`}>
          <div className="rtm-panel-head">
            <span><DoorOpen size={15} /> Door Status</span>
            <small>{autoRefresh ? 'Updating every 3 seconds' : 'Auto refresh paused'}</small>
          </div>
          {loading ? (
            <div className="rtm-empty"><RefreshCw className="spin" size={24} /> Loading controllers...</div>
          ) : !visibleDoors.length ? (
            <div className="rtm-empty"><DoorOpen size={28} /> No matching doors</div>
          ) : (
            <div className="rtm-door-grid">
              {visibleDoors.map(({ device, doorNo, status }) => {
                const sensorOpen = Boolean(status?.door_sensor_status?.[doorNo - 1]);
                const unlocked = Boolean(status?.door_lock_status?.[doorNo - 1]);
                const readerOnline = status?.card_reader_online?.[doorNo - 1];
                const active = selectedDoor?.deviceId === device.id
                  && selectedDoor?.doorNo === doorNo;
                return (
                  <button
                    key={doorKey(device.id, doorNo)}
                    className={`rtm-door-card ${active ? 'active' : ''} ${!status?.online ? 'offline' : ''}`}
                    onClick={() => toggleDoor(device.id, doorNo)}
                  >
                    <div className="rtm-door-card-top">
                      <span className={`rtm-device-state ${status?.online ? 'online' : 'offline'}`}>
                        <Circle size={8} fill="currentColor" />
                        {status?.online ? 'Online' : 'Offline'}
                      </span>
                      <small>{device.ip_address}</small>
                    </div>
                    <div className="rtm-door-visual">
                      <DoorOpen size={34} />
                      <strong>Door {doorNo}</strong>
                      <span>{device.name}</span>
                    </div>
                    <div className="rtm-door-states">
                      <span className={sensorOpen ? 'open' : ''}>
                        {sensorOpen ? 'Door Open' : 'Door Closed'}
                      </span>
                      <span className={unlocked ? 'open' : ''}>
                        {unlocked ? 'Unlocked' : 'Locked'}
                      </span>
                      <span className={readerOnline === false ? 'error' : ''}>
                        Reader {readerOnline === false ? 'Offline' : 'Online'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {selected && (
            <section className="rtm-control-panel">
            <div className="rtm-control-title">
              <div>
                <strong>{selected ? `${selected.device.name} / Door ${selected.doorNo}` : 'Select a door'}</strong>
                <span>Remote door control</span>
              </div>
              {selected?.status?.online
                ? <span className="rtm-online-pill"><CheckCircle2 size={13} /> Online</span>
                : <span className="rtm-offline-pill"><AlertTriangle size={13} /> Offline</span>}
            </div>
            <div className="rtm-command-grid">
              <button disabled={!selected || commandBusy} onClick={() => runCommand('unlock')}>
                <LockOpen size={18} /><span>Open Door<small>Momentary unlock</small></span>
              </button>
              <button disabled={!selected || commandBusy} onClick={() => runCommand('lock')}>
                <Lock size={18} /><span>Close Door<small>Return to normal</small></span>
              </button>
              <button disabled={!selected || commandBusy} onClick={() => runCommand('stay_open')}>
                <KeyRound size={18} /><span>Remain Open<small>Keep door unlocked</small></span>
              </button>
              <button disabled={!selected || commandBusy} onClick={() => runCommand('stay_close')}>
                <ShieldAlert size={18} /><span>Remain Closed<small>Keep door locked</small></span>
              </button>
            </div>
            <div className="rtm-emergency-actions">
              <button disabled={Boolean(commandBusy)} onClick={() => runEmergency('open_all')}>
                <DoorOpen size={15} /> Emergency Open All
              </button>
              <button disabled={Boolean(commandBusy)} onClick={() => runEmergency('lockdown')}>
                <ShieldAlert size={15} /> Lockdown All
              </button>
            </div>
            {commandResult && (
              <div className={`rtm-command-result ${commandResult.ok ? 'ok' : 'error'}`}>
                {commandResult.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                {commandResult.message}
              </div>
            )}
            </section>
          )}

          {centerView === 'commands' && (
          <section className="rtm-history-panel rtm-history-focus">
            <div className="rtm-section-title"><History size={15} /> {t('Recent Operator Commands')}</div>
            {!commandHistory.length ? (
              <div className="rtm-history-empty">{t('No operator commands recorded')}</div>
            ) : commandHistory.map(item => (
              <div className="rtm-history-row" key={item.id}>
                <span>{item.username}</span>
                <p>{t(item.details)}</p>
                <time>{formatTime(item.created_at)}</time>
              </div>
            ))}
          </section>
          )}
        </main>

        <aside className={`rtm-events ${eventDrawerOpen ? 'drawer-open' : ''}`}>
          <div className="rtm-panel-head">
            <span><Clock3 size={15} /> Real-Time Events</span>
            <div className="rtm-event-head-actions">
              <b>{filteredEvents.length}</b>
              <button onClick={() => setEventDrawerOpen(false)}><X size={14} /></button>
            </div>
          </div>
          <div className="rtm-event-search">
            <Search size={14} />
            <input
              value={eventSearch}
              onChange={event => setEventSearch(event.target.value)}
              placeholder="Name, card, controller..."
            />
          </div>
          <div className="rtm-event-filters">
            <ListFilter size={14} />
            <RtmFilterSelect
              label="Event filter"
              value={eventFilter}
              onChange={setEventFilter}
              options={[
                { value: 'all', label: 'All Events' },
                { value: 'granted', label: 'Access Granted' },
                { value: 'denied', label: 'Access Denied' },
                { value: 'manual', label: 'Manual Control' },
              ]}
            />
            <RtmFilterSelect
              label="Credential filter"
              value={credentialFilter}
              onChange={setCredentialFilter}
              options={[
                { value: 'all', label: 'All Credentials' },
                { value: 'face', label: 'Face' },
                { value: 'card', label: 'Card' },
                { value: 'pin', label: 'PIN' },
                { value: 'fingerprint', label: 'Fingerprint' },
                { value: 'manual', label: 'Manual' },
              ]}
            />
          </div>
          <div className="rtm-event-list">
            {!filteredEvents.length ? (
              <div className="rtm-empty compact">No events for this selection</div>
            ) : filteredEvents.map(event => (
              <button
                className={`rtm-event ${eventTone(event)}`}
                key={event.id}
                onClick={() => setSelectedEvent(event)}
              >
                <div className="rtm-event-photo">
                  {event.event_image ? (
                    <img
                      src={mediaUrl(API, event.event_image)}
                      alt=""
                      onError={error => { error.currentTarget.style.display = 'none'; }}
                    />
                  ) : (
                    <UserRound size={18} />
                  )}
                  <span className={`rtm-event-mark ${eventTone(event)}`}>
                    {eventTone(event) === 'danger'
                      ? <AlertTriangle size={10} />
                      : <CheckCircle2 size={10} />}
                  </span>
                </div>
                <div className="rtm-event-body">
                  <div>
                    <strong>{event.person_name || event.card_number || 'Unknown person'}</strong>
                    <time>{formatTime(event.created_at)}</time>
                  </div>
                  <span>{eventLabel(event.event_type)}</span>
                  <small>
                    {event.device_name || `Device ${event.device_id}`}
                    {' / '}Door {event.door_no || '-'}
                    {event.verify_mode ? ` / ${event.verify_mode}` : ''}
                  </small>
                </div>
              </button>
            ))}
          </div>
        </aside>
      </div>

      {eventDrawerOpen && <button className="rtm-drawer-backdrop" onClick={() => setEventDrawerOpen(false)} />}

      {selectedEvent && (
        <div className="rtm-modal-backdrop" onMouseDown={() => setSelectedEvent(null)}>
          <div className="rtm-event-modal" onMouseDown={event => event.stopPropagation()}>
            <div className="rtm-event-modal-head">
              <div><Bell size={17} /><strong>Access Event Details</strong></div>
              <button onClick={() => setSelectedEvent(null)}><X size={17} /></button>
            </div>
            <div className="rtm-event-modal-content">
              <div className="rtm-modal-photo">
                {selectedEvent.event_image
                  ? <img src={mediaUrl(API, selectedEvent.event_image)} alt="" />
                  : <UserRound size={42} />}
              </div>
              <div className="rtm-event-detail-grid">
                <label>Person<strong>{selectedEvent.person_name || 'Unknown person'}</strong></label>
                <label>Result<strong>{eventLabel(selectedEvent.event_type)}</strong></label>
                <label>Controller<strong>{selectedEvent.device_name || `Device ${selectedEvent.device_id}`}</strong></label>
                <label>Door<strong>Door {selectedEvent.door_no || '-'}</strong></label>
                <label>Credential<strong>{selectedEvent.verify_mode || credentialType(selectedEvent)}</strong></label>
                <label>Card Number<strong>{selectedEvent.card_number || '-'}</strong></label>
                <label>Time<strong>{formatTime(selectedEvent.created_at)}</strong></label>
                <label>Reason<strong>{selectedEvent.denial_reason || '-'}</strong></label>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
