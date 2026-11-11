// Download public Binance Spot OHLCV candles for research/backtesting.
// Usage: node scripts/download-history.js BTCUSDT 1m 90
// This data is a research proxy, not an exact IQ Option quote feed.
const fs = require("fs");
const path = require("path");

const [symbolArg="BTCUSDT", interval="1m", daysArg="90"] = process.argv.slice(2);
const symbol = symbolArg.toUpperCase();
const days = Math.max(1, Math.min(3650, Number(daysArg) || 90));
const allowed = new Set(["1m","3m","5m","15m","30m","1h","2h","4h","1d"]);
if (!/^[A-Z0-9]{5,20}$/.test(symbol) || !allowed.has(interval)) {
  console.error("Usage: node scripts/download-history.js BTCUSDT 1m|3m|5m|15m|30m|1h|2h|4h|1d 90");
  process.exit(1);
}

const intervalMs = ({ "1m":60000,"3m":180000,"5m":300000,"15m":900000,"30m":1800000,"1h":3600000,"2h":7200000,"4h":14400000,"1d":86400000 })[interval];
const endTime = Date.now();
const startTime = endTime - days * 86400000;
const base = "https://data-api.binance.vision/api/v3/klines";
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const rows = [];
  let cursor = startTime;
  while (cursor < endTime) {
    const url = new URL(base);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("interval", interval);
    url.searchParams.set("startTime", String(cursor));
    url.searchParams.set("endTime", String(endTime));
    url.searchParams.set("limit", "1000");
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("Binance data request failed: HTTP " + response.status);
    const batch = await response.json();
    if (!Array.isArray(batch)) throw new Error(JSON.stringify(batch));
    if (!batch.length) break;
    rows.push(...batch);
    const lastOpen = Number(batch[batch.length - 1][0]);
    const next = lastOpen + intervalMs;
    if (next <= cursor) throw new Error("Pagination did not advance.");
    cursor = next;
    process.stdout.write("\rDownloaded " + rows.length + " candles");
    if (batch.length < 1000) break;
    await sleep(120);
  }

  const seen = new Map();
  for (const k of rows) {
    const t = Number(k[0]);
    if (t < startTime || t >= endTime) continue;
    seen.set(t, {
      open_time: new Date(t).toISOString(),
      open: Number(k[1]), high: Number(k[2]), low: Number(k[3]),
      close: Number(k[4]), volume: Number(k[5]),
      close_time: new Date(Number(k[6])).toISOString(),
      quote_volume: Number(k[7]), trades: Number(k[8])
    });
  }
  const candles = [...seen.values()].sort((a,b)=>a.open_time.localeCompare(b.open_time));
  const dir = path.join(__dirname, "..", "data", "historical");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, symbol + "-" + interval + "-" + days + "d.json");
  fs.writeFileSync(file, JSON.stringify({
    source: "Binance public Spot market data",
    symbol, interval, requested_days: days,
    downloaded_at: new Date().toISOString(),
    candle_count: candles.length,
    candles
  }, null, 2));
  console.log("\nSaved " + candles.length + " candles to " + file);
  console.log("Reminder: Binance Spot candles are not identical to IQ Option's quote feed or OTC prices.");
}
main().catch(error => { console.error("\nDownload failed:", error.message); process.exit(1); });
