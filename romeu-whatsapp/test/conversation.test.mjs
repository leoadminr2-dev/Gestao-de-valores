import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {conversationalReply,parse,audioCommand,createHandler} from '../app.mjs';
const env={AUTHORIZED_NUMBERS:'5511999999999',META_PHONE_NUMBER_ID:'123',META_APP_SECRET:'test-secret',META_VERIFY_TOKEN:'test',META_ACCESS_TOKEN:'test',DATABASE_URL:'test',OUTBOUND_ENABLED:'true',GROQ_API_KEY:'mock-key',ROMEU_AI_ENABLED:'true'};
const request=(body,from='5511999999999')=>{
 const payload=JSON.stringify({object:'whatsapp_business_account',entry:[{changes:[{value:{metadata:{phone_number_id:'123'},messages:[{id:'wamid.ai.test',from,type:'text',text:{body}}]}}]}]});
 return new Request('http://localhost/webhook',{method:'POST',body:payload,headers:{'x-hub-signature-256':'sha256='+crypto.createHmac('sha256',env.META_APP_SECRET).update(payload).digest('hex')}});
};
test('explicit learning and audio confirmation',()=>{
 assert.deepEqual(parse('Romeu, memorize que janela custa R$ 280'),{action:'learn',content:'janela custa R$ 280'});
 assert.equal(audioCommand('memorize que janela custa R$ 280').action,'audioConfirm');
});
test('provider disabled without opt-in and secret never enters prompt',async()=>{
 assert.equal(await conversationalReply({...env,ROMEU_AI_ENABLED:'false'},'oi',{},()=>{throw Error('must not call')}),null);
 const answer=await conversationalReply(env,'qual o preço?',{memories:['janela R$280']},async(url,options)=>{
  assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(options.headers.authorization,'Bearer mock-key');
  assert.ok(!options.body.includes('mock-key'));assert.ok(options.body.includes('janela R$280'));
  return new Response(JSON.stringify({choices:[{message:{content:'R$ 280'}}]}),{status:200});
 });
 assert.equal(answer,'R$ 280');
});
test('authorized natural language consults memory and AI; other sender ignored',async()=>{
 let calls=0;let sent='';
 const handler=createHandler(env,{store:{process:async()=>({data:{}}),context:async()=>({memories:['janela R$280']}),rememberTurn:async()=>{},markSent:async()=>{}},think:async(_env,input,context)=>{calls++;assert.equal(input,'Qual é o preço da limpeza?');assert.deepEqual(context.memories,['janela R$280']);return 'R$ 280';},send:async(_env,_to,body)=>{sent=body}});
 assert.equal((await handler(request('Qual é o preço da limpeza?'))).status,200);
 assert.equal(sent,'R$ 280');await handler(request('Qual é o preço da limpeza?','5511888888888'));assert.equal(calls,1);
});
test('explicit memory saved before confirmation',async()=>{
 let saved=false;
 const handler=createHandler(env,{store:{process:async()=>({data:{}}),remember:async(_from,_id,content)=>{assert.equal(content,'janela R$280');saved=true;},markSent:async()=>{}},send:async(_env,_to,body)=>{assert.ok(saved);assert.match(body,/guardada na memória/);}});
 assert.equal((await handler(request('memorize janela R$280'))).status,200);
});
