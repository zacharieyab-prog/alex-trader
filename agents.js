const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
function trendScout(m) {
  const a=finite(m.indicators?.ema9), b=finite(m.indicators?.ema21);
  if(a===null||b===null||a===b)return {name:"Trend Scout",role:"Trend structure",vote:"WAIT",reason:"EMA data is missing or flat."};
  return {name:"Trend Scout",role:"Trend structure",vote:a>b?"BUY":"SELL",reason:a>b?"EMA 9 is above EMA 21.":"EMA 9 is below EMA 21."};
}
function momentumScout(m) {
  const r=finite(m.indicators?.rsi);
  if(r===null||r>=48&&r<=52)return {name:"Momentum Scout",role:"Momentum confirmation",vote:"WAIT",reason:r===null?"RSI is unavailable.":"RSI is neutral."};
  return {name:"Momentum Scout",role:"Momentum confirmation",vote:r>52?"BUY":"SELL",reason:"RSI is "+r.toFixed(1)+"."};
}
function riskGuardian(m,t,v) {
  const r=finite(m.indicators?.rsi);let block=false,reason="No directional consensus.";
  if(t===v&&["BUY","SELL"].includes(t)){block=r===null||(t==="BUY"?r>68:r<32);reason=r===null?"Blocked: RSI unavailable.":block?"Blocked: momentum is overextended.":"Risk screen passed.";}
  return {name:"Risk Guardian",role:"Risk control",vote:block?"BLOCK":"PASS",reason,limits:{execution:"disabled",maxRiskPerTradePct:0.5,maxDailyLossPct:2,maxOpenPaperPositions:3}};
}
function signalAuditor(t,v,r) {
  const ok=t===v&&["BUY","SELL"].includes(t)&&r.vote==="PASS";
  return {name:"Signal Auditor",role:"Independent consensus",vote:ok?t:"WAIT",reason:ok?"Trend and momentum agree; risk screen passed.":"WAIT: agents disagree, data is incomplete, or risk blocked the setup."};
}
function runAgents(m) {
 const t=trendScout(m),v=momentumScout(m),r=riskGuardian(m,t.vote,v.vote),a=signalAuditor(t.vote,v.vote,r);
 return {final_signal:a.vote,execution_enabled:false,agents:[t,v,r,a]};
}
module.exports={runAgents};
