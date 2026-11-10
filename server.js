const express=require("express");
const path=require("path");
const multer=require("multer");
const crypto=require("crypto");
const app=express(),PORT=process.env.PORT||3000;
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:8*1024*1024},fileFilter:(req,file,cb)=>cb(null,["image/png","image/jpeg","image/webp"].includes(file.mimetype))});
app.use(express.json({limit:"64kb"}));
app.use(express.static(__dirname));

/* Cross-platform trade-feed receiver.
   Providers must send events to this endpoint using the configured bearer token.
   No platform is scraped and no broker account credentials are stored here. */
const tradeEvents=[];
const MAX_EVENTS=5000;
const clean=(v,n=100)=>String(v??"").trim().slice(0,n);
function feedConfigured(){return Boolean(process.env.TRADER_FEED_TOKEN);}
function authFeed(req,res,next){
 const supplied=String(req.headers.authorization||"").replace(/^Bearer\s+/i,"");
 const expected=process.env.TRADER_FEED_TOKEN||"";
 if(!expected||!supplied||supplied.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))return res.status(401).json({error:"Trader feed is not configured or token is invalid."});
 next();
}
function normaliseEvent(body){
 const direction=clean(body.direction||body.side,12).toUpperCase();
 const outcome=clean(body.outcome,12).toUpperCase();
 const opened=body.opened_at?new Date(body.opened_at):new Date();
 if(!["BUY","SELL","HIGHER","LOWER","LONG","SHORT"].includes(direction))throw new Error("direction must be BUY, SELL, HIGHER, LOWER, LONG or SHORT");
 if(Number.isNaN(opened.getTime()))throw new Error("opened_at must be a valid date");
 if(outcome&&!["WIN","LOSS","OPEN","UNRESOLVED"].includes(outcome))throw new Error("outcome must be WIN, LOSS, OPEN or UNRESOLVED");
 return {id:crypto.randomUUID(),platform:clean(body.platform||"External feed",40),trader:clean(body.trader||body.trader_name,80),asset:clean(body.asset||body.symbol,40).toUpperCase(),direction,entry:body.entry==null?null:Number(body.entry),opened_at:opened.toISOString(),outcome:outcome||"OPEN",received_at:new Date().toISOString()};
}
app.get("/api/health",(req,res)=>res.json({ok:true,aiConfigured:Boolean(process.env.OPENAI_API_KEY),executionEnabled:false,mode:"demo",traderFeedConfigured:feedConfigured(),traderEvents:tradeEvents.length}));
app.get("/api/traders",(req,res)=>{
 const groups=new Map();
 for(const e of tradeEvents){const key=e.platform+"::"+e.trader;const g=groups.get(key)||{platform:e.platform,trader:e.trader,trades:0,wins:0,losses:0,open:0,assets:new Set(),last_trade:null};g.trades++;g.assets.add(e.asset);if(e.outcome==="WIN")g.wins++;else if(e.outcome==="LOSS")g.losses++;else g.open++;if(!g.last_trade||e.opened_at>g.last_trade)g.last_trade=e.opened_at;groups.set(key,g);}
 const traders=[...groups.values()].map(g=>({...g,assets:[...g.assets],resolved:g.wins+g.losses,win_rate:g.wins+g.losses?Math.round(g.wins/(g.wins+g.losses)*100):null,rank_eligible:g.wins+g.losses>=20})).sort((a,b)=>(b.rank_eligible-a.rank_eligible)||((b.win_rate??-1)-(a.win_rate??-1))||b.trades-a.trades);
 res.json({configured:feedConfigured(),events:tradeEvents.slice(-100).reverse(),traders});
});
app.post("/api/trader-events",authFeed,(req,res)=>{
 try{const list=Array.isArray(req.body.events)?req.body.events:[req.body];if(!list.length||list.length>100) return res.status(400).json({error:"Send between 1 and 100 events."});const added=list.map(normaliseEvent);tradeEvents.push(...added);if(tradeEvents.length>MAX_EVENTS)tradeEvents.splice(0,tradeEvents.length-MAX_EVENTS);res.status(201).json({accepted:added.length,execution_enabled:false});}
 catch(e){res.status(400).json({error:e.message});}
});
app.post("/api/analyze",upload.single("chart"),async(req,res)=>{try{
 if(!req.file)return res.status(400).json({error:"Upload a PNG, JPG or WEBP screenshot."});
 if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:"AI is not configured. Set OPENAI_API_KEY on the backend."});
 const imageData="data:"+req.file.mimetype+";base64,"+req.file.buffer.toString("base64");
 const prompt="You are a cautious multi-asset chart screenshot analyst. Read the asset/symbol, chart timeframe and any displayed expiry directly from the screenshot. Do not use client-supplied timeframe or expiry. Return valid JSON with keys signal (HIGHER, LOWER, WAIT), reason, confidence_label (Low, Moderate, Unrated; never a percentage), symbol, timeframe, expiry_minutes (number or null), entry, stop_loss, take_profit, extracted (object with symbol, visible_price, trend, candle_structure, support_resistance, indicators, uncertainties). Entry, stop_loss and take_profit must be numeric only when responsibly inferable; otherwise null. Never fabricate values. Use WAIT if asset/timeframe is unclear, chart is unreadable, or evidence is mixed/insufficient. This is analysis only, not an order instruction.";
 const response=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{Authorization:"Bearer "+process.env.OPENAI_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({model:process.env.OPENAI_VISION_MODEL||"gpt-4o-mini",temperature:0.1,response_format:{type:"json_object"},messages:[{role:"user",content:[{type:"text",text:prompt},{type:"image_url",image_url:{url:imageData,detail:"high"}}]}]})});
 const data=await response.json();if(!response.ok)throw new Error(data.error?.message||"Vision API request failed");
 const raw=data.choices?.[0]?.message?.content;if(!raw)throw new Error("AI returned no analysis.");
 const result=JSON.parse(raw),signal=["HIGHER","LOWER","WAIT"].includes(String(result.signal).toUpperCase())?String(result.signal).toUpperCase():"WAIT";
 res.json({...result,signal,execution_enabled:false});
 }catch(e){console.error("AI analysis:",e.message);res.status(500).json({error:"Screenshot analysis failed: "+e.message});}});
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"index.html")));
app.listen(PORT,()=>console.log("Alex Trader listening on "+PORT));
