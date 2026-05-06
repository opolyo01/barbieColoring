import { fillOrder, rejectOrder, recordTrade, getAllPendingLimitOrders, getAllPendingMarketOrders } from './db/queries/orders';
import { getPortfolio, getHoldings, applyFill } from './db/queries/portfolio';
import { getCompetition } from './db/queries/competitions';
import { sendToUser } from './ws/server';
import { Holding, Order } from './types';

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

  const qty = Number(order.qty);
  const qtyDelta = order.side === 'BUY' ? qty : -qty;
  await applyFill(portfolio.id, order.symbol, qtyDelta, fillPrice);
  await recordTrade(order.id, order.user_id, order.competition_id, order.symbol, order.side, qty, fillPrice);
  sendToUser(order.user_id, { type: 'filled', data: filled });

  return { ok: true };
}

let lastCheck = 0;
let checkInFlight = false;

export async function checkPendingOrders(): Promise<void> {
  const now = Date.now();
  if (checkInFlight || now - lastCheck < 900) return;
  lastCheck = now;
  checkInFlight = true;

  try {
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
  } finally {
    checkInFlight = false;
  }
}
