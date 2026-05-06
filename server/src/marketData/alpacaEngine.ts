import WebSocket, { RawData } from 'ws';
import { PriceTick } from '../types';

interface AlpacaEngineOptions {
  apiKey: string;
  apiSecret: string;
  symbols: string[];
  publishIntervalMs: number;
  snapshotRefreshMs: number;
  onTick: (tick: PriceTick) => void | Promise<void>;
}

interface SymbolState extends PriceTick {
  dirty: boolean;
}

// Alpaca IEX stream events
interface AlpacaTradeEvent {
  T: 't';
  S: string;
  p: number;
  s: number;
  t: string;
}

interface AlpacaQuoteEvent {
  T: 'q';
  S: string;
  bp: number;
  ap: number;
  t: string;
}

interface AlpacaControlEvent {
  T: 'success' | 'error' | 'subscription';
  msg?: string;
  code?: number;
}

type AlpacaEvent = AlpacaTradeEvent | AlpacaQuoteEvent | AlpacaControlEvent | Record<string, unknown>;

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function firstNumber(...values: unknown[]): number | null {
  for (const v of values) {
    const n = asNumber(v);
    if (n != null) return n;
  }
  return null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const WS_URL = 'wss://stream.data.alpaca.markets/v2/iex';
const REST_BASE = 'https://data.alpaca.markets';

export class AlpacaEngine {
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly publishIntervalMs: number;
  private readonly snapshotRefreshMs: number;
  private readonly onTick: (tick: PriceTick) => void | Promise<void>;
  private readonly includeQuotes = false;
  private readonly trackedSymbols = new Set<string>();
  private readonly states = new Map<string, SymbolState>();

  private ws: WebSocket | null = null;
  private publishTimer: ReturnType<typeof setInterval> | null = null;
  private snapshotTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private authenticated = false;
  private connectAttempt = 0;

  constructor(options: AlpacaEngineOptions) {
    this.apiKey = options.apiKey;
    this.apiSecret = options.apiSecret;
    this.publishIntervalMs = Math.max(options.publishIntervalMs, 250);
    this.snapshotRefreshMs = Math.max(options.snapshotRefreshMs, 5_000);
    this.onTick = options.onTick;

    for (const sym of options.symbols) {
      this.trackedSymbols.add(sym.toUpperCase());
    }
  }

  async start(): Promise<void> {
    await this.refreshSnapshots();
    this.startPublishLoop();
    this.startSnapshotLoop();
    this.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.authenticated = false;

    if (this.publishTimer) { clearInterval(this.publishTimer); this.publishTimer = null; }
    if (this.snapshotTimer) { clearInterval(this.snapshotTimer); this.snapshotTimer = null; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }

    if (!this.ws) return;
    const ws = this.ws;
    this.ws = null;

    await new Promise<void>((resolve) => {
      if (ws.readyState === WebSocket.CLOSED) { resolve(); return; }
      ws.once('close', () => resolve());
      ws.close();
    });
  }

  getSymbols(): string[] {
    return Array.from(this.trackedSymbols);
  }

  getLatestPrices(): Map<string, number> {
    const out = new Map<string, number>();
    for (const [sym, s] of this.states) out.set(sym, s.price);
    return out;
  }

  async ensureSymbol(symbol: string): Promise<number> {
    const sym = symbol.toUpperCase();
    this.trackedSymbols.add(sym);

    if (!this.states.has(sym)) {
      await this.hydrateSymbols([sym]);
    }

    if (this.ws?.readyState === WebSocket.OPEN && this.authenticated) {
      this.subscribeSymbols([sym]);
    }

    const state = this.states.get(sym);
    if (!state) throw new Error(`Unable to load market data for ${sym}`);
    return state.price;
  }

  private startPublishLoop(): void {
    this.publishTimer = setInterval(() => {
      for (const state of this.states.values()) {
        if (!state.dirty) continue;
        state.dirty = false;

        const tick: PriceTick = {
          symbol: state.symbol,
          price: state.price,
          bid: state.bid,
          ask: state.ask,
          open: state.open,
          high: state.high,
          low: state.low,
          close: state.close,
          volume: state.volume,
          ts: state.ts,
        };

        Promise.resolve(this.onTick(tick)).catch((err: Error) => {
          console.error(`[alpaca] Failed to process tick for ${tick.symbol}:`, err.message);
        });
      }
    }, this.publishIntervalMs);
  }

  private startSnapshotLoop(): void {
    this.snapshotTimer = setInterval(() => {
      this.refreshSnapshots().catch((err) => {
        console.error('[alpaca] Snapshot refresh failed:', err);
      });
    }, this.snapshotRefreshMs);
  }

  private connect(): void {
    if (this.stopped) return;

    const ws = new WebSocket(WS_URL);
    this.ws = ws;
    this.authenticated = false;

    ws.on('open', () => {
      this.connectAttempt = 0;
      ws.send(JSON.stringify({ action: 'auth', key: this.apiKey, secret: this.apiSecret }));
    });

    ws.on('message', (raw) => this.handleMessage(raw));

    ws.on('error', (err) => {
      console.error('[alpaca] WebSocket error:', err.message);
    });

    ws.on('close', () => {
      this.ws = null;
      this.authenticated = false;
      if (this.stopped) return;

      const delayMs = Math.min(30_000, 1_000 * 2 ** Math.min(this.connectAttempt, 5));
      this.connectAttempt += 1;
      this.reconnectTimer = setTimeout(() => this.connect(), delayMs);
    });
  }

  private handleMessage(raw: RawData): void {
    let parsed: unknown;
    try { parsed = JSON.parse(raw.toString()); } catch { return; }

    const events = Array.isArray(parsed) ? parsed : [parsed];
    for (const event of events as AlpacaEvent[]) {
      if (typeof event !== 'object' || event == null) continue;
      const ev = (event as Record<string, unknown>).T;

      if (ev === 'success') {
        const msg = String((event as AlpacaControlEvent).msg ?? '').toLowerCase();
        if (msg === 'authenticated') {
          this.authenticated = true;
          this.subscribeSymbols();
          console.log('[alpaca] Authenticated — subscribed to', this.trackedSymbols.size, 'symbols (trades only)');
        }
        continue;
      }

      if (ev === 'error') {
        const ctrl = event as AlpacaControlEvent;
        console.error(`[alpaca] Stream error code=${ctrl.code} msg=${ctrl.msg}`);
        continue;
      }

      if (ev === 't') {
        this.applyTrade(event as AlpacaTradeEvent);
        continue;
      }

      if (ev === 'q') {
        this.applyQuote(event as AlpacaQuoteEvent);
      }
    }
  }

  private subscribeSymbols(symbols: string[] = Array.from(this.trackedSymbols)): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || symbols.length === 0) return;
    this.ws.send(JSON.stringify({
      action: 'subscribe',
      trades: symbols,
      ...(this.includeQuotes ? { quotes: symbols } : {}),
    }));
  }

  private applyTrade(event: AlpacaTradeEvent): void {
    const sym = event.S.toUpperCase();
    const state = this.states.get(sym) ?? this.createState(sym, event.p);
    const size = Number.isFinite(event.s) ? Math.max(0, Math.round(event.s)) : 0;

    state.price = event.p;
    state.close = event.p;
    state.high = Math.max(state.high, event.p);
    state.low = Math.min(state.low, event.p);
    state.volume += size;
    state.ts = new Date(event.t).getTime();

    if (!this.includeQuotes || state.bid <= 0 || state.ask <= 0) {
      const half = Math.max(0.01, event.p * 0.0005);
      state.bid = Number((event.p - half).toFixed(2));
      state.ask = Number((event.p + half).toFixed(2));
    }

    state.dirty = true;
    this.states.set(sym, state);
  }

  private applyQuote(event: AlpacaQuoteEvent): void {
    const sym = event.S.toUpperCase();
    const mid = (event.bp + event.ap) / 2;
    const state = this.states.get(sym) ?? this.createState(sym, mid);

    state.bid = event.bp;
    state.ask = event.ap;
    state.ts = new Date(event.t).getTime();

    if (!Number.isFinite(state.price) || state.price <= 0) {
      state.price = mid;
      state.close = mid;
      state.high = Math.max(state.high, mid);
      state.low = Math.min(state.low, mid);
    }

    state.dirty = true;
    this.states.set(sym, state);
  }

  private createState(symbol: string, price: number): SymbolState {
    const p = Number(price.toFixed(2));
    const half = Math.max(0.01, p * 0.0005);
    return {
      symbol,
      price: p,
      bid: Number((p - half).toFixed(2)),
      ask: Number((p + half).toFixed(2)),
      open: p, high: p, low: p, close: p,
      volume: 0,
      ts: Date.now(),
      dirty: true,
    };
  }

  private async refreshSnapshots(): Promise<void> {
    await this.hydrateSymbols(Array.from(this.trackedSymbols));
  }

  private async hydrateSymbols(symbols: string[]): Promise<void> {
    for (const batch of chunk(symbols, 100)) {
      const data = await this.fetchSnapshots(batch);
      const found = new Set<string>();

      for (const [symbol, snapshot] of Object.entries(data)) {
        const state = this.buildStateFromSnapshot(symbol.toUpperCase(), snapshot);
        if (!state) continue;

        found.add(state.symbol);
        const prev = this.states.get(state.symbol);
        const merged = prev
          ? {
              ...prev,
              ...state,
              bid: state.bid > 0 ? state.bid : prev.bid,
              ask: state.ask > 0 ? state.ask : prev.ask,
              volume: state.volume > 0 ? state.volume : prev.volume,
              dirty: prev.price !== state.price || prev.bid !== state.bid || prev.ask !== state.ask ||
                     prev.open !== state.open || prev.high !== state.high || prev.low !== state.low ||
                     prev.close !== state.close || prev.volume !== state.volume,
            }
          : state;

        this.states.set(state.symbol, merged);
      }

      for (const sym of batch) {
        if (found.has(sym)) continue;
        if (!this.states.has(sym)) throw new Error(`No Alpaca snapshot returned for ${sym}`);
      }
    }
  }

  private async fetchSnapshots(symbols: string[]): Promise<Record<string, unknown>> {
    const url = new URL('/v2/stocks/snapshots', REST_BASE);
    url.searchParams.set('symbols', symbols.join(','));
    url.searchParams.set('feed', 'iex');

    const response = await fetch(url.toString(), {
      headers: {
        'APCA-API-KEY-ID': this.apiKey,
        'APCA-API-SECRET-KEY': this.apiSecret,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      let detail = body.trim();
      try {
        const payload = JSON.parse(body) as { message?: string; error?: string };
        detail = payload.message ?? payload.error ?? detail;
      } catch { /* keep raw text */ }
      throw new Error(`Alpaca snapshot failed: HTTP ${response.status}${detail ? ` - ${detail}` : ''}`);
    }

    return response.json() as Promise<Record<string, unknown>>;
  }

  private buildStateFromSnapshot(symbol: string, snapshot: unknown): SymbolState | null {
    if (typeof snapshot !== 'object' || snapshot == null) return null;
    const raw = snapshot as Record<string, Record<string, unknown>>;

    const trade = raw.latestTrade ?? {};
    const quote = raw.latestQuote ?? {};
    const bar = raw.dailyBar ?? {};
    const prevBar = raw.prevDailyBar ?? {};

    const bid = firstNumber(quote.bp, bar.o);
    const ask = firstNumber(quote.ap, bar.c);
    const mid = bid != null && ask != null ? (bid + ask) / 2 : null;
    const price = firstNumber(trade.p, bar.c, prevBar.c, mid);
    if (price == null) return null;

    const open = firstNumber(bar.o, prevBar.c, price) ?? price;
    const high = firstNumber(bar.h, price) ?? price;
    const low = firstNumber(bar.l, price) ?? price;
    const close = firstNumber(bar.c, price) ?? price;
    const volume = firstNumber(bar.v, prevBar.v, 0) ?? 0;
    const tsRaw = trade.t ?? quote.t ?? null;
    const ts = tsRaw ? new Date(String(tsRaw)).getTime() : Date.now();

    const state = this.createState(symbol, price);
    state.open = Number(open.toFixed(2));
    state.high = Number(high.toFixed(2));
    state.low = Number(low.toFixed(2));
    state.close = Number(close.toFixed(2));
    state.volume = Math.max(0, Math.round(volume));
    state.ts = Number.isFinite(ts) ? ts : Date.now();
    if (bid != null) state.bid = Number(bid.toFixed(2));
    if (ask != null) state.ask = Number(ask.toFixed(2));
    state.dirty = true;

    return state;
  }
}
