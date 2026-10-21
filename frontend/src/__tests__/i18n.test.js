import { describe, it, expect } from 'vitest';
import { I18N } from '../i18n';

describe('I18N translations', () => {
  it('has all three languages', () => {
    expect(Object.keys(I18N)).toEqual(['en', 'hy', 'ru']);
  });

  it('hy and ru have same keys as en', () => {
    const enKeys = Object.keys(I18N.en).sort();
    expect(Object.keys(I18N.hy).sort()).toEqual(enKeys);
    expect(Object.keys(I18N.ru).sort()).toEqual(enKeys);
  });

  it('all keys are non-empty strings', () => {
    for (const lang of ['en', 'hy', 'ru']) {
      for (const [key, value] of Object.entries(I18N[lang])) {
        expect(typeof value, `${lang}.${key} should be string`).toBe('string');
        expect(value.length, `${lang}.${key} should not be empty`).toBeGreaterThan(0);
      }
    }
  });

  it('en.login is Login', () => {
    expect(I18N.en.login).toBe('Login');
  });

  it('contains readable Russian authentication labels', () => {
    expect(I18N.ru.login).toBe('Войти');
    expect(I18N.ru.password).toBe('Пароль');
    expect(I18N.ru.logout).toBe('Выход');
  });
});
