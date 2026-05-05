import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getSymbols, getLatestPrices, ensureSymbol } from '../marketData';
import { updatePrice } from '../kafka/fillSimulator';

const router = Router();

router.get('/', requireAuth, (_req, res) => {
  const symbols = getSymbols();
  const prices = getLatestPrices();
  const result = symbols.map((s) => ({ symbol: s, price: prices.get(s) ?? null }));
  res.json(result);
});

router.get('/:symbol', requireAuth, async (req, res) => {
  const symbol = req.params.symbol?.toUpperCase().trim();
  if (!symbol) {
    res.status(400).json({ error: 'symbol is required' });
    return;
  }

  try {
    const price = await ensureSymbol(symbol);
    updatePrice(symbol, price);
    res.json({ symbol, price });
  } catch (err) {
    const message = err instanceof Error ? err.message : `Unable to load market data for ${symbol}`;
    res.status(404).json({ error: message });
  }
});

export default router;
