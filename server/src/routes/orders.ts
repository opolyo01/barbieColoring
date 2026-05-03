import { Router, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { AuthenticatedRequest, OrderSide, OrderType } from '../types';
import { createOrder, getTradeHistory } from '../db/queries/orders';
import { getEnrollment } from '../db/queries/competitions';
import { publishOrderSubmitted } from '../kafka/producer';
import { getLatestPrice } from '../kafka/fillSimulator';
import { getSymbols } from '../simulator/priceEngine';

const router = Router();

const ALLOWED_SYMBOLS = new Set(getSymbols());

router.post('/', requireAuth as never, async (req: AuthenticatedRequest, res: Response) => {
  const { competitionId, symbol, side, qty, orderType, limitPrice } = req.body as {
    competitionId?: string;
    symbol?: string;
    side?: string;
    qty?: number;
    orderType?: string;
    limitPrice?: number;
  };

  if (!competitionId || !symbol || !side || !qty || !orderType) {
    res.status(400).json({ error: 'competitionId, symbol, side, qty, orderType are required' });
    return;
  }
  if (!['BUY', 'SELL'].includes(side)) {
    res.status(400).json({ error: 'side must be BUY or SELL' });
    return;
  }
  if (!['MARKET', 'LIMIT'].includes(orderType)) {
    res.status(400).json({ error: 'orderType must be MARKET or LIMIT' });
    return;
  }
  if (!ALLOWED_SYMBOLS.has(symbol.toUpperCase())) {
    res.status(400).json({ error: `Symbol ${symbol} is not supported` });
    return;
  }
  if (qty <= 0 || !Number.isFinite(qty)) {
    res.status(400).json({ error: 'qty must be a positive number' });
    return;
  }
  if (orderType === 'LIMIT' && (!limitPrice || limitPrice <= 0)) {
    res.status(400).json({ error: 'limitPrice is required for LIMIT orders' });
    return;
  }

  const enrollment = await getEnrollment(req.userId, competitionId);
  if (!enrollment) {
    res.status(403).json({ error: 'Not enrolled in this competition' });
    return;
  }

  // Quick sanity check: is there any price for this symbol?
  const currentPrice = getLatestPrice(symbol.toUpperCase());
  if (!currentPrice) {
    res.status(503).json({ error: 'No price available for symbol — try again shortly' });
    return;
  }

  const order = await createOrder(
    req.userId,
    competitionId,
    symbol.toUpperCase(),
    side as OrderSide,
    qty,
    orderType as OrderType,
    limitPrice ?? null,
  );

  // Send to Kafka — fill simulator will process it
  await publishOrderSubmitted(order);

  res.status(202).json(order);
});

router.get('/history/:competitionId', requireAuth as never, async (req: AuthenticatedRequest, res: Response) => {
  const trades = await getTradeHistory(req.userId, req.params.competitionId);
  res.json(trades);
});

export default router;
