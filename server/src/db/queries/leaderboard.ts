import pool from '../pool';
import { LeaderboardEntry } from '../../types';

interface PortfolioRow {
  user_id: string;
  display_name: string;
  cash_balance: string;
  starting_balance: string;
  symbol: string | null;
  qty: string | null;
}

export async function getLeaderboardData(competitionId: string): Promise<
  Array<{ user_id: string; display_name: string; cash_balance: number; starting_balance: number; holdings: Array<{ symbol: string; qty: number }> }>
> {
  const { rows } = await pool.query<PortfolioRow>(
    `SELECT u.id AS user_id, u.display_name,
            p.cash_balance, c.starting_balance,
            h.symbol, h.qty
     FROM enrollments e
     JOIN users u ON u.id = e.user_id
     JOIN portfolios p ON p.user_id = e.user_id AND p.competition_id = e.competition_id
     JOIN competitions c ON c.id = e.competition_id
     LEFT JOIN holdings h ON h.portfolio_id = p.id AND h.qty != 0
     WHERE e.competition_id = $1`,
    [competitionId],
  );

  // Group rows by user
  const usersMap = new Map<string, {
    user_id: string;
    display_name: string;
    cash_balance: number;
    starting_balance: number;
    holdings: Array<{ symbol: string; qty: number }>;
  }>();

  for (const row of rows) {
    if (!usersMap.has(row.user_id)) {
      usersMap.set(row.user_id, {
        user_id: row.user_id,
        display_name: row.display_name,
        cash_balance: Number(row.cash_balance),
        starting_balance: Number(row.starting_balance),
        holdings: [],
      });
    }
    if (row.symbol && row.qty) {
      usersMap.get(row.user_id)!.holdings.push({ symbol: row.symbol, qty: Number(row.qty) });
    }
  }

  return Array.from(usersMap.values());
}

export function computeLeaderboard(
  users: Array<{
    user_id: string;
    display_name: string;
    cash_balance: number;
    starting_balance: number;
    holdings: Array<{ symbol: string; qty: number }>;
  }>,
  prices: Map<string, number>,
): LeaderboardEntry[] {
  const entries: LeaderboardEntry[] = users.map((u) => {
    // portfolio_value = cash + Σ(qty × price)
    // Works correctly for both longs (qty > 0) and shorts (qty < 0, cash already credited)
    const holdingsValue = u.holdings.reduce((sum, h) => {
      const price = prices.get(h.symbol) ?? 0;
      return sum + h.qty * price;
    }, 0);

    const portfolioValue = u.cash_balance + holdingsValue;
    const pnl = portfolioValue - u.starting_balance;
    const pnlPct = (pnl / u.starting_balance) * 100;

    return {
      rank: 0,
      user_id: u.user_id,
      display_name: u.display_name,
      portfolio_value: portfolioValue,
      starting_balance: u.starting_balance,
      pnl,
      pnl_pct: pnlPct,
      cash_balance: u.cash_balance,
    };
  });

  entries.sort((a, b) => b.portfolio_value - a.portfolio_value);
  entries.forEach((e, i) => { e.rank = i + 1; });

  return entries;
}
