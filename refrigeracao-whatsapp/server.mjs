import http from "node:http";
import crypto from "node:crypto";
import pg from "pg";
import {advance} from "./bot.mjs";

const DB_URL=process.env.DATABASE_URL||"";
const APP_SECRET=process.env.WHATSAPP_APP_SECRET||"";
const VERIFY_TOKEN=process.env.WHATSAPP_VERIFY_TOKEN||"";
const ACCESS_TOKEN=process.env.WHATSAPP_ACCESS_TOKEN||"";
const PHONE_NUMBER_ID=process.env.WHATSAPP_PHONE_NUMBER_ID||"";
const WIX_CLIENT_ID=process.env.WIX_CLIENT_ID||"";
const API_VERSION=process.env.GRAPH_API_VERSION||"v26.0";
const PORT=Number(process.env.PORT||3000);
const pool=new pg.Pool({connectionString:DB_URL,max:4,idleTimeoutMillis:10000,connectionTimeoutMillis:10000});
const metaReady=Boolean(APP_SECRET&&VERIFY_TOKEN&&ACCESS_TOKEN&&PHONE_NUMBER_ID);
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
  let reply=move.reply;
  if(move.order){
   const protocol=newProtocol();
   await db.query("INSERT INTO wa_orders (protocol,phone,payload) VALUES($1,$2,$3)",[protocol,phone,JSON.stringify(move.order)]);
   reply="✅ Solicitação recebida!\nProtocolo: *"+protocol+"*\n\nVamos avaliar seu pedido e confirmar a disponibilidade do atendimento. O horário solicitado *não está confirmado*. Obrigado por procurar a Leonardo Moreira Refrigeração!";
  }
  await db.query("UPDATE wa_sessions SET stage=$2,mode=$3,data=$4,last_message_at=now(),updated_at=now() WHERE phone=$1",[phone,move.stage,move.mode,JSON.stringify(move.data)]);
  if(reply)await db.query("INSERT INTO wa_outbound (incoming_message_id,phone,message) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[messageId,phone,reply]);
  await db.query("COMMIT");
 }catch(err){
  try{await db.query("ROLLBACK");}catch{}
  throw err;
 }finally{db.release();}
 if(!duplicate)await tick();
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
  descricao:"Solicitação recebida pelo WhatsApp oficial. Preferência de visita: "+String(d.preferencia||"A combinar"),
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
 if(!metaReady)return;
 for(let i=0;i<10;i++){
  const picked=await pool.query("UPDATE wa_outbound SET lease_until=now()+interval '90 seconds',attempts=attempts+1 WHERE id=(SELECT id FROM wa_outbound WHERE sent_at IS NULL AND attempts<15 AND (lease_until IS NULL OR lease_until<now()) ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING id,phone,message");
  if(picked.rowCount===0)break;
  const row=picked.rows[0];
  const last=await pool.query("SELECT last_message_at FROM wa_sessions WHERE phone=$1",[row.phone]);
  if(!last.rows[0]||Date.now()-new Date(last.rows[0].last_message_at).getTime()>23*60*60*1000){
   await pool.query("UPDATE wa_outbound SET last_error='OUTSIDE_24H_WINDOW',lease_until=now()+interval '1 day' WHERE id=$1",[row.id]);
   continue;
  }
  try{
   await sendMessage(row.phone,row.message);
   await pool.query("UPDATE wa_outbound SET sent_at=now(),lease_until=NULL,last_error=NULL WHERE id=$1",[row.id]);
  }catch(err){
   await pool.query("UPDATE wa_outbound SET last_error=$2,lease_until=now()+interval '3 minutes' WHERE id=$1",[row.id,String(err?.message||"SEND_FAILED").slice(0,100)]);
  }
 }
}
async function tick(){
 if(processing)return;
 processing=true;
 try{await syncOrders();await sendOutbox();}
 catch(e){console.error("FALHA_FILA",String(e?.code||e?.message||"ERR").slice(0,100));}
 finally{processing=false;}
}
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url||"/","http://localhost");
  if(req.method==="GET"&&url.pathname==="/healthz"){
   return json(res,200,{service:"leonardo-refrigeracao-whatsapp",status:metaReady?"configured":"awaiting_meta_onboarding",database:DB_URL?"configured":"missing",wix:WIX_CLIENT_ID?"configured":"missing",graphApi:API_VERSION});
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
    if(String(value.metadata?.phone_number_id||"")!==PHONE_NUMBER_ID)continue;
    for(const message of value.messages||[]){
     if(!["text","image","interactive","button"].includes(message.type))continue;
     await handleInbound(message);
     processed++;
    }
   }
  }
  return json(res,200,{ok:true,processed});
 }catch(err){
  console.error("WEBHOOK_ERROR",String(err?.code||err?.message||"ERR").slice(0,100));
  return json(res,err?.status===413?413:500,{error:err?.status===413?"payload_too_large":"temporary_error"});
 }
});
server.listen(PORT,"0.0.0.0",()=>console.log("Refrigeracao WhatsApp webhook initialized on port "+PORT+"; "+(metaReady?"META_CONFIGURED":"AWAITING_META")));
setInterval(()=>{void tick();},30000).unref();
