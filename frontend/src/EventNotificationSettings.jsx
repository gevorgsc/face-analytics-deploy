import React from 'react';
import { playEventSound } from './alertSound';
import { useTr } from './i18n';

function Card({ children, className = '' }) {
  return <div className={'card ' + className}>{children}</div>;
}

const SOUND_OPTION_KEYS = [
  { value: 'none',           labelKey: 'noSound' },
  { value: 'soft_ping',      labelKey: 'softPing' },
  { value: 'soft_notice',    labelKey: 'softNotice' },
  { value: 'vip_chime',      labelKey: 'vipChime' },
  { value: 'warning_alarm',  labelKey: 'warningAlarm' },
  { value: 'blacklist_alarm', labelKey: 'blacklistAlarm' },
];

const EVENT_TYPE_KEYS = [
  { key: 'unknown',   labelKey: 'unknown' },
  { key: 'employee',  labelKey: 'employees' },
  { key: 'vip',       labelKey: 'vipClients' },
  { key: 'blacklist', labelKey: 'blacklist' },
];

export default function EventNotificationSettings({
  settings,
  setSettings,
  eventPopupEnabled,
  setEventPopupEnabled,
}) {
  const t = useTr();

  const update = (key, value) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    localStorage.setItem('eventSoundSettings', JSON.stringify(next));
  };

  const updatePopupEnabled = value => {
    setEventPopupEnabled(value);
    localStorage.setItem('eventPopupEnabled', String(value));
  };

  return (
    <section className="event-admin-section">
      <Card className="event-sound-card">
        <div className="card-title-row">
          <div>
            <h2>{t('notificationSettings')}</h2>
            <p className="muted">{t('notificationDesc')}</p>
          </div>
        </div>
        <label className="event-notification-toggle">
          <input
            type="checkbox"
            checked={eventPopupEnabled}
            onChange={e => updatePopupEnabled(e.target.checked)}
          />
          <span>
            <b>{t('livePopupCards')}</b>
            <small>{t('livePopupDesc')}</small>
          </span>
        </label>
        <div className="event-sound-grid">
          {EVENT_TYPE_KEYS.map(type => (
            <div key={type.key} className={`event-sound-row type-${type.key}`}>
              <div>
                <b>{t(type.labelKey)}</b>
                <small>{type.key === 'blacklist' ? t('blacklistSoundHint') : t('eventSoundHint')}</small>
              </div>
              <select
                value={settings[type.key] || 'soft_ping'}
                onChange={e => update(type.key, e.target.value)}
              >
                {SOUND_OPTION_KEYS.map(opt => (
                  <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                ))}
              </select>
              <button className="ghost-btn" onClick={() => playEventSound(settings[type.key] || 'soft_ping')}>
                {t('testSound')}
              </button>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}
