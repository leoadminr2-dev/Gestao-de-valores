'use strict';
// Central do Associado 2027: isolada do aplicativo e dos registros de 2026.
const { Pool } = require('pg');
const { randomBytes, createHash, createHmac, scryptSync, timingSafeEqual } = require('node:crypto');
const MAX_BYTES = 1024 * 1024;
const CATEGORIES = new Set(['Mensalidade','Juros de mensalidade','Rifa','Evento','Pagamento de empréstimo','Juros de empréstimo','Outros']);
const ID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const DATE_RE = /^2027-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH_RE = /^2027-(0[1-9]|1[0-2])$/;
const sha = x => createHash('sha256').update(x).digest('hex');
let pool;
const attempts = new Map();

function fail(message, status=400) { return Object.assign(new Error(message), { status }); }
function database() {
  const url = process.env.PORTAL_DATABASE_URL;
  const pepper = process.env.ASSOCIATE27_PEPPER;
  if (!url || !pepper || pepper.length<32) throw fail('A Central 2027 ainda não foi configurada no servidor.',503);
  if (!pool) pool = new Pool({connectionString:url,max:3,connectionTimeoutMillis:7000,idleTimeoutMillis:15000});
  return pool;
}
function cpfDigits(input) {
  const x=String(input||'').replace(/\D/g,'');
  if (!/^\d{11}$/.test(x) || /^(\d)\1{10}$/.test(x)) return '';
  const dv=(n)=>{let s=0;for(let i=0;i<n;i++)s+=Number(x[i])*(n+1-i);let r=11-s%11;return r>9?0:r;};
  return Number(x[9])===dv(9)&&Number(x[10])===dv(10)?x:'';
}
function cpfHmac(cpf) { return createHmac('sha256',process.env.ASSOCIATE27_PEPPER).update(cpf).digest('hex'); }
function passHash(password, salt) { return scryptSync(password+process.env.ASSOCIATE27_PEPPER,Buffer.from(salt,'hex'),64).toString('hex'); }
function safeEqual(a,b) {
  if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
  return timingSafeEqual(Buffer.from(a),Buffer.from(b));
}
function rate(req,key,limit=15) {
  const ip=String(req.headers['x-forwarded-for']||req.socket.remoteAddress||'local').split(',')[0].slice(0,80);
  const id=key+':'+ip, now=Date.now(), item=attempts.get(id)||{since:now,n:0};
  if(now-item.since>60000){item.since=now;item.n=0;}
  item.n++;attempts.set(id,item);if(attempts.size>4000)attempts.clear();
  if(item.n>limit)throw fail('Muitas tentativas. Aguarde um minuto.',429);
}
function fileOk(data,type) {
  if(type==='image/jpeg')return data.length>=3&&data[0]===255&&data[1]===216&&data[2]===255;
  if(type==='image/png')return data.length>=8&&data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(type==='application/pdf')return data.subarray(0,5).toString('ascii')==='%PDF-';
  return false;
}
function validDate(s) {
  if(!DATE_RE.test(s))return false;
  const d=new Date(s+'T12:00:00Z');
  return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;
}
function parseReceipt(b, requireFile = true, today = new Date().toISOString().slice(0,10)) {
  const paidOn=String(b.paidOn||''), cents=Number(b.amountCents);
  if(!validDate(paidOn)||paidOn>today) throw fail('Informe a data válida do pagamento de 2027.');
  if(!Number.isSafeInteger(cents)||cents<1||cents>20000000)throw fail('Valor inválido.');
  if(!Array.isArray(b.allocations)||!b.allocations.length||b.allocations.length>20)throw fail('Informe de 1 a 20 finalidades.');
  let sum=0;
  const allocations=b.allocations.map(a=>{
    const category=String(a.category||''), part=Number(a.amountCents), competence=String(a.competence||''), eventName=String(a.eventName||'').trim();
    if(!CATEGORIES.has(category)||!Number.isSafeInteger(part)||part<1)throw fail('Finalidade ou valor incorreto.');
    if(['Mensalidade','Juros de mensalidade'].includes(category)&&!MONTH_RE.test(competence))throw fail('Informe o mês de competência de 2027.');
    if(category==='Evento'&&(!eventName||eventName.length>90))throw fail('Informe o nome do evento.');
    sum+=part;
    return {category,amountCents:part,competence:MONTH_RE.test(competence)?competence:null,eventName:category==='Evento'?eventName:null};
  });
  if(sum!==cents)throw fail('A soma das finalidades deve corresponder exatamente ao depósito.');
  if(!requireFile) return {paidOn,cents,allocations,notes:String(b.notes||'').trim().slice(0,800)};
  const mime=String(b.fileType||''), base64=String(b.fileBase64||'');
  if(base64.length>Math.ceil(MAX_BYTES*4/3)+10||!base64||!/^[A-Za-z0-9+/]+={0,2}$/.test(base64))throw fail('Arquivo inválido ou maior que 1 MB.',413);
  const bytes=Buffer.from(base64,'base64');
  if(bytes.length<50||bytes.length>MAX_BYTES||!fileOk(bytes,mime))throw fail('Use JPG, PNG ou PDF verdadeiro com até 1 MB.');
  return {paidOn,cents,allocations,mime,bytes,fileHash:sha(bytes),fileName:String(b.fileName||'comprovante').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,80),notes:String(b.notes||'').trim().slice(0,800)};
}
function cookie(req) {
  const m=String(req.headers.cookie||'').match(/(?:^|;\s*)cx27=([A-Za-z0-9_-]{40,120})(?:;|$)/);
  return m?.[1]||'';
}
function setCookie(res,token,days) {
  res.setHeader('Set-Cookie','cx27='+token+'; Path=/api/2027; Max-Age='+Math.floor(days*86400)+'; HttpOnly; Secure; SameSite=Strict');
}
async function member(req,res,respond) {
  const key=cookie(req);
  if(!key){respond(res,401,{error:'Entre no seu cadastro para continuar.'});return null;}
  const q=await database().query(
    "SELECT m.id,m.full_name,m.cpf_last4,m.phone,m.address,m.status,s.expires_at FROM cx27.sessions s JOIN cx27.members m ON m.id=s.member_id WHERE s.token_hash=$1 AND s.expires_at>now() LIMIT 1",
    [sha(key)]);
  if(!q.rowCount||q.rows[0].status!=='active'){respond(res,401,{error:'Sessão inválida ou cadastro aguardando aprovação.'});return null;}
  return q.rows[0];
}
function createCaixinha27Api({getAccess,bodyJson,respond,headers}) {
  async function admin(req,res) {
    const a=await getAccess(req);
    if(a.status!==200){respond(res,a.status,{error:'Apenas os responsáveis autenticados podem acessar a administração.'});return null;}
    return a;
  }
  async function handle(req,res,url) {
    try { await route(req,res,url); }
    catch(e) {
      if(e.code==='23505'){respond(res,409,{error:'Este cadastro, comprovante ou número já existe. Atualize e confira.'});return;}
      if(e.status){respond(res,e.status,{error:e.message});return;}
      console.error('Caixinha2027:',e.code||e.name||'erro');
      respond(res,503,{error:'Não foi possível concluir a operação. Nenhuma confirmação foi emitida.'});
    }
  }
  async function route(req,res,url) {
    const p=url.pathname;
    if(p==='/api/2027/ready'&&req.method==='GET'){
      try{await database().query('SELECT 1 FROM cx27.members LIMIT 1');respond(res,200,{ready:true});}
      catch{respond(res,503,{ready:false});}
      return;
    }
    if(p==='/api/2027/register'&&req.method==='POST'){
      rate(req,'register',5);const b=await bodyJson(req);
      const name=String(b.fullName||'').trim().replace(/\s+/g,' '),cpf=cpfDigits(b.cpf);
      const phone=String(b.phone||'').replace(/\D/g,''),address=String(b.address||'').trim().replace(/\s+/g,' ');
      const pwd=String(b.password||'');
      if(name.length<5||name.length>120||name.split(' ').length<2)throw fail('Informe o nome completo.');
      if(!cpf)throw fail('CPF inválido.');
      if(!/^\d{10,11}$/.test(phone))throw fail('Informe telefone com DDD.');
      if(address.length<12||address.length>240)throw fail('Informe endereço completo, com número e cidade.');
      if(pwd.length<10||pwd.length>128)throw fail('Crie uma senha de 10 a 128 caracteres.');
      const salt=randomBytes(16).toString('hex');
      await database().query('INSERT INTO cx27.members (full_name,cpf_hmac,cpf_last4,phone,address,password_salt,password_hash) VALUES($1,$2,$3,$4,$5,$6,$7)',[name,cpfHmac(cpf),cpf.slice(-4),phone,address,salt,passHash(pwd,salt)]);
      respond(res,201,{success:true,message:'Cadastro recebido. O acesso será liberado após a conferência dos responsáveis.'});return;
    }
    if(p==='/api/2027/login'&&req.method==='POST'){
      rate(req,'login',12);const b=await bodyJson(req),cpf=cpfDigits(b.cpf),pwd=String(b.password||'');
      if(!cpf||pwd.length>128){respond(res,401,{error:'CPF ou senha inválidos.'});return;}
      const q=await database().query('SELECT id,status,password_salt,password_hash FROM cx27.members WHERE cpf_hmac=$1 LIMIT 1',[cpfHmac(cpf)]);
      const record=q.rows[0];
      if(!record||!safeEqual(passHash(pwd,record.password_salt),record.password_hash)){respond(res,401,{error:'CPF ou senha inválidos.'});return;}
      if(record.status!=='active'){respond(res,403,{error:record.status==='pending'?'Cadastro aguardando aprovação.':'Acesso suspenso. Contate os responsáveis.'});return;}
      const token=randomBytes(32).toString('base64url');
      await database().query("INSERT INTO cx27.sessions (token_hash,member_id,expires_at) VALUES ($1,$2,now()+interval '14 days')",[sha(token),record.id]);
      setCookie(res,token,14);respond(res,200,{success:true});return;
    }
    if(p==='/api/2027/logout'&&req.method==='POST'){
      const k=cookie(req);if(k)await database().query('DELETE FROM cx27.sessions WHERE token_hash=$1',[sha(k)]);
      setCookie(res,'',0);respond(res,200,{success:true});return;
    }
    if(p.startsWith('/api/2027/admin/')){
      rate(req,'admin',80);
      const a=await admin(req,res);if(!a)return;
      if(p==='/api/2027/admin/dashboard'&&req.method==='GET'){
        const db=database(),[members,receipts,events,numbers]=await Promise.all([
          db.query('SELECT id,full_name,cpf_last4,phone,address,status,created_at,approved_at FROM cx27.members ORDER BY created_at DESC LIMIT 500'),
          db.query('SELECT r.id,r.member_id,m.full_name,r.paid_on,r.amount_cents,r.allocations,r.status,r.notes,r.review_notes,r.submitted_at,r.reviewed_by FROM cx27.receipts r JOIN cx27.members m ON m.id=r.member_id ORDER BY r.submitted_at DESC LIMIT 600'),
          db.query('SELECT * FROM cx27.events ORDER BY created_at DESC LIMIT 80'),
          db.query('SELECT n.event_id,n.number,n.member_id,m.full_name FROM cx27.event_numbers n JOIN cx27.members m ON m.id=n.member_id ORDER BY n.event_id,n.number LIMIT 10000')
        ]);
        respond(res,200,{members:members.rows,receipts:receipts.rows,events:events.rows,numbers:numbers.rows});return;
      }
      if(p==='/api/2027/admin/member'&&req.method==='POST'){
        const b=await bodyJson(req);
        if(!ID_RE.test(String(b.memberId||''))||!['active','blocked'].includes(b.status))throw fail('Dados inválidos.');
        const q=await database().query('UPDATE cx27.members SET status=$2,approved_at=CASE WHEN $2=\'active\' THEN now() ELSE approved_at END,approved_by=$3 WHERE id=$1 RETURNING id,status',[b.memberId,b.status,a.email]);
        if(b.status==='blocked')await database().query('DELETE FROM cx27.sessions WHERE member_id=$1',[b.memberId]);
        respond(res,q.rowCount?200:404,{success:q.rowCount>0});return;
      }
      if(p==='/api/2027/admin/review'&&req.method==='POST'){
        const b=await bodyJson(req),id=String(b.receiptId||''),decision=String(b.decision||''),notes=String(b.notes||'').trim();
        if(!ID_RE.test(id)||!['approved','rejected'].includes(decision)||notes.length<8||notes.length>500)throw fail('Informe decisão e justificativa com 8 a 500 caracteres.');
        const client=await database().connect();
        try {
          await client.query('BEGIN');
          const q=await client.query('SELECT id,member_id,allocations,status FROM cx27.receipts WHERE id=$1 FOR UPDATE',[id]);
          if(!q.rowCount||q.rows[0].status!=='pending')throw fail('Comprovante inexistente ou já conferido.',409);
          const r=q.rows[0];
          if(decision==='approved'){
            for(const [i,line] of r.allocations.entries()) await client.query('INSERT INTO cx27.ledger (member_id,receipt_id,line_index,category,amount_cents,competence,event_name,approved_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
              [r.member_id,r.id,i,line.category,line.amountCents,line.competence,line.eventName,a.email]);
          }
          await client.query('UPDATE cx27.receipts SET status=$2,review_notes=$3,reviewed_at=now(),reviewed_by=$4 WHERE id=$1',[id,decision,notes,a.email]);
          await client.query('COMMIT');
          respond(res,200,{success:true,status:decision,recorded:decision==='approved'});
        } catch(e){await client.query('ROLLBACK');throw e;}
        finally{client.release();}
        return;
      }
      if(p==='/api/2027/admin/receipt-file'&&req.method==='GET'){
        const id=String(url.searchParams.get('id')||'');
        if(!ID_RE.test(id))throw fail('Identificador inválido.');
        const q=await database().query('SELECT mime,file_bytes FROM cx27.receipts WHERE id=$1',[id]);
        if(!q.rowCount){respond(res,404,{error:'Arquivo não encontrado.'});return;}
        headers(res,q.rows[0].mime);res.setHeader('Content-Disposition','attachment; filename="comprovante-2027-'+id+(q.rows[0].mime==='application/pdf'?'.pdf':q.rows[0].mime==='image/png'?'.png':'.jpg')+'"');
        res.writeHead(200);res.end(q.rows[0].file_bytes);return;
      }
      if(p==='/api/2027/admin/event'&&req.method==='POST'){
        const b=await bodyJson(req),title=String(b.title||'').trim(),description=String(b.description||'').trim(),date=String(b.eventDate||'');
        const total=Number(b.totalNumbers);
        if(title.length<5||title.length>120||description.length>500||!Number.isInteger(total)||total<1||total>500||date&&!validDate(date))throw fail('Informe evento, data e quantidade de números válidos (1 a 500).');
        const q=await database().query('INSERT INTO cx27.events (title,description,event_date,total_numbers) VALUES($1,$2,$3,$4) RETURNING id',[title,description,date||null,total]);
        respond(res,201,{success:true,id:q.rows[0].id});return;
      }
      if(p==='/api/2027/admin/event-status'&&req.method==='POST'){
        const b=await bodyJson(req);
        if(!ID_RE.test(String(b.eventId||''))||!['open','closed'].includes(b.status))throw fail('Evento inválido.');
        const q=await database().query('UPDATE cx27.events SET status=$2 WHERE id=$1 RETURNING id',[b.eventId,b.status]);
        respond(res,q.rowCount?200:404,{success:q.rowCount>0});return;
      }
      respond(res,404,{error:'Rota administrativa desconhecida.'});return;
    }
    const m=await member(req,res,respond);if(!m)return;
    if(p==='/api/2027/me'&&req.method==='GET'){
      const db=database();
      const [receipts,ledger,approved,events,numbers,occupied]=await Promise.all([
        db.query('SELECT id,amount_cents,paid_on,allocations,notes,status,review_notes,submitted_at FROM cx27.receipts WHERE member_id=$1 ORDER BY submitted_at DESC LIMIT 100',[m.id]),
        db.query('SELECT category,amount_cents,competence,event_name,created_at FROM cx27.ledger WHERE member_id=$1 ORDER BY created_at DESC LIMIT 300',[m.id]),
        db.query('SELECT coalesce(sum(amount_cents),0)::bigint AS total FROM cx27.ledger WHERE member_id=$1',[m.id]),
        db.query('SELECT id,title,description,event_date,total_numbers,status FROM cx27.events ORDER BY created_at DESC LIMIT 50'),
        db.query('SELECT event_id,number FROM cx27.event_numbers WHERE member_id=$1 ORDER BY number',[m.id]),
        db.query('SELECT event_id,number FROM cx27.event_numbers')
      ]);
      respond(res,200,{member:{name:m.full_name,cpfLast4:m.cpf_last4,phone:m.phone,address:m.address},receipts:receipts.rows,ledger:ledger.rows,approvedCents:approved.rows[0].total,events:events.rows,numbers:numbers.rows,occupied:occupied.rows});return;
    }
    if(p==='/api/2027/receipt/correct'&&req.method==='POST'){
      rate(req,'receipt-correct',10);
      const b=await bodyJson(req), id=String(b.receiptId||'');
      if(!ID_RE.test(id))throw fail('Comprovante inválido.');
      const r=parseReceipt(b,false);
      const q=await database().query(
        "UPDATE cx27.receipts SET paid_on=$3,amount_cents=$4,allocations=$5::jsonb,notes=$6,status='pending',review_notes=NULL,reviewed_by=NULL,reviewed_at=NULL WHERE id=$1 AND member_id=$2 AND status='rejected' RETURNING id",
        [id,m.id,r.paidOn,r.cents,JSON.stringify(r.allocations),r.notes]);
      if(!q.rowCount){respond(res,409,{error:'Somente comprovantes rejeitados podem ser corrigidos pelo titular.'});return;}
      respond(res,200,{success:true,status:'pending',message:'Correção recebida. O comprovante original foi mantido para nova conferência.'});return;
    }
    if(p==='/api/2027/receipt'&&req.method==='POST'){
      rate(req,'receipt',10);const r=parseReceipt(await bodyJson(req));
      const db=database();
      const count=await db.query("SELECT count(*)::integer AS total FROM cx27.receipts WHERE member_id=$1 AND submitted_at>now()-interval '30 days'",[m.id]);
      if(Number(count.rows[0].total)>=40)throw fail('Limite de envios atingido neste mês. Contate os responsáveis.',429);
      const size=await db.query("SELECT pg_total_relation_size('cx27.receipts')::bigint AS bytes");
      if(Number(size.rows[0].bytes)>180*1024*1024)throw fail('Limite seguro de armazenamento atingido.',507);
      const q=await db.query('INSERT INTO cx27.receipts (member_id,paid_on,amount_cents,allocations,notes,mime,filename,file_bytes,file_sha256) VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9) RETURNING id,status',
        [m.id,r.paidOn,r.cents,JSON.stringify(r.allocations),r.notes,r.mime,r.fileName,r.bytes,r.fileHash]);
      respond(res,201,{success:true,id:q.rows[0].id,status:'pending',message:'Comprovante recebido para conferência. O saldo oficial ainda não mudou.'});return;
    }
    if(p==='/api/2027/numbers'&&req.method==='POST'){
      rate(req,'numbers',12);const b=await bodyJson(req);
      const id=String(b.eventId||''), nums=b.numbers;
      if(!ID_RE.test(id)||!Array.isArray(nums)||!nums.length||nums.length>500||!nums.every(x=>Number.isInteger(x)&&x>=1&&x<=500)||new Set(nums).size!==nums.length)throw fail('Selecione números válidos, sem repetição.');
      const client=await database().connect();
      try{
        await client.query('BEGIN');
        const ev=await client.query('SELECT id,total_numbers,status,event_date::text AS event_date FROM cx27.events WHERE id=$1 FOR UPDATE',[id]);
        if(!ev.rowCount||ev.rows[0].status!=='open'||ev.rows[0].event_date&&String(ev.rows[0].event_date).slice(0,10)<new Date().toISOString().slice(0,10))throw fail('Evento não disponível.',409);
        if(nums.some(n=>n>ev.rows[0].total_numbers))throw fail('Número fora da faixa deste evento.');
        for(const n of nums)await client.query('INSERT INTO cx27.event_numbers (event_id,number,member_id) VALUES($1,$2,$3)',[id,n,m.id]);
        await client.query('COMMIT');respond(res,201,{success:true,numbers:nums,message:'Números registrados para este associado.'});
      }catch(e){await client.query('ROLLBACK');if(e.code==='23505')throw fail('Um dos números acabou de ser escolhido. Atualize a lista.',409);throw e;}
      finally{client.release();}
      return;
    }
    respond(res,404,{error:'Rota não encontrada.'});
  }
  return {handle};
}
module.exports={createCaixinha27Api,cpfDigits,parseReceipt,fileOk,validDate,MAX_BYTES};
