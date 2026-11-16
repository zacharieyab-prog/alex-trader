const test=require("node:test");
const assert=require("node:assert/strict");
const {skills,evaluateProposal}=require("../trader-skill-adapter");
test("all 11 capabilities are registered",()=>assert.equal(skills.length,11));
test("safe paper proposal can pass for manual review without execution",()=>{
 const r=evaluateProposal({symbol:"BTC/USDT",side:"BUY",paper_budget:1000,entry_price:100,quantity:1,stop_loss:95});
 assert.equal(r.decision,"PASS_FOR_MANUAL_REVIEW");assert.equal(r.execution_enabled,false);assert.equal(r.order_placement_enabled,false);
});
test("oversized position is blocked",()=>{
 const r=evaluateProposal({symbol:"BTC/USDT",side:"BUY",paper_budget:1000,entry_price:100,quantity:3,stop_loss:99});
 assert.equal(r.decision,"BLOCK");
});
test("short orders are blocked",()=>{
 const r=evaluateProposal({symbol:"BTC/USDT",side:"SELL",paper_budget:1000,entry_price:100,quantity:1,stop_loss:101});
 assert.equal(r.decision,"BLOCK");
});
test("missing stop is blocked",()=>assert.equal(evaluateProposal({symbol:"BTC/USDT",side:"BUY",paper_budget:1000,entry_price:100,quantity:1}).decision,"BLOCK"));
