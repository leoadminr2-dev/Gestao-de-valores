'use strict';
const {Pool}=require('pg');
const {randomBytes,createHash}=require('node:crypto');
const MAX_BYTES=300*1024;
const ALLOWED_TYPES=new Set(['image/jpeg','image/png','application/pdf']);
const ALLOWED_CATEGORIES=new Set(['Mensalidade','Juros de mensalidade','Rifa','Evento','Pagamento de empréstimo','Juros de empréstimo','Outros']);
const ID_RE=/^[a-f0-9-]{36}$/i;
const DATE_RE=/^2026-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH_RE=/^2026-(0[1-9]|1[01])$/;
const hash=key=>createHash('sha256').update(key).digest('hex');
let pool;
function database(){
  if(!process.env.PORTAL_DATABASE_URL)throw Object.assign(new Error('Recebimento de comprovantes ainda não configurado.'),{status:503});
  if(!pool)pool=new Pool({connectionString:process.env.PORTAL_DATABASE_URL,max:3,connectionTimeoutMillis:7000,idleTimeoutMillis:15000});
  return pool;
}
function fileSignature(bytes,type){
  if(type==='image/jpeg')return bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  if(type==='image/png')return bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(type==='application/pdf')return bytes.subarray(0,5).toString('ascii')==='%PDF-';
  return false;
}
function parseReceipt(payload){
 const name=String(payload.payerName||'').trim().replace(/\s+/g,' ');
 const cents=Number(payload.amountCents);
 const paid=String(payload.paidOn||'');
 if(name.length<5||name.length>120||name.split(' ').length<2)throw Object.assign(new Error('Informe nome e sobrenome completos do pagador.'),{status:400});
 if(!Number.isSafeInteger(cents)||cents<1||cents>20000000)throw Object.assign(new Error('Valor inválido.'),{status:400});
 const paidDate=new Date(paid+'T12:00:00Z');
 if(!DATE_RE.test(paid)||Number.isNaN(paidDate.getTime())||paidDate.toISOString().slice(0,10)!==paid||paid>new Date().toISOString().slice(0,10))throw Object.assign(new Error('Informe a data real do pagamento em 2026.'),{status:400});
 const items=payload.allocations;
 if(!Array.isArray(items)||!items.length||items.length>8)throw Object.assign(new Error('Informe de 1 a 8 finalidades para o pagamento.'),{status:400});
 let sum=0;
 const alloc=items.map(x=>{
   const category=String(x.category||'');
   const amount=Number(x.cents);
   const competence=String(x.competence||'');
   const eventName=String(x.eventName||'').trim().slice(0,90);
   if(!ALLOWED_CATEGORIES.has(category)||!Number.isSafeInteger(amount)||amount<1)throw Object.assign(new Error('Categoria ou valor incorreto.'),{status:400});
   if(['Mensalidade','Juros de mensalidade'].includes(category)&&!MONTH_RE.test(competence))throw Object.assign(new Error('Informe a competência mensal para mensalidades e juros.'),{status:400});
   if(category==='Evento'&&!eventName)throw Object.assign(new Error('Informe o nome do evento.'),{status:400});
   sum+=amount;
   return {category,cents:amount,...(MONTH_RE.test(competence)?{competence}:{}),...(category==='Evento'?{eventName}:{})};
 });
 if(sum!==cents)throw Object.assign(new Error('A soma das finalidades deve ser exatamente igual ao depósito.'),{status:400});
 const type=String(payload.fileType||'');
 if(!ALLOWED_TYPES.has(type))throw Object.assign(new Error('Formato inválido. Use JPG, PNG ou PDF.'),{status:400});
 const base64=String(payload.fileBase64||'');
 if(!base64||base64.length>Math.ceil(MAX_BYTES*4/3)+10||!/^[a-zA-Z0-9+/]+={0,2}$/.test(base64))throw Object.assign(new Error('Arquivo inválido ou maior que 300 KB.'),{status:413});
 const bytes=Buffer.from(base64,'base64');
 if(bytes.length<50||bytes.length>MAX_BYTES||!fileSignature(bytes,type))throw Object.assign(new Error('Arquivo inválido. Anexe imagem ou PDF verdadeiro de até 300 KB.'),{status:400});
 const filename=String(payload.fileName||'comprovante').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,80);
 return {name,cents,paid,alloc,bytes,type,filename,notes:String(payload.notes||'').trim().slice(0,800),fileHash:hash(bytes)};
}
const clientRate=new Map();
function rateAllowed(req){
 const now=Date.now(),ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0].trim().slice(0,100);
 const r=clientRate.get(ip)||{count:0,start:now};
 if(now-r.start>60000){r.count=0;r.start=now;}r.count++;clientRate.set(ip,r);
 if(clientRate.size>5000)clientRate.clear();
 return r.count<=35;
}
function createPortalApi({getAccess,dataApi,bodyJson,respond,headers,appOrigin}){
 async function admin(req,res){
   const access=await getAccess(req);
   if(access.status!==200){respond(res,access.status,{error:'Apenas responsáveis autenticados podem acessar este painel.'});return null;}
   return access;
 }
 async function invite(req,res,access){
   const b=await bodyJson(req),id=String(b.participantId||'');
   if(!/^person_[a-z0-9]+$/i.test(id)){respond(res,400,{error:'Associado inválido.'});return;}
   const a=await dataApi('app_state?select=data&slot=eq.primary',access);
   if(!a.up.ok||!Array.isArray(a.data)||a.data.length!==1){respond(res,502,{error:'Não foi possível conferir o cadastro.'});return;}
   const person=(a.data[0].data.participants||[]).find(p=>p.id===id);
   if(!person){respond(res,404,{error:'Associado não cadastrado.'});return;}
   const key=randomBytes(32).toString('base64url');
   const db=database();
   const client=await db.connect();
   try{
    await client.query('BEGIN');
    await client.query('UPDATE public.portal_invites SET is_active=false,revoked_at=now() WHERE participant_id=$1 AND is_active=true',[id]);
    await client.query('INSERT INTO public.portal_invites (participant_id,participant_name,token_hash,expires_at,created_by) VALUES($1,$2,$3,now()+interval \'180 days\',$4)',[id,String(person.name).slice(0,120),hash(key),access.email]);
    await client.query('COMMIT');
    respond(res,200,{name:person.name,link:appOrigin+'/associado#chave='+key,daysValid:180});
   }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
 }
 async function byInvite(req,res){
  const raw=String(req.headers.authorization||'');
  const token=raw.match(/^Bearer ([A-Za-z0-9_-]{35,120})$/)?.[1];
  if(!token){respond(res,401,{error:'Abra o link pessoal recebido do responsável.'});return null;}
  const q=await database().query('SELECT id,participant_id,participant_name,expires_at FROM public.portal_invites WHERE token_hash=$1 AND is_active=true AND revoked_at IS NULL AND expires_at>now() LIMIT 1',[hash(token)]);
  if(q.rowCount!==1){respond(res,401,{error:'Link expirado ou revogado. Solicite outro aos responsáveis.'});return null;}
  return q.rows[0];
 }
 async function handle(req,res,url){
   if(!rateAllowed(req)){respond(res,429,{error:'Muitas tentativas. Tente novamente em instantes.'});return;}
   if(req.method==='GET'&&url.pathname==='/api/portal/ready'){
     try{await database().query('SELECT 1 AS ok');respond(res,200,{ready:true});}
     catch{respond(res,503,{ready:false,error:'Recebimento de comprovantes indisponível.'});}
     return;
   }

   if(url.pathname.startsWith('/api/portal/admin/')){
     const access=await admin(req,res);if(!access)return;
     if(req.method==='GET'&&url.pathname==='/api/portal/admin/participants'){
       const a=await dataApi('app_state?select=data&slot=eq.primary',access);
       if(!a.up.ok||!Array.isArray(a.data)||a.data.length!==1){respond(res,502,{error:'Cadastro dos associados indisponível.'});return;}
       const people=(a.data[0].data.participants||[]).map(p=>({id:p.id,name:p.name})).filter(p=>p.id&&p.name);
       respond(res,200,{participants:people});return;
     }
     if(req.method==='POST'&&url.pathname==='/api/portal/admin/invite')return invite(req,res,access);
     if(req.method==='GET'&&url.pathname==='/api/portal/admin/list'){
      const [receipts,links]=await Promise.all([
       database().query("SELECT r.id,r.participant_id,i.participant_name,r.payer_full_name,r.amount_cents,r.paid_on,r.allocations,r.notes,r.status,r.review_notes,r.submitted_at,r.receipt_filename,r.reviewed_at FROM public.portal_receipts r JOIN public.portal_invites i ON i.id=r.invite_id ORDER BY r.submitted_at DESC LIMIT 400"),
       database().query("SELECT id,participant_id,participant_name,is_active,expires_at,created_at,revoked_at FROM public.portal_invites ORDER BY created_at DESC LIMIT 200")]);
      respond(res,200,{receipts:receipts.rows,links:links.rows});return;
     }
     if(req.method==='POST'&&url.pathname==='/api/portal/admin/revoke'){
      const b=await bodyJson(req);if(!ID_RE.test(String(b.id||''))){respond(res,400,{error:'Identificador inválido.'});return;}
      const q=await database().query('UPDATE public.portal_invites SET is_active=false,revoked_at=now() WHERE id=$1 RETURNING id',[b.id]);
      respond(res,q.rowCount?200:404,{success:q.rowCount>0});return;
     }
     if(req.method==='POST'&&url.pathname==='/api/portal/admin/review'){
      const b=await bodyJson(req),id=String(b.id||''),status=String(b.status||''),note=String(b.note||'').trim().slice(0,500);
      if(!ID_RE.test(id)||!['reviewed','rejected'].includes(status)||note.length<8){respond(res,400,{error:'Informe a decisão e observação com no mínimo 8 caracteres.'});return;}
      const q=await database().query("UPDATE public.portal_receipts SET status=$2,review_notes=$3,reviewed_at=now(),reviewed_by=$4 WHERE id=$1 AND status='pending' RETURNING id",[id,status,note,access.email]);
      respond(res,q.rowCount?200:409,{success:q.rowCount>0,error:q.rowCount?undefined:'Já revisado ou inexistente. Recarregue.'});return;
     }
     if(req.method==='GET'&&url.pathname==='/api/portal/admin/file'){
      const id=String(url.searchParams.get('id')||'');
      if(!ID_RE.test(id)){respond(res,400,{error:'Identificador inválido.'});return;}
      const q=await database().query('SELECT receipt_media_type,receipt_bytes,id FROM public.portal_receipts WHERE id=$1',[id]);
      if(!q.rowCount){respond(res,404,{error:'Comprovante não encontrado.'});return;}
      const row=q.rows[0];headers(res,row.receipt_media_type);
      res.setHeader('Content-Disposition','attachment; filename="comprovante-'+row.id+(row.receipt_media_type==='application/pdf'?'.pdf':row.receipt_media_type==='image/png'?'.png':'.jpg')+'"');
      res.writeHead(200);res.end(row.receipt_bytes);return;
     }
     respond(res,404,{error:'Rota administrativa não encontrada.'});return;
   }
   const invitation=await byInvite(req,res);if(!invitation)return;
   if(req.method==='GET'&&url.pathname==='/api/portal/me'){
     const rows=await database().query('SELECT id,amount_cents,paid_on,allocations,status,review_notes,submitted_at FROM public.portal_receipts WHERE participant_id=$1 ORDER BY submitted_at DESC LIMIT 70',[invitation.participant_id]);
     respond(res,200,{name:invitation.participant_name,expiresAt:invitation.expires_at,submissions:rows.rows});return;
   }
   if(req.method==='POST'&&url.pathname==='/api/portal/submit'){
     const b=await bodyJson(req),r=parseReceipt(b);
     const last=await database().query("SELECT count(*)::integer AS total FROM public.portal_receipts WHERE invite_id=$1 AND submitted_at>now()-interval '30 days'",[invitation.id]);
     if(Number(last.rows[0]?.total)>30){respond(res,429,{error:'Limite de 30 envios em 30 dias. Contate os responsáveis.'});return;}
     const storage=await database().query("SELECT pg_total_relation_size('public.portal_receipts')::bigint AS bytes");
     if(Number(storage.rows[0]?.bytes)>180*1024*1024){respond(res,507,{error:'Armazenamento gratuito de comprovantes atingiu o limite seguro. Contate os responsáveis.'});return;}
     const duplicate=await database().query('SELECT id FROM public.portal_receipts WHERE participant_id=$1 AND receipt_sha256=$2 AND amount_cents=$3 LIMIT 1',[invitation.participant_id,r.fileHash,r.cents]);
     if(duplicate.rowCount){respond(res,409,{error:'Este comprovante já foi enviado anteriormente.'});return;}
     const q=await database().query('INSERT INTO public.portal_receipts (invite_id,participant_id,payer_full_name,amount_cents,paid_on,allocations,notes,receipt_media_type,receipt_filename,receipt_bytes,receipt_sha256) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11) RETURNING id,submitted_at,status',[invitation.id,invitation.participant_id,r.name,r.cents,r.paid,JSON.stringify(r.alloc),r.notes,r.type,r.filename,r.bytes,r.fileHash]);
     respond(res,201,{success:true,id:q.rows[0].id,status:q.rows[0].status,message:'Comprovante recebido. A administração fará a conferência. Ainda não altera o livro-caixa.'});return;
   }
   respond(res,404,{error:'Página não encontrada.'});
 }
 return {handle};
}
module.exports={createPortalApi,parseReceipt,fileSignature,MAX_BYTES};
