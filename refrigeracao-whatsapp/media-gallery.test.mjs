import test from "node:test";
import assert from "node:assert/strict";
import {relevantYCloudEvent} from "./ycloud.mjs";
import {advance} from "./bot.mjs";
function e(type,link="https://api.ycloud.com/v2/whatsapp/media/download/12345?sig=x"){
 return {id:"evt_media123",type:"whatsapp.inbound_message.received",whatsappInboundMessage:{id:"msg123",from:"+5521999991111",to:"+5521970338222",type,[type]:{id:"12345",link,mime_type:type==="image"?"image/jpeg":"video/mp4"}}};
}
test("YCloud mantém somente referência de mídia do provedor",()=>{
 assert.equal(relevantYCloudEvent(e("image"),"+5521970338222").media.type,"image");
 assert.equal(relevantYCloudEvent(e("video","https://example.com/other"),"+5521970338222").media,undefined);
});
test("venda registra foto e vídeo enviados em ordem invertida",()=>{
 let x={stage:"venda_midia",mode:"bot",data:{servico:"Venda de equipamento",fotos:0,videoRecebido:false,mediaItems:[]}};
 x=advance(x,{type:"video",text:"",media:{provider:"ycloud",type:"video",id:"v1",link:"https://api.ycloud.com/v2/whatsapp/media/download/1?sig=x",mimeType:"video/mp4"}});
 assert.equal(x.stage,"venda_midia");
 x=advance(x,{type:"image",text:"",media:{provider:"ycloud",type:"image",id:"i1",link:"https://api.ycloud.com/v2/whatsapp/media/download/2?sig=x",mimeType:"image/jpeg"}});
 assert.equal(x.stage,"nome");assert.equal(x.data.mediaItems.length,2);
 assert.deepEqual(x.data.mediaItems.map(m=>m.type),["video","image"]);
});

test("simulação YCloud completa: vídeo, foto, valor pretendido e ordem com galeria",()=>{
 const business="+5521970338222";
 const make=(type,id)=>relevantYCloudEvent({
  id:"evt_realistic_"+type,
  type:"whatsapp.inbound_message.received",
  apiVersion:"v2",
  whatsappInboundMessage:{
   id:"provider_"+type,from:"+5521999991111",to:business,type,
   [type]:{
    id,
    link:"https://api.ycloud.com/v2/whatsapp/media/download/"+id+"?sig=t%3D1677228430%2Cs%3Dfake&payload=test",
    mime_type:type==="image"?"image/jpeg":"video/mp4"
   }
  }
 },business);
 let state=advance({stage:"menu",mode:"bot",data:{}},{text:"Quero vender minha geladeira"});
 assert.equal(state.stage,"venda_midia");
 const v=make("video","919306472440541");
 const i=make("image","592623615738103");
 assert.equal(v.media?.type,"video");
 assert.equal(i.media?.type,"image");
 state=advance(state,{type:v.messageType,text:v.text,media:v.media});
 assert.equal(state.stage,"venda_midia");
 state=advance(state,{type:i.messageType,text:i.text,media:i.media});
 assert.equal(state.stage,"nome");
 state=advance(state,{text:"Cliente de teste"});
 state=advance(state,{text:"Cascadura - Rio de Janeiro"});
 state=advance(state,{text:"Geladeira Brastemp 375L, não gela"});
 assert.equal(state.stage,"venda_valor");
 state=advance(state,{text:"R$ 1.200,00"});
 state=advance(state,{text:"Sim"});
 state=advance(state,{text:"Noite, retirada no local"});
 assert.equal(state.stage,"confirmar");
 state=advance(state,{text:"SIM"});
 assert.equal(state.order.valorPretendidoNumero,1200);
 assert.equal(state.order.valorNegociavel,"Sim");
 assert.equal(state.order.videoRecebido,true);
 assert.equal(state.order.fotos,1);
 assert.deepEqual(state.order.mediaItems.map(x=>x.type),["video","image"]);
 assert.ok(state.order.mediaItems.every(x=>x.provider==="ycloud"&&x.link.startsWith("https://api.ycloud.com/v2/whatsapp/media/download/")));
});
