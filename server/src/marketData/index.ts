import {
  startPriceEngine as startSimulatedPriceEngine,
  getLatestPrices as getSimulatedLatestPrices,
  getSymbols as getSimulatedSymbols,
  ensureSymbol as ensureSimulatedSymbol,
} from '../simulator/priceEngine';
import { PolygonEngine } from './polygonEngine';
import { AlpacaEngine } from './alpacaEngine';

export type MarketDataProvider = 'simulated' | 'polygon' | 'alpaca';
type LiveMarketDataVendor = 'polygon' | 'massive';

export interface MarketDataController {
  stop(): Promise<void>;
}

type TickHandler = (tick: import('../types').PriceTick) => void | Promise<void>;

let activeProvider: MarketDataProvider = resolveMarketDataProvider();
let simulatedTimer: ReturnType<typeof setInterval> | null = null;
let polygonEngine: PolygonEngine | null = null;
let alpacaEngine: AlpacaEngine | null = null;

function getConfiguredValue(...keys: string[]): string | null {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return null;
}

function resolveMarketDataProvider(): MarketDataProvider {
  const configured = process.env.MARKET_DATA_PROVIDER;
  if (!configured) {
    if (getConfiguredValue('ALPACA_API_KEY')) return 'alpaca';
    if (getConfiguredValue('POLYGON_API_KEY', 'MASSIVE_API_KEY')) return 'polygon';
    return 'simulated';
  }

  const raw = configured.toLowerCase();
  if (raw === 'alpaca') return 'alpaca';
  if (raw === 'polygon' || raw === 'massive' || raw === 'real') return 'polygon';
  return 'simulated';
}

function resolveLiveMarketDataVendor(): LiveMarketDataVendor {
  const configured = process.env.MARKET_DATA_PROVIDER?.toLowerCase();
  if (configured === 'massive') return 'massive';
  if (configured === 'polygon') return 'polygon';
  return getConfiguredValue('POLYGON_API_KEY') ? 'polygon' : 'massive';
}

function resolvePolygonFeed(): 'delayed' | 'realtime' {
  const raw = (process.env.POLYGON_FEED ?? process.env.MASSIVE_FEED ?? 'delayed').toLowerCase();
  return raw === 'realtime' ? 'realtime' : 'delayed';
}

export function getMarketDataProvider(): MarketDataProvider {
  return activeProvider;
}

export async function startMarketDataEngine(
  tickIntervalMs: number,
  onTick: TickHandler,
): Promise<MarketDataController> {
  activeProvider = resolveMarketDataProvider();

  if (activeProvider === 'alpaca') {
    const apiKey = getConfiguredValue('ALPACA_API_KEY');
    const apiSecret = getConfiguredValue('ALPACA_API_SECRET');
    if (!apiKey || !apiSecret) {
      throw new Error('MARKET_DATA_PROVIDER=alpaca requires ALPACA_API_KEY and ALPACA_API_SECRET');
    }

    alpacaEngine = new AlpacaEngine({
      apiKey,
      apiSecret,
      symbols: getSimulatedSymbols(),
      publishIntervalMs: Number(process.env.MARKET_DATA_PUBLISH_MS ?? tickIntervalMs),
      snapshotRefreshMs: Number(process.env.ALPACA_SNAPSHOT_REFRESH_MS ?? 60_000),
      onTick,
    });
    await alpacaEngine.start();

    console.log(`[marketData] Provider=alpaca feed=iex trades-only symbols=${alpacaEngine.getSymbols().length}`);

    return {
      stop: async () => {
        const engine = alpacaEngine;
        alpacaEngine = null;
        await engine?.stop();
      },
    };
  }

  if (activeProvider === 'polygon') {
    const apiKey = getConfiguredValue('POLYGON_API_KEY', 'MASSIVE_API_KEY');
    if (!apiKey) {
      throw new Error('MARKET_DATA_PROVIDER=polygon requires POLYGON_API_KEY or MASSIVE_API_KEY');
    }

    const vendor = resolveLiveMarketDataVendor();
    polygonEngine = new PolygonEngine({
      apiKey,
      vendor,
      feed: resolvePolygonFeed(),
      symbols: getSimulatedSymbols(),
      publishIntervalMs: Number(process.env.MARKET_DATA_PUBLISH_MS ?? tickIntervalMs),
      snapshotRefreshMs: Number(process.env.POLYGON_SNAPSHOT_REFRESH_MS ?? 60_000),
      onTick,
    });
    await polygonEngine.start();

    console.log(
      `[marketData] Provider=polygon vendor=${vendor} feed=${resolvePolygonFeed()} symbols=${polygonEngine.getSymbols().length}`,
    );

    return {
      stop: async () => {
        const engine = polygonEngine;
        polygonEngine = null;
        await engine?.stop();
      },
    };
  }

  simulatedTimer = startSimulatedPriceEngine(tickIntervalMs, onTick);
  console.log(`[marketData] Provider=simulated symbols=${getSimulatedSymbols().length}`);

  return {
    stop: async () => {
      if (simulatedTimer) {
        clearInterval(simulatedTimer);
        simulatedTimer = null;
      }
    },
  };
}

export function getLatestPrices(): Map<string, number> {
  if (activeProvider === 'alpaca' && alpacaEngine) return alpacaEngine.getLatestPrices();
  if (activeProvider === 'polygon' && polygonEngine) return polygonEngine.getLatestPrices();
  return getSimulatedLatestPrices();
}

export function getSymbols(): string[] {
  if (activeProvider === 'alpaca' && alpacaEngine) return alpacaEngine.getSymbols();
  if (activeProvider === 'polygon' && polygonEngine) return polygonEngine.getSymbols();
  return getSimulatedSymbols();
}

export async function ensureSymbol(symbol: string): Promise<number> {
  if (activeProvider === 'alpaca') {
    if (!alpacaEngine) throw new Error('Market data engine has not started');
    return alpacaEngine.ensureSymbol(symbol);
  }
  if (activeProvider === 'polygon') {
    if (!polygonEngine) throw new Error('Market data engine has not started');
    return polygonEngine.ensureSymbol(symbol);
  }
  return ensureSimulatedSymbol(symbol);
}
