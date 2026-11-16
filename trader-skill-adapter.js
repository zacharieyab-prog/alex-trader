"use strict";
// Alex Trader integration adapter inspired by the MIT-licensed trader-skill project.
// No broker connectivity, order submission, or execution routes.
const skills=[
["copycat","13F investor research"],["news","Public news monitoring"],["budget","Paper position sizing"],
["pelosi","Public congressional disclosures"],["analyst","SEC financial analysis"],
["screener","Rule-based stock screening"],["risk","Proposal risk checks"],
["broker","Ticket preview only — execution permanently disabled"],["tax","Tax-lot research"],
["alerts","Price alert research"],["rebalance","Paper portfolio rebalance proposals"]
];
const finite=(v)=>typeof v==="number"&&Number.isFinite(v);
function evaluateProposal(input={}){
 const reasons=[];
 const symbol=typeof input.symbol==="string"?input.symbol.trim().toUpperCase().slice(0,32):"";
 const side=typeof input.side==="string"?input.side.trim().toUpperCase():"";
 const budget=input.paper_budget,price=input.entry_price,quantity=input.quantity;
 const maxRiskPct=input.max_risk_pct??1,stop=input.stop_loss;
 if(!symbol||!/^[A-Z0-9/._-]{2,32}$/.test(symbol))reasons.push("Valid symbol required");
 if(!["BUY","SELL"].includes(side))reasons.push("Side must be BUY or SELL");
 if(!finite(budget)||budget<=0)reasons.push("Positive paper_budget required");
 if(!finite(price)||price<=0)reasons.push("Positive entry_price required");
 if(!finite(quantity)||quantity<=0)reasons.push("Positive quantity required");
 if(!finite(maxRiskPct)||maxRiskPct<=0||maxRiskPct>5)reasons.push("max_risk_pct must be > 0 and <= 5");
 if(!finite(stop)||stop<=0)reasons.push("Positive stop_loss required");
 if(finite(price)&&finite(stop)&&((side==="BUY"&&stop>=price)||(side==="SELL"&&stop<=price)))reasons.push("Stop must be on loss side of entry");
 const notional=finite(price)&&finite(quantity)?price*quantity:null;
 const risk=finite(price)&&finite(stop)&&finite(quantity)?Math.abs(price-stop)*quantity:null;
 if(finite(budget)&&notional!==null&&notional>budget*0.25)reasons.push("Position exceeds 25% paper budget cap");
 if(finite(budget)&&risk!==null&&finite(maxRiskPct)&&risk>budget*maxRiskPct/100)reasons.push("Stop-loss risk exceeds configured paper risk limit");
 if(side==="SELL")reasons.push("SELL proposals require explicit existing-position verification; shorting unsupported");
 return {mode:"demo",execution_enabled:false,order_placement_enabled:false,decision:reasons.length?"BLOCK":"PASS_FOR_MANUAL_REVIEW",symbol,side,notional_paper:notional,estimated_stop_risk_paper:risk,reasons,disclaimer:"Research only. No order is placed or sent to any broker."};
}
module.exports={skills,evaluateProposal};
