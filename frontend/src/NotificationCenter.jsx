import React from 'react';
import { Activity } from 'lucide-react';

export default function NotificationCenter({
  notifOpen,
  setNotifOpen,
  notifications,
  setNotifications,
  unreadCount,
}) {
  const toggle = () => {
    setNotifOpen(open => !open);
    if (!notifOpen) {
      setNotifications(prev => prev.map(item => ({ ...item, read: true })));
    }
  };

  return (
    <div className="nc-wrap" style={{ position: 'relative' }}>
      <button
        className={`top-icon-btn nc-bell-btn${notifOpen ? ' active' : ''}`}
        onClick={toggle}
        title="Notification center"
      >
        <Activity size={16} />
        {unreadCount > 0 && (
          <span className="nc-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {notifOpen && (
        <div className="nc-panel">
          <div className="nc-hd">
            <span>Notifications</span>
            <button className="nc-clear" onClick={() => setNotifications([])}>Clear all</button>
            <button className="nc-close" onClick={() => setNotifOpen(false)}>x</button>
          </div>
          {notifications.length === 0 ? (
            <div className="nc-empty">No notifications yet</div>
          ) : (
            <div className="nc-list">
              {notifications.map(item => (
                <div
                  key={item.id}
                  className={`nc-item${item.alert ? ' nc-alert' : ''}${!item.read ? ' nc-unread' : ''}`}
                >
                  <span className={`nc-dot mvp-ptype-${item.type}`} />
                  <div className="nc-body">
                    <span className="nc-msg">{item.msg}</span>
                    <small className="nc-sub">
                      {item.sub} - {new Date(item.ts).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                      })}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
