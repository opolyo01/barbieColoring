import { test, expect } from '../fixtures/auth';

test.describe('Competitions page', () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto('/competitions');
    await page.waitForURL('/competitions');
  });

  test('shows the competitions dashboard', async ({ authedPage: page }) => {
    await expect(page.getByRole('button', { name: '+ New Competition' })).toBeVisible();
  });

  test('sign-out button is present', async ({ authedPage: page }) => {
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  });

  test('can open the create competition modal', async ({ authedPage: page }) => {
    await page.getByRole('button', { name: '+ New Competition' }).click();
    await expect(page.getByRole('heading', { name: 'Create Competition' })).toBeVisible();
    await expect(page.getByPlaceholder('March Madness 2025')).toBeVisible();
    await expect(page.getByPlaceholder('Select start date')).toBeVisible();
    await expect(page.getByPlaceholder('Select end date')).toBeVisible();
  });

  test('create competition modal can be cancelled', async ({ authedPage: page }) => {
    await page.getByRole('button', { name: '+ New Competition' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Create Competition' })).not.toBeVisible();
  });

  test('can create a competition and see it in the list', async ({ authedPage: page }) => {
    const name = `E2E League ${Date.now()}`;

    await page.getByRole('button', { name: '+ New Competition' }).click();
    await page.getByPlaceholder('March Madness 2025').fill(name);
    await page.getByPlaceholder('Optional').fill('Created by e2e tests');

    // Type dates directly into the react-datepicker inputs
    await page.getByPlaceholder('Select start date').fill('06/01/2026');
    await page.keyboard.press('Escape');
    await page.getByPlaceholder('Select end date').fill('12/31/2026');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Create' }).click();

    await expect(page.getByText(name)).toBeVisible({ timeout: 8000 });
  });

  test('can open the join by invite modal', async ({ authedPage: page }) => {
    // The "Join" button in the header (not inside a competition card)
    await page.getByRole('button', { name: /^Join/i }).first().click();
    await expect(page.getByRole('heading', { name: 'Join by Invite' })).toBeVisible();
    await expect(page.getByPlaceholder('AB12CD34EF56')).toBeVisible();
  });

  test('join modal shows error for an invalid invite code', async ({ authedPage: page }) => {
    await page.getByRole('button', { name: /^Join/i }).first().click();
    await page.getByPlaceholder('AB12CD34EF56').fill('INVALID000');
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await expect(page.getByText(/invalid|not found|error/i)).toBeVisible({ timeout: 8000 });
  });

  test('join modal can be cancelled', async ({ authedPage: page }) => {
    await page.getByRole('button', { name: /^Join/i }).first().click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('heading', { name: 'Join by Invite' })).not.toBeVisible();
  });
});
