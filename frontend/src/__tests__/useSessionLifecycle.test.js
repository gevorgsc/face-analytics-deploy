import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tokenExpiryMs, useSessionLifecycle } from '../useSessionLifecycle';

function tokenWithPayload(payload) {
  const encode = value => btoa(JSON.stringify(value)).replaceAll('=', '');
  return `${encode({ alg: 'none' })}.${encode(payload)}.signature`;
}

describe('tokenExpiryMs', () => {
  it('reads JWT expiry in milliseconds', () => {
    expect(tokenExpiryMs(tokenWithPayload({ exp: 1234 }))).toBe(1234000);
  });

  it('returns null for malformed or expiry-free tokens', () => {
    expect(tokenExpiryMs('invalid')).toBeNull();
    expect(tokenExpiryMs(tokenWithPayload({ sub: '1' }))).toBeNull();
  });
});

describe('useSessionLifecycle', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('expires the session when the JWT deadline is reached', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T08:00:00Z'));
    const onExpired = vi.fn();
    const exp = Math.floor((Date.now() + 30_000) / 1000);

    renderHook(() => useSessionLifecycle({
      token: tokenWithPayload({ exp }),
      refreshToken: null,
      refreshSession: vi.fn(),
      onExpired,
    }));

    act(() => vi.advanceTimersByTime(30_000));
    expect(onExpired).toHaveBeenCalledTimes(1);
  });
});
