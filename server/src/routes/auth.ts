import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pool from '../db/pool';
import { User } from '../types';
import { CLIENT_ORIGIN, IS_PRODUCTION, JWT_SECRET, SERVER_URL } from '../config';
import { authRateLimiter } from '../rateLimit';

const router = Router();
router.use(authRateLimiter);

// ─── Helpers ────────────────────────────────────────────────────────────────

function issueAppToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
}

// Signed, expiring state param — prevents CSRF without needing server-side sessions
function generateState(): string {
  return jwt.sign({ nonce: crypto.randomBytes(16).toString('hex') }, JWT_SECRET, { expiresIn: '10m' });
}

function verifyState(state: string): boolean {
  try {
    jwt.verify(state, JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}

async function upsertOAuthUser(
  provider: string,
  providerId: string,
  displayName: string,
  email: string,
): Promise<User> {
  const { rows } = await pool.query<User>(
    `INSERT INTO users (email, display_name, provider, provider_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (provider, provider_id)
     DO UPDATE SET
       display_name = EXCLUDED.display_name,
       email        = EXCLUDED.email
     RETURNING id, email, display_name, created_at`,
    [email, displayName.trim(), provider, providerId],
  );
  return rows[0];
}

function redirectError(res: Response, message: string): void {
  res.redirect(`${CLIENT_ORIGIN}/login?error=${encodeURIComponent(message)}`);
}

// ─── Google ──────────────────────────────────────────────────────────────────

router.get('/google', (_req: Request, res: Response) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    redirectError(res, 'Google OAuth is not configured on the server');
    return;
  }

  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri:  `${SERVER_URL}/api/auth/google/callback`,
    response_type: 'code',
    scope:         'openid email profile',
    access_type:   'online',
    state:         generateState(),
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

router.get('/google/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;

  if (error) { redirectError(res, 'Google sign-in was cancelled'); return; }
  if (!verifyState(state ?? '')) { redirectError(res, 'Invalid OAuth state'); return; }
  if (!code) { redirectError(res, 'No auth code received'); return; }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     process.env.GOOGLE_CLIENT_ID ?? '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
        redirect_uri:  `${SERVER_URL}/api/auth/google/callback`,
        grant_type:    'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json() as { access_token?: string; error?: string };
    if (!tokenData.access_token) { redirectError(res, 'Failed to get Google token'); return; }

    const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json() as { sub?: string; name?: string; email?: string };
    if (!profile.sub || !profile.email) { redirectError(res, 'Could not read Google profile'); return; }

    const user = await upsertOAuthUser('google', profile.sub, profile.name ?? profile.email, profile.email);
    const token = issueAppToken(user.id);
    res.redirect(`${CLIENT_ORIGIN}/auth/callback#token=${encodeURIComponent(token)}`);
  } catch (err) {
    console.error('Google OAuth error:', err);
    redirectError(res, 'Google sign-in failed');
  }
});

// ─── /me — resolve JWT → user profile ───────────────────────────────────────

router.get('/me', async (req: Request, res: Response) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) { res.status(401).json({ error: 'Missing token' }); return; }

  try {
    const { userId } = jwt.verify(header.slice(7), JWT_SECRET) as { userId: string };
    const { rows } = await pool.query<User>(
      'SELECT id, email, display_name, created_at FROM users WHERE id = $1',
      [userId],
    );
    if (!rows[0]) { res.status(404).json({ error: 'User not found' }); return; }
    res.json(rows[0]);
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// ─── Test-only bypass (never available in production) ────────────────────────

router.post('/test-login', async (req: Request, res: Response) => {
  if (IS_PRODUCTION) { res.status(404).end(); return; }
  const { email, name } = req.body as { email?: string; name?: string };
  if (!email) { res.status(400).json({ error: 'email required' }); return; }
  try {
    const user = await upsertOAuthUser('test', email, name ?? email, email);
    const token = issueAppToken(user.id);
    res.json({ token, user });
  } catch (err) {
    console.error('test-login error:', err);
    res.status(500).json({ error: 'Failed to create test user' });
  }
});

export default router;
