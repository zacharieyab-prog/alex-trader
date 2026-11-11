// Historical walk-forward backtest for Alex Trader's four-agent consensus.
// Usage: node scripts/backtest.js data/historical/BTCUSDT-1m-90d.json 5
// Uses only candles available up to each decision point; outcome is the next N candles.
const fs = require("fs");
const path = require("path");
const { runAgents } = require("../agents");

const file = process.argv[2];
const horizon = Math.max(1, Math.min(240, Number(process.argv[3]) || 5));
if (!file) {
  console.error("Usage: node scripts/backtest.js <history.json> [forward-candles]");
  process.exit(1);
}
const dataset = JSON.parse(fs.readFileSync(path.resolve(file), "utf8"));
const candles = dataset.candles;
if (!Array.isArray(candles) || candles.length < 100) throw new Error("Need at least 100 candles.");

function ema(values, period) {
  const k = 2 / (period + 1);
  let value = values.slice(0, period).reduce((a,b)=>a+b,0) / period;
  for (let i=period; i<values.length; i++) value = values[i]*k + value*(1-k);
  return value;
}
function rsi(values, period=14) {
  let gains=0, losses=0;
  for(let i=values.length-period; i<values.length; i++) {
    const d=values[i]-values[i-1];
    if(d>0) gains+=d; else losses-=d;
  }
  if(losses===0) return 100;
  const rs=(gains/period)/(losses/period);
  return 100-100/(1+rs);
}
const trades=[];
for(let i=60; i<candles.length-horizon; i++) {
  const history=candles.slice(i-60,i+1);
  const closes=history.map(c=>Number(c.close));
  const market={
    symbol:dataset.symbol, market:"Crypto", source:dataset.source,
    price:closes.at(-1), indicators:{ema9:ema(closes.slice(-30),9),ema21:ema(closes.slice(-30),21),rsi:rsi(closes)},
    scanned_at:history.at(-1).close_time
  };
  const decision=runAgents(market);
  if(!["BUY","SELL"].includes(decision.final_signal)) continue;
  const entry=Number(candles[i].close);
  const exit=Number(candles[i+horizon].close);
  const change=(exit-entry)/entry;
  const correct=decision.final_signal==="BUY"?change>0:change<0;
  trades.push({
    time:candles[i].close_time, signal:decision.final_signal,
    entry, exit, forward_return_pct:change*100,
    result:change===0?"FLAT":correct?"WIN":"LOSS",
    agents:decision.agents.map(a=>({name:a.name,vote:a.vote}))
  });
}
const wins=trades.filter(t=>t.result==="WIN").length;
const losses=trades.filter(t=>t.result==="LOSS").length;
const flats=trades.filter(t=>t.result==="FLAT").length;
const report={
  source:dataset.source, symbol:dataset.symbol, interval:dataset.interval,
  candle_count:candles.length, forward_candles:horizon,
  tested_signals:trades.length, wins, losses, flats,
  win_rate_pct:wins+losses?Number((wins/(wins+losses)*100).toFixed(2)):null,
  average_forward_return_pct:trades.length?Number((trades.reduce((s,t)=>s+t.forward_return_pct,0)/trades.length).toFixed(5)):null,
  limitations:[
    "Historical simulation only; not a forecast.",
    "No fees, spread, slippage, funding, execution delay or liquidity model.",
    "Signal uses candle close and enters at that close; real execution may be worse.",
    "Next-N-candle direction is not equivalent to IQ Option fixed-time settlement.",
    "Historical win rate does not guarantee future performance."
  ],
  trades
};
const out=path.join(path.dirname(path.resolve(file)),path.basename(file,".json")+"-backtest-"+horizon+".json");
fs.writeFileSync(out,JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,trades:undefined,output_file:out},null,2));
