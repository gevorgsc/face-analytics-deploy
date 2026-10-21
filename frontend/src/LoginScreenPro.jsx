import React, { useState, useEffect, useRef } from 'react';
import { User, Lock, ArrowRight, Eye, EyeOff, Sun, Moon, Shield, Clock } from 'lucide-react';
import { toast } from './useToast';

export default function LoginScreenPro({ API, onLogin, theme, setTheme, t, langSelector }) {
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [blockedSecs, setBlockedSecs] = useState(0);
  const countdownRef = useRef(null);

  // initialize data-theme on mount so Login renders with correct theme immediately
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (blockedSecs <= 0) return;
    countdownRef.current = setInterval(() => {
      setBlockedSecs(s => {
        if (s <= 1) { clearInterval(countdownRef.current); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(countdownRef.current);
  }, [blockedSecs > 0]);

  const fmtCountdown = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  const handleLogin = async () => {
    if (blockedSecs > 0) return;
    if (!u || !p) { toast.warn(t('usernamePasswordRequired')); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: p }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 429 && data.detail?.blocked) {
          setBlockedSecs(data.detail.blocked_seconds || data.detail.blocked_minutes * 60 || 300);
        } else {
          const remaining = data.detail?.remaining_attempts;
          const msg = typeof data.detail === 'string' ? data.detail : data.detail?.message || t('loginFailed');
          toast.error(remaining != null ? `${msg} (${remaining} attempt${remaining !== 1 ? 's' : ''} left)` : msg, 5000);
        }
        return;
      }
      onLogin(data);
    } catch {
      toast.error(t('backendConnectionFailed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-root">
      <div className="login-bg">
        <div className="login-bg-grid" />
        <div className="login-orb login-orb-1" />
        <div className="login-orb login-orb-2" />
        <div className="login-orb login-orb-3" />
      </div>

      <div className="login-topbar">
        {langSelector}
        <button className="login-theme-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>

      <div className="login-card">
        <div className="login-logo-block">
          <div className="login-logo-img-wrap">
            <img
              src="/gsc-logo.svg"
              alt="GSC"
              className="login-logo-img"
              onError={e => { e.currentTarget.style.display = 'none'; }}
            />
          </div>
          <div className="login-logo-text">
            <h1>Face Analytics Pro</h1>
            <p>{t('enterpriseSecurity')}</p>
          </div>
        </div>

        <div className="login-divider">
          <span />
          <Shield size={12} />
          <span>{t('secureSignIn')}</span>
          <span />
        </div>

        <div className="login-form">
          <div className="login-field">
            <label>{t('usernameLabel')}</label>
            <div className="login-input-wrap">
              <User size={15} className="login-icon" />
              <input
                type="text"
                value={u}
                onChange={e => setU(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder={t('enterUsername')}
                autoFocus
                disabled={loading}
              />
            </div>
          </div>

          <div className="login-field">
            <label>{t('passwordLabel')}</label>
            <div className="login-input-wrap">
              <Lock size={15} className="login-icon" />
              <input
                type={show ? 'text' : 'password'}
                value={p}
                onChange={e => setP(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder={t('enterPassword')}
                disabled={loading}
              />
              <button className="login-eye" onClick={() => setShow(!show)} type="button" tabIndex={-1}>
                {show ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {blockedSecs > 0 ? (
            <div className="login-blocked-banner">
              <Clock size={15} />
              <span>Too many failed attempts. Try again in <strong>{fmtCountdown(blockedSecs)}</strong></span>
            </div>
          ) : null}

          <button
            className="login-submit"
            onClick={handleLogin}
            disabled={loading || !u || !p || blockedSecs > 0}
          >
            {loading ? (
              <><span className="login-spinner" /> {t('signingIn')}</>
            ) : blockedSecs > 0 ? (
              <><Clock size={16} /> Locked — {fmtCountdown(blockedSecs)}</>
            ) : (
              <>{t('signIn')} <ArrowRight size={16} /></>
            )}
          </button>
        </div>

        <div className="login-footer">
          <Shield size={12} />
          GSC LLC &nbsp;-&nbsp; Face Analytics Pro &nbsp;-&nbsp; Enterprise Edition
        </div>
      </div>
    </div>
  );
}
