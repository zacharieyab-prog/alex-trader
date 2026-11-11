# Alex Trader 3.0 — Historical Research Lab

## Safety
- Historical research and demo/paper testing only.
- Live trading is disabled.
- Order placement is disabled.
- No broker credentials are required for historical candle research.

## Configured research scope
- Lookback: 90 days
- Interval: 5 minutes
- Crypto: BTCUSDT, ETHUSDT, BNBUSDT, SOLUSDT, XRPUSDT, ADAUSDT, DOGEUSDT, LINKUSDT (Binance Spot)
- Forex: EUR/USD, GBP/USD, USD/JPY, AUD/USD, USD/CAD, USD/CHF (Twelve Data)
- Gold: XAU/USD (Twelve Data)

## 1. Install
Use Node.js 18 or newer:
```bash
npm install
```

## 2. Download historical candles
Crypto data is public. Forex and gold require a Twelve Data API key and sufficient API credits/plan access.
```bash
# macOS/Linux
export TWELVEDATA_API_KEY="your_key"
npm run research:download

# Windows PowerShell
$env:TWELVEDATA_API_KEY="your_key"
npm run research:download
```
The downloader stores one JSON file per symbol under `data/historical/` and writes `download-manifest.json`. Missing feeds are reported as unavailable; no prices are fabricated.

## 3. Run the backtest
```bash
npm run research:backtest
```
By default, it tests a three-candle forward horizon (15 minutes on 5-minute data), uses the next candle open as the simulated entry, and assumes zero transaction costs unless a cost assumption is supplied:
```bash
node scripts/backtest.js data/historical/BTCUSDT-5m-90d.json 3 5
```
The last argument is round-trip cost in basis points (5 bps = 0.05%). This is a user-supplied assumption, not a broker quote.

## 4. Outputs
- `data/reports/research-summary.json`: summary for all downloaded datasets.
- `data/reports/<symbol>-team-report.json`: per-market report.
- Each report includes 70% chronological training / 30% out-of-sample results, final-team performance, individual directional-agent results, risk-guardian block statistics, drawdown and profit factor.

The four specialist agents are rule-based today. The lab evaluates them; it does not automatically rewrite their rules or perform machine-learning training. Tune only on the earlier training period, then re-run the untouched later out-of-sample period.

## Important limitations
- Binance Spot history is a proxy and is not identical to IQ Option prices, OTC quotes, spreads or binary-option settlement.
- Twelve Data symbol availability, historical depth and API credits depend on the account plan.
- Simulated fills, costs and candle timing differ from real execution.
- A high historical win rate is not a guarantee of future performance.
- No result should be treated as permission to enable live trading.
