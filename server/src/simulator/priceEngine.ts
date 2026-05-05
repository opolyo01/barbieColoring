import { PriceTick } from '../types';
import { publishTick } from '../kafka/producer';

// Initial prices and per-symbol volatility (annualized %)
const SYMBOLS: Record<string, { price: number; volatility: number; drift: number }> = {
  AAPL:  { price: 185.00, volatility: 0.25, drift: 0.05 },
  TSLA:  { price: 250.00, volatility: 0.60, drift: 0.10 },
  NVDA:  { price: 480.00, volatility: 0.55, drift: 0.15 },
  MSFT:  { price: 415.00, volatility: 0.22, drift: 0.08 },
  AMZN:  { price: 185.00, volatility: 0.28, drift: 0.07 },
  GOOGL: { price: 175.00, volatility: 0.24, drift: 0.06 },
  META:  { price: 495.00, volatility: 0.35, drift: 0.09 },
  NFLX:  { price: 680.00, volatility: 0.40, drift: 0.05 },
  AMD:   { price: 165.00, volatility: 0.50, drift: 0.12 },
  INTC:  { price: 30.00,  volatility: 0.30, drift: -0.02 },
  JPM:   { price: 200.00, volatility: 0.20, drift: 0.06 },
  GS:    { price: 480.00, volatility: 0.25, drift: 0.07 },
  BAC:   { price: 38.00,  volatility: 0.22, drift: 0.04 },
  WMT:   { price: 65.00,  volatility: 0.15, drift: 0.04 },
  COST:  { price: 790.00, volatility: 0.18, drift: 0.06 },
  SPY:   { price: 520.00, volatility: 0.15, drift: 0.07 },
  QQQ:   { price: 450.00, volatility: 0.18, drift: 0.09 },
  DIS:   { price: 95.00,  volatility: 0.28, drift: 0.03 },
  UBER:  { price: 75.00,  volatility: 0.45, drift: 0.10 },
  PYPL:  { price: 62.00,  volatility: 0.40, drift: 0.02 },
};

// Current state per symbol
const state: Record<string, { price: number; open: number; high: number; low: number }> = {};

for (const [symbol, cfg] of Object.entries(SYMBOLS)) {
  state[symbol] = { price: cfg.price, open: cfg.price, high: cfg.price, low: cfg.price };
}

// Box-Muller transform for standard normal random variable
function randNormal(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Geometric Brownian Motion: dS = S(μ dt + σ dW)
// Trading day = 8 hours = 28800 seconds
const TICKS_PER_YEAR = 252 * 28800;

function nextPrice(symbol: string): number {
  const cfg = SYMBOLS[symbol];
  const dt = 1 / TICKS_PER_YEAR;
  const drift = (cfg.drift - 0.5 * cfg.volatility ** 2) * dt;
  const diffusion = cfg.volatility * Math.sqrt(dt) * randNormal();
  const newPrice = state[symbol].price * Math.exp(drift + diffusion);
  return Math.max(newPrice, 0.01); // price floor
}

export function getLatestPrices(): Map<string, number> {
  const map = new Map<string, number>();
  for (const [symbol, s] of Object.entries(state)) {
    map.set(symbol, s.price);
  }
  return map;
}

export function getSymbols(): string[] {
  return Object.keys(SYMBOLS);
}

// Dynamically add a symbol if not already tracked; returns its current price
export function ensureSymbol(symbol: string): number {
  if (state[symbol]) return state[symbol].price;

  const initialPrice = parseFloat((50 + Math.random() * 200).toFixed(2));
  (SYMBOLS as Record<string, { price: number; volatility: number; drift: number }>)[symbol] = {
    price: initialPrice,
    volatility: 0.30,
    drift: 0.05,
  };
  state[symbol] = { price: initialPrice, open: initialPrice, high: initialPrice, low: initialPrice };
  console.log(`[priceEngine] Added dynamic symbol ${symbol} @ $${initialPrice}`);
  return initialPrice;
}

// Reset OHLC candle every minute
let lastCandleReset = Date.now();

export function startPriceEngine(tickIntervalMs: number): NodeJS.Timeout {
  console.log(`Price engine started — ${Object.keys(SYMBOLS).length} symbols, ${tickIntervalMs}ms interval`);

  return setInterval(async () => {
    const now = Date.now();

    // Reset OHLC at the start of a new minute
    if (now - lastCandleReset >= 60_000) {
      for (const s of Object.values(state)) {
        s.open = s.price;
        s.high = s.price;
        s.low = s.price;
      }
      lastCandleReset = now;
    }

    for (const symbol of Object.keys(SYMBOLS)) {
      const newPrice = nextPrice(symbol);
      const s = state[symbol];

      s.price = newPrice;
      if (newPrice > s.high) s.high = newPrice;
      if (newPrice < s.low) s.low = newPrice;

      const volume = Math.floor(Math.random() * 5000 + 500);
      const halfSpread = Math.max(0.01, newPrice * (SYMBOLS as Record<string, { price: number; volatility: number; drift: number }>)[symbol].volatility * 0.001);

      const tick: PriceTick = {
        symbol,
        price: newPrice,
        bid: parseFloat((newPrice - halfSpread).toFixed(2)),
        ask: parseFloat((newPrice + halfSpread).toFixed(2)),
        open: s.open,
        high: s.high,
        low: s.low,
        close: newPrice,
        volume,
        ts: now,
      };

      // Fire and forget — don't block the interval
      publishTick(tick).catch((err: Error) => {
        console.error(`Failed to publish tick for ${symbol}:`, err.message);
      });
    }
  }, tickIntervalMs);
}
