# Alex Trader — BTC/USD signals-only app

A signals-only BTC/USD chart screenshot assistant. It analyses an image and returns HIGHER / LOWER / WAIT with visible chart observations and optional reference levels. It does not connect to a broker or place trades.

## Features
- Upload PNG/JPG/WEBP chart screenshots (max 8 MB).
- Server-side OpenAI vision analysis; API key is never placed in browser code.
- Conservative HIGHER / LOWER / WAIT output; unclear charts should return WAIT.
- Optional browser notifications for directional signals after an analysis completes.
- Local signal journal with manual WIN / LOSS / UNRESOLVED outcome tracking and CSV export.
- Broker execution is disabled and no broker credentials are requested.

## Run locally
Requires Node.js 18+.
```sh
npm install
cp .env.example .env
# Set OPENAI_API_KEY in .env
npm start
```
Open http://localhost:3000. Keep the API key only in the server environment. Never commit .env or place secrets in browser JavaScript.

## Deploy free on Render
The repository includes `render.yaml` for a Render Blueprint deployment.
1. Sign in to Render and choose **New → Blueprint**.
2. Connect GitHub and select `zacharieyab-prog/alex-trader`.
3. Review the service plan; keep the web service on **Free**.
4. When prompted, enter `OPENAI_API_KEY` as a secret environment variable. Do not paste it into GitHub, this README, or the browser.
5. Deploy. Render builds with `npm install` and starts with `npm start`.
6. Open the generated `onrender.com` URL and check that the service status says the AI is configured.

Free Render services spin down after 15 minutes without inbound traffic and can take about a minute to wake. The free service filesystem is ephemeral. Signal history is stored in your browser's local storage, not on the server. OpenAI API usage is billed separately by OpenAI; set a spending limit and disable automatic recharge if you do not want automatic top-ups.

## API
- `GET /api/health` — service and AI-key configuration status.
- `POST /api/analyze` — accepts a multipart image field named `chart`, plus `timeframe` and `expiry`.

## Safety and limitations
AI chart interpretation can misread screenshots and is not a guaranteed prediction or financial advice. Independently verify chart conditions. Short-expiry trades can lose the entire stake. This app provides analysis only; it does not place orders.
