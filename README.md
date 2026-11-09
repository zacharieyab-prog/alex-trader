# Alex Trader — AI Vision demo workspace

BTC/USD screenshot-analysis workspace with an intentionally locked execution path.

## Current build
- BTC/USD chart screenshot upload (PNG/JPG/WEBP, max 8 MB).
- Automatic server-side image analysis through OpenAI API when configured.
- Conservative HIGHER / LOWER / WAIT assessment and visible chart observations.
- User-selected custom demo stake is saved locally as an approval preference.
- No broker login, order placement, order closing, or live execution is implemented.
- Live execution is explicitly disabled.

## Run locally
Requires Node.js 18+.
```sh
npm install
cp .env.example .env
# Set OPENAI_API_KEY in .env
npm start
```
Open http://localhost:3000. Keep the API key only in the server environment. Never commit .env or place secrets in browser JavaScript.

## Hosting
GitHub Pages can host the static frontend only; it cannot run this backend. Deploy the Node server to a trusted backend host and configure OPENAI_API_KEY as a server secret.

## Broker integration status
IQ Option does not provide a supported public retail order-execution API documented for this project. No unofficial credential-based connector is included. Demo order execution remains disconnected; amount approval only saves the amount locally and does not submit a trade. A verified, supported demo API is required before implementing order open/close.

## Safety
AI chart interpretation can misread screenshots and is not guaranteed financial advice. Independently verify chart conditions. Short-expiry contracts can lose the entire stake. Live trading remains disabled.
