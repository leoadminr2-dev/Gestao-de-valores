import {customerMessage,customerPhone,kinds} from "./client-replies.mjs";

const sender=process.env.YCLOUD_SENDER_NUMBER||"";
const apiKey=process.env.YCLOUD_API_KEY||"";
const maxReplyAge=23*60*60*1000;
function err(message,status){return Object.assign(new Error(message),{status});}
async function loadOrder(pool,protocol){
 if(!/^(?:WA|LMR|FORM)-[A-Z0-9-]{8,64}$/.test(String(protocol||"")))throw err("protocolo_invalido",422);
 const r=await pool.query("SELECT protocol,phone,payload,operation_status,appointment_at,estimate_amount,updated_at FROM wa_orders WHERE protocol=$1",[protocol]);
 if(!r.rowCount)throw err("ordem_nao_encontrada",404);
 return r.rows[0];
}
async function windowOpen(pool,phone,now=Date.now()){
 const r=await pool.query("SELECT max(created_at) AS last_inbound FROM wa_provider_events WHERE event_type='incoming' AND payload->>'phone'=$1",[phone]);
 const when=r.rows[0]?.last_inbound?new Date(r.rows[0].last_inbound).getTime():NaN;
 return Number.isFinite(when)&&now>=when&&now-when<maxReplyAge;
}
async function apiSend(phone,message){
 const r=await fetch("https://api.ycloud.com/v2/whatsapp/messages",{
  method:"POST",
  headers:{"X-API-Key":apiKey,"Content-Type":"application/json"},
  body:JSON.stringify({from:sender,to:"+"+phone,type:"text",text:{body:message}}),
  signal:AbortSignal.timeout(16000)
 });
 if(!r.ok)throw err("provedor_rejeitou_"+r.status,502);
 const raw=await r.json().catch(()=>({}));
 return String(raw?.id||raw?.message?.id||"").slice(0,128);
}
export function createCustomerReplyService(pool,options={}){
 const outbound=options.send||apiSend;
 const ready=options.ready??Boolean(apiKey&&sender);
 return {
  async preview({protocol,kind,extra=""}){
   const o=await loadOrder(pool,protocol);
   const phone=customerPhone(o.phone);
   if(!phone)throw err("telefone_do_cliente_invalido",422);
   const message=customerMessage(o,kind,extra);
   const eligible=ready&&await windowOpen(pool,phone);
   return {protocol:o.protocol,phone,kind,message,eligible,channel:eligible?"ycloud":"manual",notice:eligible?"Envio direto disponível enquanto a conversa estiver dentro da janela de 24 horas.":"Envio automático indisponível: abra a conversa no WhatsApp Business para enviar manualmente.",updatedAt:new Date(o.updated_at).toISOString()};
  },
  async send({protocol,kind,extra="",requestKey,expectedUpdatedAt}){
   if(!ready)throw err("envio_automatico_indisponivel",503);
   if(!/^[A-Za-z0-9-]{16,100}$/.test(String(requestKey||"")))throw err("id_envio_invalido",422);
   if(!kinds.includes(kind))throw err("tipo_invalido",422);
   const o=await loadOrder(pool,protocol);
   const phone=customerPhone(o.phone);
   if(!phone)throw err("telefone_do_cliente_invalido",422);
   if(!expectedUpdatedAt||new Date(expectedUpdatedAt).getTime()!==new Date(o.updated_at).getTime())throw err("dados_alterados_revisar_proposta",409);
   const message=customerMessage(o,kind,extra);
   if(!(await windowOpen(pool,phone)))throw err("janela_de_atendimento_encerrada",409);
   // Request key is durable. Never silently retry ambiguous submissions.
   const claimed=await pool.query("INSERT INTO wa_customer_replies(request_key,protocol,phone,kind,body,status) VALUES($1,$2,$3,$4,$5,'sending') ON CONFLICT(request_key) DO NOTHING RETURNING id",[requestKey,protocol,phone,kind,message]);
   if(!claimed.rowCount){
    const prior=await pool.query("SELECT protocol,status FROM wa_customer_replies WHERE request_key=$1",[requestKey]);
    if(prior.rows[0]?.protocol!==protocol)throw err("id_envio_em_uso",409);
    return {status:prior.rows[0].status,repeated:true};
   }
   try{
    const providerId=await outbound(phone,message);
    await pool.query("UPDATE wa_customer_replies SET status='accepted',provider_message_id=$2,updated_at=now() WHERE id=$1",[claimed.rows[0].id,providerId||null]);
    // Owner initiated an explicit follow-up: preserve human control, never let bot answer an acceptance.
    await pool.query("INSERT INTO wa_sessions(phone,mode) VALUES($1,'human') ON CONFLICT(phone) DO UPDATE SET mode='human',updated_at=now()",[phone]);
    await pool.query("UPDATE wa_outbound SET cancelled_at=now(),last_error='HUMAN_TAKEOVER' WHERE phone=$1 AND sent_at IS NULL AND cancelled_at IS NULL",[phone]);
    return {status:"accepted",repeated:false};
   }catch(e){
    // Timeout and network failures are ambiguous; an HTTP rejection is known.
    const failed=String(e?.message||"").startsWith("provedor_rejeitou_");
    await pool.query("UPDATE wa_customer_replies SET status=$2,error_code=$3,updated_at=now() WHERE id=$1",[claimed.rows[0].id,failed?"rejected":"unknown",String(e?.message||"erro_envio").slice(0,70)]);
    throw err(failed?"provedor_rejeitou_mensagem":"envio_incertro_nao_repetir",502);
   }
  },
  async history(protocol){
   await loadOrder(pool,protocol);
   const result=await pool.query("SELECT kind,status,created_at,provider_message_id FROM wa_customer_replies WHERE protocol=$1 ORDER BY created_at DESC LIMIT 20",[protocol]);
   return result.rows;
  }
 };
}
