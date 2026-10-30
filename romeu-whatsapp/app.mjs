import http from 'node:http';
import crypto from 'node:crypto';

const maxBytes=128*1024;
export const envConfig=()=>process.env;
const json=(status,obj)=>new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&!!a&&!!b&&Buffer.byteLength(a)===Buffer.byteLength(b)&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function signed(raw,signature,secret){
  if(!secret||!/^sha256=[a-f0-9]{64}$/i.test(signature||''))return false;
  const digest='sha256='+crypto.createHmac('sha256',secret).update(raw).digest('hex');
  return equal(digest,signature);
}
export function parse(input){
  const original=String(input||'').trim().slice(0,1500);
  const phrase=original.replace(/^romeu[,!?:\s]*/i,'').replace(/^anot[ae]\s+que\s+/i,'');
  const s=phrase.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if(!s)return {action:'unknown'};
  if(/^(ajuda|menu|oi|ola|iniciar|start)\b/.test(s))return {action:'help'};
  if(/^(resumo|status|saldo)\b/.test(s))return {action:'summary'};
  if(/^(tarefas|minhas tarefas|listar tarefas)\b/.test(s))return {action:'tasks'};
  const value=s.match(/^(gastei|paguei|despesa|comprei|recebi|entrada|ganhei)\s+(?:r\$\s*)?([\d.,]+)(?:\s+(?:de|com|em|no|na|por|do|da)\s+(.+))?$/);
  if(value){
    const r=value[2];const money=r.includes(',')?r.replace(/\./g,'').replace(',','.'):/^\d{1,3}(?:\.\d{3})+$/.test(r)?r.replace(/\./g,''):r;
    const amount=Number(money);
    if(Number.isFinite(amount)&&amount>0&&amount<=1e9)return {action:'create',kind:/^(recebi|entrada|ganhei)$/.test(value[1])?'income':'expense',amount:Math.round(amount*100)/100,content:(value[3]||'Sem descrição').slice(0,500)};
  }
  for(const [re,kind] of [
    [/^(comprar|lista de compras|adicionar compra|preciso comprar)\s+(.+)$/,'shopping'],
    [/^(tarefa|lembrar|preciso|tenho que|fazer)\s+(.+)$/,'task'],
    [/^(nota|anotar|anota|registre|registrar)\s+(.+)$/,'note'],
    [/^(ideia|ideias)\s+(.+)$/,'idea'],
    [/^(estudar|estudo)\s+(.+)$/,'study']
  ]){const m=s.match(re);if(m)return {action:'create',kind,content:phrase.slice(-m[2].length).slice(0,500)};}
  return {action:'unknown'};
}
export function reply(cmd,data={}){
  if(cmd.action==='help')return '🤖 *ROMEU — Minha Vida em Dia*\n\nComandos:\n• tarefa levar o carro\n• comprar café e arroz\n• gastei R$ 80 com combustível\n• recebi R$ 120 de cliente\n• anotar reunião\n• tarefas\n• resumo';
  if(cmd.action==='create')return '✅ '+({task:'Tarefa',expense:'Despesa',income:'Recebimento',shopping:'Compra',note:'Nota',idea:'Ideia',study:'Estudo'}[cmd.kind]||'Registro')+' salvo: '+cmd.content+(cmd.amount?' — R$ '+cmd.amount.toFixed(2).replace('.',','):'');
  if(cmd.action==='tasks')return data.items?.length?'📋 *Tarefas abertas*\n'+data.items.map(x=>'• '+x.content).join('\n'):'Você não tem tarefas abertas.';
  if(cmd.action==='summary')return '📊 *Resumo*\nTarefas abertas: '+(data.tasks||0)+'\nRegistros: '+(data.total||0)+'\nDespesas: R$ '+Number(data.expenses||0).toFixed(2).replace('.',',')+'\nRecebimentos: R$ '+Number(data.income||0).toFixed(2).replace('.',',');
  return 'Não entendi. Escreva *ajuda* para ver os comandos.';
}
export async function makeStore(url){
  const {default:pg}=await import('pg');
  const pool=new pg.Pool({connectionString:url,max:3,connectionTimeoutMillis:5000,idleTimeoutMillis:15000,ssl:{rejectUnauthorized:true}});
  return {async process({from,messageId,cmd,limit}){
    const c=await pool.connect();
    try{
      await c.query('BEGIN');
      const added=await c.query("INSERT INTO romeu_wa_inbox(message_id,from_number,status) VALUES($1,$2,'received') ON CONFLICT(message_id) DO NOTHING RETURNING message_id",[messageId,from]);
      if(!added.rowCount){await c.query('ROLLBACK');return {skip:'duplicate'};}
      const month=new Date().toISOString().slice(0,7)+'-01';
      const q=await c.query("INSERT INTO romeu_wa_quota(month,sender_id,reserved) VALUES($1,$2,1) ON CONFLICT(month,sender_id) DO UPDATE SET reserved=romeu_wa_quota.reserved+1 WHERE romeu_wa_quota.reserved<$3 RETURNING reserved",[month,'romeu-primary',limit]);
      if(!q.rowCount){await c.query("UPDATE romeu_wa_inbox SET status='quota_blocked' WHERE message_id=$1",[messageId]);await c.query('COMMIT');return {skip:'quota'};}
      const u=await c.query("INSERT INTO romeu_users(display_name,whatsapp_phone) VALUES('Usuário autorizado',$1) ON CONFLICT(whatsapp_phone) DO UPDATE SET whatsapp_phone=EXCLUDED.whatsapp_phone RETURNING id",[from]);
      const uid=u.rows[0].id;
      let sp=await c.query("SELECT id FROM romeu_spaces WHERE owner_id=$1 AND kind='personal' ORDER BY created_at ASC LIMIT 1",[uid]);
      let sid=sp.rows[0]?.id;
      if(!sid){sp=await c.query("INSERT INTO romeu_spaces(name,kind,owner_id) VALUES('Pessoal','personal',$1) RETURNING id",[uid]);sid=sp.rows[0].id;}
      await c.query("INSERT INTO romeu_memberships(space_id,user_id,role) VALUES($1,$2,'owner') ON CONFLICT DO NOTHING",[sid,uid]);
      if(cmd.action==='create')await c.query("INSERT INTO romeu_entries(space_id,author_id,kind,content,amount,metadata) VALUES($1,$2,$3,$4,$5,$6::jsonb)",[sid,uid,cmd.kind,cmd.content,cmd.amount??null,JSON.stringify({origin:'whatsapp',wa_message_id:messageId})]);
      let data={};
      if(cmd.action==='tasks'){const x=await c.query("SELECT content FROM romeu_entries WHERE space_id=$1 AND kind='task' AND status='open' ORDER BY created_at DESC LIMIT 8",[sid]);data={items:x.rows};}
      if(cmd.action==='summary'){const x=await c.query("SELECT count(*)::int total,count(*) FILTER(WHERE kind='task' AND status='open')::int tasks,coalesce(sum(amount) FILTER(WHERE kind='expense'),0)::float8 expenses,coalesce(sum(amount) FILTER(WHERE kind='income'),0)::float8 income FROM romeu_entries WHERE space_id=$1",[sid]);data=x.rows[0];}
      await c.query("UPDATE romeu_wa_inbox SET status='reserved' WHERE message_id=$1",[messageId]);
      await c.query('COMMIT');return {data};
    }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
  },async ping(){await pool.query('SELECT 1');}};
}
export async function sendToMeta(env,to,body,messageId,fetcher=fetch){
  if(env.OUTBOUND_ENABLED!=='true')return {skipped:'disabled'};
  if(!env.META_PHONE_NUMBER_ID||!env.META_ACCESS_TOKEN)throw Error('Meta is not configured');
  const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),7500);
  try{
    const response=await fetcher('https://graph.facebook.com/'+(env.GRAPH_API_VERSION||'v24.0')+'/'+encodeURIComponent(env.META_PHONE_NUMBER_ID)+'/messages',{
      method:'POST',headers:{authorization:'Bearer '+env.META_ACCESS_TOKEN,'content-type':'application/json'},
      body:JSON.stringify({messaging_product:'whatsapp',to,type:'text',context:{message_id:messageId},text:{preview_url:false,body:body.slice(0,3500)}}),signal:abort.signal});
    if(!response.ok)throw Error('Meta rejected reply: HTTP '+response.status);
    return {sent:true};
  }finally{clearTimeout(timer);}
}
export function createHandler(env,{store,send=sendToMeta}={}){
  const allowed=new Set((env.AUTHORIZED_NUMBERS||'').split(',').map(n=>n.replace(/\D/g,'')).filter(Boolean));
  const ready=()=>!!(env.META_VERIFY_TOKEN&&env.META_APP_SECRET&&env.META_ACCESS_TOKEN&&env.META_PHONE_NUMBER_ID&&env.DATABASE_URL&&allowed.size);
  return async function handle(request){
    const url=new URL(request.url);
    if(url.pathname==='/health'&&request.method==='GET')return json(200,{service:'romeu-whatsapp',version:'0.2.0',status:'ready_for_setup',outbound:env.OUTBOUND_ENABLED==='true',meta_configured:!!(env.META_VERIFY_TOKEN&&env.META_APP_SECRET&&env.META_ACCESS_TOKEN&&env.META_PHONE_NUMBER_ID),database_configured:!!env.DATABASE_URL,allowlist_configured:allowed.size>0});
    if(url.pathname!=='/webhook')return json(404,{error:'not found'});
    if(request.method==='GET')return url.searchParams.get('hub.mode')==='subscribe'&&equal(url.searchParams.get('hub.verify_token'),env.META_VERIFY_TOKEN)&&url.searchParams.has('hub.challenge')
      ?new Response(url.searchParams.get('hub.challenge'),{status:200,headers:{'content-type':'text/plain'}}):json(403,{error:'invalid verification'});
    if(request.method!=='POST')return json(405,{error:'method not allowed'});
    if(!env.META_APP_SECRET)return json(503,{error:'not configured'});
    const raw=await request.text();
    if(Buffer.byteLength(raw)>maxBytes)return json(413,{error:'too large'});
    if(!signed(raw,request.headers.get('x-hub-signature-256'),env.META_APP_SECRET))return json(401,{error:'invalid signature'});
    let data;try{data=JSON.parse(raw);}catch{return json(400,{error:'invalid json'});}
    if(data.object!=='whatsapp_business_account'||!Array.isArray(data.entry))return json(400,{error:'invalid payload'});
    let accepted=0,ignored=0,errors=0;
    for(const entry of data.entry.slice(0,10))for(const change of (entry.changes||[]).slice(0,10)){
      const value=change.value||{};
      if(value.metadata?.phone_number_id!==env.META_PHONE_NUMBER_ID){ignored++;continue;}
      for(const m of (value.messages||[]).slice(0,20)){
        const from=String(m.from||'').replace(/\D/g,'');
        if(!allowed.has(from)||m.type!=='text'||!m.id||!m.text?.body||env.OUTBOUND_ENABLED!=='true'||!ready()||!store){ignored++;continue;}
        const cmd=parse(m.text.body);
        try{
          const r=await store.process({from,messageId:m.id,cmd,limit:Math.min(800,Math.max(1,Number(env.MAX_MONTHLY_REPLIES)||800))});
          if(r.skip){ignored++;continue;}
          await send(env,from,reply(cmd,r.data),m.id);accepted++;
        }catch(e){errors++;console.error('Webhook processing failed:',String(e?.message||e).replace(/Bearer\s+\S+/gi,'Bearer ***'));}
      }
    }
    return json(errors?500:200,{ok:errors===0,accepted,ignored,errors});
  };
}
export function startServer(env=process.env,opts={}){
  const handle=createHandler(env,opts);
  const server=http.createServer(async(req,res)=>{
    try{
      let size=0;const chunks=[];
      for await(const chunk of req){size+=chunk.length;if(size>maxBytes){res.writeHead(413);res.end();return;}chunks.push(chunk);}
      const request=new Request('http://localhost:'+(env.PORT||3000)+req.url,{method:req.method,headers:req.headers,body:/^(GET|HEAD)$/.test(req.method)?undefined:Buffer.concat(chunks)});
      const r=await handle(request);res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));
    }catch(e){console.error('Request failed:',e.message);res.writeHead(500);res.end('server error');}
  });
  server.listen(Number(env.PORT||3000),'0.0.0.0');return server;
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1]){
  const env=process.env;
  const store=env.DATABASE_URL?await makeStore(env.DATABASE_URL):null;
  if(store){try{await store.ping();console.log('ROMEU Neon database connection: OK');}catch(e){console.error('ROMEU Neon database connection: FAILED',String(e?.code||'unknown'));}}
  startServer(env,{store});
}
