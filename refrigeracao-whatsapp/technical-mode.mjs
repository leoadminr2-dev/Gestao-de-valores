import crypto from "node:crypto";
export const ABSENCE_MESSAGE="❄️ *LEONARDO MOREIRA REFRIGERAÇÃO*\n\n🔧 No momento, estamos realizando um atendimento técnico e não conseguimos responder imediatamente.\n\n🤖 Aqui é o Romeu, assistente virtual. Leonardo dará continuidade à conversa assim que estiver disponível.\n\n🤝 Agradecemos pela compreensão e pela confiança em nosso trabalho!\n\n*Qualidade, responsabilidade e compromisso com você!* 🛠️";
export function absenceMessage(now=new Date()){
 const hour=Number(new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",hour:"2-digit",hourCycle:"h23"}).format(now));
 const greeting=hour>=5&&hour<12?"☀️ Bom dia!":hour>=12&&hour<18?"🌤️ Boa tarde!":"🌙 Boa noite!";
 return greeting+" Olá, tudo bem?\n\n"+ABSENCE_MESSAGE;
}
export function validDuration(hours){return Number.isInteger(hours)&&hours>=1&&hours<=12;}
export function createTechnicalMode(pool){
 let ready;
 function ensure(){
  if(!ready)ready=(async()=>{
   await pool.query("CREATE TABLE IF NOT EXISTS wa_technical_mode (id integer PRIMARY KEY CHECK(id=1), run_id text, active_until timestamptz)");
   await pool.query("INSERT INTO wa_technical_mode(id) VALUES(1) ON CONFLICT DO NOTHING");
   await pool.query("CREATE TABLE IF NOT EXISTS wa_technical_waiting (run_id text NOT NULL, phone text NOT NULL, first_at timestamptz NOT NULL DEFAULT now(), last_at timestamptz NOT NULL DEFAULT now(), attempted_at timestamptz, sent_at timestamptz, responded_at timestamptz, error text, PRIMARY KEY(run_id,phone))");
  })().catch(e=>{ready=null;throw e;});
  return ready;
 }
 async function status(){
  await ensure();
  const r=await pool.query("SELECT run_id,active_until,COALESCE(active_until>now(),false) AS active FROM wa_technical_mode WHERE id=1");
  return r.rows[0];
 }
 async function snapshot(){
  const s=await status();
  const r=await pool.query("SELECT phone,first_at,last_at,attempted_at,sent_at,responded_at,error FROM wa_technical_waiting WHERE run_id=$1 ORDER BY last_at DESC LIMIT 200",[s.run_id]);
  return {active:s.active,activeUntil:s.active_until,waiting:r.rows};
 }
 async function set(active,hours=4){
  await ensure();
  if(typeof active!=="boolean"||(active&&!validDuration(hours)))throw Error("duracao_invalida");
  if(active)await pool.query("UPDATE wa_technical_mode SET run_id=$1,active_until=now()+($2::int*interval '1 hour') WHERE id=1 AND (active_until IS NULL OR active_until<=now())",[crypto.randomUUID(),hours]);
  else await pool.query("UPDATE wa_technical_mode SET active_until=NULL WHERE id=1");
  return snapshot();
 }
 async function capture(phone){
  await ensure();
  // One row per contact per activation. No message content is retained.
  const r=await pool.query("INSERT INTO wa_technical_waiting(run_id,phone,responded_at) SELECT run_id,$1,GREATEST((SELECT MAX(responded_at) FROM wa_technical_waiting WHERE phone=$1),(SELECT (data->>'romeuManualAt')::timestamptz FROM wa_sessions WHERE phone=$1)) FROM wa_technical_mode WHERE id=1 AND active_until>now() ON CONFLICT(run_id,phone) DO UPDATE SET last_at=now(),responded_at=GREATEST(wa_technical_waiting.responded_at,EXCLUDED.responded_at) RETURNING phone",[phone]);
  return r.rowCount>0;
 }
 async function manual(phone){
  await ensure();
  // Every manual reply restarts the per-contact clock, even before the first incoming message.
  const r=await pool.query("INSERT INTO wa_technical_waiting(run_id,phone,responded_at) SELECT run_id,$1,now() FROM wa_technical_mode WHERE id=1 AND active_until>now() ON CONFLICT(run_id,phone) DO UPDATE SET responded_at=now(),attempted_at=NULL,sent_at=NULL,error=NULL",[phone]);
  if(!r.rowCount)await pool.query("UPDATE wa_technical_waiting SET responded_at=now() WHERE phone=$1 AND run_id=(SELECT run_id FROM wa_technical_mode WHERE id=1)",[phone]);
 }
 async function nextDue(){
  await ensure();
  const r=await pool.query("SELECT MIN(CASE WHEN q.responded_at IS NULL THEN now() ELSE q.responded_at+interval '10 minutes' END) AS due FROM wa_technical_waiting q JOIN wa_technical_mode m ON m.run_id=q.run_id AND m.active_until>now() WHERE q.attempted_at IS NULL AND (q.responded_at IS NULL OR q.last_at>q.responded_at)");
  return r.rows[0]?.due||null;
 }
 async function drain(send,isProtected){
  await ensure();
  for(let i=0;i<20;i++){
   // Claim before sending: uncertain network failures never cause repeated messages.
   const r=await pool.query("UPDATE wa_technical_waiting w SET attempted_at=now() WHERE (w.run_id,w.phone)=(SELECT q.run_id,q.phone FROM wa_technical_waiting q JOIN wa_technical_mode m ON m.run_id=q.run_id AND m.active_until>now() WHERE q.attempted_at IS NULL AND (q.responded_at IS NULL OR (q.last_at>q.responded_at AND q.responded_at<=now()-interval '10 minutes')) ORDER BY q.last_at LIMIT 1 FOR UPDATE OF q SKIP LOCKED) RETURNING w.run_id,w.phone,w.attempted_at::text AS claim_token");
   if(!r.rowCount)break;
   const {run_id,phone,claim_token}=r.rows[0];
   try{
    if(isProtected(phone))throw Error("PRIVATE_CONTACT");
    const current=await status();
    if(!current.active||current.run_id!==run_id)throw Error("MODE_ENDED");
    // A manual reply may have cancelled the claim since it was taken.
    const valid=await pool.query("SELECT 1 FROM wa_technical_waiting q JOIN wa_technical_mode m ON m.run_id=q.run_id AND m.active_until>now() WHERE q.run_id=$1 AND q.phone=$2 AND q.attempted_at=$3::timestamptz AND (q.responded_at IS NULL OR (q.last_at>q.responded_at AND q.responded_at<=now()-interval '10 minutes'))",[run_id,phone,claim_token]);
    if(!valid.rowCount)continue;
    await send(phone,absenceMessage());
    await pool.query("UPDATE wa_technical_waiting SET sent_at=now() WHERE run_id=$1 AND phone=$2 AND attempted_at=$3::timestamptz",[run_id,phone,claim_token]);
   }catch(e){await pool.query("UPDATE wa_technical_waiting SET error=$4 WHERE run_id=$1 AND phone=$2 AND attempted_at=$3::timestamptz",[run_id,phone,claim_token,String(e?.message||"SEND_FAILED").slice(0,100)]);}
  }
 }
 async function manualAssist(phone,at){
  await ensure();
  const r=await pool.query("INSERT INTO wa_technical_waiting(run_id,phone,responded_at) SELECT run_id,$1,$2::timestamptz FROM wa_technical_mode WHERE id=1 AND active_until>now() ON CONFLICT(run_id,phone) DO UPDATE SET responded_at=EXCLUDED.responded_at,attempted_at=NULL,sent_at=NULL,error=NULL WHERE wa_technical_waiting.responded_at IS NULL OR wa_technical_waiting.responded_at<EXCLUDED.responded_at RETURNING phone",[phone,at]);
  return r.rowCount>0;
 }
 async function paused(phone){
  await ensure();
  const r=await pool.query("SELECT 1 FROM wa_technical_waiting q JOIN wa_technical_mode m ON m.run_id=q.run_id AND m.active_until>now() WHERE q.phone=$1 AND q.responded_at>now()-interval '10 minutes'",[phone]);
  return r.rowCount>0;
 }
 async function markAssisted(phone){
  await ensure();
  await pool.query("UPDATE wa_technical_waiting q SET sent_at=now(),error=NULL FROM wa_technical_mode m WHERE m.run_id=q.run_id AND m.active_until>now() AND q.phone=$1 AND (q.responded_at IS NULL OR q.responded_at<=now()-interval '10 minutes')",[phone]);
 }
 return {status,snapshot,set,capture,manual,drain,nextDue,manualAssist,paused,markAssisted};
}
