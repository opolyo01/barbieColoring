import {
  startPriceEngine as startSimulatedPriceEngine,
  getLatestPrices as getSimulatedLatestPrices,
  getSymbols as getSimulatedSymbols,
  ensureSymbol as ensureSimulatedSymbol,
} from '../simulator/priceEngine';
import { PolygonEngine } from './polygonEngine';

export type MarketDataProvider = 'simulated' | 'polygon';
type LiveMarketDataVendor = 'polygon' | 'massive';

export interface MarketDataController {
  stop(): Promise<void>;
}

let activeProvider: MarketDataProvider = resolveMarketDataProvider();
let simulatedTimer: ReturnType<typeof setInterval> | null = null;
let polygonEngine: PolygonEngine | null = null;

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
    return getConfiguredValue('POLYGON_API_KEY', 'MASSIVE_API_KEY') ? 'polygon' : 'simulated';
  }

  const raw = configured.toLowerCase();
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

export async function startMarketDataEngine(tickIntervalMs: number): Promise<MarketDataController> {
  activeProvider = resolveMarketDataProvider();

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

  simulatedTimer = startSimulatedPriceEngine(tickIntervalMs);
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
  if (activeProvider === 'polygon' && polygonEngine) {
    return polygonEngine.getLatestPrices();
  }
  return getSimulatedLatestPrices();
}

export function getSymbols(): string[] {
  if (activeProvider === 'polygon' && polygonEngine) {
    return polygonEngine.getSymbols();
  }
  return getSimulatedSymbols();
}

export async function ensureSymbol(symbol: string): Promise<number> {
  if (activeProvider === 'polygon') {
    if (!polygonEngine) throw new Error('Market data engine has not started');
    return polygonEngine.ensureSymbol(symbol);
  }
  return ensureSimulatedSymbol(symbol);
}
