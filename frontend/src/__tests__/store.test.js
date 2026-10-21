import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppStore } from '../store';

beforeEach(() => {
  useAppStore.setState({
    auth: null,
    theme: 'light',
    lang: 'en',
    soundEnabled: true,
    eventPopupEnabled: true,
    eventSoundSettings: { unknown: 'soft_notice', employee: 'soft_ping', vip: 'vip_chime', blacklist: 'blacklist_alarm' },
  });
  sessionStorage.clear();
});

describe('useAppStore - auth', () => {
  it('starts with no auth', () => {
    const { result } = renderHook(() => useAppStore(s => s.auth));
    expect(result.current).toBeNull();
  });

  it('setAuth stores token in sessionStorage', () => {
    const { result } = renderHook(() => useAppStore());
    act(() => result.current.setAuth({ access_token: 'tok', user: { id: 1 } }));
    expect(sessionStorage.getItem('auth')).toContain('tok');
    expect(result.current.auth.access_token).toBe('tok');
  });

  it('logout clears auth and sessionStorage', () => {
    const { result } = renderHook(() => useAppStore());
    act(() => result.current.setAuth({ access_token: 'tok' }));
    act(() => result.current.logout());
    expect(result.current.auth).toBeNull();
    expect(sessionStorage.getItem('auth')).toBeNull();
  });
});

describe('useAppStore - preferences', () => {
  it('setTheme updates theme', () => {
    const { result } = renderHook(() => useAppStore());
    act(() => result.current.setTheme('dark'));
    expect(result.current.theme).toBe('dark');
  });

  it('setLang updates lang', () => {
    const { result } = renderHook(() => useAppStore());
    act(() => result.current.setLang('hy'));
    expect(result.current.lang).toBe('hy');
  });

  it('setSoundEnabled toggles sound', () => {
    const { result } = renderHook(() => useAppStore());
    act(() => result.current.setSoundEnabled(false));
    expect(result.current.soundEnabled).toBe(false);
  });
});
