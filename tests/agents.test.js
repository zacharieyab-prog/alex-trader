const test=require("node:test");
const assert=require("node:assert/strict");
const {runAgents}=require("../agents");

test("team approves BUY only when trend and momentum agree and risk passes",()=>{
 const result=runAgents({symbol:"BTCUSDT",indicators:{ema9:110,ema21:100,rsi:60}});
 assert.equal(result.final_signal,"BUY");
 assert.equal(result.execution_enabled,false);
 assert.deepEqual(result.agents.map(a=>a.vote),["BUY","BUY","PASS","BUY"]);
});

test("team returns WAIT when trend and momentum disagree",()=>{
 const result=runAgents({symbol:"BTCUSDT",indicators:{ema9:110,ema21:100,rsi:45}});
 assert.equal(result.final_signal,"WAIT");
 assert.equal(result.agents[3].vote,"WAIT");
});

test("risk guardian blocks an overextended BUY",()=>{
 const result=runAgents({symbol:"BTCUSDT",indicators:{ema9:110,ema21:100,rsi:75}});
 assert.equal(result.agents[2].vote,"BLOCK");
 assert.equal(result.final_signal,"WAIT");
});

test("missing indicators cannot produce a trade",()=>{
 const result=runAgents({symbol:"BTCUSDT",indicators:{}});
 assert.equal(result.final_signal,"WAIT");
});
