import { API } from './apiConfig';
import { useAppStore } from './store';

const UTC_NAIVE_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
const TZ_AWARE_ISO_RE = /(?:Z|[+-]\d{2}:\d{2})$/;
const DATE_FIELD_RE = /(?:^|_)(?:at|time|seen|sent|from|to|until|expires|triggered)$/i;

function normalizeApiDates(value, key = '') {
  if (Array.isArray(value)) return value.map(item => normalizeApiDates(item, key));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        normalizeApiDates(childValue, childKey),
      ])
    );
  }
  if (
    typeof value === 'string' &&
    DATE_FIELD_RE.test(key) &&
    UTC_NAIVE_ISO_RE.test(value) &&
    !TZ_AWARE_ISO_RE.test(value)
  ) {
    return `${value}Z`;
  }
  return value;
}

function withNormalizedJson(response) {
  if (!response || typeof response.json !== 'function') return response;
  const originalJson = response.json.bind(response);
  response.json = async () => normalizeApiDates(await originalJson());
  return response;
}

export function createApiClient({
  baseUrl = '',
  getAuth,
  setAuth,
  onUnauthorized,
  fetchImpl = (...args) => fetch(...args),
}) {
  let refreshPromise = null;
  let unauthorizedToken = null;
  let config = { getAuth, setAuth, onUnauthorized };

  const resolveUrl = path => (
    path?.startsWith('http://') || path?.startsWith('https://')
      ? path
      : `${baseUrl}${path || ''}`
  );

  const configure = next => {
    config = { ...config, ...next };
  };

  const refreshSession = async () => {
    if (refreshPromise) return refreshPromise;

    const auth = config.getAuth?.();
    if (!auth?.refresh_token) return null;

    refreshPromise = fetchImpl(resolveUrl('/api/auth/refresh'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: auth.refresh_token }),
    })
      .then(async response => {
        if (!response.ok) return null;
        const refreshed = await response.json();
        config.setAuth?.({
          ...auth,
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token || auth.refresh_token,
        });
        unauthorizedToken = null;
        return refreshed;
      })
      .finally(() => {
        refreshPromise = null;
      });

    return refreshPromise;
  };

  const request = async (path, options = {}) => {
    const { skipAuthRefresh = false, ...requestOptions } = options;
    const auth = config.getAuth?.();
    const headers = {
      ...(requestOptions.headers || {}),
      ...(auth?.access_token ? { Authorization: `Bearer ${auth.access_token}` } : {}),
    };
    let response = await fetchImpl(resolveUrl(path), {
      ...requestOptions,
      credentials: requestOptions.credentials || 'include',
      headers,
    });

    if (response.status !== 401 || skipAuthRefresh) return withNormalizedJson(response);

    const refreshed = await refreshSession().catch(() => null);
    if (refreshed?.access_token) {
      response = await fetchImpl(resolveUrl(path), {
        ...requestOptions,
        credentials: requestOptions.credentials || 'include',
        headers: {
          ...(requestOptions.headers || {}),
          Authorization: `Bearer ${refreshed.access_token}`,
        },
      });
      if (response.status !== 401) return withNormalizedJson(response);
    }

    const failedToken = config.getAuth?.()?.access_token || null;
    if (unauthorizedToken !== failedToken) {
      unauthorizedToken = failedToken;
      config.onUnauthorized?.();
    }
    return withNormalizedJson(response);
  };

  return { configure, refreshSession, request };
}

const sharedApiClient = createApiClient({
  baseUrl: API,
  getAuth: () => useAppStore.getState().auth,
  setAuth: auth => useAppStore.getState().setAuth(auth),
  onUnauthorized: () => useAppStore.getState().logout(),
});

export const configureApiClient = config => sharedApiClient.configure(config);
export const apiFetch = (path, options) => sharedApiClient.request(path, options);
export const refreshApiSession = () => sharedApiClient.refreshSession();
