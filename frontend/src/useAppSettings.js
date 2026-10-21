import { useEffect } from 'react';
import { apiFetch } from './apiClient';
import { API } from './apiConfig';
import { useAppStore } from './store';

export function useAppSettings(token) {
  const setTimezone = useAppStore(state => state.setTimezone);

  useEffect(() => {
    if (!token) return undefined;

    let cancelled = false;
    apiFetch(API + '/api/settings')
      .then(response => (response.ok ? response.json() : null))
      .then(data => {
        if (!cancelled && data?.ui_timezone) setTimezone(data.ui_timezone);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [setTimezone, token]);
}
