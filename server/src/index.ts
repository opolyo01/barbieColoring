import './loadEnv';
import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import { join } from 'path';
import pool from './db/pool';
import { Server as HttpServer } from 'http';
import { initWebSocketServer, broadcastTick, closeWebSocketServer, getConnectedClientCount } from './ws/server';
import { refreshLeaderboards } from './ws/leaderboard';
import { startMarketDataEngine, getLatestPrices, getMarketDataProvider, type MarketDataController } from './marketData';
import authRouter from './routes/auth';
import competitionsRouter from './routes/competitions';
import ordersRouter from './routes/orders';
import portfolioRouter from './routes/portfolio';
import symbolsRouter from './routes/symbols';
import { CLIENT_ORIGIN, PORT, SINGLE_INSTANCE_LOCK_ID, TICK_INTERVAL_MS } from './config';
import { checkPendingOrders, updatePrice } from './tradingEngine';
import { acquireSingleInstanceLease, type SingleInstanceLease } from './singleInstance';

async function migrate(): Promise<void> {
  const schemaPaths = [
    join(__dirname, '../src/db/schema.sql'),
    join(__dirname, 'db/schema.sql'),
  ];

  let lastError: unknown;
  for (const schemaPath of schemaPaths) {
    try {
      const sql = readFileSync(schemaPath, 'utf8');
      await pool.query(sql);
      console.log('Database schema applied');
      return;
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(`Could not run database migration automatically: ${String(lastError)}`);
}

async function shutdownWithError(err: unknown): Promise<never> {
  await pool.end().catch(() => {});
  throw err;
}

async function main(): Promise<void> {
  await migrate();

  const runtime = {
    startedAt: new Date().toISOString(),
    ready: false,
    shuttingDown: false,
    singleInstanceLockHeld: false,
    marketDataProvider: getMarketDataProvider(),
  };
  let marketData: MarketDataController | null = null;
  let httpServer: HttpServer | null = null;
  let lease: SingleInstanceLease | null = null;
  let shutdownPromise: Promise<void> | null = null;

  const shutdown = async (exitCode = 0, err?: unknown): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;

    runtime.ready = false;
    runtime.shuttingDown = true;
    if (err) {
      console.error('Shutdown triggered by runtime error:', err);
    }

    shutdownPromise = (async () => {
      if (marketData) {
        await marketData.stop().catch((stopErr) => console.error('Market data stop failed:', stopErr));
        marketData = null;
      }

      await closeWebSocketServer().catch((wsErr) => console.error('WebSocket close failed:', wsErr));

      if (httpServer) {
        await new Promise<void>((resolve) => {
          httpServer?.close(() => resolve());
        });
        httpServer = null;
      }

      if (lease) {
        await lease.release().catch((lockErr) => console.error('Single-instance lease release failed:', lockErr));
        runtime.singleInstanceLockHeld = false;
        lease = null;
      }

      await pool.end().catch((poolErr) => console.error('DB pool shutdown failed:', poolErr));
      process.exit(exitCode);
    })();

    return shutdownPromise;
  };

  lease = await acquireSingleInstanceLease((err) => {
    void shutdown(1, err);
  }).catch(shutdownWithError);
  runtime.singleInstanceLockHeld = lease.isHeld();

  // Express HTTP server
  const app = express();
  app.use(cors({ origin: CLIENT_ORIGIN }));
  app.use(express.json({ limit: '256kb' }));

  app.use('/api/auth', authRouter);
  app.use('/api/competitions', competitionsRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/portfolio', portfolioRouter);
  app.use('/api/symbols', symbolsRouter);

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      ready: runtime.ready,
      shuttingDown: runtime.shuttingDown,
      marketDataProvider: runtime.marketDataProvider,
      singleInstance: {
        enforced: true,
        lockHeld: runtime.singleInstanceLockHeld,
        lockId: SINGLE_INSTANCE_LOCK_ID,
      },
      websocketClients: getConnectedClientCount(),
      startedAt: runtime.startedAt,
    });
  });

  app.get('/ready', (_req, res) => {
    const ready = runtime.ready && runtime.singleInstanceLockHeld && !runtime.shuttingDown;
    res.status(ready ? 200 : 503).json({
      ok: ready,
      marketDataProvider: runtime.marketDataProvider,
      singleInstanceLockHeld: runtime.singleInstanceLockHeld,
      shuttingDown: runtime.shuttingDown,
    });
  });

  httpServer = app.listen(PORT, () => console.log(`HTTP server on http://localhost:${PORT}`));
  httpServer.on('error', (err) => {
    void shutdown(1, err);
  });

  // WebSocket server
  initWebSocketServer(httpServer);

  // Market data engine (simulated or live provider) calls back directly on each tick.
  marketData = await startMarketDataEngine(TICK_INTERVAL_MS, (tick) => {
    updatePrice(tick.symbol, tick.price);
    broadcastTick(tick);

    const prices = getLatestPrices();
    refreshLeaderboards(prices).catch(console.error);
    checkPendingOrders().catch(console.error);
  }).catch(async (err) => {
    await shutdown(1, err);
    throw err;
  });
  runtime.marketDataProvider = getMarketDataProvider();
  runtime.ready = true;

  console.log(`Trading competition platform running (single-instance lock ${lease.lockId})`);

  process.on('SIGTERM', () => { void shutdown(0); });
  process.on('SIGINT', () => { void shutdown(0); });
  process.on('uncaughtException', (err) => { void shutdown(1, err); });
  process.on('unhandledRejection', (err) => { void shutdown(1, err); });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
