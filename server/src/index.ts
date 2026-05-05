import './loadEnv';
import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import { join } from 'path';
import pool from './db/pool';
import { initWebSocketServer, broadcastTick, sendToUser } from './ws/server';
import { refreshLeaderboards } from './ws/leaderboard';
import { startConsumers } from './kafka/consumer';
import { startFillSimulator, updatePrice, checkLimitOrders } from './kafka/fillSimulator';
import { startMarketDataEngine, getLatestPrices } from './marketData';
import { disconnectProducer } from './kafka/producer';
import authRouter from './routes/auth';
import competitionsRouter from './routes/competitions';
import ordersRouter from './routes/orders';
import portfolioRouter from './routes/portfolio';
import symbolsRouter from './routes/symbols';

const PORT = Number(process.env.PORT ?? 4000);
const WS_PORT = Number(process.env.WS_PORT ?? 4001);
const TICK_INTERVAL_MS = Number(process.env.TICK_INTERVAL_MS ?? 1000);

async function migrate(): Promise<void> {
  const schemaPath = join(__dirname, '../src/db/schema.sql');
  try {
    const sql = readFileSync(schemaPath, 'utf8');
    await pool.query(sql);
    console.log('Database schema applied');
  } catch {
    // In production the dist path differs
    try {
      const sql = readFileSync(join(__dirname, 'db/schema.sql'), 'utf8');
      await pool.query(sql);
      console.log('Database schema applied');
    } catch (err) {
      console.warn('Could not run migration automatically:', err);
    }
  }
}

async function main(): Promise<void> {
  await migrate();

  // Express HTTP server
  const app = express();
  app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? '*' }));
  app.use(express.json());

  app.use('/api/auth', authRouter);
  app.use('/api/competitions', competitionsRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/portfolio', portfolioRouter);
  app.use('/api/symbols', symbolsRouter);

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.listen(PORT, () => console.log(`HTTP server on http://localhost:${PORT}`));

  // WebSocket server
  initWebSocketServer(WS_PORT);

  // Kafka consumers: ticks → broadcast + leaderboard; fills → notify user
  await startConsumers(
    (tick) => {
      updatePrice(tick.symbol, tick.price);
      broadcastTick(tick);

      // Throttled leaderboard + limit order check on each tick
      const prices = getLatestPrices();
      refreshLeaderboards(prices).catch(console.error);
      checkLimitOrders().catch(console.error);
    },
    (order) => {
      sendToUser(order.user_id, { type: 'filled', data: order as never });
    },
  );

  // Kafka fill simulator (processes orders.submitted → fills)
  await startFillSimulator();

  // Market data engine (simulated or live provider) publishes to market.ticks
  const marketData = await startMarketDataEngine(TICK_INTERVAL_MS);

  console.log('Trading competition platform running');

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    console.log('Shutting down...');
    await marketData.stop();
    await disconnectProducer();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
