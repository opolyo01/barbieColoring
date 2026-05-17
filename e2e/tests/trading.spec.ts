import { test, expect } from '@playwright/test';
import { loginAs } from '../fixtures/auth';

const API_URL = 'http://127.0.0.1:4000';
const TRADER_EMAIL = 'trader-e2e@test.com';
const TRADER_NAME = 'Trader E2E';

let competitionId: string;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    const { token } = await loginAs(page, TRADER_EMAIL, TRADER_NAME);
    const res = await page.request.post(`${API_URL}/api/competitions`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: `E2E Trading ${Date.now()}`,
        description: 'e2e test competition',
        startDate: '2026-01-01',
        endDate: '2026-12-31',
        startingBalance: 1_000_000,
      },
    });
    if (!res.ok()) throw new Error(`createCompetition failed: ${res.status()} ${await res.text()}`);
    const comp = await res.json() as { id: string };
    competitionId = comp.id;
  } finally {
    await context.close();
  }
});

test.beforeEach(async ({ page }) => {
  await loginAs(page, TRADER_EMAIL, TRADER_NAME);
});

test.describe('Trading room', () => {
  test('creator can open the trading room', async ({ page }) => {
    await page.goto(`/competition/${competitionId}`);
    await expect(page.getByRole('button', { name: /Back/i })).toBeVisible({ timeout: 8000 });
  });

  test('symbol selector shows tickers', async ({ page }) => {
    await page.goto(`/competition/${competitionId}`);
    await expect(page.getByRole('button', { name: 'AAPL' })).toBeVisible({ timeout: 10_000 });
  });

  test('shows PM / Blotter / OE tabs', async ({ page }) => {
    await page.goto(`/competition/${competitionId}`);
    await expect(page.getByRole('button', { name: 'PM' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Blotter' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'OE' })).toBeVisible();
  });

  test('unenrolled user is redirected to competitions', async ({ page }) => {
    await loginAs(page, 'unenrolled-e2e@test.com', 'Unenrolled User');
    await page.goto('/competition/00000000-0000-0000-0000-000000000000');
    await expect(page).toHaveURL('/competitions', { timeout: 8000 });
  });
});
