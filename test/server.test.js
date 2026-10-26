'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
let upstream,child,app,version='2026-10-25T18:00:00.000Z';
const listen = s => new Promise(ok=>s.listen(0,'127.0.0.1',()=>ok(s.address().port)));
const wait = ms => new Promise(ok=>setTimeout(ok,ms));
async function call(path,method='GET',body,session=''){
  const r=await fetch(app+path,{method,headers:{Origin:app,...(body?{'Content-Type':'application/json'}:{}),...(session?{Cookie:'sid='+session}:{})},...(body?{body:JSON.stringify(body)}:{})});
  let data;try{data=await r.json();}catch{data=null;}
  return {status:r.status,data};
}
before(async()=>{
  upstream=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    res.setHeader('Content-Type','application/json');
    if(url.pathname==='/auth/get-session'){
      if(!req.headers.cookie){res.end('{}');return;}
      const email=req.headers.cookie.includes('outsider')?'outside@example.com':'Leonardo_r2@hotmail.com';
      res.end(JSON.stringify({user:{email,emailVerified:!req.headers.cookie.includes('unverified')}}));return;
    }
    if(url.pathname==='/auth/token'){res.end('{"token":"aa.bb.cc"}');return;}
    if(url.pathname.includes('email-otp')){res.end('{"success":true}');return;}
    if(url.pathname==='/auth/sign-in/email'){
      if(req.headers.origin!=='https://gestao-de-valores-particular.onrender.com'){
        res.statusCode=403;res.end('{"message":"Missing or null Origin"}');return;
      }
      res.end('{"success":true}');return;
    }
    if(url.pathname==='/rest/app_state'){
      if(req.method==='PATCH'){res.end('[]');return;}
      const row=url.searchParams.get('select')==='updated_at'?{updated_at:version}:{updated_at:version,data:{participants:[{name:'Teste'}],transactions:[],loans:[],dues:[],review2026:[]}};
      res.end(JSON.stringify([row]));return;
    }
    res.end('{}');
  });
  const mockPort=await listen(upstream);
  const probe=http.createServer();const appPort=await listen(probe);await new Promise(ok=>probe.close(ok));
  app='http://127.0.0.1:'+appPort;
  child=spawn(process.execPath,['server.js'],{env:{...process.env,NODE_ENV:'test',PORT:String(appPort),NEON_AUTH_URL:'http://127.0.0.1:'+mockPort+'/auth',NEON_DATA_API_URL:'http://127.0.0.1:'+mockPort+'/rest',ALLOWED_EMAILS:'Leonardo_r2@hotmail.com,tatideoabreu@gmail.com'},stdio:'ignore'});
  let ready=false;
  for(let i=0;i<70;i++){
    if(child.exitCode!==null)throw Error('Servidor encerrou inesperadamente');
    try{if((await fetch(app+'/health')).ok){ready=true;break;}}catch{}
    await wait(80);
  }
  assert.ok(ready,'servidor iniciou');
});
after(async()=>{if(child)child.kill();if(upstream)await new Promise(ok=>upstream.close(ok));});
test('saude do servidor',async()=>assert.equal((await call('/health')).status,200));
test('bloquear acesso sem sessão',async()=>assert.equal((await call('/api/state')).status,401));
test('bloquear e-mail não autorizado',async()=>assert.equal((await call('/api/state','GET',null,'outsider')).status,401));
test('bloquear e-mail ainda não verificado',async()=>assert.equal((await call('/api/state','GET',null,'unverified')).status,403));
test('permitir leitura somente a pessoa autenticada e verificada',async()=>{
 const r=await call('/api/state','GET',null,'good');
 assert.equal(r.status,200);assert.equal(r.data.data.participants[0].name,'Teste');
});
test('sincronização consulta só versão antes do histórico',async()=>{
 const r=await call('/api/version','GET',null,'good');
 assert.equal(r.status,200);assert.equal(r.data.version,version);assert.equal(r.data.data,undefined);
});
test('recusar login não autorizado',async()=>{
 const r=await call('/api/auth/login','POST',{email:'outside@example.com',password:'senha-teste-123'});
 assert.equal(r.status,403);
});
test('enviar Origin confiável ao Neon durante login autorizado',async()=>{
  const r=await call('/api/auth/login','POST',{email:'Leonardo_r2@hotmail.com',password:'senha-de-teste-123'});
  assert.equal(r.status,200);
  assert.equal(r.data.success,true);
});
test('recusar gravação com revisão desatualizada',async()=>{
 const r=await call('/api/state','PUT',{version:'2026-01-01T00:00:00.000Z',data:{participants:[]}},'good');
 assert.equal(r.status,409);
});
test('permitir envio de OTP apenas aos autorizados',async()=>{
 assert.equal((await call('/api/auth/verify','POST',{email:'tatideoabreu@gmail.com'})).status,200);
 assert.equal((await call('/api/auth/verify','POST',{email:'outside@example.com'})).status,403);
});
test('service worker não armazena respostas privadas',async()=>{
 const r=await fetch(app+'/sw.js');
 assert.equal(r.status,200);const source=await r.text();
 assert.ok(source.includes('install'));assert.ok(!source.includes('/api/state'));
});
