// Walk-forward team and per-agent backtest for 5-minute historical candles.
// Usage: node scripts/backtest.js [dataset.json] [forward-candles=3] [cost-bps=10]
// Without a file argument, runs every dataset in data/historical.
// Signal is formed after candle i closes; simulated entry is next candle open.
// No live trading, broker connection or order placement exists in this script.
const fs = require("fs");
const path = require("path");
const { runAgents } = require("../agents");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data", "historical");
const REPORTS = path.join(ROOT, "data", "reports");
const requestedFile = process.argv[2];
const horizon = Math.max(1, Math.min(240, Number(process.argv[3]) || 3));
const costArg = process.argv[4];
const costBps = Math.max(0, Math.min(500, costArg === undefined ? 10 : Number(costArg)));
const WARMUP = 60;

function ema(values, period) {
  const k=2/(period+1);
  let v=values.slice(0,period).reduce((a,b)=>a+b,0)/period;
  for(let i=period;i<values.length;i++) v=values[i]*k+v*(1-k);
  return v;
}
function rsi(values, period=14) {
  let gains=0,losses=0;
  for(let i=values.length-period;i<values.length;i++) {
    const d=values[i]-values[i-1];
    if(d>0) gains+=d; else losses-=d;
  }
  if(losses===0 && gains===0) return 50;
  if(losses===0) return 100;
  if(gains===0) return 0;
  const rs=(gains/period)/(losses/period);
  return 100-100/(1+rs);
}
function scoreDirectional(records) {
  const resolved=records.filter(x=>x.result==="WIN"||x.result==="LOSS");
  const wins=resolved.filter(x=>x.result==="WIN");
  const losses=resolved.filter(x=>x.result==="LOSS");
  const grossWin=wins.reduce((s,x)=>s+x.net_return_pct,0);
  const grossLoss=Math.abs(losses.reduce((s,x)=>s+x.net_return_pct,0));
  let equity=1,peak=1,maxDrawdown=0;
  for(const x of resolved) {
    equity*=1+x.net_return_pct/100;
    peak=Math.max(peak,equity);
    maxDrawdown=Math.max(maxDrawdown,(peak-equity)/peak*100);
  }
  return {
    signals:records.length, resolved:resolved.length, wins:wins.length, losses:losses.length,
    win_rate_pct:resolved.length?Number((wins.length/resolved.length*100).toFixed(2)):null,
    average_net_return_pct:resolved.length?Number((resolved.reduce((s,x)=>s+x.net_return_pct,0)/resolved.length).toFixed(5)):null,
    profit_factor:grossLoss?Number((grossWin/grossLoss).toFixed(3)):grossWin>0?"Infinity":null,
    max_drawdown_pct:Number(maxDrawdown.toFixed(3))
  };
}
function backtest(file) {
  const data=JSON.parse(fs.readFileSync(file,"utf8"));
  const candles=data.candles;
  if(!Array.isArray(candles)||candles.length<WARMUP+30) throw new Error("Not enough candles in "+file);
  const startIndex=WARMUP;
  const splitIndex=Math.max(startIndex+1,Math.floor(candles.length*0.7));
  const byAgent={ "Trend Scout":[], "Momentum Scout":[], "Signal Auditor":[] };
  const risk={blocked:0,blocked_would_lose:0,blocked_would_win:0,passed:0,passed_would_lose:0,passed_would_win:0};
  const all=[];
  for(let i=startIndex;i<candles.length-horizon-1;i++) {
    const closes=candles.slice(i-WARMUP+1,i+1).map(c=>Number(c.close));
    const ema9=ema(closes.slice(-30),9), ema21=ema(closes.slice(-30),21), momentum=rsi(closes);
    const market={
      symbol:data.symbol,market:data.market,source:data.source,price:closes.at(-1),
      indicators:{ema9,ema21,rsi:momentum},scanned_at:candles[i].close_time
    };
    const decision=runAgents(market);
    const entry=Number(candles[i+1].open);
    const exit=Number(candles[i+horizon].close);
    if(!Number.isFinite(entry)||!Number.isFinite(exit)||entry<=0) continue;
    const gross=(exit-entry)/entry*100;
    const netLong=gross-costBps/100;
    const netShort=-gross-costBps/100;
    const directionalReturn=signal=>signal==="BUY"?netLong:signal==="SELL"?netShort:null;
    const record={time:candles[i].close_time,entry_time:candles[i+1].open_time,signal:decision.final_signal,entry,exit,gross_return_pct:gross,net_return_pct:null,result:"WAIT",votes:{}};
    for(const agent of decision.agents) record.votes[agent.name]=agent.vote;
    for(const name of Object.keys(byAgent)) {
      const vote=decision.agents.find(a=>a.name===name)?.vote;
      if(vote!=="BUY"&&vote!=="SELL") continue;
      const ret=directionalReturn(vote);
      byAgent[name].push({time:record.time,net_return_pct:ret,result:ret>0?"WIN":ret<0?"LOSS":"FLAT"});
    }
    const trend=decision.agents.find(a=>a.name==="Trend Scout")?.vote;
    const momentumVote=decision.agents.find(a=>a.name==="Momentum Scout")?.vote;
    const guardian=decision.agents.find(a=>a.name==="Risk Guardian")?.vote;
    if(trend===momentumVote&&["BUY","SELL"].includes(trend)) {
      const ret=directionalReturn(trend);
      if(guardian==="BLOCK") {risk.blocked++;if(ret<0)risk.blocked_would_lose++;else if(ret>0)risk.blocked_would_win++;}
      else {risk.passed++;if(ret<0)risk.passed_would_lose++;else if(ret>0)risk.passed_would_win++;}
    }
    if(decision.final_signal==="BUY"||decision.final_signal==="SELL") {
      record.net_return_pct=directionalReturn(decision.final_signal);
      record.result=record.net_return_pct>0?"WIN":record.net_return_pct<0?"LOSS":"FLAT";
    }
    all.push(record);
  }
  const training=all.filter(x=>new Date(x.time).getTime()<new Date(candles[splitIndex].open_time).getTime());
  const outOfSample=all.filter(x=>new Date(x.time).getTime()>=new Date(candles[splitIndex].open_time).getTime());
  const agentReports={};
  for(const [name,records] of Object.entries(byAgent)) {
    agentReports[name]={
      all:scoreDirectional(records),
      training:scoreDirectional(records.filter(x=>new Date(x.time).getTime()<new Date(candles[splitIndex].open_time).getTime())),
      out_of_sample:scoreDirectional(records.filter(x=>new Date(x.time).getTime()>=new Date(candles[splitIndex].open_time).getTime()))
    };
  }
  const finalRecords=all.filter(x=>x.signal==="BUY"||x.signal==="SELL").map(x=>({...x,net_return_pct:x.net_return_pct??0}));
  const costSensitivity = [5,10,20].map(bps => {
    const trades = finalRecords.map(x => ({
      net_return_pct: (x.signal === "BUY" ? x.gross_return_pct : -x.gross_return_pct) - bps / 100,
      result: ((x.signal === "BUY" ? x.gross_return_pct : -x.gross_return_pct) - bps / 100) > 0 ? "WIN" : "LOSS"
    }));
    return {round_trip_cost_bps:bps, out_of_sample:scoreDirectional(outOfSample.filter(x=>x.signal==="BUY"||x.signal==="SELL").map(x=>({
      net_return_pct:(x.signal==="BUY"?x.gross_return_pct:-x.gross_return_pct)-bps/100,
      result:((x.signal==="BUY"?x.gross_return_pct:-x.gross_return_pct)-bps/100)>0?"WIN":"LOSS"
    })))};
  });
  const report={
    symbol:data.symbol,market:data.market,source:data.source,interval:data.interval,
    candle_count:candles.length,forward_horizon_candles:horizon,
    estimated_holding_period_minutes:horizon*5,estimated_cost_bps_per_round_trip:costBps,
    split:{method:"chronological 70% training / 30% out-of-sample",split_at:candles[splitIndex].open_time},
    team:{all:scoreDirectional(finalRecords),training:scoreDirectional(training.filter(x=>x.signal!=="WAIT")),out_of_sample:scoreDirectional(outOfSample.filter(x=>x.signal!=="WAIT"))},\n    cost_sensitivity:costSensitivity,
    individual_agents:agentReports,
    risk_guardian:{...risk,blocked_adverse_rate_pct:risk.blocked?Number((risk.blocked_would_lose/risk.blocked*100).toFixed(2)):null,passed_adverse_rate_pct:risk.passed?Number((risk.passed_would_lose/risk.passed*100).toFixed(2)):null},
    limitations:[
      "This is a rule-based historical simulation, not model training or a prediction.",
      "Out-of-sample period is later in time and is not used to tune the rules.",
      "Simulated entry is next candle open; actual fills, latency, spread and slippage may differ.",
      "Default cost assumption is 10 basis points round trip; sensitivity is also reported at 5 and 20 basis points. These are illustrative assumptions, not verified venue fees. Cost is only the user-supplied round-trip basis-point assumption; funding, market impact and venue-specific fees are not modeled.",
      "Five-minute provider candles are not IQ Option OTC quotes or binary-option settlement prices.",
      "A directional win rate does not establish profitability or guarantee future results."
    ],
    sample_trades:all.slice(-250)
  };
  fs.mkdirSync(REPORTS,{recursive:true});
  const name=path.basename(file,".json")+"-team-report.json";
  const out=path.join(REPORTS,name);
  fs.writeFileSync(out,JSON.stringify(report,null,2));
  return {symbol:data.symbol,market:data.market,report:out,team_oos:report.team.out_of_sample,agents_oos:Object.fromEntries(Object.entries(agentReports).map(([k,v])=>[k,v.out_of_sample])),risk_guardian:report.risk_guardian};
}
function main() {
  const files=requestedFile?[path.resolve(requestedFile)]:fs.existsSync(DATA)?fs.readdirSync(DATA).filter(f=>f.endsWith("-5m-90d.json")).map(f=>path.join(DATA,f)):[];
  if(!files.length) throw new Error("No historical datasets found. Run npm run research:download first.");
  const results=[],errors=[];
  for(const file of files) {try{results.push(backtest(file));}catch(e){errors.push({file,error:e.message});}}
  fs.mkdirSync(REPORTS,{recursive:true});
  const summary={generated_at:new Date().toISOString(),mode:"historical_backtest_only",live_trading_enabled:false,forward_horizon_candles:horizon,cost_bps:costBps,datasets:results,errors};
  fs.writeFileSync(path.join(REPORTS,"research-summary.json"),JSON.stringify(summary,null,2));
  console.log(JSON.stringify(summary,null,2));
  if(errors.length) process.exitCode=2;
}
try{main();}catch(e){console.error(e.message);process.exit(1);}
