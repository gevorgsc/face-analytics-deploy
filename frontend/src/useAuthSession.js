import { useCallback, useEffect } from 'react';
import { configureApiClient, refreshApiSession } from './apiClient';
import { useSessionLifecycle } from './useSessionLifecycle';
import { toast } from './useToast';

export function useAuthSession({ token, refreshToken, clearAuth, logout, t }) {
  useEffect(() => {
    configureApiClient({
      onUnauthorized: () => {
        toast.error(t('sessionExpired'));
        clearAuth();
      },
    });
  }, [clearAuth, t]);

  useSessionLifecycle({
    token,
    refreshToken,
    refreshSession: refreshApiSession,
    onExpired: useCallback(() => {
      toast.error(t('sessionExpired'));
      logout();
    }, [logout, t]),
    onRefreshed: useCallback(() => toast.info(t('sessionRefreshed')), [t]),
    onRefreshUnavailable: useCallback(() => toast.warn(t('sessionExpiresSoon')), [t]),
    onRefreshFailed: useCallback(() => toast.warn(t('sessionRefreshFailed')), [t]),
  });
}
