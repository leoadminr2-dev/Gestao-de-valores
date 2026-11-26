import http from 'node:http';
import crypto from 'node:crypto';
import {readFileSync} from 'node:fs';
const homeHtml=readFileSync(new URL('./home.html',import.meta.url),'utf8');

const maxBytes=128*1024;
export const envConfig=()=>process.env;
const json=(status,obj)=>new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&!!a&&!!b&&Buffer.byteLength(a)===Buffer.byteLength(b)&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function signed(raw,signature,secret){
  if(!secret||!/^sha256=[a-f0-9]{64}$/i.test(signature||''))return false;
  const digest='sha256='+crypto.createHmac('sha256',secret).update(raw).digest('hex');
  return equal(digest,signature);
}
const price = cents => (cents / 100).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
const quoteExample = 'Envie o pedido completo assim:\nOrçamento para Carol\n2 x Higienização de split | R$ 280,00 cada\n1 x Material | R$ 50,00 cada';
const quantityWords = {um:1,uma:1,dois:2,duas:2,três:3,tres:3,quatro:4,cinco:5};
function parseQuote(phrase) {
  const match = phrase.match(/^(?:(?:assistente|romeu)[, ]+)?(?:(?:eu )?(?:preciso de|quero|faz|faça|fazer|monta|monte|prepara|prepare)\s+)?(?:um\s+)?or[çc]amento\b\s*(.*)$/isu);
  if (!match) return null;
  // Accept a single service with explicitly supplied labour and material amounts.
  const inline = match[1].trim().match(/^de\s+([^,\n]{3,160}),?\s+com\s+m[ãa]o\s+de\s+obra\s+de\s+R\$\s*(\d{1,6}|\d{1,3}(?:\.\d{3}){1,2})(?:,(\d{2}))?\s+e\s+materia(?:l|is)\s+de\s+R\$\s*(\d{1,6}|\d{1,3}(?:\.\d{3}){1,2})(?:,(\d{2}))?[.!]?$/iu);
  if (inline && !/R\$|\||\n/i.test(inline[1])) {
    const cents = (whole, fraction) => Number(whole.replaceAll('.',''))*100+Number(fraction||0);
    const labour=cents(inline[2],inline[3]), material=cents(inline[4],inline[5]);
    if (labour > 0 && material > 0) return {action:'quote',client:null,items:[{count:1,description:inline[1].trim()+' — mão de obra',cents:labour},{count:1,description:'Material',cents:material}]};
  }
  const header = match[1].match(/^(?:para|pra|pro|da|do|de)\s+(?:(?:a|o)\s+)?([\p{L}][\p{L} '-]{0,70}?)[.:,\n]\s*([\s\S]+)$/iu);
  if (!header) return {action:'quoteGuide'};
  const items = [];
  for (const line of header[2].trim().split(/\n+/)) {
    const reference = line.trim().match(/^(?:são\s+)?(\d{1,3}|um|uma|dois|duas|três|tres|quatro|cinco)\s+(?:x\s+)?(higienizaç(?:ão|ões) de split(?:s)? (?:de )?(?:9[. ]?000|9 mil)\s*btus?|limpeza(?:s)? de ar(?:-condicionado)? de janela)[.!]?$/iu);
    if (reference) {
      const count = quantityWords[reference[1].toLowerCase()] ?? Number(reference[1]);
      if (!count) return {action:'quoteGuide'};
      items.push({count, description:reference[2], cents:/^higieniza/i.test(reference[2]) ? 28000 : 25000});
      continue;
    }
    const item = line.trim().match(/^(?:são\s+)?(\d{1,3}|um|uma|dois|duas|três|tres|quatro|cinco)\s+(?:x\s+)?(.{2,140}?)\s*[,|]\s*R\$\s*(\d{1,6}|\d{1,3}(?:\.\d{3}){1,2})(?:,(\d{2}))?\s*(cada|por unidade|a unidade)?[.!]?$/iu);
    if (!item || /R\$|\||\n/i.test(item[2])) return {action:'quoteGuide'};
    const count = quantityWords[item[1].toLowerCase()] ?? Number(item[1]);
    const cents = Number(item[3].replaceAll('.','')) * 100 + Number(item[4] || 0);
    if (!count || !cents || (count > 1 && !item[5])) return {action:'quoteGuide'};
    items.push({count, description:item[2].trim(), cents});
  }
  return {action:'quote', client:header[1].trim(), items};
}
const COMPARISON_INTENT = /(?:\b(?:outros?|novos?|mais|demais)\s+(?:\w+\s+){0,2}(?:orcamentos?|cotacoes?|propostas?)\b|\b(?:pesquis\w*|compar\w*|busc\w*|procur\w*|peg\w*|faz\w*|solicit\w*|levant\w*|consult\w*)\s+(?:\w+\s+){0,4}(?:orcamentos|cotacoes|precos|valores|propostas)\b|\b(?:orcamento|cotacao|preco|valor)\s+(?:de|com|em)\s+outr[oa]s?\b)/;
const COMPARISON_REPLY = "Entendemos perfeitamente! 😊\n\nÉ importante, sim, pesquisar e comparar orçamentos antes de contratar um serviço.\n\n⭐ *Confira nossas avaliações no Google:*\nhttps://share.google/QTqpyBWNP4QKaFm7C\n\nSão feedbacks de clientes que contrataram nossos serviços de instalação, higienização (lavação) e manutenção.\n\n🌐 *Conheça também nossa página:*\nhttps://headless-qqhigtkprnz-leoadminr2-140a.wix-site-host.com/\n\nPrezamos pela qualidade, pelos procedimentos técnicos, pela transparência e pela garantia dos nossos serviços.\n\nEstamos à disposição! 🤝\n\n❄️ *Leonardo Moreira Refrigeração*";
const PAYMENT_METHODS = '💳 *FORMAS DE PAGAMENTO*\n\n💳 Cartão de crédito\n💳 Cartão de débito\n📲 Pix';
const quoteNorm = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function quoteProcedures(items) {
  const descriptions = items.map(i=>quoteNorm(i.description));
  const blocks = [];
  if (descriptions.some(t=>/instalacao/.test(t) && /split/.test(t) && !/desinstalacao|retirada|eletrica|somente|apenas|parcial|fachada|rapel/.test(t))) {
    blocks.push(['❄️ *Instalação de split — procedimentos padrão*','📍 Posicionamento e fixação das unidades interna e externa.','🔩 Interligação das tubulações frigoríficas.','⚡ Interligação elétrica entre as unidades.','💧 Instalação e teste do dreno.','🛡️ Teste de estanqueidade para verificar vazamentos.','🔬 Vácuo para remover ar e umidade do sistema.','🌡️ Teste de funcionamento e conferência final.','📦 Materiais, adequação elétrica e acesso especial somente quando expressamente incluídos no orçamento.'].join('\n\n'));
  }
  if (descriptions.some(t=>/(higienizac|limpeza)/.test(t) && /split|ar[ -]condicionado|ar de janela/.test(t) && !/filtro|superficial|somente|apenas|parcial/.test(t))) {
    blocks.push(['🧼 *Higienização — procedimentos padrão*','🔧 Desmontagem das partes necessárias do equipamento.','💧 Lavagem individual dos componentes laváveis.','❄️ Higienização da serpentina e da evaporadora, conforme o tipo de equipamento.','🌀 Limpeza da condensadora quando incluída e acessível.','✅ Montagem, conferência e teste de funcionamento.'].join('\n\n'));
  }
  return blocks;
}
function quoteDraft(cmd) {
  const lines = cmd.items.map(i => '🔹 '+i.description+'\n'+i.count+' × '+price(i.cents)+' = '+price(i.count*i.cents));
  const total = cmd.items.reduce((sum,i)=>sum+i.count*i.cents,0);
  return ['Rascunho para sua revisão 👇','❄️ *Leonardo Moreira Refrigeração*',cmd.client?'😊 Olá, '+cmd.client+'! Tudo bem? Segue o orçamento solicitado.':'😊 Olá! Tudo bem? Segue o orçamento solicitado.','Prezamos pela qualidade, segurança e clareza em cada serviço.',...quoteProcedures(cmd.items),'━━━━━━━━━━━━━━━━','📋 *Serviços e materiais*',...lines,'💰 *Total: '+price(total)+'*','━━━━━━━━━━━━━━━━',PAYMENT_METHODS,'🤝 Qualquer dúvida, estou à disposição!'].join('\n\n');
}

export function parse(input){
  const original=String(input||'').trim().slice(0,1500);
  const phrase=original.replace(/^romeu[,!?:\s]*/i,'').replace(/^anot[ae]\s+que\s+/i,'');
  const s=phrase.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  if (!/^(?:gastei|paguei|despesa|comprei|recebi|entrada|ganhei|tarefa|lembrar|nota|anotar|anota|registre|registrar|comprar|lista de compras|ideia|ideias|estudar|estudo)\b/.test(s) && COMPARISON_INTENT.test(s)) return {action:'comparisonReply'};
  const quote=parseQuote(phrase);
  if(quote)return String(input).trim().length>1500 ? {action:'quoteGuide'} : quote;
  if(!s)return {action:'unknown'};
  if(/^(?:quais (?:sao )?(?:as )?formas de pagamento|formas de pagamento|(?:voces? )?aceita(?:m)? (?:cartao(?: de (?:credito|debito))?|pix|credito|debito))[?!. ]*$/.test(s))return {action:'paymentMethods'};
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
  if(cmd.action==='comparisonReply')return COMPARISON_REPLY;
  if(cmd.action==='quote')return quoteDraft(cmd);
  if(cmd.action==='paymentMethods')return PAYMENT_METHODS;
  if(cmd.action==='quoteGuide')return 'Preciso do cliente, da descrição, da quantidade e do preço por unidade para calcular. '+quoteExample;
  if(cmd.action==='help')return '🤖 *ROMEU — Minha Vida em Dia*\n\nComandos:\n• orçamento para Carol: 2 x higienização | R$ 280 cada\n• tarefa levar o carro\n• comprar café e arroz\n• gastei R$ 80 com combustível\n• recebi R$ 120 de cliente\n• anotar reunião\n• tarefas\n• resumo';
  if(cmd.action==='create')return '✅ '+({task:'Tarefa',expense:'Despesa',income:'Recebimento',shopping:'Compra',note:'Nota',idea:'Ideia',study:'Estudo'}[cmd.kind]||'Registro')+' salvo: '+cmd.content+(cmd.amount?' — R$ '+cmd.amount.toFixed(2).replace('.',','):'');
  if(cmd.action==='tasks')return data.items?.length?'📋 *Tarefas abertas*\n'+data.items.map(x=>'• '+x.content).join('\n'):'Você não tem tarefas abertas.';
  if(cmd.action==='summary')return '📊 *Resumo*\nTarefas abertas: '+(data.tasks||0)+'\nRegistros: '+(data.total||0)+'\nDespesas: R$ '+Number(data.expenses||0).toFixed(2).replace('.',',')+'\nRecebimentos: R$ '+Number(data.income||0).toFixed(2).replace('.',',');
  return 'Não entendi. Escreva *ajuda* para ver os comandos.';
}
async function commandData(c,sid,cmd){
  let data={};
  if(cmd.action==='tasks'){
    const x=await c.query("SELECT content FROM romeu_entries WHERE space_id=$1 AND kind='task' AND status='open' ORDER BY created_at DESC LIMIT 8",[sid]);
    data={items:x.rows};
  }
  if(cmd.action==='summary'){
    const x=await c.query("SELECT count(*)::int total,count(*) FILTER(WHERE kind='task' AND status='open')::int tasks,coalesce(sum(amount) FILTER(WHERE kind='expense'),0)::float8 expenses,coalesce(sum(amount) FILTER(WHERE kind='income'),0)::float8 income FROM romeu_entries WHERE space_id=$1",[sid]);
    data=x.rows[0];
  }
  return data;
}
export async function makeStore(url){
  const {default:pg}=await import('pg');
  const pool=new pg.Pool({connectionString:url,max:3,connectionTimeoutMillis:5000,idleTimeoutMillis:15000,ssl:{rejectUnauthorized:true}});
  return {async process({from,messageId,cmd,limit}){
    const c=await pool.connect();
    try{
      await c.query('BEGIN');
      const added=await c.query("INSERT INTO romeu_wa_inbox(message_id,from_number,status) VALUES($1,$2,'received') ON CONFLICT(message_id) DO NOTHING RETURNING message_id",[messageId,from]);
      if(!added.rowCount){
        // A reply might have failed after the business action was committed.
        // Retry that reply without creating the entry or reserving quota again.
        const existing=await c.query("SELECT from_number,status FROM romeu_wa_inbox WHERE message_id=$1 FOR UPDATE",[messageId]);
        if(existing.rows[0]?.status!=='reserved'||existing.rows[0]?.from_number!==from){
          await c.query('ROLLBACK');return {skip:'duplicate'};
        }
        const user=await c.query("SELECT id FROM romeu_users WHERE whatsapp_phone=$1",[from]);
        if(!user.rowCount)throw Error('Missing user for reply retry');
        const space=await c.query("SELECT id FROM romeu_spaces WHERE owner_id=$1 AND kind='personal' ORDER BY created_at ASC LIMIT 1",[user.rows[0].id]);
        if(!space.rowCount)throw Error('Missing space for reply retry');
        const data=await commandData(c,space.rows[0].id,cmd);
        await c.query('COMMIT');return {data,retry:true};
      }
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
      const data=await commandData(c,sid,cmd);
      await c.query("UPDATE romeu_wa_inbox SET status='reserved' WHERE message_id=$1",[messageId]);
      await c.query('COMMIT');return {data};
    }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
  },async markSent(messageId){
    const result=await pool.query("UPDATE romeu_wa_inbox SET status='sent' WHERE message_id=$1 AND status='reserved' RETURNING message_id",[messageId]);
    if(!result.rowCount)throw Error('Could not confirm WhatsApp delivery request');
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
    if (url.pathname === '/privacidade' && ['GET', 'HEAD'].includes(request.method)) {
      return new Response(request.method === 'HEAD' ? null : "<!doctype html><html lang=\"pt-BR\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Política de privacidade do Romeu</title><main style=\"max-width:44rem;margin:3rem auto;padding:0 1rem;font:1.1rem/1.55 system-ui\"><h1>Política de privacidade do Romeu</h1><p>Atualizada em 26 de novembro de 2026.</p><p>Leonardo Moreira é o responsável pelo Romeu, assistente pessoal de uso restrito pelo WhatsApp.</p><h2>Dados e finalidade</h2><p>O serviço recebe da Meta o número do remetente, identificadores da mensagem e o conteúdo enviado. Usa esses dados para verificar se o número está autorizado, interpretar pedidos, responder e evitar processamento duplicado. Os registros criados por comando podem conter nomes de clientes, descrições, valores e anotações fornecidos pelo usuário. O serviço também guarda identificadores, estados de processamento e contadores de uso.</p><h2>Processamento e conservação</h2><p>A Meta transporta as mensagens pelo WhatsApp, o Render hospeda o aplicativo e o Neon armazena os registros. Os provedores podem processar dados em outros países. Os registros do assistente ficam armazenados para consulta. Uma solicitação de exclusão será avaliada considerando a identificação do solicitante, os dados envolvidos e eventuais obrigações de conservação.</p><h2>Contato e direitos</h2><p>Para saber se há dados seus, pedir acesso, correção ou exclusão, fale com Leonardo Moreira pelo atendimento humano da Leonardo Moreira Refrigeração no WhatsApp. Identifique o pedido como “Privacidade do Romeu” e informe apenas os dados necessários para localizar o registro. Você também pode recorrer à Autoridade Nacional de Proteção de Dados.</p></main></html>", {
        headers: {'content-type': 'text/html; charset=utf-8', 'x-content-type-options': 'nosniff'}
      });
    }
    if(url.pathname==='/'&&request.method==='GET')return new Response(homeHtml,{status:200,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; connect-src 'none'; frame-ancestors 'none'"}});
    if(url.pathname==='/health'&&request.method==='GET')return json(200,{service:'romeu-whatsapp',version:'0.3.0',status:ready()&&env.OUTBOUND_ENABLED==='true'?'configured':'ready_for_setup',outbound:env.OUTBOUND_ENABLED==='true',meta_configured:!!(env.META_VERIFY_TOKEN&&env.META_APP_SECRET&&env.META_ACCESS_TOKEN&&env.META_PHONE_NUMBER_ID),database_configured:!!env.DATABASE_URL,allowlist_configured:allowed.size>0});
    if(url.pathname!=='/webhook')return json(404,{error:'not found'});
    if(request.method==='GET')return url.searchParams.get('hub.mode')==='subscribe'&&equal(url.searchParams.get('hub.verify_token'),env.META_VERIFY_TOKEN)&&url.searchParams.has('hub.challenge')
      ?new Response(url.searchParams.get('hub.challenge'),{status:200,headers:{'content-type':'text/plain'}}):json(403,{error:'invalid verification'});
    if(request.method!=='POST')return json(405,{error:'method not allowed'});
    if(!env.META_APP_SECRET)return json(503,{error:'not configured'});
    const raw=await request.text();
    if(Buffer.byteLength(raw)>maxBytes)return json(413,{error:'too large'});
    if(!signed(raw,request.headers.get('x-hub-signature-256'),env.META_APP_SECRET)){console.warn('ROMEU webhook rejected: invalid signature');return json(401,{error:'invalid signature'});}
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
          await send(env,from,reply(cmd,r.data),m.id);
          await store.markSent?.(m.id);
          accepted++;
        }catch(e){errors++;console.error('Webhook processing failed:',String(e?.message||e).replace(/Bearer\s+\S+/gi,'Bearer ***'));}
      }
    }
    console.info('ROMEU webhook processed',JSON.stringify({accepted,ignored,errors}));
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
