# TradeBattle — Setup Guide

## Quick Start (Local Dev)

### 1. Start infrastructure
```bash
docker compose up -d
```
Starts Kafka (KRaft, no Zookeeper) + PostgreSQL.

### 2. Server
```bash
cd server
cp .env.example .env   # edit if needed
npm install
npm run dev            # http://localhost:4000  ws://localhost:4001
```

### 3. Client
```bash
cd client
cp .env.example .env
npm install
npm run dev            # http://localhost:3000
```

---

## Deploy to Railway + Vercel + Upstash

### Railway (server + postgres)
1. Create a new Railway project
2. Add a **PostgreSQL** service — copy the connection URL
3. Add a **Node.js** service pointing to `/server`
4. Set environment variables:
   ```
   DATABASE_URL=<railway postgres url>
   JWT_SECRET=<random 32-char string>
   KAFKA_BROKERS=<upstash broker url>
   KAFKA_USERNAME=<upstash username>
   KAFKA_PASSWORD=<upstash password>
   CLIENT_ORIGIN=https://your-app.vercel.app
   ```
5. Build command: `npm install && npm run build`
6. Start command: `npm start`

### Upstash Kafka (free)
1. Create account at upstash.com
2. Create a Kafka cluster (free tier)
3. Copy broker URL, username, password → Railway env vars

### Vercel (client)
1. Import the `/client` folder
2. Set environment variables:
   ```
   VITE_API_URL=https://your-server.railway.app
   VITE_WS_URL=wss://your-server.railway.app
   ```
3. Build command: `npm run build`
4. Output dir: `dist`

---

## Swap Simulator for Real Prices

Replace `server/src/simulator/priceEngine.ts` with a real feed adapter.
The only interface the rest of the app uses is:

```typescript
// Called every tick
publishTick(tick: PriceTick): Promise<void>

// Called by routes/portfolio.ts and leaderboard
getLatestPrices(): Map<string, number>
getSymbols(): string[]
```

Example: Alpaca WebSocket → publishTick → everything else stays identical.

---

## Architecture

```
React (Vite)
  ↕ REST   /api/*  (Express)
  ↕ WS     :4001   (ws)

Node.js
  ├── Kafka Consumer  ← market.ticks, orders.filled
  ├── Kafka Producer  → orders.submitted
  ├── Fill Simulator  (orders.submitted → fills → orders.filled)
  ├── Price Engine    (GBM simulator → market.ticks)
  └── PostgreSQL      (users, competitions, portfolios, orders)
```
