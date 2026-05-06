# TradeBattle — Stock Trading Competition Platform

Compete against others using a virtual trading book. Each user gets a configurable starting balance (default $1M), places real-time buy/sell/short orders, and the leaderboard ranks everyone by portfolio P&L. Best performance wins when the competition closes.

**Stack:** React + TypeScript · Node.js + TypeScript · WebSockets · PostgreSQL

---

## OAuth Setup (required before first run)

Authentication uses Google OAuth — no username/password.

### Google
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project → **APIs & Services** → **Credentials** → **Create OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Add Authorised redirect URI:
   - Local: `http://localhost:4000/api/auth/google/callback`
   - Production: `https://your-server.railway.app/api/auth/google/callback`
5. Copy **Client ID** and **Client Secret** → set in `server/.env`

---

## Running Locally

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) (for Postgres)
- Node.js 18+

### 1. Start infrastructure

```bash
docker compose up -d
```

This starts:
- **PostgreSQL** on `localhost:5432`

### 2. Start the server

```bash
cd server
cp .env.example .env       # fill in GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
npm install
npm run dev                # http://localhost:4000  |  ws://localhost:4000/ws
```

The server auto-applies the DB schema on first start.

For market data, you have three runtime modes in `server/.env`:

Alpaca IEX (recommended if you want a live provider without a paid market-data plan):

```bash
MARKET_DATA_PROVIDER=alpaca
ALPACA_API_KEY=your_key_here
ALPACA_API_SECRET=your_secret_here
ALPACA_SNAPSHOT_REFRESH_MS=60000
```

Polygon / Massive:

```bash
MARKET_DATA_PROVIDER=massive   # or polygon
MASSIVE_API_KEY=your_key_here  # or POLYGON_API_KEY=your_key_here
POLYGON_FEED=delayed           # or realtime if your plan supports it
POLYGON_SNAPSHOT_REFRESH_MS=60000
```

If `MARKET_DATA_PROVIDER` is left as `simulated`, the existing `server/src/simulator/priceEngine.ts` stays in use.

### 3. Start the client

```bash
cd client
cp .env.example .env
npm install
npm run dev                # http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000), sign in with Google, create a competition, and start trading.

### Stopping

```bash
docker compose down        # stop Postgres (keeps data)
docker compose down -v     # stop and wipe all data
```

---

## Deploying Remotely

The recommended stack is **Railway** (server + Postgres) + **Vercel** (client).

### Step 1 — Railway (server + Postgres)

1. Go to [railway.app](https://railway.app) and create a new project
2. Add a **PostgreSQL** plugin — Railway gives you a connection URL automatically
3. Add a new **service** → deploy from GitHub → select this repo → set root to `/server`
4. Set these environment variables in Railway:

```
DATABASE_URL        = <Railway Postgres connection URL>
JWT_SECRET          = <any random 32+ character string>
DATABASE_SSL        = true
SINGLE_INSTANCE_LOCK_ID = 42424201
SERVER_URL          = https://your-server.railway.app
CLIENT_ORIGIN       = https://your-app.vercel.app
GOOGLE_CLIENT_ID    = <from Google Console>
GOOGLE_CLIENT_SECRET= <from Google Console>
PORT                = 4000
TICK_INTERVAL_MS    = 1000
```

5. Set build command: `npm install && npm run build`
6. Set start command: `npm start`
7. Keep the service at **1 replica / 1 active instance**. This app now enforces a single-instance DB advisory lock and is intentionally not designed for active-active backend replicas.

> **WebSocket on Railway:** the app now serves WebSockets on the same port as HTTP at `/ws`.

### Step 2 — Vercel (client)

1. Go to [vercel.com](https://vercel.com) and import this GitHub repo
2. Set **Root Directory** to `client`
3. Set these environment variables:

```
VITE_API_URL   = https://your-server.railway.app
VITE_WS_URL    = wss://your-server.railway.app/ws
```

4. Build command: `npm run build`
5. Output directory: `dist`
6. Deploy

---

## Environment Variables Reference

### Server (`server/.env`)

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP server port | `4000` |
| `JWT_SECRET` | Secret for signing JWTs | — |
| `DATABASE_SSL` | Enable TLS for PostgreSQL connections | `false` in local dev, `true` recommended in prod |
| `SERVER_URL` | Public URL of this server | `http://localhost:4000` |
| `CLIENT_ORIGIN` | Frontend URL (CORS + OAuth redirect) | `http://localhost:3000` |
| `DATABASE_URL` | PostgreSQL connection string | — |
| `SINGLE_INSTANCE_LOCK_ID` | PostgreSQL advisory lock ID used to enforce one active backend instance | `42424201` |
| `MAX_ORDER_QTY` | Upper bound for one order request | `1000000` |
| `AUTH_RATE_LIMIT_WINDOW_MS` | Auth rate-limit window | `900000` |
| `AUTH_RATE_LIMIT_MAX` | Max auth requests per window | `120` |
| `ORDER_RATE_LIMIT_WINDOW_MS` | Order write rate-limit window | `60000` |
| `ORDER_RATE_LIMIT_MAX` | Max order write requests per window | `300` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | — |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | — |
| `TICK_INTERVAL_MS` | Price tick frequency in ms | `1000` |
| `MARKET_DATA_PROVIDER` | `simulated`, `alpaca`, `polygon`, or `massive` | `simulated` |
| `MARKET_DATA_PUBLISH_MS` | Tick publish cadence into the app UI/order checker | `1000` |
| `ALPACA_API_KEY` | Alpaca market-data API key | — |
| `ALPACA_API_SECRET` | Alpaca market-data API secret | — |
| `ALPACA_SNAPSHOT_REFRESH_MS` | Snapshot resync cadence for Alpaca mode | `60000` |
| `POLYGON_API_KEY` | API key for Polygon/Massive live data | — |
| `MASSIVE_API_KEY` | Alias for `POLYGON_API_KEY` | — |
| `POLYGON_FEED` | `delayed` or `realtime` live feed | `delayed` |
| `POLYGON_SNAPSHOT_REFRESH_MS` | Snapshot resync cadence for live mode | `60000` |

### Client (`client/.env`)

| Variable | Description | Default |
|---|---|---|
| `VITE_API_URL` | Server HTTP base URL | `http://localhost:4000` |
| `VITE_WS_URL` | Server WebSocket URL | `ws://localhost:4000/ws` |

---

## Architecture

```
Browser (React)
  │
  ├─ REST  /api/*  ──────────► Express (Node.js)
  │                                 │
  └─ WebSocket /ws ◄────────────────┤
                                    │
                          ┌─────────┼─────────┐
                          │         │         │
                    Trading      Postgres  Market Data
                     Engine      (users,    Engine
                  (fills/risk) portfolios, (sim / Alpaca /
                                 orders)    Polygon/Massive)
```

---

## Market Data Modes

The simulator remains in `server/src/simulator/priceEngine.ts` for tests and deterministic local development.

Runtime market data now goes through `server/src/marketData/index.ts`, which can start:

1. the simulator (`MARKET_DATA_PROVIDER=simulated`)
2. an Alpaca IEX-backed engine (`MARKET_DATA_PROVIDER=alpaca`)
3. a Polygon/Massive-backed engine (`MARKET_DATA_PROVIDER=polygon` or `massive`)

The provider adapters are:

- `server/src/marketData/alpacaEngine.ts`
- `server/src/marketData/polygonEngine.ts`

Each live adapter:

- hydrates initial symbol state from provider snapshots
- streams trade and quote updates over WebSocket
- synthesizes app-level `PriceTick` events and hands them directly to the server runtime
- keeps the same downstream interfaces used by portfolio marks, leaderboard updates, and order fills

## Single-Instance Production

The no-Kafka architecture is intentionally hardened for **one active backend instance per database**.

- Startup acquires a PostgreSQL advisory lock and exits if another instance already holds it.
- `/health` reports detailed liveness only outside production; production responses are scrubbed to `{ ok: true }`.
- `/ready` only goes green after market data is up and the single-instance lock is held.
- If the lock connection is lost, the process shuts itself down rather than continuing in a split-brain state.

This is the right tradeoff for a simpler deployment, but it means you should **not** run multiple active app replicas against the same database.
