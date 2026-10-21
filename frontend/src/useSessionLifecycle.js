import { useEffect } from 'react';

export function tokenExpiryMs(token) {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function useSessionLifecycle({
  token,
  refreshToken,
  refreshSession,
  onExpired,
  onRefreshed,
  onRefreshUnavailable,
  onRefreshFailed,
}) {
  useEffect(() => {
    const expiresAt = tokenExpiryMs(token);
    if (!expiresAt) return undefined;

    const now = Date.now();
    if (now >= expiresAt) {
      onExpired();
      return undefined;
    }

    let refreshTimer = null;
    const refreshAt = expiresAt - 2 * 60 * 1000;
    if (refreshToken && refreshAt > now) {
      refreshTimer = window.setTimeout(async () => {
        try {
          const refreshed = await refreshSession();
          if (refreshed) onRefreshed?.();
          else onRefreshUnavailable?.();
        } catch {
          onRefreshFailed?.();
        }
      }, Math.max(0, refreshAt - Date.now()));
    }

    const logoutTimer = window.setTimeout(onExpired, expiresAt - Date.now());
    return () => {
      window.clearTimeout(logoutTimer);
      if (refreshTimer) window.clearTimeout(refreshTimer);
    };
  }, [
    token,
    refreshToken,
    refreshSession,
    onExpired,
    onRefreshed,
    onRefreshUnavailable,
    onRefreshFailed,
  ]);
}
