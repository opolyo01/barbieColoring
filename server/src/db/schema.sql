-- Trading Competition Platform Schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  password_hash TEXT,                         -- null for OAuth users
  provider      TEXT,                         -- 'google' | 'facebook'
  provider_id   TEXT,                         -- provider's user ID
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (email),
  UNIQUE (provider, provider_id)
);

CREATE TABLE IF NOT EXISTS competitions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  description      TEXT,
  start_date       TIMESTAMPTZ NOT NULL,
  end_date         TIMESTAMPTZ NOT NULL,
  starting_balance NUMERIC(20, 2) NOT NULL DEFAULT 1000000,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'closed')),
  created_by       UUID NOT NULL REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS enrollments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id),
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  joined_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, competition_id)
);

CREATE TABLE IF NOT EXISTS portfolios (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id),
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  cash_balance   NUMERIC(20, 2) NOT NULL,
  UNIQUE(user_id, competition_id)
);

CREATE TABLE IF NOT EXISTS holdings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  symbol       TEXT NOT NULL,
  qty          NUMERIC(20, 6) NOT NULL,   -- negative = short
  avg_cost     NUMERIC(20, 6) NOT NULL,   -- avg entry price
  UNIQUE(portfolio_id, symbol)
);

CREATE TABLE IF NOT EXISTS orders (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id),
  competition_id UUID NOT NULL REFERENCES competitions(id),
  symbol         TEXT NOT NULL,
  side           TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  qty            NUMERIC(20, 6) NOT NULL,
  order_type     TEXT NOT NULL CHECK (order_type IN ('MARKET', 'LIMIT')),
  limit_price    NUMERIC(20, 6),
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'filled', 'cancelled', 'rejected')),
  fill_price     NUMERIC(20, 6),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  filled_at      TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS trades (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL REFERENCES orders(id),
  user_id        UUID NOT NULL REFERENCES users(id),
  competition_id UUID NOT NULL REFERENCES competitions(id),
  symbol         TEXT NOT NULL,
  side           TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
  qty            NUMERIC(20, 6) NOT NULL,
  fill_price     NUMERIC(20, 6) NOT NULL,
  filled_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_enrollments_competition ON enrollments(competition_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_user ON enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolios_competition ON portfolios(competition_id);
CREATE INDEX IF NOT EXISTS idx_holdings_portfolio ON holdings(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_competition ON orders(user_id, competition_id);
CREATE INDEX IF NOT EXISTS idx_orders_competition_pending ON orders(competition_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_trades_user_competition ON trades(user_id, competition_id);
