import { test, expect } from '../fixtures/auth';
import { loginAs } from '../fixtures/auth';

const API_URL = 'http://localhost:4000';

/** Creates a competition via API and returns its id and invite_code. */
async function createCompetition(token: string, page: import('@playwright/test').Page) {
  const res = await page.request.post(`${API_URL}/api/competitions`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      name: `E2E Trading ${Date.now()}`,
      description: 'e2e test competition',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      starting_balance: 1_000_000,
    },
  });
  return (await res.json()) as { id: string; invite_code: string };
}

test.describe('Trading room', () => {
  test('creator can open the trading room', async ({ authedPage: page }) => {
    // Re-run login to capture the token
    const { token } = await loginAs(page, 'trader-e2e@test.com', 'Trader E2E');
    const { id } = await createCompetition(token, page);

    await page.goto(`/competition/${id}`);

    // Header should show the competition
    await expect(page.getByRole('button', { name: /Back/i })).toBeVisible({ timeout: 8000 });
  });

  test('symbol selector shows tickers', async ({ authedPage: page }) => {
    const { token } = await loginAs(page, 'trader-e2e@test.com', 'Trader E2E');
    const { id } = await createCompetition(token, page);

    await page.goto(`/competition/${id}`);
    await page.waitForURL(`/competition/${id}`);

    // Expect at least one stock ticker button to be rendered
    await expect(page.getByRole('button', { name: 'AAPL' })).toBeVisible({ timeout: 10000 });
  });

  test('shows PM / Blotter / OE tabs', async ({ authedPage: page }) => {
    const { token } = await loginAs(page, 'trader-e2e@test.com', 'Trader E2E');
    const { id } = await createCompetition(token, page);

    await page.goto(`/competition/${id}`);

    await expect(page.getByRole('button', { name: /PM/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /Blotter/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /OE/i })).toBeVisible();
  });

  test('unenrolled user is redirected to competitions', async ({ authedPage: page }) => {
    await page.goto('/competition/00000000-0000-0000-0000-000000000000');
    await expect(page).toHaveURL('/competitions', { timeout: 8000 });
  });
});
