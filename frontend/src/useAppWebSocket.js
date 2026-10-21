import { useEffect, useRef, useState } from 'react';
import { playEventSound, sendBrowserNotification } from './alertSound';
import { toast } from './useToast';

const DEBUG_WS = import.meta.env.DEV;
const MAX_RECONNECT_DELAY = 30000;
const HEARTBEAT_INTERVAL = 25000;
const PONG_TIMEOUT = 10000;

function absoluteWsUrl(API, path) {
  const base = API || `${window.location.protocol}//${window.location.host}`;
  return `${path?.startsWith('http') ? path : base + (path || '/ws')}`
    .replace('https://', 'wss://')
    .replace('http://', 'ws://');
}

function calculateDelay(attempt) {
  return Math.min(Math.pow(2, attempt) * 1000, MAX_RECONNECT_DELAY);
}

export function useAppWebSocket({
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
}) {
  const [wsStatus, setWsStatus] = useState('connecting');
  const [liveAlert, setLiveAlert] = useState(null);
  const [liveMapEvent, setLiveMapEvent] = useState(null);

  const runtimeRef = useRef({});
  runtimeRef.current = {
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
  };

  useEffect(() => {
    if (!auth) {
      setWsStatus('disconnected');
      setLiveAlert(null);
      setLiveMapEvent(null);
      return undefined;
    }

    let ws = null;
    let reconnectTimer = null;
    let heartbeatTimer = null;
    let pongTimeoutTimer = null;
    let closedByReact = false;
    let reconnectAttempts = 0;

    const stopHeartbeat = () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      if (pongTimeoutTimer) {
        clearTimeout(pongTimeoutTimer);
        pongTimeoutTimer = null;
      }
    };

    const startHeartbeat = () => {
      stopHeartbeat();
      heartbeatTimer = setInterval(() => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
            pongTimeoutTimer = setTimeout(() => {
              console.warn('[WS] Heartbeat timeout; closing socket');
              try { ws.close(); } catch {}
            }, PONG_TIMEOUT);
          } catch (error) {
            console.warn('[WS] Heartbeat send failed:', error);
          }
        }
      }, HEARTBEAT_INTERVAL);
    };

    const scheduleReconnect = () => {
      if (closedByReact) return;
      const delay = calculateDelay(reconnectAttempts);
      reconnectAttempts++;
      if (DEBUG_WS) console.info(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
      reconnectTimer = setTimeout(connectWebSocket, delay);
    };

    const handleMessage = (message) => {
      try {
        const data = JSON.parse(message.data);
        const runtime = runtimeRef.current;

        if (pongTimeoutTimer) {
          clearTimeout(pongTimeoutTimer);
          pongTimeoutTimer = null;
        }

        if (data.type === 'pong') return;

        if (data.type === 'occupancy_update') {
          runtime.setOccupancyWsData(data);
          return;
        }

        if (data.type === 'camera_auto_registered') {
          runtime.loadCameras().catch(() => {});
          const regId = data.camera_id;
          const regName = data.camera_name;
          const regIp = data.camera_ip;
          toast.info(`New camera: ${regName} (${regIp})`, {
            duration: 15000,
            action: {
              label: 'Configure ->',
              onClick: async () => {
                await runtime.loadCameras().catch(() => {});
                runtime.setAutoEditCameraId(regId);
                runtime.setTab('cameras');
              },
            },
          });
        }

        if (data.type === 'new_event') {
          if (runtime.eventPopupEnabled) {
            setLiveAlert(data);
            setTimeout(() => setLiveAlert(null), 5000);
          }
          setLiveMapEvent(data);
          if (data.direction === 'in' || data.direction === 'out') {
            runtime.setInoutRefreshAt(Date.now());
          }
          runtime.load();

          const personType = data.person_type || 'unknown';
          runtime.setNotifications(prev => [{
            id: Date.now(),
            type: personType,
            msg: data.person_name || 'Unknown person',
            sub: data.camera_name || '',
            ts: new Date().toISOString(),
            read: false,
            alert: ['blacklist', 'vip'].includes(personType),
          }, ...prev].slice(0, 100));

          if (runtime.soundEnabled) {
            playEventSound(
              runtime.eventSoundSettings[personType]
              || runtime.eventSoundSettings.unknown
              || 'soft_ping',
            );
          }
          if (personType === 'blacklist') {
            sendBrowserNotification(
              'Blacklist Detected!',
              `${data.person_name || 'Unknown'} @ ${data.camera_name || 'Camera'}`,
            );
          } else if (personType === 'vip') {
            sendBrowserNotification(
              'VIP Detected',
              `${data.person_name} @ ${data.camera_name || 'Camera'}`,
            );
          }
        }
      } catch (error) {
        console.error('[WS] Message parse error:', error);
      }
    };

    async function connectWebSocket() {
      if (closedByReact) return;

      setWsStatus(reconnectAttempts > 0 ? 'reconnecting' : 'connecting');
      if (DEBUG_WS) console.info(`[WS] Connecting (attempt ${reconnectAttempts + 1})...`);

      try {
        const signed = await authFetch(API + '/api/ws-url');
        if (!signed.ok) throw new Error(`WS URL HTTP ${signed.status}`);
        const data = await signed.json();
        if (closedByReact) return;
        ws = new WebSocket(absoluteWsUrl(API, data.url));
      } catch (error) {
        console.error('[WS] Constructor error:', error);
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        if (DEBUG_WS) console.info('[WS] Connected');
        setWsStatus('connected');
        reconnectAttempts = 0;
        startHeartbeat();
      };
      ws.onmessage = handleMessage;
      ws.onclose = (event) => {
        stopHeartbeat();
        setWsStatus('disconnected');

        if (closedByReact) {
          if (DEBUG_WS) console.info('[WS] Closed by React (cleanup)');
          return;
        }

        console.warn(`[WS] Closed (code=${event.code}, reason=${event.reason || 'unknown'})`);
        scheduleReconnect();
      };
      ws.onerror = (event) => {
        console.warn('[WS] Error event:', event);
      };
    }

    connectWebSocket();

    const handleFocus = () => {
      if (ws && ws.readyState === WebSocket.CLOSED && !closedByReact) {
        if (DEBUG_WS) console.info('[WS] Window focus; forcing reconnect');
        reconnectAttempts = 0;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        connectWebSocket();
      }
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      closedByReact = true;
      window.removeEventListener('focus', handleFocus);
      stopHeartbeat();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        try { ws.close(); } catch {}
      }
    };
  }, [API, auth, authFetch]);

  return { wsStatus, liveAlert, liveMapEvent };
}
