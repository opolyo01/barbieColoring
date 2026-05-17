import { test as base, expect, type Page } from '@playwright/test';

const API_URL = 'http://127.0.0.1:4000';
const STORAGE_KEY = 'tradebattle_auth';

export interface TestUser {
  token: string;
  user: { id: string; email: string; display_name: string; created_at: string };
}

/**
 * Calls the dev-only test-login endpoint, then seeds localStorage so the
 * React AuthContext picks it up on next navigation.
 */
export async function loginAs(
  page: Page,
  email = 'e2e@test.com',
  name = 'E2E User',
): Promise<TestUser> {
  const res = await page.request.post(`${API_URL}/api/auth/test-login`, {
    data: { email, name },
  });
  if (!res.ok()) {
    throw new Error(`test-login failed: ${res.status()} – is the server running and NODE_ENV != production?`);
  }
  const data = (await res.json()) as TestUser;

  // Seed localStorage before navigating so AuthContext loads the session
  await page.goto('/');
  await page.evaluate(
    ([key, value]) => localStorage.setItem(key, value),
    [STORAGE_KEY, JSON.stringify({ token: data.token, user: data.user })],
  );
  return data;
}

/** Extended test fixture that pre-authenticates the page. */
export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ page }, use) => {
    await loginAs(page);
    await use(page);
  },
});

export { expect };
