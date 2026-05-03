import { Router, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';
import {
  createCompetition,
  listCompetitions,
  getCompetition,
  enrollUser,
  getEnrollment,
} from '../db/queries/competitions';
import { getLeaderboardData, computeLeaderboard } from '../db/queries/leaderboard';
import { getLatestPrices } from '../simulator/priceEngine';

const router = Router();

router.get('/', requireAuth as never, async (_req, res: Response) => {
  const competitions = await listCompetitions();
  res.json(competitions);
});

router.post('/', requireAuth as never, async (req: AuthenticatedRequest, res: Response) => {
  const { name, description, startDate, endDate, startingBalance } = req.body as {
    name?: string;
    description?: string;
    startDate?: string;
    endDate?: string;
    startingBalance?: number;
  };

  if (!name || !startDate || !endDate || !startingBalance) {
    res.status(400).json({ error: 'name, startDate, endDate, startingBalance are required' });
    return;
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    res.status(400).json({ error: 'Invalid date format' });
    return;
  }
  if (end <= start) {
    res.status(400).json({ error: 'endDate must be after startDate' });
    return;
  }
  if (startingBalance < 1000) {
    res.status(400).json({ error: 'Starting balance must be at least $1,000' });
    return;
  }

  const competition = await createCompetition(name, description ?? null, start, end, startingBalance, req.userId);

  // Auto-enroll the creator
  await enrollUser(req.userId, competition.id);

  res.status(201).json(competition);
});

router.get('/:id', requireAuth as never, async (req: AuthenticatedRequest, res: Response) => {
  const competition = await getCompetition(req.params.id);
  if (!competition) { res.status(404).json({ error: 'Not found' }); return; }

  const enrolled = !!(await getEnrollment(req.userId, req.params.id));
  res.json({ ...competition, enrolled });
});

router.post('/:id/join', requireAuth as never, async (req: AuthenticatedRequest, res: Response) => {
  const competition = await getCompetition(req.params.id);
  if (!competition) { res.status(404).json({ error: 'Not found' }); return; }
  if (competition.status === 'closed') {
    res.status(400).json({ error: 'Competition is closed' });
    return;
  }

  await enrollUser(req.userId, competition.id);
  res.json({ ok: true });
});

router.get('/:id/leaderboard', requireAuth as never, async (req: AuthenticatedRequest, res: Response) => {
  const competition = await getCompetition(req.params.id);
  if (!competition) { res.status(404).json({ error: 'Not found' }); return; }

  const users = await getLeaderboardData(req.params.id);
  const rankings = computeLeaderboard(users, getLatestPrices());
  res.json(rankings);
});

export default router;
