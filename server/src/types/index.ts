export interface User {
  id: string;
  email: string;
  display_name: string;
  created_at: Date;
}

export type CompetitionStatus = 'pending' | 'active' | 'closed';

export interface Competition {
  id: string;
  name: string;
  description: string | null;
  start_date: Date;
  end_date: Date;
  starting_balance: number;
  status: CompetitionStatus;
  created_by: string;
  created_at: Date;
}

export interface Enrollment {
  id: string;
  user_id: string;
  competition_id: string;
  joined_at: Date;
}

export interface Portfolio {
  id: string;
  user_id: string;
  competition_id: string;
  cash_balance: number;
}

export interface Holding {
  id: string;
  portfolio_id: string;
  symbol: string;
  qty: number;       // negative = short position
  avg_cost: number;  // avg entry price
}

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT';
export type OrderStatus = 'pending' | 'filled' | 'cancelled' | 'rejected';

export interface Order {
  id: string;
  user_id: string;
  competition_id: string;
  symbol: string;
  side: OrderSide;
  qty: number;
  order_type: OrderType;
  limit_price: number | null;
  status: OrderStatus;
  fill_price: number | null;
  created_at: Date;
  filled_at: Date | null;
}

export interface Trade {
  id: string;
  order_id: string;
  user_id: string;
  competition_id: string;
  symbol: string;
  side: OrderSide;
  qty: number;
  fill_price: number;
  filled_at: Date;
}

export interface PriceTick {
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ts: number;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  display_name: string;
  portfolio_value: number;
  starting_balance: number;
  pnl: number;
  pnl_pct: number;
  cash_balance: number;
}

// WebSocket message types (server → client)
export type WsServerMessage =
  | { type: 'tick'; data: PriceTick }
  | { type: 'filled'; data: Trade }
  | { type: 'order_rejected'; orderId: string; reason: string }
  | { type: 'leaderboard'; competitionId: string; rankings: LeaderboardEntry[] }
  | { type: 'error'; message: string };

// WebSocket message types (client → server)
export type WsClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'subscribe'; competitionId: string }
  | { type: 'unsubscribe'; competitionId: string };

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}
