'use strict';
/** Gestão de Valores — backend de autenticação e sincronização privada.
 * Não contém dados da caixinha nem credenciais. O Neon aplica RLS adicional.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT || 3000);
const AUTH_URL = String(process.env.NEON_AUTH_URL || '').replace(/\/$/, '');
const REST_URL = String(process.env.NEON_DATA_API_URL || '').replace(/\/$/, '');
const APP_ORIGIN = 'https://gestao-de-valores-particular.onrender.com'; // Origem publicada e autorizada no Neon Auth.
const ALLOWED_EMAILS = new Set(String(process.env.ALLOWED_EMAILS || '')
  .split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
const BASE = __dirname;
const LIMIT = 2 * 1024 * 1024;
if (!AUTH_URL || !REST_URL || ALLOWED_EMAILS.size !== 2 || !(process.env.NODE_ENV==='test'?/^https?:\/\//:/^https:\/\//).test(AUTH_URL) || !(process.env.NODE_ENV==='test'?/^https?:\/\//:/^https:\/\//).test(REST_URL)) {
  throw new Error('Configuração segura ausente: NEON_AUTH_URL, NEON_DATA_API_URL, ALLOWED_EMAILS (exatamente 2) são obrigatórios.');
}

function headers(res, contentType = 'application/json; charset=utf-8') {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
}
function respond(res, status, obj) { headers(res); res.writeHead(status); res.end(JSON.stringify(obj)); }
function validEmail(email) { return typeof email === 'string' && ALLOWED_EMAILS.has(email.trim().toLowerCase()); }
function bodyJson(req) {
  return new Promise((resolve,reject)=>{
    let bytes=0, text='';
    req.on('data', chunk=>{bytes+=chunk.length;if(bytes>LIMIT){reject(Object.assign(new Error('Arquivo muito grande'),{status:413}));req.destroy();return;} text+=chunk.toString('utf8');});
    req.on('end',()=>{try{resolve(JSON.parse(text||'{}'));}catch{reject(Object.assign(new Error('JSON inválido'),{status:400}));}});
    req.on('error',reject);
  });
}
function sameOrigin(req) {
  const origin=req.headers.origin;
  const host=req.headers['x-forwarded-host']||req.headers.host;
  if (!origin || !host) return false;
  try {return new URL(origin).host.toLowerCase()===host.toLowerCase() && (new URL(origin).protocol==='https:' || process.env.NODE_ENV==='test' && new URL(origin).protocol==='http:');} catch {return false;}
}
function sessionCookieHeader(req) { return req.headers.cookie || ''; }
async function authFetch(endpoint, {method='GET', body, cookie='', acceptJson=true}={}){
  const res = await fetch(`${AUTH_URL}/${endpoint}`,{method,headers:{
    ...(body?{'Content-Type':'application/json'}:{}), ...(cookie?{Cookie:cookie}:{}),
    'Accept':'application/json',
    'Origin':APP_ORIGIN,
    'Referer':APP_ORIGIN+'/'
  },body:body?JSON.stringify(body):undefined,redirect:'manual',signal:AbortSignal.timeout(16000)});
  let data={}; const txt=await res.text();try{data=txt?JSON.parse(txt):{};}catch{data={message:'Serviço de autenticação indisponível.'};}
  return {res,data};
}
function passCookies(res, source){
  const cookies = typeof source.headers.getSetCookie==='function'?source.headers.getSetCookie():[source.headers.get('set-cookie')].filter(Boolean);
  const safe=cookies.map(s=>s.split(';').filter((chunk,i)=>i===0 || !/^\s*(domain|path|samesite|secure|httponly)=?/i.test(chunk)).join(';')+'; Path=/; Secure; HttpOnly; SameSite=Lax');
  if (safe.length) res.setHeader('Set-Cookie', safe);
}
async function login(req,res,route){
  const b=await bodyJson(req);const email=String(b.email||'').trim();
  if (!validEmail(email)){respond(res,403,{error:'Esta conta não tem autorização para utilizar o Gestão de Valores.'});return;}
  if(typeof b.password!=='string'||b.password.length<8||b.password.length>128){respond(res,400,{error:'Utilize uma senha de 8 a 128 caracteres.'});return;}
  const isSignup=route==='cadastro';
  const body={email,password:b.password,...(isSignup?{name:email.split('@')[0]}:{rememberMe:true})};
  const {res:up,data}=await authFetch(isSignup?'sign-up/email':'sign-in/email',{method:'POST',body,cookie:sessionCookieHeader(req)});
  if(!up.ok){respond(res,up.status===401?401:400,{error:String(data.message || 'Não foi possível autenticar. Confira os dados.').slice(0,200)});return;}
  passCookies(res,up);
  if(isSignup){
    const sent=await authFetch('email-otp/send-verification-otp',{method:'POST',body:{email,type:'email-verification'}});
    respond(res,200,{success:true,created:true,needsVerification:true,otpSent:sent.res.ok});
    return;
  }
  respond(res,200,{success:true,created:false});
}
async function getAccess(req){
  const {res:up,data:session}=await authFetch('get-session',{cookie:sessionCookieHeader(req)});
  if(!up.ok || !session?.user || !validEmail(session.user.email)) return {status:401,error:'Acesso não autorizado.'};
  if(session.user.emailVerified!==true) return {status:403,error:'Confirme seu endereço de e-mail antes de acessar os valores.',needsVerification:true,email:session.user.email};
  const {res:tr,data:tokenBody}=await authFetch('token',{cookie:sessionCookieHeader(req)});
  const token = tokenBody?.token || tokenBody?.data?.token;
  if(!tr.ok || typeof token!=='string'||token.split('.').length!==3) return {status:401,error:'Sessão sem token válido. Entre novamente.'};
  return {status:200,email:session.user.email,token};
}
async function dataApi(path, access, opts={}) {
  const up=await fetch(`${REST_URL}/${path}`,{method:opts.method||'GET',headers:{
    Authorization:`Bearer ${access.token}`,Accept:'application/json',
    ...(opts.body?{'Content-Type':'application/json'}:{}),
    ...(opts.prefer?{Prefer:opts.prefer}:{})
  },body:opts.body?JSON.stringify(opts.body):undefined,signal:AbortSignal.timeout(16000)});
  let data;try{data=await up.json();}catch{data=null;}
  return {up,data};
}
async function dataHandler(req,res,url){
  const access=await getAccess(req);
  if(access.status!==200){respond(res,access.status,{error:access.error,needsVerification:access.needsVerification});return;}
  if(req.method==='GET' && url.pathname==='/api/session') {respond(res,200,{email:access.email});return;}
  if(req.method==='GET' && url.pathname==='/api/version'){
    const r=await dataApi('app_state?select=updated_at&slot=eq.primary',access);
    if(!r.up.ok){respond(res,502,{error:'Falha ao consultar a versão dos dados.'});return;}
    if(!Array.isArray(r.data)||r.data.length!==1){respond(res,403,{error:'Sua sessão não tem autorização para os dados.'});return;}
    respond(res,200,{version:r.data[0].updated_at});return;
  }
  if(req.method==='GET' && url.pathname==='/api/state'){
    const r=await dataApi('app_state?select=data,updated_at&slot=eq.primary',access);
    if(!r.up.ok){respond(res,502,{error:'Falha ao carregar os dados protegidos.'});return;}
    if(!Array.isArray(r.data)||r.data.length!==1){respond(res,403,{error:'Sua sessão não tem autorização para os dados.'});return;}
    respond(res,200,{data:r.data[0].data,version:r.data[0].updated_at});return;
  }
  if(req.method==='PUT' && url.pathname==='/api/state'){
    const b=await bodyJson(req);
    if(!b.data || typeof b.data !== 'object' || Array.isArray(b.data) || typeof b.version !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(b.version)) {respond(res,400,{error:'Formato de sincronização inválido.'});return;}
    const newVersion=new Date().toISOString();
    const r=await dataApi(`app_state?slot=eq.primary&updated_at=eq.${encodeURIComponent(b.version)}`,access,{
      method:'PATCH',prefer:'return=representation',body:{data:b.data,updated_by:access.email,updated_at:newVersion}
    });
    if(!r.up.ok){respond(res,502,{error:'O banco recusou a gravação. Nada foi confirmado.'});return;}
    if(!Array.isArray(r.data)||r.data.length!==1){respond(res,409,{error:'Outro responsável alterou os dados. Recarregue antes de modificar novamente.'});return;}
    respond(res,200,{version:r.data[0].updated_at});return;
  }
  respond(res,405,{error:'Método não permitido.'});
}
async function authHandler(req,res,url){
  if(req.method==='POST'&&url.pathname==='/api/auth/login')return login(req,res,'login');
  if(req.method==='POST'&&url.pathname==='/api/auth/signup')return login(req,res,'cadastro');
  if(req.method==='POST'&&url.pathname==='/api/auth/verify'){
    const b=await bodyJson(req);if(!validEmail(b.email)){respond(res,403,{error:'Conta não autorizada.'});return;}
    const {res:up,data}=await authFetch('email-otp/send-verification-otp',{method:'POST',body:{email:b.email,type:'email-verification'},cookie:sessionCookieHeader(req)});
    const success=up.ok && data?.success!==false;
    respond(res,success?200:400,{success,...(!success?{error:data?.message||'Não foi possível enviar o código.'}:{})});return;
  }
  if(req.method==='POST'&&url.pathname==='/api/auth/confirm-otp'){
    const b=await bodyJson(req);if(!validEmail(b.email)){respond(res,403,{error:'Conta não autorizada.'});return;}
    const otp=String(b.otp||'').trim();
    if(!/^\d{4,8}$/.test(otp)){respond(res,400,{error:'Informe o código numérico recebido por e-mail.'});return;}
    const {res:up,data}=await authFetch('email-otp/verify-email',{method:'POST',body:{email:b.email,otp},cookie:sessionCookieHeader(req)});
    const success=up.ok && data?.success!==false;
    if(success)passCookies(res,up);
    respond(res,success?200:400,{success,...(!success?{error:data?.message||'Código inválido ou expirado.'}:{})});return;
  }
  if(req.method==='POST'&&url.pathname==='/api/auth/forgot'){
    const b=await bodyJson(req);if(!validEmail(b.email)){respond(res,403,{error:'Conta não autorizada.'});return;}
    const {res:up,data}=await authFetch('forget-password',{method:'POST',body:{email:b.email}});
    respond(res,up.ok?200:400,{success:up.ok,...(!up.ok?{error:data?.message||'A solicitação falhou.'}:{})});return;
  }
  if(req.method==='POST'&&url.pathname==='/api/auth/logout'){
    const {res:up}=await authFetch('sign-out',{method:'POST',cookie:sessionCookieHeader(req),body:{}});
    passCookies(res,up);
    respond(res,200,{success:true});return;
  }
  respond(res,404,{error:'Não encontrado.'});
}
function staticFile(res,urlPath){
  const paths={'/':'index.html','/index.html':'index.html','/secure-client.js':'secure-client.js','/app-ui.js':'app-ui.js','/participant-panel.js':'participant-panel.js','/caixinha-rules.js':'caixinha-rules.js',
    '/manifest.webmanifest':'manifest.webmanifest','/sw.js':'sw.js', '/icon.svg':'icon.svg'};
  if(!paths[urlPath]){respond(res,404,{error:'Não encontrado.'});return;}
  const file=path.join(BASE,paths[urlPath]);
  fs.readFile(file,(err,buf)=>{
    if(err){respond(res,404,{error:'Página indisponível.'});return;}
    const type=urlPath.endsWith('.js')?'application/javascript; charset=utf-8':urlPath.endsWith('.svg')?'image/svg+xml':urlPath.endsWith('.webmanifest')?'application/manifest+json':'text/html; charset=utf-8';
    headers(res,type);
    if(urlPath==='/sw.js')res.setHeader('Service-Worker-Allowed','/');
    if(urlPath==='/')res.setHeader('Cache-Control','no-store');
    res.writeHead(200);res.end(buf);
  });
}
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
    if(url.pathname==='/health'){respond(res,200,{status:'ok',service:'gestao-de-valores'});return;}
    if(url.pathname.startsWith('/api/')){
      if(req.method!=='GET'&&!sameOrigin(req)){respond(res,403,{error:'Origem não autorizada.'});return;}
      if(url.pathname.startsWith('/api/auth/'))await authHandler(req,res,url);
      else if(url.pathname==='/api/state'||url.pathname==='/api/session'||url.pathname==='/api/version')await dataHandler(req,res,url);
      else respond(res,404,{error:'Não encontrado.'});
      return;
    }
    if(req.method!=='GET'&&req.method!=='HEAD'){respond(res,405,{error:'Método não permitido.'});return;}
    staticFile(res,url.pathname);
  }catch(e){console.error('Erro de solicitação:',e.name ||'Error');if(!res.headersSent)respond(res,e.status||503,{error:'Serviço temporariamente indisponível. Tente novamente.'});}
});
server.listen(PORT,'0.0.0.0',()=>console.log(`Gestão de Valores: HTTP pronto na porta ${PORT}`));
module.exports={server};
