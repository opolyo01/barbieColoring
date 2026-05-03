import pool from '../pool';
import { Order, OrderSide, OrderType } from '../../types';

export async function createOrder(
  userId: string,
  competitionId: string,
  symbol: string,
  side: OrderSide,
  qty: number,
  orderType: OrderType,
  limitPrice: number | null,
): Promise<Order> {
  const { rows } = await pool.query<Order>(
    `INSERT INTO orders (user_id, competition_id, symbol, side, qty, order_type, limit_price)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [userId, competitionId, symbol, side, qty, orderType, limitPrice],
  );
  return rows[0];
}

export async function fillOrder(orderId: string, fillPrice: number): Promise<Order | null> {
  const { rows } = await pool.query<Order>(
    `UPDATE orders
     SET status = 'filled', fill_price = $1, filled_at = NOW()
     WHERE id = $2 AND status = 'pending'
     RETURNING *`,
    [fillPrice, orderId],
  );
  return rows[0] ?? null;
}

export async function rejectOrder(orderId: string): Promise<void> {
  await pool.query("UPDATE orders SET status = 'rejected' WHERE id = $1", [orderId]);
}

export async function getPendingLimitOrders(competitionId: string): Promise<Order[]> {
  const { rows } = await pool.query<Order>(
    `SELECT * FROM orders
     WHERE competition_id = $1 AND status = 'pending' AND order_type = 'LIMIT'`,
    [competitionId],
  );
  return rows;
}

export async function recordTrade(
  orderId: string,
  userId: string,
  competitionId: string,
  symbol: string,
  side: OrderSide,
  qty: number,
  fillPrice: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO trades (order_id, user_id, competition_id, symbol, side, qty, fill_price)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [orderId, userId, competitionId, symbol, side, qty, fillPrice],
  );
}

export async function getTradeHistory(userId: string, competitionId: string): Promise<Order[]> {
  const { rows } = await pool.query<Order>(
    `SELECT * FROM orders
     WHERE user_id = $1 AND competition_id = $2
     ORDER BY created_at DESC
     LIMIT 200`,
    [userId, competitionId],
  );
  return rows;
}
