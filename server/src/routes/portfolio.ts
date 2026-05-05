import { Router, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { getPortfolioWithHoldings } from '../db/queries/portfolio';
import { getLatestPrices } from '../marketData';

const router = Router();

router.get('/:competitionId', requireAuth, async (req, res: Response) => {
  const userId = req.userId!;
  const result = await getPortfolioWithHoldings(userId, req.params.competitionId);
  if (!result) {
    res.status(404).json({ error: 'Portfolio not found — are you enrolled in this competition?' });
    return;
  }

  const prices = getLatestPrices();

  const holdingsWithPnl = result.holdings.map((h) => {
    const currentPrice = prices.get(h.symbol) ?? 0;
    const qty = Number(h.qty);
    const avgCost = Number(h.avg_cost);

    // For longs: pnl = (currentPrice - avgCost) * qty
    // For shorts: pnl = (avgCost - currentPrice) * |qty|
    const pnl = qty >= 0
      ? (currentPrice - avgCost) * qty
      : (avgCost - currentPrice) * Math.abs(qty);

    const marketValue = qty * currentPrice; // negative for shorts

    return {
      ...h,
      qty,
      avg_cost: avgCost,
      current_price: currentPrice,
      market_value: marketValue,
      unrealized_pnl: pnl,
    };
  });

  res.json({
    portfolio: result.portfolio,
    holdings: holdingsWithPnl,
    prices: Object.fromEntries(prices),
  });
});

export default router;
