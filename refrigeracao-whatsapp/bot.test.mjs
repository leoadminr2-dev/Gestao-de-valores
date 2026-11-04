import {test} from "node:test";
import assert from "node:assert/strict";
import {advance,price} from "./bot.mjs";
const empty={stage:"menu",mode:"bot",data:{}};
test("boas-vindas não anunciam preços",()=>{const r=advance(empty,{text:"olá"});assert.match(r.reply,/Como posso ajudar/);assert.doesNotMatch(r.reply,/R\$\s*\d/);});
test("consultas explícitas mostram somente valores iniciais",()=>{assert.match(price("preço limpeza"),/R\$ 280/);assert.match(price("troca compressor"),/R\$ 550/);});
test("solicitação exige consentimento",()=>{
 let r=advance(empty,{text:"1"});assert.equal(r.stage,"nome");
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
