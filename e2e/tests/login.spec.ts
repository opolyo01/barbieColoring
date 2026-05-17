import { test, expect } from '@playwright/test';

test.describe('Login page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('renders brand and Google sign-in button', async ({ page }) => {
    await expect(page.getByText('TradeBattle').first()).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Continue with Google/i }).first(),
    ).toBeVisible();
    await expect(page.getByPlaceholder('Have an invite code?')).toBeVisible();
  });

  test('shows the three feature cards', async ({ page }) => {
    await expect(page.getByText('Private Competitions')).toBeVisible();
    await expect(page.getByText('Live Trading Room')).toBeVisible();
    await expect(page.getByText('Risk-Limited Gameplay')).toBeVisible();
  });

  test('shows error banner when ?error param is set', async ({ page }) => {
    await page.goto('/?error=Google+sign-in+was+cancelled');
    await expect(page.getByText('Google sign-in was cancelled')).toBeVisible();
  });

  test('unauthenticated user stays on login page', async ({ page }) => {
    await expect(page).toHaveURL('/');
  });
});
