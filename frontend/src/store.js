/**
 * Global app store - auth, theme, language, sound preferences.
 * Replaces scattered localStorage reads and cross-component state drilling.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

function _readStoredAuth() {
  try {
    const stored = JSON.parse(sessionStorage.getItem('auth') || 'null');
    if (!stored?.access_token) return null;
    try {
      const payload = JSON.parse(atob(stored.access_token.split('.')[1]));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        if (!stored.refresh_token) { sessionStorage.removeItem('auth'); return null; }
      }
    } catch { /* ignore decode errors */ }
    return stored;
  } catch {
    return null;
  }
}

export const useAppStore = create(
  persist(
    (set, get) => ({
      // -- Auth (NOT persisted via zustand/persist - stays in sessionStorage) --
      auth: _readStoredAuth(),
      setAuth: (auth) => {
        if (auth) sessionStorage.setItem('auth', JSON.stringify(auth));
        else sessionStorage.removeItem('auth');
        set({ auth });
      },
      logout: () => {
        sessionStorage.removeItem('auth');
        set({ auth: null });
      },

      // -- UI preferences (persisted to localStorage via zustand/persist) --
      theme: 'light',
      setTheme: (theme) => set({ theme }),

      lang: 'en',
      setLang: (lang) => set({ lang }),

      // Display timezone — loaded from /api/settings on startup, persisted locally
      timezone: 'Asia/Yerevan',
      setTimezone: (tz) => set({ timezone: tz }),

      soundEnabled: true,
      setSoundEnabled: (v) => set({ soundEnabled: v }),

      eventPopupEnabled: true,
      setEventPopupEnabled: (v) => set({ eventPopupEnabled: v }),

      eventSoundSettings: {
        unknown: 'soft_notice',
        employee: 'soft_ping',
        vip: 'vip_chime',
        blacklist: 'blacklist_alarm',
      },
      setEventSoundSettings: (s) => set({ eventSoundSettings: s }),
    }),
    {
      name: 'face-analytics-prefs',
      // Only persist UI preferences - never auth tokens
      partialize: (state) => ({
        theme: state.theme,
        lang: state.lang,
        timezone: state.timezone,
        soundEnabled: state.soundEnabled,
        eventPopupEnabled: state.eventPopupEnabled,
        eventSoundSettings: state.eventSoundSettings,
      }),
    }
  )
);

// Convenience selectors
export const useAuth = () => useAppStore((s) => s.auth);
export const useSetAuth = () => useAppStore((s) => s.setAuth);
export const useLogout = () => useAppStore((s) => s.logout);
