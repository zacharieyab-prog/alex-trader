# Alex Trader — IQ Option signal workspace

A static, mobile-friendly BTC/USD decision-support prototype. It is designed for chart review and manual decisions only.

## Current features
- BTC/USD workspace with 1-minute and 5-minute chart timeframes.
- 1–5 minute expiry selector.
- PNG/JPG/WEBP chart screenshot upload and local preview.
- Manual EMA 20, EMA 50, RSI 14, MACD histogram, price and candle-direction checklist.
- Basic rule-based HIGHER / LOWER / WAIT output and local session log.
- No broker login, no order execution, and no real-money trading code.

## Important limitations
Screenshot upload currently displays the image only. It does not read candles or extract indicators. The signal engine is a transparent rule-based checklist, not an AI prediction model. A real screenshot-vision engine needs a secure server-side AI integration; API keys must never be placed in browser JavaScript. IQ Option connectivity and automated execution are intentionally not implemented.

The checklist is educational decision support, not financial advice. A HIGHER or LOWER result is not a guarantee; short-expiry contracts are high risk.

## Run locally
Open index.html in a modern browser, or serve this folder with any static web server.

## Publish free with GitHub Pages
In the repository, open Settings → Pages, choose Deploy from a branch, select main and root folder, then save. Wait for the Pages build to complete and open the URL GitHub provides.

## Safety
Real-money execution is disabled by design. Do not add broker credentials or API keys to this public-facing static app.
