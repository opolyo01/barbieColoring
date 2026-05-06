import { Router, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { OrderSide, OrderType } from '../types';
import { createOrder, getTradeHistory, cancelOrder } from '../db/queries/orders';
import { getEnrollment } from '../db/queries/competitions';
import { getLatestPrice, updatePrice, executeFill } from '../tradingEngine';
import { ensureSymbol } from '../marketData';
import { MAX_ORDER_QTY } from '../config';
import { orderWriteRateLimiter } from '../rateLimit';
import { isValidSymbol, normalizeSymbol } from '../validation';

const router = Router();

router.post('/', orderWriteRateLimiter, requireAuth, async (req, res: Response) => {
  const userId = req.userId!;
  const { competitionId, symbol, side, qty, orderType, limitPrice } = req.body as {
    competitionId?: string;
    symbol?: string;
    side?: string;
    qty?: number;
    orderType?: string;
    limitPrice?: number;
  };
  const qtyValue = Number(qty);
  const limitPriceValue = limitPrice == null ? null : Number(limitPrice);
  const sym = normalizeSymbol(symbol);

  if (!competitionId || !symbol || !side || qty == null || !orderType) {
    res.status(400).json({ error: 'competitionId, symbol, side, qty, orderType are required' });
    return;
  }
  if (!isValidSymbol(sym)) {
    res.status(400).json({ error: 'symbol must be 1-10 chars and contain only A-Z, 0-9, dot, or hyphen' });
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
  if (qtyValue <= 0 || !Number.isFinite(qtyValue)) {
    res.status(400).json({ error: 'qty must be a positive number' });
    return;
  }
  if (qtyValue > MAX_ORDER_QTY) {
    res.status(400).json({ error: `qty must be <= ${MAX_ORDER_QTY.toLocaleString('en-US')}` });
    return;
  }
  if (orderType === 'LIMIT' && (limitPriceValue == null || !Number.isFinite(limitPriceValue) || limitPriceValue <= 0)) {
    res.status(400).json({ error: 'limitPrice is required for LIMIT orders' });
    return;
  }

  const enrollment = await getEnrollment(userId, competitionId);
  if (!enrollment) {
    res.status(403).json({ error: 'Not enrolled in this competition' });
    return;
  }

  // Ensure symbol is tracked by the market data engine; seed the in-process price cache if new.
  let currentPrice = getLatestPrice(sym);
  if (!currentPrice) {
    currentPrice = await ensureSymbol(sym);
    updatePrice(sym, currentPrice);
  }

  const order = await createOrder(
    userId,
    competitionId,
    sym,
    side as OrderSide,
    qtyValue,
    orderType as OrderType,
    limitPriceValue,
  );

  // MARKET orders: fill synchronously right now so the caller gets an immediate
  // accept/reject decision against the current risk rules.
  // LIMIT orders: left as pending; the trading engine re-checks them on each tick.
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

router.delete('/:orderId', orderWriteRateLimiter, requireAuth, async (req, res: Response) => {
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
