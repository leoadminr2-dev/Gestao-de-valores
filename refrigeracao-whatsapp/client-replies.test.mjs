import test from "node:test";
import assert from "node:assert/strict";
import {customerMessage,customerPhone} from "./client-replies.mjs";
import {createCustomerReplyService} from "./client-send.mjs";

const order=()=>({
 protocol:"WA-20261104-DEADBEEF",phone:"5521991234567",
 payload:{cliente:"Cliente Teste",servico:"Limpeza de ar-condicionado",equipamento:"Split 9000 BTU"},
 operation_status:"orcamento",appointment_at:"2026-11-12T17:00:00Z",
 estimate_amount:280,admin_notes:"INTERNO: nunca mostrar ao cliente",
 updated_at:"2026-11-04T11:00:00.000Z"
});
function fakeDb({lastInbound=new Date().toISOString()}={}){
 const history=new Map();
 let calls=0;
 return {
  get calls(){return calls;},history,
  async query(sql,args=[]){
   if(sql.includes("FROM wa_orders WHERE protocol="))return {rowCount:1,rows:[order()]};
   if(sql.includes("SELECT max(created_at) AS last_inbound"))return {rows:[{last_inbound:lastInbound}]};
   if(sql.includes("INSERT INTO wa_customer_replies")){
    const k=args[0];if(history.has(k))return {rowCount:0,rows:[]};
    const id=history.size+1;history.set(k,{id,protocol:args[1],status:"sending"});
    return {rowCount:1,rows:[{id}]};
   }
   if(sql.includes("SELECT protocol,status FROM wa_customer_replies")){
    const x=history.get(args[0]);return {rows:x?[x]:[],rowCount:x?1:0};
   }
   if(sql.includes("UPDATE wa_customer_replies")){
    const x=[...history.values()].find(y=>y.id===args[0]);x.status=args[1];return {rowCount:1};
   }
   if(sql.includes("INSERT INTO wa_sessions")||sql.includes("UPDATE wa_outbound"))return {rows:[],rowCount:1};
   if(sql.includes("FROM wa_customer_replies WHERE protocol"))return {rows:[...history.values()],rowCount:history.size};
   calls++;throw Error("unexpected test query "+sql);
  }
 };
}
test("mensagem de orçamento contém valor aprovado e nunca observações internas",()=>{
 const msg=customerMessage(order(),"orcamento");
 assert.match(msg,/R\$\s*280,00/);
 assert.match(msg,/WA-20261104-DEADBEEF/);
 assert.doesNotMatch(msg,/INTERNO/);
 assert.match(msg,/responda/i);
});
test("agendamento é proposta e exige data",()=>{
 const txt=customerMessage(order(),"agendamento");
 assert.match(txt,/novembro de 2026/);
 assert.match(txt,/depende da sua confirmação/);
 assert.throws(()=>customerMessage({...order(),appointment_at:null},"agendamento"),/data_nao_informada/);
});
test("orçamento exige valor salvo",()=>{
 assert.throws(()=>customerMessage({...order(),estimate_amount:null},"orcamento"),/valor_nao_informado/);
 assert.equal(customerPhone("(21) 99123-4567"),"5521991234567");
 assert.equal(customerPhone("impossivel"),"");
});
test("preview disponibiliza YCloud apenas com mensagem recebida recentemente",async()=>{
 const recent=fakeDb();
 const available=await createCustomerReplyService(recent,{ready:true,send:async()=>""}).preview({protocol:order().protocol,kind:"orcamento"});
 assert.equal(available.eligible,true);
 assert.match(available.message,/R\$\s*280,00/);
 const expired=fakeDb({lastInbound:"2026-10-01T10:00:00Z"});
 const manual=await createCustomerReplyService(expired,{ready:true,send:async()=>""}).preview({protocol:order().protocol,kind:"retorno"});
 assert.equal(manual.eligible,false);
});
test("envio exige aprovação explícita e não duplica requisições com mesma chave",async()=>{
 let sends=0;const db=fakeDb();
 const service=createCustomerReplyService(db,{ready:true,send:async()=>{sends++;return "provider-message-01";}});
 const args={protocol:order().protocol,kind:"orcamento",requestKey:"customer-send-unique-011",expectedUpdatedAt:order().updated_at};
 const first=await service.send(args);assert.equal(first.status,"accepted");
 const second=await service.send(args);assert.equal(second.repeated,true);
 assert.equal(sends,1);
 assert.equal(db.history.get(args.requestKey).status,"accepted");
});
test("API não envia se janela de 24 horas terminou",async()=>{
 let sends=0;const db=fakeDb({lastInbound:"2026-10-01T10:00:00Z"});
 const service=createCustomerReplyService(db,{ready:true,send:async()=>{sends++;}});
 await assert.rejects(()=>service.send({protocol:order().protocol,kind:"retorno",requestKey:"customer-send-unique-011",expectedUpdatedAt:order().updated_at}),/janela_de_atendimento_encerrada/);
 assert.equal(sends,0);
});
