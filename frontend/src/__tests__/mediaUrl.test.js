import { describe, it, expect } from 'vitest';
import { mediaUrl } from '../mediaUrl';

describe('mediaUrl', () => {
  const BASE = 'http://localhost:8000';

  it('returns empty string for falsy path', () => {
    expect(mediaUrl(BASE, null)).toBe('');
    expect(mediaUrl(BASE, undefined)).toBe('');
    expect(mediaUrl(BASE, '')).toBe('');
  });

  it('passes through absolute http URLs unchanged', () => {
    const url = 'http://example.com/image.jpg';
    expect(mediaUrl(BASE, url)).toBe(url);
  });

  it('appends base to relative paths', () => {
    const result = mediaUrl(BASE, '/media/2024-01-01/face.jpg');
    expect(result).toContain(BASE);
    expect(result).toContain('/media/');
  });

  it('handles paths with query params (signed URLs)', () => {
    const path = '/media/img.jpg?token=x&exp=123&sig=abc';
    const result = mediaUrl(BASE, path);
    expect(result).toContain('token=x');
  });
});
