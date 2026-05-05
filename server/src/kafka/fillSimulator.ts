import kafka, { TOPICS } from './client';
import { publishOrderFilled } from './producer';
import { fillOrder, rejectOrder, recordTrade, getAllPendingLimitOrders, getAllPendingMarketOrders } from '../db/queries/orders';
import { getPortfolio, getHoldings, applyFill } from '../db/queries/portfolio';
import { getCompetition } from '../db/queries/competitions';
import { sendToUser } from '../ws/server';
import { Holding, Order } from '../types';

// In-memory latest prices (updated on every tick)
const latestPrices = new Map<string, number>();

export function updatePrice(symbol: string, price: number): void {
  latestPrices.set(symbol, price);
}

export function getLatestPrice(symbol: string): number | undefined {
  return latestPrices.get(symbol);
}

type FillResult =
  | { ok: true }
  | { ok: false; reason: string };

function money(value: number): string {
  return `$${value.toFixed(2)}`;
}

function getMarkedPrice(symbol: string, fillPrice: number, holding?: Holding): number {
  return latestPrices.get(symbol) ?? Number(holding?.avg_cost ?? fillPrice);
}

async function getProjectedGrossExposure(
  order: Order,
  portfolioId: string,
  fillPrice: number,
): Promise<{ grossExposure: number; exposureLimit: number } | null> {
  const competition = await getCompetition(order.competition_id);
  if (!competition) return null;

  const holdings = await getHoldings(portfolioId);
  const nextQtyBySymbol = new Map<string, number>();
  const holdingBySymbol = new Map<string, Holding>();

  for (const holding of holdings) {
    const qty = Number(holding.qty);
    nextQtyBySymbol.set(holding.symbol, qty);
    holdingBySymbol.set(holding.symbol, holding);
  }

  const qtyDelta = order.side === 'BUY' ? Number(order.qty) : -Number(order.qty);
  nextQtyBySymbol.set(order.symbol, (nextQtyBySymbol.get(order.symbol) ?? 0) + qtyDelta);

  let grossExposure = 0;
  for (const [symbol, qty] of nextQtyBySymbol) {
    if (Math.abs(qty) < 0.000001) continue;
    const price = symbol === order.symbol
      ? fillPrice
      : getMarkedPrice(symbol, fillPrice, holdingBySymbol.get(symbol));
    grossExposure += Math.abs(qty) * price;
  }

  return {
    grossExposure,
    exposureLimit: Number(competition.starting_balance),
  };
}

async function reject(order: Order, reason: string): Promise<FillResult> {
  await rejectOrder(order.id);
  sendToUser(order.user_id, { type: 'order_rejected', orderId: order.id, reason });
  return { ok: false, reason };
}

export async function executeFill(order: Order, fillPrice: number): Promise<FillResult> {
  const portfolio = await getPortfolio(order.user_id, order.competition_id);
  if (!portfolio) return reject(order, 'Portfolio not found');

  const projected = await getProjectedGrossExposure(order, portfolio.id, fillPrice);
  if (!projected) return reject(order, 'Competition not found');
  if (projected.grossExposure > projected.exposureLimit + 0.01) {
    return reject(
      order,
      `Gross exposure limit exceeded — projected ${money(projected.grossExposure)} vs limit ${money(projected.exposureLimit)}`,
    );
  }

  const filled = await fillOrder(order.id, fillPrice);
  if (!filled) return { ok: false, reason: 'Order no longer pending' };

  // qty sign convention: BUY → positive delta, SELL → negative delta
  const qty = Number(order.qty);
  const qtyDelta = order.side === 'BUY' ? qty : -qty;
  await applyFill(portfolio.id, order.symbol, qtyDelta, fillPrice);
  await recordTrade(order.id, order.user_id, order.competition_id, order.symbol, order.side, qty, fillPrice);
  await publishOrderFilled(order, fillPrice);

  return { ok: true };
}

export async function startFillSimulator(): Promise<void> {
  const consumer = kafka.consumer({ groupId: 'trading-fill-simulator', allowAutoTopicCreation: true });

  await consumer.connect();
  await consumer.subscribe({ topic: TOPICS.ORDERS_SUBMITTED, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      try {
        const order: Order = JSON.parse(message.value.toString());

        if (order.order_type === 'MARKET') {
          const price = latestPrices.get(order.symbol);
          if (!price) {
            await rejectOrder(order.id);
            return;
          }
          await executeFill(order, price);
        }
        // LIMIT orders are handled by checkLimitOrders() on each tick
      } catch (err) {
        console.error('Fill simulator error:', err);
      }
    },
  });
}

let lastCheck = 0;

// Called on every tick but throttled to once per second to avoid pool exhaustion
export async function checkLimitOrders(): Promise<void> {
  const now = Date.now();
  if (now - lastCheck < 900) return;
  lastCheck = now;
  const [limitOrders, marketOrders] = await Promise.all([
    getAllPendingLimitOrders(),
    getAllPendingMarketOrders(),
  ]);

  for (const order of marketOrders) {
    const price = latestPrices.get(order.symbol);
    if (!price) {
      await reject(order, `No price available for ${order.symbol}`);
      continue;
    }
    await executeFill(order, price);
  }

  for (const order of limitOrders) {
    if (!order.limit_price) continue;
    const price = latestPrices.get(order.symbol);
    if (!price) continue;

    const limitPrice = Number(order.limit_price);
    const shouldFill =
      (order.side === 'BUY' && price <= limitPrice) ||
      (order.side === 'SELL' && price >= limitPrice);

    if (shouldFill) {
      await executeFill(order, price);
    }
  }
}
