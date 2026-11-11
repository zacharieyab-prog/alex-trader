// Download the configured 90-day research set.
// Usage: TWELVEDATA_API_KEY=... node scripts/download-research.js
// Binance crypto data is public; Twelve Data FX/gold requires a suitable plan/key.
const fs = require("fs");
const path = require("path");

const DAYS = 90;
const INTERVAL = "5min";
const CONFIG = require("../research-config.json").historical_research;
const OUT = path.join(__dirname, "..", "data", "historical");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const stamp = d => d.toISOString().replace("T", " ").slice(0, 19);

function save(symbol, market, source, candles) {
  const unique = new Map();
  for (const c of candles) unique.set(c.open_time, c);
  const clean = [...unique.values()].sort((a,b)=>a.open_time.localeCompare(b.open_time));
  const safe = symbol.replace(/[^A-Z0-9]/gi, "");
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, safe + "-5m-90d.json");
  fs.writeFileSync(file, JSON.stringify({
    symbol, market, interval: INTERVAL, requested_days: DAYS, source,
    downloaded_at: new Date().toISOString(), candle_count: clean.length,
    candles: clean
  }, null, 2));
  console.log("Saved " + symbol + ": " + clean.length + " candles -> " + path.relative(process.cwd(), file));
}

async function downloadBinance(symbol, startMs, endMs) {
  const rows = [];
  let cursor = startMs;
  while (cursor < endMs) {
    const u = new URL("https://data-api.binance.vision/api/v3/klines");
    u.searchParams.set("symbol", symbol);
    u.searchParams.set("interval", "5m");
    u.searchParams.set("startTime", String(cursor));
    u.searchParams.set("endTime", String(endMs));
    u.searchParams.set("limit", "1000");
    const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error("Binance " + symbol + " HTTP " + r.status);
    const batch = await r.json();
    if (!Array.isArray(batch)) throw new Error(JSON.stringify(batch));
    if (!batch.length) break;
    rows.push(...batch);
    const next = Number(batch[batch.length - 1][0]) + 300000;
    if (next <= cursor) throw new Error("Binance pagination stalled for " + symbol);
    cursor = next;
    if (batch.length < 1000) break;
    await sleep(120);
  }
  return rows.map(k => ({
    open_time: new Date(Number(k[0])).toISOString(),
    open: Number(k[1]), high: Number(k[2]), low: Number(k[3]),
    close: Number(k[4]), volume: Number(k[5]),
    close_time: new Date(Number(k[6])).toISOString(),
    quote_volume: Number(k[7]), trades: Number(k[8])
  }));
}

async function downloadTwelveData(symbol, startMs, endMs, apiKey) {
  const all = [];
  // 14-day windows stay below typical 5,000-point response caps at 5-minute granularity.
  const chunkMs = 14 * 86400000;
  for (let from = startMs; from < endMs; from += chunkMs) {
    const to = Math.min(from + chunkMs, endMs);
    const u = new URL("https://api.twelvedata.com/time_series");
    u.searchParams.set("symbol", symbol);
    u.searchParams.set("interval", "5min");
    u.searchParams.set("start_date", stamp(new Date(from)));
    u.searchParams.set("end_date", stamp(new Date(to)));
    u.searchParams.set("order", "ASC");
    u.searchParams.set("timezone", "UTC");
    u.searchParams.set("outputsize", "5000");
    u.searchParams.set("apikey", apiKey);
    const r = await fetch(u, { signal: AbortSignal.timeout(25000) });
    if (!r.ok) throw new Error("Twelve Data " + symbol + " HTTP " + r.status);
    const d = await r.json();
    if (d.status === "error" || !Array.isArray(d.values)) {
      throw new Error("Twelve Data " + symbol + ": " + (d.message || "No candle data; check plan, symbol and API credits."));
    }
    for (const v of d.values) {
      const open = new Date(v.datetime.replace(" ", "T") + "Z");
      const close = new Date(open.getTime() + 300000);
      all.push({
        open_time: open.toISOString(),
        open: Number(v.open), high: Number(v.high), low: Number(v.low),
        close: Number(v.close), volume: v.volume == null ? null : Number(v.volume),
        close_time: close.toISOString()
      });
    }
    await sleep(8000); // conservative pacing for API-credit/rate limits
  }
  return all;
}

async function main() {
  const end = Date.now();
  const start = end - DAYS * 86400000;
  const results = { downloaded: [], failed: [], live_trading_enabled: false };
  for (const symbol of CONFIG.crypto.symbols) {
    try {
      const candles = await downloadBinance(symbol, start, end);
      save(symbol, "crypto", "Binance public Spot OHLCV", candles);
      results.downloaded.push(symbol);
    } catch (e) { console.error("FAILED " + symbol + ": " + e.message); results.failed.push({symbol,error:e.message}); }
  }

  const apiKey = process.env.TWELVEDATA_API_KEY;
  const macro = [
    ...CONFIG.forex.symbols.map(symbol => ({symbol,market:"forex"})),
    ...CONFIG.gold.symbols.map(symbol => ({symbol,market:"gold"}))
  ];
  if (!apiKey) {
    console.warn("TWELVEDATA_API_KEY is not set. Forex/gold downloads skipped, not fabricated.");
    results.failed.push({market:"forex+gold",error:"TWELVEDATA_API_KEY is required."});
  } else {
    for (const item of macro) {
      try {
        const candles = await downloadTwelveData(item.symbol, start, end, apiKey);
        save(item.symbol, item.market, "Twelve Data historical time series", candles);
        results.downloaded.push(item.symbol);
      } catch (e) { console.error("FAILED " + item.symbol + ": " + e.message); results.failed.push({symbol:item.symbol,error:e.message}); }
    }
  }
  const reportPath = path.join(OUT, "download-manifest.json");
  fs.writeFileSync(reportPath, JSON.stringify({
    requested_days:DAYS, interval:INTERVAL, completed_at:new Date().toISOString(),
    downloaded:results.downloaded, failed:results.failed,
    note:"Provider coverage and candle counts vary. Binance Spot is not IQ Option OTC or broker quote history."
  }, null, 2));
  console.log(JSON.stringify(results, null, 2));
  if (results.failed.length) process.exitCode = 2;
}
main().catch(e => { console.error(e); process.exit(1); });
