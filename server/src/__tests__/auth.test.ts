import { describe, it, expect, vi, beforeAll } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const TEST_SECRET = 'test-secret-key-that-is-long-enough-32chars';

vi.mock('../config', () => ({
  JWT_SECRET: TEST_SECRET,
  DATABASE_URL: 'postgres://localhost/test',
  DATABASE_SSL: false,
  IS_PRODUCTION: false,
  PORT: 4001,
  NODE_ENV: 'test',
}));

let app: Express;

beforeAll(async () => {
  const { requireAuth } = await import('../middleware/auth');
  app = express();
  app.use(express.json());
  app.get('/protected', requireAuth, (_req, res) => {
    res.json({ ok: true });
  });
});

describe('requireAuth middleware', () => {
  it('passes through a valid JWT', async () => {
    const token = jwt.sign({ userId: 'user-123' }, TEST_SECRET);
    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('returns 401 when Authorization header is missing', async () => {
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 401 for an invalid token', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer this-is-not-a-valid-jwt');
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });
});
