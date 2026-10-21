import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../apiClient';

function jsonResponse(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('apiClient', () => {
  it('refreshes once and retries concurrent unauthorized requests', async () => {
    let auth = { access_token: 'old', refresh_token: 'refresh', user: { id: 1 } };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(200, {
        access_token: 'new',
        refresh_token: 'refresh-2',
      }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: 1 }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: 2 }));

    const client = createApiClient({
      baseUrl: 'http://api.test',
      getAuth: () => auth,
      setAuth: next => { auth = next; },
      fetchImpl,
    });

    const [first, second] = await Promise.all([
      client.request('/api/first'),
      client.request('/api/second'),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(auth.access_token).toBe('new');
    expect(fetchImpl.mock.calls.filter(([url]) => url.endsWith('/api/auth/refresh'))).toHaveLength(1);
  });

  it('notifies the app when refresh cannot restore the session', async () => {
    const onUnauthorized = vi.fn();
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(jsonResponse(401, {}));
    const client = createApiClient({
      baseUrl: 'http://api.test',
      getAuth: () => ({ access_token: 'old', refresh_token: 'bad' }),
      setAuth: vi.fn(),
      onUnauthorized,
      fetchImpl,
    });

    await client.request('/api/private');

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});
