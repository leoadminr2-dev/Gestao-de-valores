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
