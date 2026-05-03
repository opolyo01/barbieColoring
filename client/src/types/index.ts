export interface User {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
}

export type CompetitionStatus = 'pending' | 'active' | 'closed';

export interface Competition {
  id: string;
  name: string;
  description: string | null;
  start_date: string;
  end_date: string;
  starting_balance: number;
  status: CompetitionStatus;
  created_by: string;
  created_at: string;
  participant_count?: number;
  enrolled?: boolean;
}

export interface Holding {
  id: string;
  portfolio_id: string;
  symbol: string;
  qty: number;
  avg_cost: number;
  current_price: number;
  market_value: number;
  unrealized_pnl: number;
}

export interface Portfolio {
  id: string;
  user_id: string;
  competition_id: string;
  cash_balance: number;
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
  created_at: string;
  filled_at: string | null;
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

export interface PriceTick {
  symbol: string;
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ts: number;
}

export interface SymbolInfo {
  symbol: string;
  price: number | null;
}

// WebSocket messages
export type WsMessage =
  | { type: 'tick'; data: PriceTick }
  | { type: 'filled'; data: Order }
  | { type: 'order_rejected'; orderId: string; reason: string }
  | { type: 'leaderboard'; competitionId: string; rankings: LeaderboardEntry[] }
  | { type: 'error'; message: string };
