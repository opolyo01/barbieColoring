import pool from '../pool';
import { Order, OrderSide, OrderType } from '../../types';

export interface CompetitionTradeAuditRow {
  id: string;
  order_id: string;
  user_id: string;
  display_name: string;
  symbol: string;
  side: OrderSide;
  qty: number;
  fill_price: number;
  filled_at: Date;
}

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

export async function cancelOrder(orderId: string, userId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    "UPDATE orders SET status = 'cancelled' WHERE id = $1 AND user_id = $2 AND status = 'pending'",
    [orderId, userId],
  );
  return (rowCount ?? 0) > 0;
}

export async function getAllPendingLimitOrders(): Promise<Order[]> {
  const { rows } = await pool.query<Order>(
    `SELECT * FROM orders WHERE status = 'pending' AND order_type = 'LIMIT'`,
  );
  return rows;
}

export async function getAllPendingMarketOrders(): Promise<Order[]> {
  const { rows } = await pool.query<Order>(
    `SELECT * FROM orders WHERE status = 'pending' AND order_type = 'MARKET'`,
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

export async function getCompetitionTradeAudit(competitionId: string): Promise<CompetitionTradeAuditRow[]> {
  const { rows } = await pool.query<CompetitionTradeAuditRow>(
    `SELECT t.id,
            t.order_id,
            t.user_id,
            u.display_name,
            t.symbol,
            t.side,
            t.qty,
            t.fill_price,
            t.filled_at
     FROM trades t
     JOIN users u ON u.id = t.user_id
     WHERE t.competition_id = $1
     ORDER BY t.filled_at DESC
     LIMIT 1000`,
    [competitionId],
  );
  return rows.map((row) => ({
    ...row,
    qty: Number(row.qty),
    fill_price: Number(row.fill_price),
  }));
}
