import { getLeaderboardData, computeLeaderboard } from '../db/queries/leaderboard';
import { broadcastLeaderboard, getActiveCompetitionIds } from './server';

// Throttle: recalculate leaderboard at most once per second per competition
const lastBroadcast = new Map<string, number>();
const LEADERBOARD_INTERVAL_MS = 2000;

export async function refreshLeaderboards(prices: Map<string, number>): Promise<void> {
  const competitionIds = getActiveCompetitionIds();
  const now = Date.now();

  for (const competitionId of competitionIds) {
    const last = lastBroadcast.get(competitionId) ?? 0;
    if (now - last < LEADERBOARD_INTERVAL_MS) continue;

    lastBroadcast.set(competitionId, now);

    try {
      const users = await getLeaderboardData(competitionId);
      const rankings = computeLeaderboard(users, prices);
      broadcastLeaderboard(competitionId, {
        type: 'leaderboard',
        competitionId,
        rankings,
      });
    } catch (err) {
      console.error(`Leaderboard refresh failed for competition ${competitionId}:`, err);
    }
  }
}
