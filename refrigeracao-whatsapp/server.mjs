import http from "node:http";
import crypto from "node:crypto";
import pg from "pg";
import {advance} from "./bot.mjs";
import {appReplyPhones} from "./coexistence.mjs";
import {verifyYCloudSignature,relevantYCloudEvent} from "./ycloud.mjs";
import {createDashboard} from "./dashboard.mjs";

const DB_URL=process.env.DATABASE_URL||"";
const APP_SECRET=process.env.WHATSAPP_APP_SECRET||"";
const VERIFY_TOKEN=process.env.WHATSAPP_VERIFY_TOKEN||"";
const ACCESS_TOKEN=process.env.WHATSAPP_ACCESS_TOKEN||"";
const PHONE_NUMBER_ID=process.env.WHATSAPP_PHONE_NUMBER_ID||"";
const WIX_CLIENT_ID=process.env.WIX_CLIENT_ID||"";
const API_VERSION=process.env.GRAPH_API_VERSION||"v26.0";
const YCLOUD_WEBHOOK_SECRET=process.env.YCLOUD_WEBHOOK_SECRET||"";
const YCLOUD_API_KEY=process.env.YCLOUD_API_KEY||"";
const YCLOUD_SENDER_NUMBER=process.env.YCLOUD_SENDER_NUMBER||"";
const YCLOUD_AUTOREPLY_ENABLED=process.env.YCLOUD_AUTOREPLY_ENABLED==="true";
// Guardrail: real customers remain unaffected until explicit production release.
const YCLOUD_TEST_MODE=process.env.YCLOUD_TEST_MODE!=="false";
const PORT=Number(process.env.PORT||3000);
const pool=new pg.Pool({connectionString:DB_URL,max:4,idleTimeoutMillis:10000,connectionTimeoutMillis:10000});
const metaReady=Boolean(APP_SECRET&&VERIFY_TOKEN&&ACCESS_TOKEN&&PHONE_NUMBER_ID);
const ycloudReady=Boolean(YCLOUD_WEBHOOK_SECRET&&YCLOUD_API_KEY&&YCLOUD_SENDER_NUMBER&&YCLOUD_AUTOREPLY_ENABLED);
let processing=false;

function json(res,status,data){
  res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"});
  res.end(JSON.stringify(data));
}
function safePhone(value){const v=String(value||"").replace(/[^\d]/g,"");return v.length>=10&&v.length<=15?v:"";}
function newProtocol(){return "WA-"+new Date().toISOString().slice(0,10).replace(/-/g,"")+"-"+crypto.randomBytes(4).toString("hex").toUpperCase();}
function signatureValid(raw,header){
 if(!APP_SECRET||!header||!header.startsWith("sha256="))return false;
 const actual=Buffer.from(header,"utf8");
 const expected=Buffer.from("sha256="+crypto.createHmac("sha256",APP_SECRET).update(raw).digest("hex"),"utf8");
 return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected);
}
async function readBody(req){
 const chunks=[];let size=0;
 for await(const chunk of req){
  size+=chunk.length;
  if(size>200000)throw Object.assign(new Error("PAYLOAD_TOO_LARGE"),{status:413});
  chunks.push(chunk);
 }
 return Buffer.concat(chunks);
}
function msgText(m){
 if(m?.type==="text")return m?.text?.body||"";
 if(m?.type==="interactive")return m?.interactive?.button_reply?.title||m?.interactive?.list_reply?.title||"";
 if(m?.type==="button")return m?.button?.text||"";
 return "";
}
async function handleInbound(message){
 const phone=safePhone(message?.from),messageId=String(message?.id||"");
 if(!phone||!messageId||messageId.length>255)return;
 const incoming={text:msgText(message),type:message.type};
 const db=await pool.connect();
 let duplicate=false;
 try{
  await db.query("BEGIN");
  await db.query("INSERT INTO wa_sessions (phone) VALUES ($1) ON CONFLICT (phone) DO NOTHING",[phone]);
  const sess=await db.query("SELECT * FROM wa_sessions WHERE phone=$1 FOR UPDATE",[phone]);
  const inserted=await db.query("INSERT INTO wa_processed_messages (message_id,phone) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING message_id",[messageId,phone]);
  if(inserted.rowCount===0){duplicate=true;await db.query("COMMIT");return;}
  const current=sess.rows[0];
  const move=advance({stage:current.stage,mode:current.mode,data:current.data},incoming);
  // A confirmação da transferência humana deve chegar antes de pausar o robô.
  // Usamos JSONB como estado temporário, preservando o CHECK bot/human do banco.
  const enteringHuman=current.mode==="bot"&&move.mode==="human"&&Boolean(move.reply);
  const cancellingHandoff=Boolean(current.data?.handoffPending)&&move.mode==="bot"&&!move.data?.handoffPending;
  const persistedMode=enteringHuman?"bot":move.mode;
  const persistedData=enteringHuman?{...move.data,handoffPending:true}:move.data;
  if(enteringHuman||cancellingHandoff){
   await db.query("UPDATE wa_outbound SET cancelled_at=now(),last_error='HANDOFF_RESET' WHERE phone=$1 AND sent_at IS NULL AND cancelled_at IS NULL",[phone]);
  }
  let reply=move.reply;
  if(move.order){
   const protocol=newProtocol();
   await db.query("INSERT INTO wa_orders (protocol,phone,payload) VALUES($1,$2,$3)",[protocol,phone,JSON.stringify(move.order)]);
   reply="✅ Solicitação recebida!\nProtocolo: *"+protocol+"*\n\nVamos avaliar seu pedido e confirmar a disponibilidade do atendimento. O horário solicitado *não está confirmado*. Obrigado por procurar a Leonardo Moreira Refrigeração!";
  }
  await db.query("UPDATE wa_sessions SET stage=$2,mode=$3,data=$4,last_message_at=now(),updated_at=now() WHERE phone=$1",[phone,move.stage,persistedMode,JSON.stringify(persistedData)]);
  if(reply)await db.query("INSERT INTO wa_outbound (incoming_message_id,phone,message) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[messageId,phone,reply]);
  await db.query("COMMIT");
 }catch(err){
  try{await db.query("ROLLBACK");}catch{}
  throw err;
 }finally{db.release();}
 // The durable outbound queue is drained by the provider event worker/timer.
}
async function handleManualReply(phone){
 // A human reply from the Business App pauses bot responses for this customer.
 // Never interpret the echo as a new inbound order or send an automatic reply.
 const db=await pool.connect();
 try{
  await db.query("BEGIN");
  await db.query("INSERT INTO wa_sessions (phone,mode) VALUES($1,'human') ON CONFLICT (phone) DO UPDATE SET mode='human',updated_at=now()",[phone]);
  await db.query("UPDATE wa_outbound SET cancelled_at=now(),last_error='HUMAN_TAKEOVER' WHERE phone=$1 AND sent_at IS NULL AND cancelled_at IS NULL",[phone]);
  await db.query("COMMIT");
 }catch(error){
  try{await db.query("ROLLBACK")}catch{}
  throw error;
 }finally{db.release()}
}
async function receiveYCloudEvent(event){
 const saved=await pool.query("INSERT INTO wa_provider_events(event_id,event_type,payload) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING event_id",[event.id,event.kind,JSON.stringify(event)]);
 return saved.rowCount===1;
}
async function processYCloudEvents(){
 if(!ycloudReady)return;
 for(let i=0;i<20;i++){
  const claim=await pool.query("UPDATE wa_provider_events SET lease_until=now()+interval '90 seconds',attempts=attempts+1 WHERE event_id=(SELECT event_id FROM wa_provider_events WHERE processed_at IS NULL AND attempts<20 AND (lease_until IS NULL OR lease_until<now()) ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING event_id,payload");
  if(!claim.rowCount)break;
  const event=claim.rows[0].payload;
  try{
   if(YCLOUD_TEST_MODE){
    const optedIn=event.kind==="incoming" && event.messageType==="text" && String(event.text||"").trim().toUpperCase()==="TESTE LMR";
    if(optedIn){
     await pool.query("INSERT INTO wa_test_allowlist(phone) VALUES($1) ON CONFLICT DO NOTHING",[event.phone]);
     event.text="menu";
    }else{
     const allowed=await pool.query("SELECT 1 FROM wa_test_allowlist WHERE phone=$1",[event.phone]);
     if(!allowed.rowCount){
      await pool.query("UPDATE wa_provider_events SET processed_at=now(),lease_until=NULL,last_error=NULL WHERE event_id=$1",[claim.rows[0].event_id]);
      continue;
     }
    }
   }
   if(event.kind==="manual_reply"){await handleManualReply(event.phone);}
   else if(event.kind==="incoming"){
    await handleInbound({from:event.phone,id:"ycloud-"+event.messageId,type:event.messageType,text:{body:event.text||""}});
   }
   await pool.query("UPDATE wa_provider_events SET processed_at=now(),lease_until=NULL,last_error=NULL WHERE event_id=$1",[claim.rows[0].event_id]);
  }catch(err){
   await pool.query("UPDATE wa_provider_events SET lease_until=now()+interval '2 minutes',last_error=$2 WHERE event_id=$1",[claim.rows[0].event_id,String(err?.code||err?.message||"ERROR").slice(0,100)]);
  }
 }
}
async function wixInsert(order){
 if(!WIX_CLIENT_ID)throw new Error("WIX_CLIENT_ID_NOT_CONFIGURED");
 const tokenResponse=await fetch("https://www.wixapis.com/oauth2/token",{
  method:"POST",headers:{"content-type":"application/json"},
  body:JSON.stringify({clientId:WIX_CLIENT_ID,grantType:"anonymous"}),
  signal:AbortSignal.timeout(15000)
 });
 if(!tokenResponse.ok)throw new Error("WIX_AUTH_"+tokenResponse.status);
 const tokens=await tokenResponse.json();
 if(!tokens.access_token)throw new Error("WIX_TOKEN_MISSING");
 const d=order.payload||{};
 const fields={
  title:order.protocol+" · "+String(d.cliente||"Cliente"),
  protocolo:order.protocol,
  cliente:String(d.cliente||""),
  telefone:order.phone,
  bairro:String(d.bairro||""),
  equipamento:String(d.equipamento||""),
  servico:String(d.servico||""),
  descricao:("Solicitação recebida pelo WhatsApp oficial. "
    +(d.tipoAtendimento?"Atendimento: "+String(d.tipoAtendimento)+". ":"")
    +(d.empresa?"Empresa: "+String(d.empresa)+". ":"")
    +"Preferência de atendimento ou retorno: "+String(d.preferencia||"A combinar")).slice(0,1500),
  origem:"WhatsApp Business Platform",
  periodoPreferido:String(d.preferencia||"A combinar"),
  status:"Novo pedido",
  prioridade:"Normal",
  fotosCanal:Number(d.fotos||0)>0?"Fotos na conversa do WhatsApp":"Não informado"
 };
 const response=await fetch("https://www.wixapis.com/wix-data/v2/items",{
  method:"POST",headers:{"authorization":tokens.access_token,"content-type":"application/json"},
  body:JSON.stringify({dataCollectionId:"OrdensRefrigeracao",dataItem:{data:fields}}),
  signal:AbortSignal.timeout(16000)
 });
 if(!response.ok)throw new Error("WIX_INSERT_"+response.status);
 const result=await response.json();
 const id=result.dataItem?.id;
 if(!id)throw new Error("WIX_INSERT_WITHOUT_ID");
 return id;
}
async function syncOrders(){
 if(!WIX_CLIENT_ID)return;
 const result=await pool.query("SELECT protocol,phone,payload,sync_attempts FROM wa_orders WHERE sync_status<>'synced' AND sync_attempts<20 ORDER BY created_at ASC LIMIT 5");
 for(const order of result.rows){
  await pool.query("UPDATE wa_orders SET sync_attempts=sync_attempts+1,updated_at=now() WHERE protocol=$1",[order.protocol]);
  try{
   const itemId=await wixInsert(order);
   await pool.query("UPDATE wa_orders SET wix_item_id=$2,sync_status='synced',last_error=NULL,updated_at=now() WHERE protocol=$1",[order.protocol,itemId]);
  }catch(err){
   const code=String(err?.message||"ERROR").slice(0,100);
   await pool.query("UPDATE wa_orders SET sync_status='failed',last_error=$2,updated_at=now() WHERE protocol=$1",[order.protocol,code]);
  }
 }
}
async function sendMessage(phone,message){
 if(ycloudReady){
  const to="+"+phone;
  const response=await fetch("https://api.ycloud.com/v2/whatsapp/messages",{
   method:"POST",
   headers:{"X-API-Key":YCLOUD_API_KEY,"content-type":"application/json"},
   body:JSON.stringify({from:YCLOUD_SENDER_NUMBER,to,type:"text",text:{body:message}}),
   signal:AbortSignal.timeout(16000)
  });
  if(!response.ok)throw new Error("YCLOUD_SEND_"+response.status);
  return;
 }
 const url="https://graph.facebook.com/"+API_VERSION+"/"+encodeURIComponent(PHONE_NUMBER_ID)+"/messages";
 const response=await fetch(url,{
  method:"POST",
  headers:{"authorization":"Bearer "+ACCESS_TOKEN,"content-type":"application/json"},
  body:JSON.stringify({messaging_product:"whatsapp",to:phone,type:"text",text:{preview_url:false,body:message}}),
  signal:AbortSignal.timeout(15000)
 });
 if(!response.ok)throw new Error("META_SEND_"+response.status);
}
async function sendOutbox(){
 if(!metaReady&&!ycloudReady)return;
 for(let i=0;i<10;i++){
  const picked=await pool.query("UPDATE wa_outbound SET lease_until=now()+interval '90 seconds',attempts=attempts+1 WHERE id=(SELECT id FROM wa_outbound WHERE sent_at IS NULL AND cancelled_at IS NULL AND attempts<15 AND (lease_until IS NULL OR lease_until<now()) ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id,phone,message");
  if(picked.rowCount===0)break;
  const row=picked.rows[0];
  const last=await pool.query("SELECT last_message_at,mode,data FROM wa_sessions WHERE phone=$1",[row.phone]);
  if(last.rows[0]?.mode==="human"){
   await pool.query("UPDATE wa_outbound SET cancelled_at=now(),last_error='HUMAN_TAKEOVER' WHERE id=$1",[row.id]);
   continue;
  }
  if(!last.rows[0]||Date.now()-new Date(last.rows[0].last_message_at).getTime()>23*60*60*1000){
   await pool.query("UPDATE wa_outbound SET last_error='OUTSIDE_24H_WINDOW',lease_until=now()+interval '1 day' WHERE id=$1",[row.id]);
   continue;
  }
  try{
   await sendMessage(row.phone,row.message);
   await pool.query("UPDATE wa_outbound SET sent_at=now(),lease_until=NULL,last_error=NULL WHERE id=$1",[row.id]);
   // A partir daqui, só Leonardo ou o comando MENU retoma a conversa.
   if(last.rows[0]?.data?.handoffPending===true){
    await pool.query("UPDATE wa_sessions SET mode='human',data=data-'handoffPending',updated_at=now() WHERE phone=$1 AND mode='bot' AND data->>'handoffPending'='true'",[row.phone]);
   }
  }catch(err){
   await pool.query("UPDATE wa_outbound SET last_error=$2,lease_until=now()+interval '3 minutes' WHERE id=$1",[row.id,String(err?.message||"SEND_FAILED").slice(0,100)]);
  }
 }
}
async function tick(){
 if(processing)return;
 processing=true;
 try{await processYCloudEvents();await syncOrders();await sendOutbox();}
 catch(e){console.error("FALHA_FILA",String(e?.code||e?.message||"ERR").slice(0,100));}
 finally{processing=false;}
}
const dashboard=createDashboard(pool);
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url||"/","http://localhost");
  if(await dashboard(req,res,url))return;
  if(req.method==="GET"&&url.pathname==="/healthz"){
   return json(res,200,{service:"leonardo-refrigeracao-whatsapp",status:metaReady?"configured":"awaiting_meta_onboarding",database:DB_URL?"configured":"missing",wix:WIX_CLIENT_ID?"configured":"missing",graphApi:API_VERSION,yCloud:ycloudReady?(YCLOUD_TEST_MODE?"test_mode":"enabled"):YCLOUD_WEBHOOK_SECRET?"paused":"awaiting_webhook_secret"});
  }
  if(url.pathname==="/webhook/ycloud"){
   if(req.method==="GET")return json(res,200,{service:"leonardo-refrigeracao-whatsapp",provider:"ycloud",state:ycloudReady?"ready":"paused"});
   if(req.method!=="POST")return json(res,405,{error:"method_not_allowed"});
   if(!YCLOUD_WEBHOOK_SECRET)return json(res,503,{error:"ycloud_secret_not_configured"});
   const raw=await readBody(req);
   if(!verifyYCloudSignature(raw,String(req.headers["ycloud-signature"]||""),YCLOUD_WEBHOOK_SECRET))return json(res,403,{error:"invalid_ycloud_signature"});
   const payload=JSON.parse(raw.toString("utf8"));
   const event=relevantYCloudEvent(payload,YCLOUD_SENDER_NUMBER);
   if(!event)return json(res,200,{ok:true,ignored:true});
   // Before final controlled validation, never process or store customer messages.
   if(!ycloudReady)return json(res,200,{ok:true,paused:true});
   if(YCLOUD_TEST_MODE){
    const testCommand=event.kind==="incoming" && event.messageType==="text" && String(event.text||"").trim().toUpperCase()==="TESTE LMR";
    if(!testCommand){
     const allowed=await pool.query("SELECT 1 FROM wa_test_allowlist WHERE phone=$1",[event.phone]);
     if(!allowed.rowCount)return json(res,200,{ok:true,test_mode:true,ignored:true});
    }
   }
   const isNew=await receiveYCloudEvent(event);
   json(res,200,{ok:true,queued:isNew});
   if(isNew)setImmediate(()=>{void tick()});
   return;
  }
  if(url.pathname!=="/webhook/whatsapp")return json(res,404,{error:"not_found"});
  if(req.method==="GET"){
   const token=url.searchParams.get("hub.verify_token")||"";
   const mode=url.searchParams.get("hub.mode")||"";
   const challenge=url.searchParams.get("hub.challenge")||"";
   if(!VERIFY_TOKEN||mode!=="subscribe"||!token||token!==VERIFY_TOKEN)return json(res,403,{error:"invalid_verification"});
   res.writeHead(200,{"content-type":"text/plain; charset=utf-8"});return res.end(challenge);
  }
  if(req.method!=="POST")return json(res,405,{error:"method_not_allowed"});
  if(!APP_SECRET)return json(res,503,{error:"meta_not_connected"});
  const raw=await readBody(req);
  if(!signatureValid(raw,String(req.headers["x-hub-signature-256"]||"")))return json(res,403,{error:"invalid_signature"});
  const body=JSON.parse(raw.toString("utf8"));
  if(body.object!=="whatsapp_business_account")return json(res,200,{ok:true,ignored:true});
  let processed=0;
  for(const entry of body.entry||[]){
   for(const change of entry.changes||[]){
    const value=change.value||{};
    const phones=appReplyPhones(change,PHONE_NUMBER_ID);
    for(const phone of phones){await handleManualReply(phone);processed++;}
    if(String(value.metadata?.phone_number_id||"")!==PHONE_NUMBER_ID)continue;
    if(change.field!=="messages")continue;
    for(const message of value.messages||[]){
     if(!["text","image","interactive","button"].includes(message.type))continue;
     await handleInbound(message);
     processed++;
    }
   }
  }
  json(res,200,{ok:true,processed});
  if(processed)setImmediate(()=>{void tick()});
  return;
 }catch(err){
  console.error("WEBHOOK_ERROR",String(err?.code||err?.message||"ERR").slice(0,100));
  return json(res,err?.status===413?413:500,{error:err?.status===413?"payload_too_large":"temporary_error"});
 }
});
server.listen(PORT,"0.0.0.0",()=>console.log("Refrigeracao WhatsApp webhook initialized on port "+PORT+"; "+(metaReady?"META_CONFIGURED":"AWAITING_META")));
// Conservar cotas gratuitas: sem sondagens ao banco antes do vínculo oficial Meta.
// Durante operação, a fila é acionada a cada mensagem recebida e sondada a cada 10 min.
if(metaReady||ycloudReady){
  setTimeout(()=>{void tick();},5000).unref();
  setInterval(()=>{void tick();},10*60*1000).unref();
}
