import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createHandler,audioCommand,parse,reply} from '../app.mjs';
const env={AUTHORIZED_NUMBERS:'5511999999999',META_PHONE_NUMBER_ID:'123',META_APP_SECRET:'test-secret',META_VERIFY_TOKEN:'test',META_ACCESS_TOKEN:'test',DATABASE_URL:'test',OUTBOUND_ENABLED:'true'};
const request=(from='5511999999999',phone='123')=>{
 const body=JSON.stringify({object:'whatsapp_business_account',entry:[{changes:[{value:{metadata:{phone_number_id:phone},messages:[{id:'wamid.audio.test',from,type:'audio',audio:{id:'456'}}]}}]}]});
 return new Request('http://localhost/webhook',{method:'POST',body,headers:{'x-hub-signature-256':'sha256='+crypto.createHmac('sha256',env.META_APP_SECRET).update(body).digest('hex')}});
};
test('Romeu understands its name and protects audio mutations',()=>{
 assert.equal(parse('Como posso chamar você?').action,'identity');
 assert.equal(audioCommand('Recebi 120 de cliente').action,'audioConfirm');
 assert.equal(audioCommand('Resumo').action,'summary');
 assert.match(reply(audioCommand('Recebi 120 de cliente')),/Ainda não salvei/);
});
test('signed authorized audio reaches transcription and returns text',async()=>{
 let calls=0;let sent='';
 const handle=createHandler(env,{store:{process:async({cmd})=>{assert.equal(cmd.action,'identity');return {data:{}}},markSent:async()=>{}},transcribe:async(_env,id)=>{calls++;assert.equal(id,'456');return 'Como posso chamar você?'},send:async(_env,_to,body)=>{sent=body}});
 const r=await handle(request());assert.equal(r.status,200);assert.equal(calls,1);assert.match(sent,/Pode me chamar de Romeu/);
 await handle(request('5511888888888'));await handle(request('5511999999999','999'));assert.equal(calls,1);
});
test('transcription failure is explicit and does not create a record',async()=>{
 const handle=createHandler(env,{store:{process:async({cmd})=>{assert.equal(cmd.action,'audioError');return {data:{}}},markSent:async()=>{}},transcribe:async()=>{throw Error('test')},send:async(_env,_to,body)=>assert.match(body,/Não consegui transcrever/)});
 assert.equal((await handle(request())).status,200);
});
