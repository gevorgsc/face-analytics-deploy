import React from 'react';
import { Bell, BellOff, LogOut, Moon, Sun } from 'lucide-react';
import { LangSelector } from './i18n';
import NotificationCenter from './NotificationCenter';

function pageTitle(tab, t) {
  if (tab === 'dashboard') return t('realtime');
  if (tab === 'events') return t('faceEvents');
  if (tab === 'persons') return t('personsDb');
  if (tab === 'register') return t('registerPerson');
  if (tab === 'attendance') return t('attendanceTitle');
  if (tab === 'event-admin') return 'Events';
  if (tab === 'users') return t('usersTitle');
  if (tab === 'analytics') return 'Analytics';
  if (tab === 'live-view') return 'Live View';
  if (tab === 'cameras') return 'Device Management';
  if (tab === 'audit') return t('auditLogsTitle');
  if (tab === 'map') return 'Floor Map';
  return t('search');
}

export default function AppHeader({
  currentUser,
  notifications,
  notifOpen,
  requestLogout,
  setNotifOpen,
  setNotifications,
  setSoundEnabled,
  setTheme,
  soundEnabled,
  t,
  tab,
  theme,
  unreadCount,
  wsStatus,
}) {
  return (
    <header className="enterprise-header">
      <div>
        <div className="page-eyebrow">GSC LLC - FACE ANALYTICS PLATFORM</div>
        <h1>{pageTitle(tab, t)}</h1>
      </div>

      <div className="topbar-actions">
        <span className={`top-status ws-status-badge ws-${wsStatus}`}>
          <span></span>
          {wsStatus === 'connected' && t('wsLiveShort')}
          {wsStatus === 'connecting' && t('wsConnectingShort')}
          {wsStatus === 'reconnecting' && t('wsReconnectingShort')}
          {wsStatus === 'disconnected' && t('wsOffline')}
        </span>
        <LangSelector />
        <button
          className="top-icon-btn"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={theme === 'dark' ? t('lightMode') : t('darkMode')}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button
          className={`top-icon-btn ${soundEnabled ? 'sound-on' : 'sound-off'}`}
          onClick={() => setSoundEnabled(!soundEnabled)}
          title={soundEnabled ? 'Disable alerts sound' : 'Enable alerts sound'}
        >
          {soundEnabled ? <Bell size={16} /> : <BellOff size={16} />}
        </button>

        <NotificationCenter
          notifOpen={notifOpen}
          setNotifOpen={setNotifOpen}
          notifications={notifications}
          setNotifications={setNotifications}
          unreadCount={unreadCount}
        />

        <span className={`role-badge role-${currentUser?.role || 'viewer'}`} title="Current access role">
          {currentUser?.role || 'viewer'}
        </span>
        <button className="top-logout-btn" onClick={requestLogout} title={t('logout')}>
          <LogOut size={16} />
          {t('logout')}
        </button>
      </div>
    </header>
  );
}
