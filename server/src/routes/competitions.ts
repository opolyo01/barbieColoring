import { Router, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  createCompetition,
  listCompetitions,
  getCompetition,
  getCompetitionByInviteCode,
  enrollUser,
  getEnrollment,
  getCompetitionAdminParticipants,
  unenrollUser,
  deleteCompetition,
} from '../db/queries/competitions';
import { getLeaderboardData, computeLeaderboard } from '../db/queries/leaderboard';
import { getCompetitionTradeAudit } from '../db/queries/orders';
import { getLatestPrices } from '../marketData';

const router = Router();

function normalizeInviteCode(value: string | undefined): string {
  return value?.trim().toUpperCase() ?? '';
}

router.get('/', requireAuth, async (req, res: Response) => {
  const userId = req.userId!;
  const competitions = await listCompetitions(userId);
  res.json(competitions);
});

router.post('/', requireAuth, async (req, res: Response) => {
  const userId = req.userId!;
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

  const competition = await createCompetition(name, description ?? null, start, end, startingBalance, userId);

  // Auto-enroll the creator
  await enrollUser(userId, competition.id);

  res.status(201).json(competition);
});

router.get('/:id', requireAuth, async (req, res: Response) => {
  const userId = req.userId!;
  const competition = await getCompetition(req.params.id);
  if (!competition) { res.status(404).json({ error: 'Not found' }); return; }

  const enrolled = !!(await getEnrollment(userId, req.params.id));
  if (!enrolled && competition.created_by !== userId) {
    res.status(403).json({ error: 'This competition is invite-only' });
    return;
  }
  res.json({ ...competition, enrolled });
});

router.get('/:id/admin', requireAuth, async (req, res: Response) => {
  const userId = req.userId!;
  const competition = await getCompetition(req.params.id);
  if (!competition) { res.status(404).json({ error: 'Not found' }); return; }
  if (competition.created_by !== userId) {
    res.status(403).json({ error: 'Admin access is limited to the competition creator' });
    return;
  }

  const [participantsRaw, trades] = await Promise.all([
    getCompetitionAdminParticipants(competition.id),
    getCompetitionTradeAudit(competition.id),
  ]);
  const prices = getLatestPrices();

  const participants = participantsRaw.map((participant) => {
    const netSemv = participant.holdings.reduce((sum, holding) => {
      const price = prices.get(holding.symbol) ?? 0;
      return sum + holding.qty * price;
    }, 0);
    const grossSemv = participant.holdings.reduce((sum, holding) => {
      const price = prices.get(holding.symbol) ?? 0;
      return sum + Math.abs(holding.qty) * price;
    }, 0);
    const portfolioValue = participant.cash_balance + netSemv;
    const pnl = portfolioValue - Number(competition.starting_balance);
    const pnlPct = Number(competition.starting_balance) > 0
      ? (pnl / Number(competition.starting_balance)) * 100
      : 0;

    return {
      user_id: participant.user_id,
      email: participant.email,
      display_name: participant.display_name,
      joined_at: participant.joined_at,
      cash_balance: participant.cash_balance,
      portfolio_value: portfolioValue,
      pnl,
      pnl_pct: pnlPct,
      gross_semv: grossSemv,
      net_semv: netSemv,
      open_positions: participant.holdings.length,
      pending_orders: participant.pending_orders,
      is_creator: participant.user_id === competition.created_by,
    };
  });

  res.json({
    competition,
    participants,
    trades,
  });
});

router.post('/join-by-invite', requireAuth, async (req, res: Response) => {
  const userId = req.userId!;
  const inviteCode = normalizeInviteCode((req.body as { inviteCode?: string }).inviteCode);
  if (!inviteCode) {
    res.status(400).json({ error: 'inviteCode is required' });
    return;
  }

  const competition = await getCompetitionByInviteCode(inviteCode);
  if (!competition) { res.status(404).json({ error: 'Invalid invite code' }); return; }
  if (competition.status === 'closed') {
    res.status(400).json({ error: 'Competition is closed' });
    return;
  }

  await enrollUser(userId, competition.id);
  res.json({ ok: true, competitionId: competition.id });
});

router.post('/:id/join', requireAuth, async (req, res: Response) => {
  const userId = req.userId!;
  const competition = await getCompetition(req.params.id);
  if (!competition) { res.status(404).json({ error: 'Not found' }); return; }
  if (competition.status === 'closed') {
    res.status(400).json({ error: 'Competition is closed' });
    return;
  }
  const inviteCode = normalizeInviteCode((req.body as { inviteCode?: string }).inviteCode);
  if (!inviteCode || inviteCode !== competition.invite_code) {
    res.status(403).json({ error: 'A valid invite code is required to join this competition' });
    return;
  }

  await enrollUser(userId, competition.id);
  res.json({ ok: true });
});

router.delete('/:id/enrollments/:targetUserId', requireAuth, async (req, res: Response) => {
  const userId = req.userId!;
  const competition = await getCompetition(req.params.id);
  if (!competition) { res.status(404).json({ error: 'Not found' }); return; }
  if (competition.created_by !== userId) {
    res.status(403).json({ error: 'Admin access is limited to the competition creator' });
    return;
  }
  if (req.params.targetUserId === competition.created_by) {
    res.status(400).json({ error: 'Cannot unenroll the competition creator' });
    return;
  }

  const removed = await unenrollUser(req.params.targetUserId, competition.id);
  if (!removed) {
    res.status(404).json({ error: 'Enrollment not found' });
    return;
  }

  res.json({ ok: true });
});

router.delete('/:id', requireAuth, async (req, res: Response) => {
  const userId = req.userId!;
  const deleted = await deleteCompetition(req.params.id, userId);
  if (!deleted) { res.status(404).json({ error: 'Not found or not your competition' }); return; }
  res.json({ ok: true });
});

router.get('/:id/leaderboard', requireAuth, async (req, res: Response) => {
  const userId = req.userId!;
  const competition = await getCompetition(req.params.id);
  if (!competition) { res.status(404).json({ error: 'Not found' }); return; }
  const enrolled = !!(await getEnrollment(userId, req.params.id));
  if (!enrolled && competition.created_by !== userId) {
    res.status(403).json({ error: 'This competition is invite-only' });
    return;
  }

  const users = await getLeaderboardData(req.params.id);
  const rankings = computeLeaderboard(users, getLatestPrices());
  res.json(rankings);
});

export default router;
