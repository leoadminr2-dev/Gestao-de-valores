import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";

const password="secure-local-test-password";
const salt=crypto.randomBytes(16).toString("hex");
process.env.LMR_ADMIN_SALT=salt;
process.env.LMR_ADMIN_HASH=crypto.pbkdf2Sync(password,Buffer.from(salt,"hex"),240000,32,"sha256").toString("hex");
process.env.LMR_ADMIN_SESSION_SECRET=crypto.randomBytes(32).toString("hex");
const {createDashboard}=await import("./dashboard.mjs");

test("painel serves login page, blocks anonymous access and accepts authorized session",async()=>{
 const pool={
  query:async(sql)=>{
   if(sql.includes("GROUP BY"))return {rows:[{status:"novo",total:1}],rowCount:1};
   if(sql.includes("ORDER BY created_at DESC"))return {rows:[{protocol:"WA-20261104-F39A0E01",phone:"5521999999999",payload:{cliente:"Cliente teste"},sync_status:"synced",operation_status:"novo",created_at:new Date().toISOString()}],rowCount:1};
   if(sql.includes("UPDATE wa_orders SET"))return {rows:[{protocol:"WA-20261104-F39A0E01",operation_status:"agendado"}],rowCount:1};
   throw Error("Unexpected SQL");
  }
 };
 const route=createDashboard(pool);
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,"http://localhost");
   if(!await route(req,res,url)){res.writeHead(404);res.end("No route");}
  }catch(e){res.writeHead(500);res.end(String(e));}
 });
 await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
 const origin="http://127.0.0.1:"+server.address().port;
 const call=(path,init)=>fetch(origin+path,init);
 try{
  const html=await call("/painel");
  assert.equal(html.status,200);
  assert.match(await html.text(),/Central de Operações/);
  const unauthorized=await call("/painel/api/overview");
  assert.equal(unauthorized.status,401);
  const wrong=await call("/painel/api/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({password:"bad-password"})});
  assert.equal(wrong.status,401);
  const login=await call("/painel/api/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({password})});
  assert.equal(login.status,200);
  const cookie=login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie?.startsWith("lmr_admin="));
  assert.match(login.headers.get("set-cookie")||"",/HttpOnly; Secure; SameSite=Lax/);
  const {csrf}=await login.json();
  const overview=await call("/painel/api/overview",{headers:{cookie}});
  assert.equal(overview.status,200);
  const data=await overview.json();
  assert.equal(data.orders.length,1);
  const badCsrf=await call("/painel/api/ordens/WA-20261104-F39A0E01",{method:"PATCH",headers:{"content-type":"application/json",cookie},body:JSON.stringify({status:"agendado"})});
  assert.equal(badCsrf.status,403);
  const patch=await call("/painel/api/ordens/WA-20261104-F39A0E01",{method:"PATCH",headers:{"content-type":"application/json","x-csrf-token":csrf,cookie},body:JSON.stringify({status:"agendado",appointment:null,amount:280,notes:"teste"})});
  assert.equal(patch.status,200);
  const res=await patch.json();
  assert.equal(res.order.operation_status,"agendado");
 }finally{await new Promise(resolve=>server.close(resolve));}
});
