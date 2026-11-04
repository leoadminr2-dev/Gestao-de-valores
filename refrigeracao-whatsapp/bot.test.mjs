import {test} from "node:test";
import assert from "node:assert/strict";
import {advance,price} from "./bot.mjs";
const empty={stage:"menu",mode:"bot",data:{}};
test("boas-vindas não anunciam preços",()=>{const r=advance(empty,{text:"olá"});assert.match(r.reply,/Como podemos ajudar/);assert.doesNotMatch(r.reply,/R\$\s*\d/);});
test("consultas explícitas mostram somente valores iniciais",()=>{assert.match(price("preço limpeza"),/R\$ 280/);assert.match(price("troca compressor"),/R\$ 550/);});
test("solicitação exige consentimento",()=>{
 let r=advance(empty,{text:"1"});assert.equal(r.stage,"ar_escolha");
 r=advance(r,{text:"1"});assert.equal(r.stage,"nome");
 r=advance(r,{text:"Ana Souza"});r=advance(r,{text:"Irajá"});r=advance(r,{text:"Split LG 9000"});r=advance(r,{text:"Quinta de manhã"});
 assert.equal(r.stage,"confirmar");assert.equal(r.order,undefined);
 r=advance(r,{text:"SIM"});assert.equal(r.order.cliente,"Ana Souza");
});
test("humano impede respostas até MENU",()=>{let r=advance(empty,{text:"5"});assert.equal(r.mode,"human");r=advance(r,{text:"ajuda"});assert.equal(r.reply,null);r=advance(r,{text:"menu"});assert.equal(r.mode,"bot");});
test("cancelamento não cria OS",()=>{const r=advance({stage:"confirmar",mode:"bot",data:{}},{text:"cancelar"});assert.equal(r.order,undefined);});

import {appReplyPhones} from "./coexistence.mjs";
test("ecos do WhatsApp Business transferem para humano apenas no número correto",()=>{
 const echo={field:"smb_message_echoes",value:{metadata:{phone_number_id:"12345"},message_echoes:[{from:"5521970338222",to:"5521999999999",type:"text",text:{body:"Eu respondo."}}]}};
 assert.deepEqual(appReplyPhones(echo,"12345"),["5521999999999"]);
 assert.deepEqual(appReplyPhones(echo,"99999"),[]);
 assert.deepEqual(appReplyPhones({...echo,field:"messages"},"12345"),[]);
});

import crypto from "node:crypto";
import {verifyYCloudSignature,relevantYCloudEvent} from "./ycloud.mjs";
test("YCloud webhook assinatura sobre corpo bruto e timestamp válido",()=>{
 const raw=Buffer.from('{"id":"evt_test001","type":"ignored"}');
 const time=1730745000;
 const secret="whsec_unit_test_only";
 const mac=crypto.createHmac("sha256",secret).update(String(time)+".").update(raw).digest("hex");
 assert.equal(verifyYCloudSignature(raw,"t="+time+",s="+mac,secret,time*1000),true);
 assert.equal(verifyYCloudSignature(Buffer.from("modified"),"t="+time+",s="+mac,secret,time*1000),false);
 assert.equal(verifyYCloudSignature(raw,"t="+time+",s="+mac,secret,(time+20000)*1000),false);
});
test("YCloud recebe apenas mensagem do nosso número e ignora grupos",()=>{
 const evt={id:"evt_inbound_123",type:"whatsapp.inbound_message.received",whatsappInboundMessage:{id:"message_1",from:"+5521988887777",to:"+5521970338222",type:"text",text:{body:"Preciso de limpeza"}}};
 const e=relevantYCloudEvent(evt,"+5521970338222");
 assert.equal(e.kind,"incoming");assert.equal(e.phone,"5521988887777");
 assert.equal(relevantYCloudEvent(evt,"+5521999999999"),null);
 assert.equal(relevantYCloudEvent({...evt,whatsappInboundMessage:{...evt.whatsappInboundMessage,groupId:"group"}}, "+5521970338222"),null);
});
test("YCloud eco do WhatsApp Business suspende robô do destinatário",()=>{
 const evt={id:"evt_echo_123",type:"whatsapp.smb.message.echoes",whatsappMessage:{from:"+5521970338222",to:"+5521988887777",type:"text",text:{body:"Eu resolvo"}}};
 const e=relevantYCloudEvent(evt,"+5521970338222");
 assert.deepEqual({kind:e.kind,phone:e.phone},{kind:"manual_reply",phone:"5521988887777"});
 assert.equal(relevantYCloudEvent({...evt,type:"whatsapp.message.updated"},"+5521970338222"),null);
});

test("menu curto e espaçado apresenta cinco categorias sem preços e sem Ler mais desnecessário",()=>{
 const r=advance(empty,{text:"Olá"});
 for(const label of ["Ar-condicionado","Geladeiras, freezers e lavadoras","Empresas e contratos","Agendamento e acompanhamento","Falar com Leonardo"])
   assert.match(r.reply,new RegExp(label));
 for(let n=1;n<=5;n++)assert.match(r.reply,new RegExp(n+"️⃣"));
 assert.doesNotMatch(r.reply,/6️⃣|7️⃣|8️⃣|9️⃣/);
 assert.doesNotMatch(r.reply,/R\$\s*\d/);
 assert.ok(r.reply.length<650);
 assert.match(r.reply,/limpeza\n\n2️⃣/);
});
test("cliente pode abrir a plataforma diretamente pelo WhatsApp",()=>{
 const r=advance(empty,{text:"qual é o link da plataforma?"});
 assert.match(r.reply,/https:\/\//);
 assert.match(r.reply,/protocolo/);
 assert.equal(r.stage,"menu");
});
test("categorias abrem submenus antes de pedir dados",()=>{
 assert.equal(advance(empty,{text:"1"}).stage,"ar_escolha");
 assert.equal(advance(empty,{text:"2"}).stage,"eletro_escolha");
 assert.equal(advance(empty,{text:"3"}).stage,"empresa_escolha");
 assert.equal(advance(empty,{text:"4"}).stage,"agenda_escolha");
 assert.equal(advance(empty,{text:"5"}).mode,"human");
});
test("atendimento de ar-condicionado mantém instalação, manutenção e limpeza",()=>{
 const a=advance(empty,{text:"1"});
 assert.equal(advance(a,{text:"1"}).data.servico,"Instalação de ar-condicionado");
 assert.equal(advance(a,{text:"2"}).data.servico,"Manutenção e consertos");
 assert.equal(advance(a,{text:"3"}).data.servico,"Limpeza profunda e higienização");
});
test("geladeiras e lavadoras mantêm consertos e compra e venda",()=>{
 const a=advance(empty,{text:"2"});
 assert.equal(advance(a,{text:"1"}).data.servico,"Manutenção e consertos");
 assert.equal(advance(a,{text:"2"}).data.servico,"Compra de equipamento");
 assert.equal(advance(a,{text:"3"}).data.servico,"Venda de equipamento");
 assert.equal(advance(empty,{text:"Minha máquina de lavar não centrifuga"}).data.servico,"Manutenção e consertos");
 assert.equal(advance(empty,{text:"Minha geladeira não gela"}).stage,"nome");
});
test("residencial ainda funciona por linguagem natural",()=>{
 const a=advance(empty,{text:"atendimento residencial"});
 assert.equal(a.stage,"residencial");
 const b=advance(a,{text:"1"});
 assert.equal(b.data.tipoAtendimento,"Residencial");
 assert.equal(b.data.servico,"Instalação de ar-condicionado");
});
test("empresas coletam nome e informações do contrato",()=>{
 let r=advance(empty,{text:"3"});
 assert.equal(r.stage,"empresa_escolha");
 r=advance(r,{text:"3"});
 assert.equal(r.stage,"empresa");
 assert.equal(r.data.servico,"Contrato de manutenção e limpeza");
 r=advance(r,{text:"Mercado Exemplo"});
 assert.equal(r.data.empresa,"Mercado Exemplo");
 assert.equal(r.stage,"nome");
});
test("acompanhar protocolo não informa status sem conferência",()=>{
 let r=advance(empty,{text:"4"});
 assert.equal(r.stage,"agenda_escolha");
 r=advance(r,{text:"2"});
 assert.equal(r.stage,"protocolo");
 r=advance(r,{text:"WA-20261104-ABCD1234"});
 assert.equal(r.mode,"human");
 assert.match(r.reply,/verificará/);
});
test("agendamento envia plataforma sem prometer data confirmada",()=>{
 let r=advance(empty,{text:"4"});
 r=advance(r,{text:"1"});
 assert.match(r.reply,/wix-site-host\.com/);
 assert.match(r.reply,/confirmará/);
 assert.equal(r.stage,"menu");
});
test("cliente pode voltar ao menu principal",()=>{
 const a=advance(empty,{text:"1"});
 const b=advance(a,{text:"0"});
 assert.equal(b.stage,"menu");
 assert.match(b.reply,/Como podemos ajudar hoje/);
});
test("compra e venda anterior continua acessível",()=>{
 let r=advance(empty,{text:"7"});
 assert.equal(r.stage,"mercado");
 r=advance(r,{text:"2"});
 assert.equal(r.data.servico,"Venda de equipamento");
});
test("urgência elétrica instrui segurança e transfere ao humano",()=>{
 const r=advance(empty,{text:"Saiu fumaça e cheiro de queimado"});
 assert.equal(r.mode,"human");
 assert.match(r.reply,/segurança/);
});

test("pedido textual de contrato tem prioridade sobre limpeza genérica",()=>{
 const r=advance(empty,{text:"Quero um contrato de manutenção e limpeza para empresa"});
 assert.equal(r.stage,"empresa");
 assert.equal(r.data.servico,"Contrato de manutenção e limpeza");
});
test("atendimento empresarial escrito usa menu especializado",()=>{
 const r=advance(empty,{text:"Preciso de manutenção na minha empresa"});
 assert.equal(r.stage,"empresa_escolha");
 assert.equal(r.data.tipoAtendimento,"Empresarial");
});
test("enquanto a transferência humana está pendente o robô não faz novas perguntas",()=>{
 const r=advance({stage:"menu",mode:"bot",data:{handoffPending:true}},{text:"alô"});
 assert.equal(r.reply,null);
 const reset=advance({stage:"menu",mode:"bot",data:{handoffPending:true}},{text:"MENU"});
 assert.equal(reset.mode,"bot");
 assert.match(reset.reply,/Como podemos ajudar/);
});
