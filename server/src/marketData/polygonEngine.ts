import WebSocket, { RawData } from 'ws';
import { publishTick } from '../kafka/producer';
import { PriceTick } from '../types';

type PolygonFeed = 'delayed' | 'realtime';
type MarketDataVendor = 'polygon' | 'massive';

interface PolygonEngineOptions {
  apiKey: string;
  vendor: MarketDataVendor;
  feed: PolygonFeed;
  symbols: string[];
  publishIntervalMs: number;
  snapshotRefreshMs: number;
}

interface SymbolState extends PriceTick {
  dirty: boolean;
}

interface PolygonTradeEvent {
  ev: 'T';
  sym: string;
  p: number;
  s: number;
  t: number;
}

interface PolygonQuoteEvent {
  ev: 'Q';
  sym: string;
  bp: number;
  ap: number;
  t: number;
}

interface PolygonStatusEvent {
  ev: 'status';
  status?: string;
  message?: string;
}

type PolygonEvent = PolygonTradeEvent | PolygonQuoteEvent | PolygonStatusEvent | Record<string, unknown>;

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function firstNumber(...values: Array<unknown>): number | null {
  for (const value of values) {
    const parsed = asNumber(value);
    if (parsed != null) return parsed;
  }
  return null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function isTradeEvent(event: PolygonEvent): event is PolygonTradeEvent {
  return event.ev === 'T'
    && typeof event.sym === 'string'
    && typeof event.p === 'number'
    && typeof event.s === 'number'
    && typeof event.t === 'number';
}

function isQuoteEvent(event: PolygonEvent): event is PolygonQuoteEvent {
  return event.ev === 'Q'
    && typeof event.sym === 'string'
    && typeof event.bp === 'number'
    && typeof event.ap === 'number'
    && typeof event.t === 'number';
}

export class PolygonEngine {
  private readonly apiKey: string;
  private readonly vendor: MarketDataVendor;
  private readonly feed: PolygonFeed;
  private readonly includeQuotes: boolean;
  private readonly publishIntervalMs: number;
  private readonly snapshotRefreshMs: number;
  private readonly restBaseUrl: string;
  private readonly trackedSymbols = new Set<string>();
  private readonly states = new Map<string, SymbolState>();

  private ws: WebSocket | null = null;
  private publishTimer: ReturnType<typeof setInterval> | null = null;
  private snapshotTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private authenticated = false;
  private connectAttempt = 0;

  constructor(options: PolygonEngineOptions) {
    this.apiKey = options.apiKey;
    this.vendor = options.vendor;
    this.feed = options.feed;
    this.includeQuotes = options.feed === 'realtime';
    this.publishIntervalMs = Math.max(options.publishIntervalMs, 250);
    this.snapshotRefreshMs = Math.max(options.snapshotRefreshMs, 5_000);
    this.restBaseUrl = options.vendor === 'massive'
      ? 'https://api.massive.com'
      : 'https://api.polygon.io';

    for (const symbol of options.symbols) {
      this.trackedSymbols.add(symbol.toUpperCase());
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

    if (this.publishTimer) {
      clearInterval(this.publishTimer);
      this.publishTimer = null;
    }
    if (this.snapshotTimer) {
      clearInterval(this.snapshotTimer);
      this.snapshotTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (!this.ws) return;

    const ws = this.ws;
    this.ws = null;

    await new Promise<void>((resolve) => {
      if (ws.readyState === WebSocket.CLOSED) {
        resolve();
        return;
      }
      ws.once('close', () => resolve());
      ws.close();
    });
  }

  getSymbols(): string[] {
    return Array.from(this.trackedSymbols);
  }

  getLatestPrices(): Map<string, number> {
    const latest = new Map<string, number>();
    for (const [symbol, state] of this.states) {
      latest.set(symbol, state.price);
    }
    return latest;
  }

  async ensureSymbol(symbol: string): Promise<number> {
    const normalized = symbol.toUpperCase();
    this.trackedSymbols.add(normalized);

    if (!this.states.has(normalized)) {
      await this.hydrateSymbols([normalized]);
    }

    if (this.ws?.readyState === WebSocket.OPEN && this.authenticated) {
      this.subscribeSymbols([normalized]);
    }

    const state = this.states.get(normalized);
    if (!state) {
      throw new Error(`Unable to load market data for ${normalized}`);
    }
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

        publishTick(tick).catch((err: Error) => {
          console.error(`[marketData] Failed to publish tick for ${tick.symbol}:`, err.message);
        });
      }
    }, this.publishIntervalMs);
  }

  private startSnapshotLoop(): void {
    this.snapshotTimer = setInterval(() => {
      this.refreshSnapshots().catch((err) => {
        console.error('[marketData] Snapshot refresh failed:', err);
      });
    }, this.snapshotRefreshMs);
  }

  private connect(): void {
    if (this.stopped) return;

    const wsHost = this.vendor === 'massive'
      ? (this.feed === 'realtime' ? 'wss://socket.massive.com/stocks' : 'wss://delayed.massive.com/stocks')
      : (this.feed === 'realtime' ? 'wss://socket.polygon.io/stocks' : 'wss://delayed.polygon.io/stocks');
    const wsUrl = wsHost;

    const ws = new WebSocket(wsUrl);
    this.ws = ws;
    this.authenticated = false;

    ws.on('open', () => {
      this.connectAttempt = 0;
      ws.send(JSON.stringify({ action: 'auth', params: this.apiKey }));
    });

    ws.on('message', (raw) => {
      this.handleMessage(raw);
    });

    ws.on('error', (err) => {
      const prefix = this.vendor === 'massive' ? 'Massive' : 'Polygon';
      console.error(`[marketData] ${prefix} WebSocket error:`, err.message);
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
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      return;
    }

    const events = Array.isArray(parsed) ? parsed : [parsed];
    for (const event of events as PolygonEvent[]) {
      if (typeof event !== 'object' || event == null) continue;

      if (event.ev === 'status') {
        const message = `${event.status ?? ''} ${event.message ?? ''}`.toLowerCase();
        if (message.includes('auth') || message.includes('authenticated')) {
          this.authenticated = true;
          this.subscribeSymbols();
        }
        continue;
      }

      if (isTradeEvent(event)) {
        this.applyTrade(event);
        continue;
      }

      if (this.includeQuotes && isQuoteEvent(event)) {
        this.applyQuote(event);
      }
    }
  }

  private subscribeSymbols(symbols: string[] = Array.from(this.trackedSymbols)): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || symbols.length === 0) return;

    const params = symbols.flatMap((symbol) => {
      const channels = [`T.${symbol}`];
      if (this.includeQuotes) channels.push(`Q.${symbol}`);
      return channels;
    });

    this.ws.send(JSON.stringify({
      action: 'subscribe',
      params: params.join(','),
    }));
  }

  private applyTrade(event: PolygonTradeEvent): void {
    const symbol = event.sym.toUpperCase();
    const state = this.states.get(symbol) ?? this.createState(symbol, event.p);
    const size = Number.isFinite(event.s) ? Math.max(0, Math.round(event.s)) : 0;

    state.price = event.p;
    state.close = event.p;
    state.high = Math.max(state.high, event.p);
    state.low = Math.min(state.low, event.p);
    state.volume += size;
    state.ts = event.t;

    if (state.bid <= 0 || state.ask <= 0) {
      const syntheticHalfSpread = Math.max(0.01, event.p * 0.0005);
      state.bid = Number((event.p - syntheticHalfSpread).toFixed(2));
      state.ask = Number((event.p + syntheticHalfSpread).toFixed(2));
    }

    state.dirty = true;
    this.states.set(symbol, state);
  }

  private applyQuote(event: PolygonQuoteEvent): void {
    const symbol = event.sym.toUpperCase();
    const mid = (event.bp + event.ap) / 2;
    const state = this.states.get(symbol) ?? this.createState(symbol, mid);

    state.bid = event.bp;
    state.ask = event.ap;
    state.ts = event.t;

    if (!Number.isFinite(state.price) || state.price <= 0) {
      state.price = mid;
      state.close = mid;
      state.high = Math.max(state.high, mid);
      state.low = Math.min(state.low, mid);
    }

    state.dirty = true;
    this.states.set(symbol, state);
  }

  private createState(symbol: string, price: number): SymbolState {
    const roundedPrice = Number(price.toFixed(2));
    const halfSpread = Math.max(0.01, roundedPrice * 0.0005);
    return {
      symbol,
      price: roundedPrice,
      bid: Number((roundedPrice - halfSpread).toFixed(2)),
      ask: Number((roundedPrice + halfSpread).toFixed(2)),
      open: roundedPrice,
      high: roundedPrice,
      low: roundedPrice,
      close: roundedPrice,
      volume: 0,
      ts: Date.now(),
      dirty: true,
    };
  }

  private async refreshSnapshots(): Promise<void> {
    await this.hydrateSymbols(Array.from(this.trackedSymbols));
  }

  private async hydrateSymbols(symbols: string[]): Promise<void> {
    for (const symbolsChunk of chunk(symbols, 50)) {
      const snapshots = await this.fetchSnapshots(symbolsChunk);
      const found = new Set<string>();

      for (const snapshot of snapshots) {
        const state = this.buildStateFromSnapshot(snapshot);
        if (!state) continue;

        found.add(state.symbol);
        const previous = this.states.get(state.symbol);
        const merged = previous
          ? {
              ...previous,
              ...state,
              bid: state.bid > 0 ? state.bid : previous.bid,
              ask: state.ask > 0 ? state.ask : previous.ask,
              volume: state.volume > 0 ? state.volume : previous.volume,
              dirty: previous.price !== state.price ||
                previous.bid !== state.bid ||
                previous.ask !== state.ask ||
                previous.open !== state.open ||
                previous.high !== state.high ||
                previous.low !== state.low ||
                previous.close !== state.close ||
                previous.volume !== state.volume,
            }
          : state;

        this.states.set(state.symbol, merged);
      }

      for (const symbol of symbolsChunk) {
        if (found.has(symbol)) continue;
        if (!this.states.has(symbol)) {
          throw new Error(`No snapshot returned for ${symbol}`);
        }
      }
    }
  }

  private async fetchSnapshots(symbols: string[]): Promise<unknown[]> {
    const url = new URL('/v2/snapshot/locale/us/markets/stocks/tickers', this.restBaseUrl);
    url.searchParams.set('tickers', symbols.join(','));
    url.searchParams.set('apiKey', this.apiKey);

    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.text();
      let detail = body.trim();
      try {
        const payload = JSON.parse(body) as { message?: string; error?: string; status?: string };
        detail = payload.message ?? payload.error ?? payload.status ?? detail;
      } catch {
        // Keep raw text detail when the response is not JSON.
      }
      const prefix = this.vendor === 'massive' ? 'Massive' : 'Polygon';
      throw new Error(`${prefix} snapshot request failed: HTTP ${response.status}${detail ? ` - ${detail}` : ''}`);
    }

    const payload = await response.json() as { tickers?: unknown[]; status?: string; error?: string };
    if (payload.error) {
      const prefix = this.vendor === 'massive' ? 'Massive' : 'Polygon';
      throw new Error(`${prefix} snapshot request failed: ${payload.error}`);
    }
    return payload.tickers ?? [];
  }

  private buildStateFromSnapshot(snapshot: unknown): SymbolState | null {
    if (typeof snapshot !== 'object' || snapshot == null) return null;
    const raw = snapshot as Record<string, unknown>;
    const symbol = typeof raw.ticker === 'string' ? raw.ticker.toUpperCase() : null;
    if (!symbol) return null;

    const day = typeof raw.day === 'object' && raw.day != null ? raw.day as Record<string, unknown> : {};
    const minute = typeof raw.min === 'object' && raw.min != null ? raw.min as Record<string, unknown> : {};
    const prevDay = typeof raw.prevDay === 'object' && raw.prevDay != null ? raw.prevDay as Record<string, unknown> : {};
    const lastTrade = typeof raw.lastTrade === 'object' && raw.lastTrade != null ? raw.lastTrade as Record<string, unknown> : {};
    const lastQuote = typeof raw.lastQuote === 'object' && raw.lastQuote != null ? raw.lastQuote as Record<string, unknown> : {};

    const bid = firstNumber(lastQuote.bp, lastQuote.p, day.o);
    const ask = firstNumber(lastQuote.ap, lastQuote.P, day.c);
    const mid = bid != null && ask != null ? (bid + ask) / 2 : null;
    const price = firstNumber(lastTrade.p, minute.c, day.c, prevDay.c, mid);

    if (price == null) return null;

    const open = firstNumber(day.o, minute.o, prevDay.c, price) ?? price;
    const high = firstNumber(day.h, minute.h, price) ?? price;
    const low = firstNumber(day.l, minute.l, price) ?? price;
    const close = firstNumber(day.c, minute.c, price) ?? price;
    const volume = firstNumber(day.v, minute.v, prevDay.v, 0) ?? 0;
    const ts = firstNumber(lastTrade.t, lastQuote.t, raw.updated, Date.now()) ?? Date.now();

    const next = this.createState(symbol, price);
    next.open = Number(open.toFixed(2));
    next.high = Number(high.toFixed(2));
    next.low = Number(low.toFixed(2));
    next.close = Number(close.toFixed(2));
    next.volume = Math.max(0, Math.round(volume));
    next.ts = Math.round(ts);
    next.bid = bid != null ? Number(bid.toFixed(2)) : next.bid;
    next.ask = ask != null ? Number(ask.toFixed(2)) : next.ask;
    next.dirty = true;

    return next;
  }
}
