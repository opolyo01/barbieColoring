# TradeBattle — Stock Trading Competition Platform

Compete against others using a virtual trading book. Each user gets a configurable starting balance (default $1M), places real-time buy/sell/short orders, and the leaderboard ranks everyone by portfolio P&L. Best performance wins when the competition closes.

**Stack:** React + TypeScript · Node.js + TypeScript · Kafka (KRaft) · WebSockets · PostgreSQL

---

## OAuth Setup (required before first run)

Authentication uses Google and Facebook OAuth — no username/password.

### Google
1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project → **APIs & Services** → **Credentials** → **Create OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Add Authorised redirect URI:
   - Local: `http://localhost:4000/api/auth/google/callback`
   - Production: `https://your-server.railway.app/api/auth/google/callback`
5. Copy **Client ID** and **Client Secret** → set in `server/.env`

### Facebook
1. Go to [developers.facebook.com](https://developers.facebook.com) → **Create App** → **Consumer**
2. Add **Facebook Login** product → **Settings**
3. Add Valid OAuth Redirect URI:
   - Local: `http://localhost:4000/api/auth/facebook/callback`
   - Production: `https://your-server.railway.app/api/auth/facebook/callback`
4. Copy **App ID** and **App Secret** from **App Settings → Basic** → set in `server/.env`

> For local dev Facebook requires HTTPS by default. Use [ngrok](https://ngrok.com) to tunnel `localhost:4000` and use the ngrok URL as `SERVER_URL`.

---

## Running Locally

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) (for Kafka + Postgres)
- Node.js 18+

### 1. Start infrastructure

```bash
docker compose up -d
```

This starts:
- **Kafka** on `localhost:9092` (KRaft mode — no Zookeeper)
- **PostgreSQL** on `localhost:5432`

### 2. Start the server

```bash
cd server
cp .env.example .env       # fill in GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, FACEBOOK_APP_ID, FACEBOOK_APP_SECRET
npm install
npm run dev                # http://localhost:4000  |  ws://localhost:4001
```

The server auto-applies the DB schema on first start.

### 3. Start the client

```bash
cd client
cp .env.example .env
npm install
npm run dev                # http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000), sign in with Google or Facebook, create a competition, and start trading.

### Stopping

```bash
docker compose down        # stop Kafka + Postgres (keeps data)
docker compose down -v     # stop and wipe all data
```

---

## Deploying Remotely (Free Tier)

The recommended free stack is **Railway** (server + Postgres) + **Upstash** (Kafka) + **Vercel** (client).

### Step 1 — Upstash Kafka

1. Create a free account at [upstash.com](https://upstash.com)
2. Create a new **Kafka** cluster (free tier: 10k messages/day)
3. Note down: **Bootstrap URL**, **Username**, **Password**

### Step 2 — Railway (server + Postgres)

1. Go to [railway.app](https://railway.app) and create a new project
2. Add a **PostgreSQL** plugin — Railway gives you a connection URL automatically
3. Add a new **service** → deploy from GitHub → select this repo → set root to `/server`
4. Set these environment variables in Railway:

```
DATABASE_URL        = <Railway Postgres connection URL>
JWT_SECRET          = <any random 32+ character string>
KAFKA_BROKERS       = <Upstash bootstrap URL>
KAFKA_USERNAME      = <Upstash username>
KAFKA_PASSWORD      = <Upstash password>
SERVER_URL          = https://your-server.railway.app
CLIENT_ORIGIN       = https://your-app.vercel.app
GOOGLE_CLIENT_ID    = <from Google Console>
GOOGLE_CLIENT_SECRET= <from Google Console>
FACEBOOK_APP_ID     = <from Facebook Developer>
FACEBOOK_APP_SECRET = <from Facebook Developer>
PORT                = 4000
WS_PORT             = 4000
TICK_INTERVAL_MS    = 1000
```

5. Set build command: `npm install && npm run build`
6. Set start command: `npm start`

> **WebSocket on Railway:** Set `WS_PORT=4000` to match `PORT` — Railway proxies both HTTP and WebSocket on the same port.

### Step 3 — Vercel (client)

1. Go to [vercel.com](https://vercel.com) and import this GitHub repo
2. Set **Root Directory** to `client`
3. Set these environment variables:

```
VITE_API_URL   = https://your-server.railway.app
VITE_WS_URL    = wss://your-server.railway.app
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
| `WS_PORT` | WebSocket server port | `4001` |
| `JWT_SECRET` | Secret for signing JWTs | — |
| `SERVER_URL` | Public URL of this server | `http://localhost:4000` |
| `CLIENT_ORIGIN` | Frontend URL (CORS + OAuth redirect) | `http://localhost:3000` |
| `DATABASE_URL` | PostgreSQL connection string | — |
| `KAFKA_BROKERS` | Comma-separated broker addresses | `localhost:9092` |
| `KAFKA_USERNAME` | Kafka SASL username (Upstash) | — |
| `KAFKA_PASSWORD` | Kafka SASL password (Upstash) | — |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | — |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | — |
| `FACEBOOK_APP_ID` | Facebook app ID | — |
| `FACEBOOK_APP_SECRET` | Facebook app secret | — |
| `TICK_INTERVAL_MS` | Price tick frequency in ms | `1000` |

### Client (`client/.env`)

| Variable | Description | Default |
|---|---|---|
| `VITE_API_URL` | Server HTTP base URL | `http://localhost:4000` |
| `VITE_WS_URL` | Server WebSocket URL | `ws://localhost:4001` |

---

## Architecture

```
Browser (React)
  │
  ├─ REST  /api/*  ──────────► Express (Node.js)
  │                                 │
  └─ WebSocket :4001 ◄──────────────┤
                                    │
                          ┌─────────┼─────────┐
                          │         │         │
                       Kafka     Postgres  Price
                     Consumer/   (users,  Engine
                     Producer  portfolios, (GBM sim)
                               orders)
```

**Kafka topics:**

| Topic | Direction | Content |
|---|---|---|
| `market.ticks` | Engine → UI | Live OHLCV ticks per symbol |
| `orders.submitted` | UI → Simulator | New orders to process |
| `orders.filled` | Simulator → UI | Fill confirmations |

---

## Swapping the Price Simulator for Real Data

The simulator lives entirely in `server/src/simulator/priceEngine.ts`. The rest of the app only depends on two functions:

```typescript
getLatestPrices(): Map<string, number>   // called by portfolio + leaderboard
getSymbols(): string[]                   // called by order validation
```

And one Kafka call:
```typescript
publishTick(tick: PriceTick): Promise<void>  // imported from kafka/producer.ts
```

To plug in a real feed (e.g. Alpaca, Polygon.io):
1. Replace `startPriceEngine()` with a WebSocket connection to your data provider
2. On each incoming price event, call `publishTick()` with the same `PriceTick` shape
3. Keep `getLatestPrices()` and `getSymbols()` returning current state

No other files need to change.
