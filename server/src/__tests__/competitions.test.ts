import { describe, it, expect, vi } from 'vitest';
import express from 'express';
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

// Mock all DB query modules so no real DB is needed
vi.mock('../db/queries/competitions', () => ({
  listCompetitions: vi.fn().mockResolvedValue([]),
  createCompetition: vi.fn(),
  getCompetition: vi.fn().mockResolvedValue(null),
  getCompetitionByInviteCode: vi.fn().mockResolvedValue(null),
  enrollUser: vi.fn(),
  getEnrollment: vi.fn().mockResolvedValue(null),
  getCompetitionAdminParticipants: vi.fn().mockResolvedValue([]),
  unenrollUser: vi.fn(),
  deleteCompetition: vi.fn(),
}));

vi.mock('../db/queries/leaderboard', () => ({
  getLeaderboardData: vi.fn().mockResolvedValue([]),
  computeLeaderboard: vi.fn().mockReturnValue([]),
}));

vi.mock('../db/queries/orders', () => ({
  getCompetitionTradeAudit: vi.fn().mockResolvedValue([]),
}));

vi.mock('../marketData', () => ({
  getLatestPrices: vi.fn().mockReturnValue(new Map()),
}));

const competitionsRouter = (await import('../routes/competitions')).default;

const app = express();
app.use(express.json());
app.use('/api/competitions', competitionsRouter);

describe('GET /api/competitions', () => {
  it('returns 401 when no auth token is provided', async () => {
    const res = await request(app).get('/api/competitions');
    expect(res.status).toBe(401);
  });

  it('returns 200 with a valid token', async () => {
    const token = jwt.sign({ userId: 'user-abc' }, TEST_SECRET);
    const res = await request(app)
      .get('/api/competitions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
