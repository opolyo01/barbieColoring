import { Router, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { OrderSide, OrderType } from '../types';
import { createOrder, getTradeHistory, cancelOrder } from '../db/queries/orders';
import { getEnrollment } from '../db/queries/competitions';
import { getLatestPrice, updatePrice, executeFill } from '../kafka/fillSimulator';
import { ensureSymbol } from '../marketData';

const router = Router();

router.post('/', requireAuth, async (req, res: Response) => {
  const userId = req.userId!;
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
  if (qty <= 0 || !Number.isFinite(qty)) {
    res.status(400).json({ error: 'qty must be a positive number' });
    return;
  }
  if (orderType === 'LIMIT' && (!limitPrice || limitPrice <= 0)) {
    res.status(400).json({ error: 'limitPrice is required for LIMIT orders' });
    return;
  }

  const enrollment = await getEnrollment(userId, competitionId);
  if (!enrollment) {
    res.status(403).json({ error: 'Not enrolled in this competition' });
    return;
  }

  // Ensure symbol is tracked by the price engine; seed fillSimulator cache if new
  const sym = symbol.toUpperCase();
  let currentPrice = getLatestPrice(sym);
  if (!currentPrice) {
    currentPrice = await ensureSymbol(sym);
    updatePrice(sym, currentPrice);
  }

  const order = await createOrder(
    userId,
    competitionId,
    symbol.toUpperCase(),
    side as OrderSide,
    qty,
    orderType as OrderType,
    limitPrice ?? null,
  );

  // MARKET orders: fill synchronously right now so the caller gets an immediate
  // accept/reject decision against the current risk rules.
  // LIMIT orders: left as pending; checkLimitOrders() picks them up on each tick.
  if (orderType === 'MARKET') {
    try {
      const result = await executeFill(order, currentPrice);
      if (!result.ok) {
        res.status(400).json({ error: result.reason });
        return;
      }
    } catch (err) {
      console.error('Inline fill error for order', order.id, err);
      res.status(500).json({ error: 'Failed to execute market order' });
      return;
    }
  }

  res.status(202).json(order);
});

router.delete('/:orderId', requireAuth, async (req, res: Response) => {
  const userId = req.userId!;
  const cancelled = await cancelOrder(req.params.orderId, userId);
  if (!cancelled) {
    res.status(404).json({ error: 'Order not found or already terminal' });
    return;
  }
  res.json({ cancelled: true });
});

router.get('/history/:competitionId', requireAuth, async (req, res: Response) => {
  const userId = req.userId!;
  const trades = await getTradeHistory(userId, req.params.competitionId);
  res.json(trades);
});

export default router;
