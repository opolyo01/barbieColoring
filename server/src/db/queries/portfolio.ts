import pool from '../pool';
import { Holding, Portfolio } from '../../types';

export async function getPortfolio(userId: string, competitionId: string): Promise<Portfolio | null> {
  const { rows } = await pool.query<Portfolio>(
    'SELECT * FROM portfolios WHERE user_id = $1 AND competition_id = $2',
    [userId, competitionId],
  );
  return rows[0] ?? null;
}

export async function getHoldings(portfolioId: string): Promise<Holding[]> {
  const { rows } = await pool.query<Holding>(
    'SELECT * FROM holdings WHERE portfolio_id = $1 AND qty != 0',
    [portfolioId],
  );
  return rows;
}

export async function getHolding(portfolioId: string, symbol: string): Promise<Holding | null> {
  const { rows } = await pool.query<Holding>(
    'SELECT * FROM holdings WHERE portfolio_id = $1 AND symbol = $2',
    [portfolioId, symbol],
  );
  return rows[0] ?? null;
}

// Apply a fill to a portfolio: adjust cash and holdings atomically.
// qty is positive for BUY, negative for SELL (including short sells).
export async function applyFill(
  portfolioId: string,
  symbol: string,
  qty: number,       // positive = buying, negative = selling/shorting
  fillPrice: number,
): Promise<void> {
  const cashDelta = -(qty * fillPrice); // buy → cash decreases, sell → cash increases

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Update cash balance
    const { rows: portfolioRows } = await client.query<Portfolio>(
      'UPDATE portfolios SET cash_balance = cash_balance + $1 WHERE id = $2 RETURNING cash_balance',
      [cashDelta, portfolioId],
    );

    if (!portfolioRows[0]) throw new Error('Portfolio not found');

    // Upsert holding
    const existing = await client.query<Holding>(
      'SELECT qty, avg_cost FROM holdings WHERE portfolio_id = $1 AND symbol = $2',
      [portfolioId, symbol],
    );

    if (existing.rows.length === 0) {
      await client.query(
        'INSERT INTO holdings (portfolio_id, symbol, qty, avg_cost) VALUES ($1, $2, $3, $4)',
        [portfolioId, symbol, qty, fillPrice],
      );
    } else {
      const prev = existing.rows[0];
      const prevQty = Number(prev.qty);
      const prevCost = Number(prev.avg_cost);
      const newQty = prevQty + qty;

      // Recalculate avg_cost only when adding to a position in the same direction
      let newAvgCost = prevCost;
      if (prevQty >= 0 && qty > 0) {
        // Adding to a long
        newAvgCost = (prevQty * prevCost + qty * fillPrice) / (prevQty + qty);
      } else if (prevQty <= 0 && qty < 0) {
        // Adding to a short
        const absPrev = Math.abs(prevQty);
        const absQty = Math.abs(qty);
        newAvgCost = (absPrev * prevCost + absQty * fillPrice) / (absPrev + absQty);
      }
      // Reducing/closing a position keeps avg_cost of the remaining portion

      if (Math.abs(newQty) < 0.000001) {
        await client.query('DELETE FROM holdings WHERE portfolio_id = $1 AND symbol = $2', [portfolioId, symbol]);
      } else {
        await client.query(
          'UPDATE holdings SET qty = $1, avg_cost = $2 WHERE portfolio_id = $3 AND symbol = $4',
          [newQty, newAvgCost, portfolioId, symbol],
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getPortfolioWithHoldings(
  userId: string,
  competitionId: string,
): Promise<{ portfolio: Portfolio; holdings: Holding[] } | null> {
  const { rows: portfolioRows } = await pool.query<Portfolio>(
    'SELECT * FROM portfolios WHERE user_id = $1 AND competition_id = $2',
    [userId, competitionId],
  );
  if (!portfolioRows[0]) return null;

  const holdings = await getHoldings(portfolioRows[0].id);
  return { portfolio: portfolioRows[0], holdings };
}
