import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";

process.env.LMR_ADMIN_SESSION_SECRET=crypto.randomBytes(32).toString("hex");
const {createDashboard}=await import("./dashboard.mjs");
test("admin returns customer proposal only with session and sends after CSRF approval",async()=>{
 const password="integration-test-password";
 const salt=crypto.randomBytes(16).toString("hex");
 const hash=crypto.pbkdf2Sync(password,Buffer.from(salt,"hex"),240000,32,"sha256").toString("hex");
 const order={protocol:"WA-20261104-BADCAFE1",phone:"5521998765432",
  payload:{cliente:"Teste Integrado",servico:"Higienização",equipamento:"Split 9000BTU"},
  operation_status:"orcamento",appointment_at:null,estimate_amount:280,
  updated_at:"2026-11-04T09:00:00.000Z"};
 let sent=0,record=null;
 const pool={async query(sql,args=[]){
  if(sql.includes("SELECT salt,password_hash,auth_version"))return {rows:[{salt,password_hash:hash,auth_version:"v1"}],rowCount:1};
  if(sql.includes("SELECT auth_version FROM ops_admin_credentials"))return {rows:[{auth_version:"v1"}],rowCount:1};
  if(sql.includes("FROM wa_orders WHERE protocol=$1"))return {rows:[order],rowCount:1};
  if(sql.includes("SELECT max(created_at) AS last_inbound"))return {rows:[{last_inbound:new Date()}],rowCount:1};
  if(sql.includes("INSERT INTO wa_customer_replies")){record={id:1,protocol:args[1],status:"sending"};return {rows:[{id:1}],rowCount:1};}
  if(sql.includes("UPDATE wa_customer_replies SET status='accepted'")){record.status="accepted";return {rowCount:1};}
  if(sql.includes("INSERT INTO wa_sessions")||sql.includes("UPDATE wa_outbound"))return {rowCount:1,rows:[]};
  if(sql.includes("SELECT kind,status,created_at,provider_message_id"))return {rowCount:record?1:0,rows:record?[{kind:"orcamento",status:record.status,created_at:new Date()}]:[]};
  throw Error("Unexpected SQL "+sql);
 }};
 const handler=createDashboard(pool,{ready:true,send:async(_phone,body)=>{sent++;assert.match(body,/280,00/);return "mock-provider-id";}});
 const server=http.createServer(async(req,res)=>{
  try{const url=new URL(req.url,"http://localhost");if(!await handler(req,res,url)){res.writeHead(404);res.end();}}
  catch(e){res.writeHead(500);res.end(String(e));}
 });
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const base="http://127.0.0.1:"+server.address().port;
 const call=(path,init={})=>fetch(base+path,init);
 const post=(path,data,csrf,cookie)=>call(path,{method:"POST",headers:{"content-type":"application/json",...csrf?{"x-csrf-token":csrf}:{},...cookie?{cookie}:{}},body:JSON.stringify(data)});
 try{
  const anonymous=await post("/painel/api/customer/preview",{protocol:order.protocol,kind:"orcamento"});
  assert.equal(anonymous.status,401);
  const login=await post("/painel/api/login",{password});assert.equal(login.status,200);
  const cookie=login.headers.get("set-cookie").split(";")[0];const loginData=await login.json();
  const forbidden=await post("/painel/api/customer/preview",{protocol:order.protocol,kind:"orcamento"},null,cookie);assert.equal(forbidden.status,403);
  const p=await post("/painel/api/customer/preview",{protocol:order.protocol,kind:"orcamento"},loginData.csrf,cookie);
  assert.equal(p.status,200);const proposal=await p.json();
  assert.equal(proposal.eligible,true);assert.match(proposal.message,/Leonardo Moreira Refrigeração/);
  assert.equal(sent,0);
  const approved=await post("/painel/api/customer/send",{
   protocol:order.protocol,kind:"orcamento",requestKey:"browser-action-confirmed-01",
   expectedUpdatedAt:proposal.updatedAt
  },loginData.csrf,cookie);
  assert.equal(approved.status,200);assert.equal((await approved.json()).status,"accepted");
  assert.equal(sent,1);
  const history=await call("/painel/api/customer/history?protocol="+order.protocol,{headers:{cookie}});
  assert.equal(history.status,200);
  assert.equal((await history.json()).entries[0].status,"accepted");
 }finally{await new Promise(resolve=>server.close(resolve));}
});
