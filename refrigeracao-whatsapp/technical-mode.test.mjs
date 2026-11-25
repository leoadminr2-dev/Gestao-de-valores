import test from "node:test";
import assert from "node:assert/strict";
import {createTechnicalMode,validDuration,ABSENCE_MESSAGE} from "./technical-mode.mjs";
test("duration limits and message",()=>{assert.equal(validDuration(4),true);assert.equal(validDuration(0),false);assert.equal(validDuration(13),false);assert.match(ABSENCE_MESSAGE,/atendimento técnico/);});
test("contact capture uses persistent unique key and no body",async()=>{
 const calls=[];const pool={query:async(sql,params)=>{calls.push({sql,params});return {rowCount:1,rows:[]};}};
 const mode=createTechnicalMode(pool);
 assert.equal(await mode.capture("5521999999999"),true);
 assert.match(calls.at(-1).sql,/ON CONFLICT\(run_id,phone\)/);
 assert.deepEqual(calls.at(-1).params,["5521999999999"]);
 assert.match(calls.at(-1).sql,/active_until>now/);
});
test("inactive capture does not intercept",async()=>{const pool={query:async()=>({rowCount:0,rows:[]})};assert.equal(await createTechnicalMode(pool).capture("5521999999999"),false);});

test("manual reply starts or restarts per-contact pause and clears previous claim",async()=>{
 const calls=[];const pool={query:async(sql,params)=>{calls.push({sql,params});return {rowCount:1,rows:[]};}};
 await createTechnicalMode(pool).manual("5521999999999");
 assert.match(calls.at(-1).sql,/ON CONFLICT\(run_id,phone\) DO UPDATE SET responded_at=now\(\),attempted_at=NULL/);
 assert.deepEqual(calls.at(-1).params,["5521999999999"]);
});
test("resume requires an unanswered incoming message after the last manual reply and ten minutes",async()=>{
 const calls=[];const pool={query:async(sql)=>{calls.push(sql);return {rowCount:0,rows:[]};}};
 const mode=createTechnicalMode(pool);
 await mode.drain(()=>assert.fail("unexpected send"),()=>false);
 assert.match(calls.at(-1),/q.last_at>q.responded_at AND q.responded_at<=now\(\)-interval '10 minutes'/);
 await mode.nextDue();
 assert.match(calls.at(-1),/q.responded_at\+interval '10 minutes'/);
 assert.match(calls.at(-1),/q.last_at>q.responded_at/);
});
test("manual reply cancelling a claimed message prevents sending",async()=>{
 let checked=false;let claims=0;
 const pool={query:async(sql)=>{
  if(sql.startsWith("UPDATE wa_technical_waiting w"))return ++claims===1?{rowCount:1,rows:[{run_id:"r",phone:"5521999999999",claim_token:"2026-11-25 12:00:00+00"}]}:{rowCount:0,rows:[]};
  if(sql.startsWith("SELECT run_id"))return {rows:[{active:true,run_id:"r"}]};
  if(sql.startsWith("SELECT 1 FROM wa_technical_waiting")){checked=true;return {rowCount:0,rows:[]};}
  return {rowCount:1,rows:[]};
 }};
 await createTechnicalMode(pool).drain(()=>assert.fail("cancelled claim must not send"),()=>false);
 assert.equal(checked,true);
});

import {advance,humanConversationNotice} from "./bot.mjs";
test("modo tecnico segue atendimento de venda da captura de tela",()=>{
 const a=advance({stage:"menu",mode:"bot",data:{}},{text:"https://facebook.com/marketplace/item/123",technicalMode:true});
 assert.match(a.reply,/realizando um atendimento/);
 assert.match(a.reply,/Como posso chamar/);
 const b=advance(a,{text:"Tenho uma máquina para vender",technicalMode:true});
 assert.equal(b.data.servico,"Venda de equipamento");
 assert.equal(b.stage,"nome");
 assert.doesNotMatch(b.reply,/realizando um atendimento/);
});
test("modo tecnico identifica nome e continua em vez de enviar ausencia",()=>{
 const a=advance({stage:"menu",mode:"bot",data:{}},{text:"Boa tarde",technicalMode:true});
 const b=advance(a,{text:"Maria",technicalMode:true});
 assert.equal(b.data.cliente,"Maria");
 assert.match(b.reply,/Como posso ajudar/);
 const c=advance(b,{text:"Quero vender minha máquina de lavar",technicalMode:true});
 assert.equal(c.data.servico,"Venda de equipamento");
 assert.equal(c.data.cliente,"Maria");
 assert.equal(c.stage,"bairro");
});
test("pausa manual usa instante original do evento e não reinicia em retry",async()=>{
 const calls=[];const pool={query:async(sql,params)=>{calls.push({sql,params});return {rowCount:1,rows:[]};}};
 const m=createTechnicalMode(pool);const at=new Date("2026-11-25T15:00:00Z");
 await m.manualAssist("5521999999999",at);
 assert.match(calls.at(-1).sql,/responded_at<EXCLUDED.responded_at/);
 assert.deepEqual(calls.at(-1).params,["5521999999999",at]);
 await m.paused("5521999999999");
 assert.match(calls.at(-1).sql,/interval '10 minutes'/);
});

test("Romeu não transforma adiamento em nome nem duplica a apresentação",()=>{
 const a=advance({stage:"menu",mode:"bot",data:{}},{text:"Vai reagendar, irmão",technicalMode:true});
 assert.equal(a.reply,null);
 const b=advance({stage:"menu",mode:"bot",data:{}},{text:"Boa tarde",technicalMode:true});
 assert.match(b.reply,/Romeu/);
 for(const text of ["Boa tarde","Depois","Mais tarde","Ok"]){
  const r=advance(b,{text,technicalMode:true});
  assert.equal(r.reply,null,text);
  assert.equal(r.data.cliente,undefined,text);
 }
 assert.equal(advance(b,{text:"Maria",technicalMode:true}).data.cliente,"Maria");
});
test("Romeu respeita conversa humana, aguarda dez minutos e avisa uma vez sem reiniciar",()=>{
 const at="2026-11-25T15:00:00Z",now=Date.parse(at);
 const state={stage:"aceite_orcamento",mode:"human",data:{cliente:"Maria",servico:"Instalação",valor:650}};
 const opts={active:true,runId:"r",manualAt:at};
 const msg={text:"Pode ser amanhã?"};
 assert.equal(humanConversationNotice(state,msg,{...opts,now:now+599999}).reply,null);
 const r=humanConversationNotice(state,msg,{...opts,now:now+600000});
 assert.match(r.reply,/Romeu/);
 assert.match(r.reply,/continuidade/);
 assert.equal(r.mode,"human");
 assert.equal(r.stage,state.stage);
 assert.equal(r.data.valor,650);
 assert.equal(r.order,undefined);
 assert.equal(humanConversationNotice(r,msg,{...opts,now:now+700000}).reply,null);
 assert.equal(humanConversationNotice(state,msg,{...opts,active:false,now:now+700000}).reply,null);
 assert.equal(humanConversationNotice(state,{text:"Depois"},{...opts,now:now+700000}).reply,null);
});
test("conversa humana anterior à ativação permanece humana",()=>{
 const r=humanConversationNotice({stage:"menu",mode:"human",data:{}},{text:"Qual o valor?"},{active:true,runId:"novo"});
 assert.match(r.reply,/Leonardo/);
 assert.equal(r.stage,"menu");
 assert.equal(r.mode,"human");
 assert.equal(humanConversationNotice(r,{text:"E aí?"},{active:true,runId:"novo"}).reply,null);
});
