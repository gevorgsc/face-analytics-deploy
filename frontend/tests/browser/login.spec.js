import { expect, test } from '@playwright/test';

test('login screen renders core controls', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Face Analytics Pro' })).toBeVisible();
  await expect(page.getByPlaceholder('Enter username')).toBeVisible();
  await expect(page.getByPlaceholder('Enter password')).toBeVisible();
  await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
});

test('login submit stays disabled until credentials are entered', async ({ page }) => {
  await page.goto('/');

  const submit = page.getByRole('button', { name: /sign in/i });
  await expect(submit).toBeDisabled();

  await page.getByPlaceholder('Enter username').fill('admin');
  await expect(submit).toBeDisabled();

  await page.getByPlaceholder('Enter password').fill('not-a-real-password');
  await expect(submit).toBeEnabled();
});

test('Russian language renders readable login labels', async ({ page }) => {
  await page.goto('/');

  await page.locator('.lang-box select').selectOption('ru');

  await expect(page.getByPlaceholder('Введите логин')).toBeVisible();
  await expect(page.getByPlaceholder('Введите пароль')).toBeVisible();
  await expect(page.getByRole('button', { name: /войти/i })).toBeVisible();
});
