# Alex Trader — Multi-Asset AI Signals & Smart Money Watch

Alex Trader is a demo-mode, signals-only chart assistant with a cross-platform trader-event monitor. It does not connect to brokers, copy trades or place orders.

## Features
- Upload PNG/JPG/WEBP chart screenshots (max 8 MB).
- Server-side OpenAI vision reads the asset, timeframe and visible expiry from each screenshot; unknown values remain unknown.
- Conservative HIGHER / LOWER / WAIT analysis.
- Optional browser notifications and local signal journal with manual outcome tracking and CSV export.
- Smart Money Watch dashboard aggregates external trader trade events and calculates observed win rates.
- Secure bearer-token-protected webhook: POST /api/trader-events.
- Trader ranking eligibility requires at least 20 settled trades; ranking is descriptive, not a promise of future performance.
- Execution is disabled in all modes.

## Important data-source limitation
There is no universal public API that exposes every trader's live trades across every platform. The monitor does not scrape private accounts, bypass platform controls or ask for broker passwords/session cookies. Each platform needs a supported public API, user-authorized export, or a trusted integration that can send events to the webhook. Until connected, the dashboard will correctly show that no feed is connected. Events are held in server memory and reset when the service restarts; this is a prototype, not durable storage.

## Run locally
Requires Node.js 18+.
```sh
npm install
cp .env.example .env
# Set OPENAI_API_KEY and a long random TRADER_FEED_TOKEN in .env
npm start
```
Open http://localhost:3000. Keep secrets only in the server environment; never commit .env or place keys in browser JavaScript.

## Deploy on Render
1. Create a Render Blueprint and connect `zacharieyab-prog/alex-trader`.
2. Keep the web service on Free if desired.
3. Add `OPENAI_API_KEY` and `TRADER_FEED_TOKEN` as secret environment variables.
4. Deploy and check `/api/health`.

OpenAI API usage is billed separately. Free Render services can sleep when idle; in-memory trader events reset on restart. Use a persistent database before relying on long-term rankings.

## API
- `GET /api/health`: AI configuration, feed configuration and execution lock.
- `POST /api/analyze`: multipart image field `chart`; timeframe and expiry are extracted from the image.
- `GET /api/traders`: aggregated trader statistics and recent received events.
- `POST /api/trader-events`: accepts one event or an `events` array (up to 100), authenticated with `Authorization: Bearer <TRADER_FEED_TOKEN>`.

Example event:
```json
{
  "platform": "ExampleExchange",
  "trader": "public-trader-id",
  "asset": "BTCUSDT",
  "direction": "BUY",
  "entry": 68000,
  "opened_at": "2026-11-11T00:00:00Z",
  "outcome": "OPEN"
}
```
Accepted directions: BUY, SELL, HIGHER, LOWER, LONG, SHORT. Outcomes: OPEN, WIN, LOSS, UNRESOLVED. Only mark WIN/LOSS when verified by the source. Feed events must be supplied by a platform integration; the app does not yet ship with direct integrations to every named platform.

## Safety
AI chart interpretation and third-party trader records can be incomplete or wrong. Short-expiry/binary trades can lose the entire stake. Do not treat leaderboards as proof of skill or a guarantee. This app provides analysis only; no trade execution or automatic copying is implemented.
