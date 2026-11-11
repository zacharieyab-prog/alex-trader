# Deploy Alex Trader 3.0

## Render deployment (web app + Node API)

1. Sign in to Render and choose **New → Blueprint**.
2. Connect GitHub and select `zacharieyab-prog/alex-trader`.
3. Render reads `render.yaml`. Choose the free web-service plan and create the service.
4. In the service's **Environment** settings, add:
   - `OPENAI_API_KEY`: your own OpenAI API key (keep it secret; never put it in frontend code or chat).
   - `TWELVEDATA_API_KEY`: optional, for forex/gold/index data.
   - `TRADER_FEED_TOKEN`: generate a strong random secret if Render has not generated it automatically.
5. Save and wait for deployment. Check `https://YOUR-SERVICE.onrender.com/api/health`; it should return `ok: true` and `executionEnabled: false`.
6. Open the service URL on your laptop and iPhone. On iPhone Safari use **Share → Add to Home Screen**. On desktop Chrome/Edge use the install icon in the address bar or browser menu.

## Important operating limits

- The free Render web service can sleep after inactivity and may take time to wake. It is suitable for testing, not guaranteed 24/7 operation.
- Free services have ephemeral storage. Uploaded screenshots are processed in memory; signal history is currently stored in each browser's local storage; scanner/trader events held only in server memory can reset on restart. Historical research files should remain in GitHub Actions artifacts, not be treated as durable Render storage.
- OpenAI and Twelve Data usage may incur charges under their providers' plans. Set usage limits with those providers.
- IQ Option OTC quotes/private positions are not connected. Public Binance and Twelve Data feeds are separate market sources.
- Live trading and order placement remain disabled in code. Do not add broker credentials to this service.
