// AppLauncher.jsx - Licensed module launcher

import React, { useState } from 'react';
import {
  ArrowRight,
  Camera,
  KeyRound,
  LockKeyhole,
  LogOut,
  ShieldCheck,
  ShieldAlert,
  X,
} from 'lucide-react';
import { PRODUCT_MODULE } from './apiConfig';

export default function AppLauncher({
  onSelect,
  onLogout,
  user,
  licenseStatus,
  licenseLoading,
  onActivateLicense,
  onActivateLicenseCode,
}) {
  const [showActivation, setShowActivation] = useState(false);
  const [licenseText, setLicenseText] = useState('');
  const [activationCode, setActivationCode] = useState('');
  const [showOffline, setShowOffline] = useState(false);
  const [activating, setActivating] = useState(false);
  const [activationError, setActivationError] = useState('');

  const faceLicensed = Boolean(licenseStatus?.modules?.face_analytics?.licensed);
  const acsLicensed = Boolean(licenseStatus?.modules?.access_controller?.licensed);
  const securityLicensed = faceLicensed || acsLicensed;
  const faceOnly = PRODUCT_MODULE === 'face';

  const activate = async () => {
    setActivationError('');
    setActivating(true);
    try {
      await onActivateLicense(JSON.parse(licenseText));
      setLicenseText('');
      setShowActivation(false);
    } catch (error) {
      setActivationError(error?.message || 'License activation failed');
    } finally {
      setActivating(false);
    }
  };

  const activateCode = async () => {
    setActivationError('');
    setActivating(true);
    try {
      await onActivateLicenseCode(activationCode.trim());
      setActivationCode('');
      setShowActivation(false);
    } catch (error) {
      setActivationError(error?.message || 'Online activation failed');
    } finally {
      setActivating(false);
    }
  };

  const renderTile = ({ module, licensed, className, icon, title, description, tags }) => (
    <button
      className={`launcher-tile ${className} ${licensed ? '' : 'launcher-tile-locked'}`}
      onClick={() => licensed && onSelect(module)}
      disabled={licenseLoading || !licensed}
      title={licensed ? `Open ${title}` : 'A valid license is required'}
    >
      <div className={`launcher-tile-icon ${module === 'face' ? 'face-icon' : 'acs-icon-l'}`}>
        {icon}
      </div>
      <div className="launcher-tile-body">
        <div className="launcher-tile-title-row">
          <h2>{title}</h2>
          {!licenseLoading && !licensed && (
            <span className="launcher-license-badge">
              <LockKeyhole size={12} /> License required
            </span>
          )}
        </div>
        <p>{description}</p>
        <div className="launcher-tile-tags">
          {tags.map(tag => <span key={tag}>{tag}</span>)}
        </div>
      </div>
      <div className="launcher-tile-arrow">
        {licensed ? <ArrowRight size={22} /> : <LockKeyhole size={22} />}
      </div>
    </button>
  );

  return (
    <div className="launcher-root">
      <div className="launcher-header">
        <div className="launcher-brand">
          <div className="launcher-logo">
            <img
              src="/gsc-logo.svg"
              alt="GSC"
              onError={event => { event.currentTarget.style.display = 'none'; }}
            />
          </div>
          <div>
            <strong>GSC LLC Enterprise</strong>
            <span>Security Platform</span>
          </div>
        </div>
        <div className="launcher-header-right">
          <span className="launcher-user">{user?.username}</span>
          {user?.role === 'admin' && licenseStatus?.enforcement_enabled && (
            <button className="launcher-license-btn" onClick={() => setShowActivation(true)}>
              <KeyRound size={15} /> Activate License
            </button>
          )}
          <button className="launcher-logout" onClick={onLogout}>
            <LogOut size={15} /> Logout
          </button>
        </div>
      </div>

      <div className="launcher-main">
        <p className="launcher-subtitle">Select a licensed module to continue</p>

        <div className="launcher-tiles">
          {renderTile({
            module: 'face',
            licensed: faceLicensed,
            className: 'launcher-tile-face',
            icon: <Camera size={38} />,
            title: 'Face Analytics Pro',
            description: 'Real-time face detection, recognition, attendance tracking, live camera feeds and advanced analytics.',
            tags: ['Face Recognition', 'Attendance', 'Analytics', 'Live View'],
          })}
          {!faceOnly && renderTile({
            module: 'acs',
            licensed: acsLicensed,
            className: 'launcher-tile-acs',
            icon: <ShieldCheck size={38} />,
            title: 'Access Controller',
            description: 'Manage Hikvision ACS devices, control door locks, view access logs and monitor entry/exit in real time.',
            tags: ['Door Control', 'Access Logs', 'Device Mgmt', 'Hikvision SDK'],
          })}
          {!faceOnly && renderTile({
            module: 'security',
            licensed: securityLicensed,
            className: 'launcher-tile-security',
            icon: <ShieldAlert size={38} />,
            title: 'Security Center',
            description: 'Unified operational view of incidents, access events, camera health and security response.',
            tags: ['Incidents', 'Health', 'Access Events', 'Operations'],
          })}
        </div>

        {licenseStatus?.enforcement_enabled && (
          <div className="launcher-license-summary">
            <span>Installation ID</span>
            <code>{licenseStatus.installation_id}</code>
            {licenseStatus.expires_at && (
              <small>Expires: {new Date(licenseStatus.expires_at).toLocaleString()}</small>
            )}
            {!licenseStatus.valid && <small className="license-error">{licenseStatus.error}</small>}
          </div>
        )}
      </div>

      <div className="launcher-footer">
        Powered by GSC LLC &nbsp;·&nbsp; Face Analytics Pro
      </div>

      {showActivation && (
        <div className="launcher-license-overlay" onMouseDown={() => setShowActivation(false)}>
          <div className="launcher-license-modal" onMouseDown={event => event.stopPropagation()}>
            <div className="launcher-license-modal-head">
              <div>
                <h3>Activate License</h3>
                <p>Enter the activation code issued by GSC.</p>
              </div>
              <button onClick={() => setShowActivation(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <label>
              Installation ID
              <code>{licenseStatus?.installation_id}</code>
            </label>
            {licenseStatus?.online_activation_available && (
              <>
                <input
                  className="launcher-activation-code"
                  value={activationCode}
                  onChange={event => setActivationCode(event.target.value.toUpperCase())}
                  placeholder="GSC-XXXX-XXXX-XXXX-XXXX-XXXX"
                  autoFocus
                />
                <button
                  className="launcher-offline-toggle"
                  onClick={() => setShowOffline(value => !value)}
                >
                  {showOffline ? 'Hide offline activation' : 'Use offline license JSON'}
                </button>
              </>
            )}
            {(!licenseStatus?.online_activation_available || showOffline) && (
              <textarea
                value={licenseText}
                onChange={event => setLicenseText(event.target.value)}
                placeholder={'{\n  "payload": "...",\n  "signature": "..."\n}'}
                rows={7}
              />
            )}
            {activationError && <div className="launcher-license-error">{activationError}</div>}
            <div className="launcher-license-actions">
              <button onClick={() => setShowActivation(false)}>Cancel</button>
              <button
                className="primary"
                disabled={
                  activating
                  || (
                    licenseStatus?.online_activation_available && !showOffline
                      ? !activationCode.trim()
                      : !licenseText.trim()
                  )
                }
                onClick={
                  licenseStatus?.online_activation_available && !showOffline
                    ? activateCode
                    : activate
                }
              >
                {activating ? 'Activating...' : 'Activate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
