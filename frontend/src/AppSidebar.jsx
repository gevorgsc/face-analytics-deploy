import React from 'react';
import {
  Activity,
  BarChart3,
  Bell,
  Camera,
  ChevronDown,
  Map,
  Search,
  Server,
  Settings,
  ShieldAlert,
  TrendingUp,
  UserPlus,
  Users,
  Wifi,
} from 'lucide-react';

export default function AppSidebar({
  isAdmin,
  mobileMenuOpen,
  openStatSection,
  setAppSection,
  setMobileMenuOpen,
  setSettingsOpen,
  setTab,
  settingsOpen,
  tab,
  t,
  wsStatus,
}) {
  const openTab = (nextTab) => {
    setTab(nextTab);
    setMobileMenuOpen(false);
  };

  const openFilteredSection = (section) => {
    openStatSection(section, 'all');
    setMobileMenuOpen(false);
  };

  return (
    <aside className={`enterprise-sidebar ${mobileMenuOpen ? 'open' : ''}`}>
      <div
        className="sidebar-logo"
        style={{ cursor: 'pointer' }}
        onClick={() => setAppSection(null)}
        title="Back to Launcher"
      >
        <div className="sidebar-logo-icon">
          <img
            src="/gsc-logo.svg"
            alt="GSC"
            className="sidebar-logo-img"
            onError={event => { event.currentTarget.style.display = 'none'; }}
          />
        </div>
        <div className="sidebar-logo-text">
          <strong>Face Analytics Pro</strong>
          <span>GSC LLC Enterprise</span>
          <div className="sidebar-logo-badge">
            <span className="slb-dot" />
            Secure Platform
          </div>
        </div>
      </div>

      <div className="sidebar-nav-divider" />

      <div className="nav-section-label">{t('navOverview')}</div>
      <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => openTab('dashboard')}>
        <Activity size={16} /><span>{t('dashboard')}</span>
      </button>
      <button className={tab === 'cameras' ? 'active' : ''} onClick={() => openTab('cameras')}>
        <Server size={16} /><span>Device Management</span>
      </button>
      <button className={tab === 'live-view' ? 'active' : ''} onClick={() => openTab('live-view')}>
        <Wifi size={16} /><span>Live View</span>
      </button>

      <div className="nav-section-label">{t('navIntelligence')}</div>
      <button className={tab === 'events' ? 'active' : ''} onClick={() => openFilteredSection('events')}>
        <Camera size={16} /><span>{t('events')}</span>
      </button>
      <button className={tab === 'persons' ? 'active' : ''} onClick={() => openFilteredSection('persons')}>
        <Users size={16} /><span>{t('persons')}</span>
      </button>
      <button className={tab === 'attendance' ? 'active' : ''} onClick={() => openTab('attendance')}>
        <BarChart3 size={16} /><span>{t('attendance')}</span>
      </button>
      <button className={tab === 'analytics' ? 'active' : ''} onClick={() => openTab('analytics')}>
        <TrendingUp size={16} /><span>Analytics</span>
      </button>
      <button className={tab === 'map' ? 'active' : ''} onClick={() => openTab('map')}>
        <Map size={16} /><span>Floor Map</span>
      </button>
      <button className={tab === 'search' ? 'active' : ''} onClick={() => openTab('search')}>
        <Search size={16} /><span>{t('search')}</span>
      </button>
      {isAdmin && (
        <button className={tab === 'event-admin' ? 'active' : ''} onClick={() => openTab('event-admin')}>
          <Bell size={16} /><span>Events</span>
        </button>
      )}

      {isAdmin && (
        <>
          <div className="nav-section-label">{t('navSettings')}</div>
          <button
            className={`settings-toggle ${settingsOpen ? 'open' : ''}`}
            onClick={() => setSettingsOpen(value => !value)}
            type="button"
          >
            <Settings size={16} /><span>{t('settings')}</span><ChevronDown size={14} className="settings-chevron" />
          </button>
          {settingsOpen && (
            <div className="settings-subnav">
              <button className={tab === 'users' ? 'active' : ''} onClick={() => openTab('users')}>
                <UserPlus size={16} /><span>{t('users')}</span>
              </button>
              <button className={tab === 'audit' ? 'active' : ''} onClick={() => openTab('audit')}>
                <ShieldAlert size={16} /><span>{t('auditLogs')}</span>
              </button>
            </div>
          )}
        </>
      )}

      <div className="sidebar-status">
        <div className={`ws-status ws-${wsStatus}`}>
          <span className="ws-dot"></span>
          {wsStatus === 'connected' && t('wsLive')}
          {wsStatus === 'connecting' && t('wsConnecting')}
          {wsStatus === 'reconnecting' && t('wsReconnecting')}
          {wsStatus === 'disconnected' && t('wsDisconnected')}
        </div>
        <div><span className="pulse-dot green"></span> Asia/Yerevan</div>
      </div>
      <div className="powered">{t('powered')}</div>
    </aside>
  );
}
