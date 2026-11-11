const express=require("express");
const path=require("path");
const fs=require("fs");
const multer=require("multer");
const crypto=require("crypto");
const {runAgents}=require("./agents");
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

/* Autonomous market scanner: public Binance spot candles for crypto;
   Twelve Data is used for FX, metals and indices when its key is configured.
   Signals are technical screening results, not predictions or trade execution. */
const scanCache={at:0,data:null};
const cryptoSymbols=["BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT","ADAUSDT","DOGEUSDT","LINKUSDT"];
const macroSymbols=["EUR/USD","GBP/USD","USD/JPY","AUD/USD","USD/CAD","USD/CHF","XAU/USD","SPX","NDX","DJI","FTSE"];
function ema(values,period){const k=2/(period+1);let v=values.slice(0,period).reduce((a,b)=>a+b,0)/period;for(let i=period;i<values.length;i++)v=values[i]*k+v*(1-k);return v;}
function rsi(values,period=14){let gains=0,losses=0;for(let i=values.length-period;i<values.length;i++){const d=values[i]-values[i-1];if(d>0)gains+=d;else losses-=d;}if(losses===0)return 100;const rs=(gains/period)/(losses/period);return 100-100/(1+rs);}
function makeSignal(symbol,market,closes,source){if(closes.length<30)throw new Error("Not enough candles");const fast=ema(closes.slice(-30),9),slow=ema(closes.slice(-30),21),momentum=rsi(closes),last=closes.at(-1);let signal="WAIT",reason="Trend or momentum is mixed; no signal.";if(fast>slow&&momentum>=52&&momentum<=68){signal="BUY";reason="EMA 9 is above EMA 21 and RSI confirms positive but not extreme momentum.";}else if(fast<slow&&momentum<=48&&momentum>=32){signal="SELL";reason="EMA 9 is below EMA 21 and RSI confirms negative but not extreme momentum.";}return {symbol,market,source,price:last,signal,reason,indicators:{ema9:fast,ema21:slow,rsi:momentum},timeframe:"5m",scanned_at:new Date().toISOString()};}
async function scanCrypto(symbol){const url="https://api.binance.com/api/v3/klines?symbol="+symbol+"&interval=5m&limit=60";const r=await fetch(url,{signal:AbortSignal.timeout(9000)});if(!r.ok)throw new Error("Binance HTTP "+r.status);const rows=await r.json();return makeSignal(symbol.replace("USDT","/USDT"),"Crypto",rows.map(x=>Number(x[4])),"Binance public market data");}
async function scanMacro(symbol){if(!process.env.TWELVEDATA_API_KEY)throw new Error("Twelve Data API key required");const url="https://api.twelvedata.com/time_series?symbol="+encodeURIComponent(symbol)+"&interval=5min&outputsize=60&apikey="+encodeURIComponent(process.env.TWELVEDATA_API_KEY);const r=await fetch(url,{signal:AbortSignal.timeout(10000)});const d=await r.json();if(!r.ok||d.status==="error"||!d.values)throw new Error(d.message||"Market data unavailable");const closes=d.values.slice().reverse().map(x=>Number(x.close));const market=symbol==="XAU/USD"?"Gold":["SPX","NDX","DJI","FTSE"].includes(symbol)?"Index":"Forex";return makeSignal(symbol,market,closes,"Twelve Data");}
app.get("/api/scanner/status",(req,res)=>res.json({enabled:true,markets:["Crypto","Forex","Gold","Indices"],cryptoSource:"Binance public spot candles",macroSource:process.env.TWELVEDATA_API_KEY?"Twelve Data connected":"Twelve Data key required for forex, gold and indices",intervalSeconds:60,executionEnabled:false}));
app.get("/api/research/status",(req,res)=>{
 const configPath=path.join(__dirname,"research-config.json");
 const dataDir=path.join(__dirname,"data","historical");
 const reportPath=path.join(__dirname,"data","reports","research-summary.json");
 let config={},manifest=null,summary=null;
 try{config=JSON.parse(fs.readFileSync(configPath,"utf8"));}catch{}
 try{manifest=JSON.parse(fs.readFileSync(path.join(dataDir,"download-manifest.json"),"utf8"));}catch{}
 try{summary=JSON.parse(fs.readFileSync(reportPath,"utf8"));}catch{}
 const files=fs.existsSync(dataDir)?fs.readdirSync(dataDir).filter(f=>f.endsWith("-5m-90d.json")):[];
 res.json({config,downloaded_datasets:files,manifest,summary,providers:{binance:"public spot historical data",twelve_data:process.env.TWELVEDATA_API_KEY?"API key configured":"API key required"},execution:{mode:"historical_and_demo_only",live_trading_enabled:false,order_placement_enabled:false}});
});
app.get("/api/scan",async(req,res)=>{try{if(scanCache.data&&Date.now()-scanCache.at<45000)return res.json({...scanCache.data,cached:true});const jobs=[...cryptoSymbols.map(s=>scanCrypto(s).catch(e=>({symbol:s.replace("USDT","/USDT"),market:"Crypto",signal:"UNAVAILABLE",reason:e.message}))),...macroSymbols.map(s=>scanMacro(s).catch(e=>({symbol:s,market:s==="XAU/USD"?"Gold":["SPX","NDX","DJI","FTSE"].includes(s)?"Index":"Forex",signal:"UNAVAILABLE",reason:e.message})))];const rawResults=await Promise.all(jobs);const results=rawResults.map(m=>({...m,team:runAgents(m)}));const payload={scanned_at:new Date().toISOString(),refresh_seconds:60,execution_enabled:false,team_agents:["Trend Scout","Momentum Scout","Risk Guardian","Signal Auditor"],signals:results,summary:{scanned:results.length,actionable:results.filter(x=>["BUY","SELL"].includes(x.team.final_signal)).length,waiting:results.filter(x=>x.team.final_signal==="WAIT").length,unavailable:results.filter(x=>x.signal==="UNAVAILABLE").length}};scanCache.at=Date.now();scanCache.data=payload;res.json(payload);}catch(e){res.status(502).json({error:"Market scan failed: "+e.message,execution_enabled:false});}});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"index.html")));
app.listen(PORT,()=>console.log("Alex Trader listening on "+PORT));
