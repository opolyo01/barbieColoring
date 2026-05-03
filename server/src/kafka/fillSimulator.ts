import kafka, { TOPICS } from './client';
import { publishOrderFilled } from './producer';
import { fillOrder, rejectOrder, recordTrade, getPendingLimitOrders } from '../db/queries/orders';
import { getPortfolio, applyFill } from '../db/queries/portfolio';
import { Order } from '../types';

// In-memory latest prices (updated on every tick)
const latestPrices = new Map<string, number>();

export function updatePrice(symbol: string, price: number): void {
  latestPrices.set(symbol, price);
}

export function getLatestPrice(symbol: string): number | undefined {
  return latestPrices.get(symbol);
}

// Check if a short order has sufficient margin (150% of position value)
async function hasMargin(order: Order, fillPrice: number): Promise<boolean> {
  if (order.side === 'BUY') return true; // longs are checked via cash

  const portfolio = await getPortfolio(order.user_id, order.competition_id);
  if (!portfolio) return false;

  const required = Number(order.qty) * fillPrice * 1.5;
  return Number(portfolio.cash_balance) >= required;
}

async function executeFill(order: Order, fillPrice: number): Promise<boolean> {
  const portfolio = await getPortfolio(order.user_id, order.competition_id);
  if (!portfolio) return false;

  const cash = Number(portfolio.cash_balance);
  const qty = Number(order.qty);

  // BUY: need enough cash
  if (order.side === 'BUY') {
    const cost = qty * fillPrice;
    if (cash < cost) {
      await rejectOrder(order.id);
      return false;
    }
  }

  // SELL (short): need 150% margin if going net short
  if (order.side === 'SELL') {
    const shortMarginOk = await hasMargin(order, fillPrice);
    if (!shortMarginOk) {
      await rejectOrder(order.id);
      return false;
    }
  }

  const filled = await fillOrder(order.id, fillPrice);
  if (!filled) return false;

  // qty sign convention: BUY → positive delta, SELL → negative delta
  const qtyDelta = order.side === 'BUY' ? qty : -qty;
  await applyFill(portfolio.id, order.symbol, qtyDelta, fillPrice);
  await recordTrade(order.id, order.user_id, order.competition_id, order.symbol, order.side, qty, fillPrice);
  await publishOrderFilled(order, fillPrice);

  return true;
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

// Called on every tick to check if any pending LIMIT orders can be filled
export async function checkLimitOrders(competitionIds: string[]): Promise<void> {
  for (const competitionId of competitionIds) {
    const pendingOrders = await getPendingLimitOrders(competitionId);
    for (const order of pendingOrders) {
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
}
