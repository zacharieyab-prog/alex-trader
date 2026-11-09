const $=id=>document.getElementById(id);let selectedFile=null,previewUrl=null,lastAnalysis=null;
const setStatus=(title,sub)=>{$("apiStatus").textContent=title;$("apiSub").textContent=sub};
async function checkHealth(){try{const r=await fetch("/api/health");const d=await r.json();setStatus(d.aiConfigured?"AI service ready":"AI service reachable · API key missing",d.aiConfigured?"Server-side vision is configured.":"Add OPENAI_API_KEY to the server environment.");}catch{setStatus("AI service not connected","Run the backend server; GitHub Pages alone cannot run image analysis.");}}checkHealth();
const drop=$("dropZone"),input=$("chartFile");
function setFile(f){if(!f)return;if(!["image/png","image/jpeg","image/webp"].includes(f.type)||f.size>8*1024*1024){alert("Choose a PNG, JPG or WEBP image under 8 MB.");return;}selectedFile=f;if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(f);$("preview").src=previewUrl;$("previewWrap").classList.remove("hidden");$("analyze").disabled=false;}
input.addEventListener("change",()=>setFile(input.files?.[0]));drop.addEventListener("dragover",e=>{e.preventDefault();drop.classList.add("drag")});drop.addEventListener("dragleave",()=>drop.classList.remove("drag"));drop.addEventListener("drop",e=>{e.preventDefault();drop.classList.remove("drag");setFile(e.dataTransfer.files?.[0])});
$("removeImage").addEventListener("click",()=>{selectedFile=null;input.value="";if(previewUrl)URL.revokeObjectURL(previewUrl);$("preview").src="";$("previewWrap").classList.add("hidden");$("analyze").disabled=true;});
$("enableAlerts").addEventListener("click",async()=>{if(!("Notification" in window)){$("alertStatus").textContent="This browser does not support notifications.";return;}try{const permission=await Notification.requestPermission();$("alertStatus").textContent=permission==="granted"?"Signal alerts enabled on this device.":"Notifications were not enabled. You can still see signals in the app.";}catch{$("alertStatus").textContent="Could not enable notifications in this browser.";}});
function notifySignal(d){if(!("Notification" in window)||Notification.permission!=="granted")return;const sig=String(d.signal||"WAIT").toUpperCase();if(sig==="WAIT")return;const n=new Notification("Alex Trader · BTC/USD "+sig,{body:"Expiry: "+(d.expiry_minutes||"—")+" min · Confidence: "+(d.confidence_label||"Unrated")+". Open the app to review the chart analysis.",tag:"alex-trader-"+Date.now()});n.onclick=()=>{window.focus();n.close();};}
function renderRows(items){const box=$("extractedRows");box.replaceChildren();for(const [k,v] of Object.entries(items||{})){const row=document.createElement("div");row.className="data-row";const x=document.createElement("span"),y=document.createElement("b");x.textContent=k;y.textContent=v??"Not visible";row.append(x,y);box.append(row);}}
$("analyze").addEventListener("click",async()=>{if(!selectedFile)return;const fd=new FormData();fd.append("chart",selectedFile);fd.append("timeframe",$("timeframe").value);fd.append("expiry",$("expiry").value);$("emptyState").classList.add("hidden");$("result").classList.add("hidden");$("loading").classList.remove("hidden");$("analyze").disabled=true;try{const r=await fetch("/api/analyze",{method:"POST",body:fd});const d=await r.json();if(!r.ok)throw new Error(d.error||"Analysis failed");lastAnalysis=d;$("loading").classList.add("hidden");$("result").classList.remove("hidden");const sig=(d.signal||"WAIT").toUpperCase();$("signalLabel").textContent=sig;$("signalLabel").className="signal-label"+(sig==="HIGHER"?" buy":sig==="LOWER"?" sell":"");$("signalTitle").textContent=sig==="WAIT"?"No confirmed setup":sig+" signal";$("signalReason").textContent=d.reason||"No reliable directional setup.";$("outTimeframe").textContent=d.timeframe||$("timeframe").value;$("outExpiry").textContent=(d.expiry_minutes||$("expiry").value)+" min";$("outConfidence").textContent=d.confidence_label||"Unrated";$("outEntry").textContent=d.entry??"Not identified";$("outStop").textContent=d.stop_loss??"Not identified";$("outTarget").textContent=d.take_profit??"Not identified";renderRows(d.extracted||{});saveSignal(d);notifySignal(d);}catch(e){$("loading").classList.add("hidden");$("emptyState").classList.remove("hidden");alert(e.message);}finally{$("analyze").disabled=!selectedFile;}});
/* Local signal journal: no broker connection and no automatic outcome claims. */
const HISTORY_KEY="alexTraderSignalHistoryV1";
function readHistory(){try{return JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]");}catch{return[];}}
function writeHistory(rows){localStorage.setItem(HISTORY_KEY,JSON.stringify(rows));}
function renderHistory(){
 const rows=readHistory(),directional=rows.filter(x=>x.signal!=="WAIT"),settled=directional.filter(x=>Boolean(x.outcome)),scored=directional.filter(x=>x.outcome==="WIN"||x.outcome==="LOSS"),wins=scored.filter(x=>x.outcome==="WIN").length,pending=directional.filter(x=>!x.outcome).length;
 $("statTotal").textContent=directional.length;$("statSettled").textContent=settled.length;$("statWins").textContent=wins;$("statPending").textContent=pending;$("statRate").textContent=scored.length?Math.round(wins/scored.length*100)+"%":"—";
 $("historyEmpty").classList.toggle("hidden",rows.length>0);const list=$("historyList");list.replaceChildren();
 rows.slice().reverse().forEach(item=>{
  const card=document.createElement("article");card.className="history-card";
  const head=document.createElement("div");head.className="history-card-head";
  const label=document.createElement("b");label.textContent=item.signal+" · "+item.timeframe+" · "+item.expiry+"m";
  const date=document.createElement("small");date.textContent=new Date(item.createdAt).toLocaleString();
  head.append(label,date);card.append(head);
  const reason=document.createElement("p");reason.textContent=item.reason||"No reason supplied.";card.append(reason);
  const meta=document.createElement("div");meta.className="history-meta";meta.textContent="Confidence: "+(item.confidence||"Unrated")+" · Outcome: "+(item.outcome||"PENDING");card.append(meta);
  if(item.signal!=="WAIT"&&!item.outcome){
   const actions=document.createElement("div");actions.className="outcome-actions";
   ["WIN","LOSS","UNRESOLVED"].forEach(value=>{const b=document.createElement("button");b.type="button";b.className="secondary-button";b.textContent=value;b.addEventListener("click",()=>{const all=readHistory(),target=all.find(x=>x.id===item.id);if(target){target.outcome=value;target.settledAt=new Date().toISOString();writeHistory(all);renderHistory();}});actions.append(b);});
   card.append(actions);
  }
  list.append(card);
 });
}
function saveSignal(d){
 const rows=readHistory();rows.push({id:Date.now().toString(36)+Math.random().toString(36).slice(2,7),createdAt:new Date().toISOString(),signal:String(d.signal||"WAIT").toUpperCase(),timeframe:d.timeframe||$("timeframe").value,expiry:d.expiry_minutes||$("expiry").value,confidence:d.confidence_label||"Unrated",reason:d.reason||"",outcome:d.signal==="WAIT"?"WAIT":null});
 writeHistory(rows);renderHistory();
}
$("exportHistory").addEventListener("click",()=>{const rows=readHistory();if(!rows.length){alert("There are no saved signals to export.");return;}const cols=["createdAt","signal","timeframe","expiry","confidence","reason","outcome","settledAt"];const csv=[cols.join(","),...rows.map(r=>cols.map(k=>'"'+String(r[k]??"").replace(/"/g,'""')+'"').join(","))].join("\n");const url=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));const a=document.createElement("a");a.href=url;a.download="alex-trader-signal-history.csv";a.click();URL.revokeObjectURL(url);});
$("clearHistory").addEventListener("click",()=>{if(confirm("Delete all locally saved signal history?")){writeHistory([]);renderHistory();}});
renderHistory();
