import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getSymbols, getLatestPrices } from '../marketData';

const router = Router();

router.get('/', requireAuth, (_req, res) => {
  const symbols = getSymbols();
  const prices = getLatestPrices();
  const result = symbols.map((s) => ({ symbol: s, price: prices.get(s) ?? null }));
  res.json(result);
});

export default router;
