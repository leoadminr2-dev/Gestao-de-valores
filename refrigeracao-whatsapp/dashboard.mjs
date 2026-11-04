import crypto from "node:crypto";
import {readFile} from "node:fs/promises";

const SALT=process.env.LMR_ADMIN_SALT||"";
const PASSWORD_HASH=process.env.LMR_ADMIN_HASH||"";
const SESSION_SECRET=process.env.LMR_ADMIN_SESSION_SECRET||"";
const active=Boolean(SALT&&PASSWORD_HASH&&SESSION_SECRET);
const failures=new Map();
const COOKIE="lmr_admin";
const ttl=12*60*60*1000;
const states=new Set(["novo","orcamento","agendado","andamento","concluido","cancelado"]);

function answer(res,code,body,headers={}){
 res.writeHead(code,{"content-type":"application/json; charset=utf-8","cache-control":"private, no-store","x-content-type-options":"nosniff",...headers});
 res.end(JSON.stringify(body));
}
function cookieValue(req) {
 const match=String(req.headers.cookie||"").match(/(?:^|;\s*)lmr_admin=([^;]+)/);
 return match?match[1]:"";
}
function equal(a,b){
 const aa=Buffer.from(String(a),"utf8"),bb=Buffer.from(String(b),"utf8");
 return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);
}
function sign(raw){
 return crypto.createHmac("sha256",SESSION_SECRET).update(raw).digest("base64url");
}
function session(req){
 if(!active)return null;
 const v=cookieValue(req);const i=v.lastIndexOf(".");
 if(i<=0)return null;
 const raw=v.slice(0,i),sig=v.slice(i+1);
 if(!equal(sig,sign(raw)))return null;
 try {const payload=JSON.parse(Buffer.from(raw,"base64url").toString("utf8"));
  return payload.exp>Date.now()&&typeof payload.csrf==="string"?payload:null;
 }catch{return null;}
}
function authorizeOrigin(req){
 const origin=String(req.headers.origin||"");
 const host=String(req.headers.host||"");
 return !origin||origin==="https://"+host;
}
function security(res){
 res.setHeader("x-content-type-options","nosniff");
 res.setHeader("x-frame-options","DENY");
 res.setHeader("referrer-policy","no-referrer");
 res.setHeader("cache-control","private, no-store");
 res.setHeader("content-security-policy","default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
}
async function bodyJSON(req){
 const chunks=[];let count=0;
 for await(const c of req){count+=c.length;if(count>20000)throw new Error("LIMITE");chunks.push(c);}
 return JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}");
}
function setSession(res){
 const payload={exp:Date.now()+ttl,csrf:crypto.randomBytes(20).toString("base64url")};
 const raw=Buffer.from(JSON.stringify(payload)).toString("base64url");
 res.setHeader("set-cookie",COOKIE+"="+raw+"."+sign(raw)+"; HttpOnly; Secure; SameSite=Lax; Path=/painel; Max-Age=43200");
 return payload;
}
function cleanAmount(value){
 if(value===null||value===undefined||value==="")return null;
 const n=Number(value);
 if(!Number.isFinite(n)||n<0||n>999999.99)throw Error("VALOR_INVALIDO");
 return Math.round(n*100)/100;
}
export function dashboardConfigured(){return active;}
export function createDashboard(pool){
 return async function dashboard(req,res,url){
  if(url.pathname!=="/painel"&&!url.pathname.startsWith("/painel/"))return false;
  security(res);
  if(req.method==="GET" && ["/painel","/painel/","/painel/index.html"].includes(url.pathname)){
   const content=await readFile(new URL("./dashboard.html",import.meta.url));
   res.writeHead(200,{"content-type":"text/html; charset=utf-8"});res.end(content);return true;
  }
  const assetPaths={"/painel/dashboard.css":["dashboard.css","text/css; charset=utf-8"],"/painel/dashboard.js":["dashboard.js","text/javascript; charset=utf-8"]};
  if(req.method==="GET"&&assetPaths[url.pathname]){
   const [file,ct]=assetPaths[url.pathname];const data=await readFile(new URL("./"+file,import.meta.url));
   res.writeHead(200,{"content-type":ct});res.end(data);return true;
  }
  if(!url.pathname.startsWith("/painel/api/")){answer(res,404,{error:"not_found"});return true;}
  if(!active){answer(res,503,{error:"painel_nao_configurado"});return true;}
  if(!authorizeOrigin(req)){answer(res,403,{error:"origem_nao_permitida"});return true;}
  if(url.pathname==="/painel/api/login"&&req.method==="POST"){
   const client=String(req.socket.remoteAddress||"unknown");
   const now=Date.now();let attempt=failures.get(client);
   if(attempt&&now-attempt.since>15*60*1000){failures.delete(client);attempt=null;}
   if(attempt&&attempt.count>=8){answer(res,429,{error:"muitas_tentativas"});return true;}
   let input;try{input=await bodyJSON(req)}catch{answer(res,400,{error:"dados_invalidos"});return true;}
   const pwd=String(input.password||"");
   const calc=crypto.pbkdf2Sync(pwd,Buffer.from(SALT,"hex"),240000,32,"sha256").toString("hex");
   if(!equal(calc,PASSWORD_HASH)){
    failures.set(client,{since:attempt?.since||now,count:(attempt?.count||0)+1});
    answer(res,401,{error:"senha_incorreta"});return true;
   }
   failures.delete(client);
   const s=setSession(res);answer(res,200,{ok:true,csrf:s.csrf});return true;
  }
  const auth=session(req);
  if(!auth){answer(res,401,{error:"acesso_restrito"});return true;}
  if(url.pathname==="/painel/api/me"&&req.method==="GET"){
   answer(res,200,{ok:true,csrf:auth.csrf});return true;
  }
  if(url.pathname==="/painel/api/overview"&&req.method==="GET"){
   const [metrics,data]=await Promise.all([
    pool.query("SELECT operation_status AS status, count(*)::int AS total FROM wa_orders GROUP BY operation_status"),
    pool.query("SELECT protocol,phone,payload,created_at,updated_at,sync_status,operation_status,appointment_at,estimate_amount,admin_notes FROM wa_orders ORDER BY created_at DESC LIMIT 200")
   ]);
   answer(res,200,{metrics:metrics.rows,orders:data.rows,limited:data.rowCount===200});return true;
  }
  const match=url.pathname.match(/^\/painel\/api\/ordens\/(WA-[A-Z0-9-]{12,30})$/);
  if(match&&req.method==="PATCH"){
   if(!equal(req.headers["x-csrf-token"],auth.csrf)){answer(res,403,{error:"requisicao_nao_autorizada"});return true;}
   let input;try{input=await bodyJSON(req)}catch{answer(res,400,{error:"dados_invalidos"});return true;}
   if(!states.has(input.status)){answer(res,422,{error:"status_invalido"});return true;}
   const note=String(input.notes||"").trim();
   if(note.length>1500){answer(res,422,{error:"observacao_muito_longa"});return true;}
   let date=null;
   if(input.appointment){date=new Date(input.appointment);if(Number.isNaN(date.getTime())){answer(res,422,{error:"data_invalida"});return true;}}
   let amount;try{amount=cleanAmount(input.amount)}catch{answer(res,422,{error:"valor_invalido"});return true;}
   const result=await pool.query(
    "UPDATE wa_orders SET operation_status=$2,appointment_at=$3,estimate_amount=$4,admin_notes=$5,updated_at=now() WHERE protocol=$1 RETURNING protocol,operation_status,appointment_at,estimate_amount,admin_notes",
    [match[1],input.status,date,amount,note]
   );
   if(!result.rowCount){answer(res,404,{error:"ordem_nao_encontrada"});return true;}
   answer(res,200,{ok:true,order:result.rows[0]});return true;
  }
  if(url.pathname==="/painel/api/logout"&&req.method==="POST"){
   if(!equal(req.headers["x-csrf-token"],auth.csrf)){answer(res,403,{error:"requisicao_nao_autorizada"});return true;}
   res.setHeader("set-cookie",COOKIE+"=; HttpOnly; Secure; SameSite=Lax; Path=/painel; Max-Age=0");
   answer(res,200,{ok:true});return true;
  }
  answer(res,405,{error:"metodo_nao_permitido"});return true;
 };
}
