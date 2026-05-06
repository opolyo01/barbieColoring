# TradeBattle — Setup Guide

## Quick Start (Local Dev)

### 1. Start infrastructure
```bash
docker compose up -d
```
Starts PostgreSQL.

### 2. Server
```bash
cd server
cp .env.example .env   # edit if needed
npm install
npm run dev            # http://localhost:4000  ws://localhost:4000/ws
```

### 3. Client
```bash
cd client
cp .env.example .env
npm install
npm run dev            # http://localhost:3000
```

---

## Deploy to Railway + Vercel

### Railway (server + postgres)
1. Create a new Railway project
2. Add a **PostgreSQL** service — copy the connection URL
3. Add a **Node.js** service pointing to `/server`
4. Set environment variables:
   ```
   DATABASE_URL=<railway postgres url>
   JWT_SECRET=<random 32-char string>
   DATABASE_SSL=true
   SINGLE_INSTANCE_LOCK_ID=42424201
   SERVER_URL=https://your-server.railway.app
   CLIENT_ORIGIN=https://your-app.vercel.app
   GOOGLE_CLIENT_ID=<google oauth client id>
   GOOGLE_CLIENT_SECRET=<google oauth client secret>
   ```
5. Build command: `npm install && npm run build`
6. Start command: `npm start`
7. Keep the backend service at one active instance. This app enforces a PostgreSQL advisory lock for single-instance runtime safety.

### Vercel (client)
1. Import the `/client` folder
2. Set environment variables:
   ```
   VITE_API_URL=https://your-server.railway.app
   VITE_WS_URL=wss://your-server.railway.app/ws
   ```
3. Build command: `npm run build`
4. Output dir: `dist`

---

## Swap Simulator for Real Prices

Replace `server/src/simulator/priceEngine.ts` with a real feed adapter.
The only interface the rest of the app uses is:

```typescript
// Called every tick
onTick(tick: PriceTick): void | Promise<void>

// Called by routes/portfolio.ts and leaderboard
getLatestPrices(): Map<string, number>
getSymbols(): string[]
```

Example: Alpaca WebSocket → `onTick` callback → everything else stays identical.

---

## Architecture

```
React (Vite)
  ↕ REST   /api/*  (Express)
  ↕ WS     /ws     (ws)

Node.js
  ├── Trading Engine  (risk checks + order fills)
  ├── Price Engine    (GBM simulator or live adapter → app ticks)
  └── PostgreSQL      (users, competitions, portfolios, orders)
```

## Runtime Notes

- `/health` is a liveness endpoint. In production it returns only `{ ok: true }`.
- `/ready` returns 200 only when the market-data engine is running and the single-instance DB lock is held.
- If the DB advisory lock connection is lost, the process exits rather than continuing in a potentially split-brain state.
