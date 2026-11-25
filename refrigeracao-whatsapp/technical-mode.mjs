import crypto from "node:crypto";
export const ABSENCE_MESSAGE="Olá! Tudo bem? Aqui é o atendimento automático da Leonardo Moreira Refrigeração. No momento, estou realizando um atendimento técnico e não consigo responder imediatamente. Pode deixar sua mensagem normalmente. Assim que possível, retornarei pessoalmente. Obrigado pela compreensão!";
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
  const r=await pool.query("INSERT INTO wa_technical_waiting(run_id,phone) SELECT run_id,$1 FROM wa_technical_mode WHERE id=1 AND active_until>now() ON CONFLICT(run_id,phone) DO UPDATE SET last_at=now() RETURNING phone",[phone]);
  return r.rowCount>0;
 }
 async function manual(phone){
  await ensure();
  await pool.query("UPDATE wa_technical_waiting SET responded_at=now() WHERE phone=$1 AND run_id=(SELECT run_id FROM wa_technical_mode WHERE id=1) AND responded_at IS NULL",[phone]);
 }
 async function drain(send,isProtected){
  await ensure();
  for(let i=0;i<20;i++){
   // Claim before sending: uncertain network failures never cause repeated messages.
   const r=await pool.query("UPDATE wa_technical_waiting w SET attempted_at=now() WHERE (w.run_id,w.phone)=(SELECT q.run_id,q.phone FROM wa_technical_waiting q JOIN wa_technical_mode m ON m.run_id=q.run_id AND m.active_until>now() WHERE q.attempted_at IS NULL AND q.responded_at IS NULL ORDER BY q.first_at LIMIT 1 FOR UPDATE OF q SKIP LOCKED) RETURNING w.run_id,w.phone");
   if(!r.rowCount)break;
   const {run_id,phone}=r.rows[0];
   try{
    if(isProtected(phone))throw Error("PRIVATE_CONTACT");
    const current=await status();
    if(!current.active||current.run_id!==run_id)throw Error("MODE_ENDED");
    await send(phone,ABSENCE_MESSAGE);
    await pool.query("UPDATE wa_technical_waiting SET sent_at=now() WHERE run_id=$1 AND phone=$2",[run_id,phone]);
   }catch(e){await pool.query("UPDATE wa_technical_waiting SET error=$3 WHERE run_id=$1 AND phone=$2",[run_id,phone,String(e?.message||"SEND_FAILED").slice(0,100)]);}
  }
 }
 return {status,snapshot,set,capture,manual,drain};
}
