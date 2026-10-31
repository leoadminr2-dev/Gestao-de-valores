import test from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../app.mjs';

test('pagina inicial publica abre com HTML sem exigir credenciais', async () => {
  const handle=createHandler({});
  const res=await handle(new Request('https://romeu-whatsapp.onrender.com/'));
  assert.equal(res.status,200);
  assert.match(res.headers.get('content-type'),/text\/html/);
  const html=await res.text();
  assert.match(html,/<title>ROMEU — Minha Vida em Dia<\/title>/);
  assert.match(html,/Dados inseridos aqui ficam apenas no dispositivo/);
  assert.doesNotMatch(html,/META_ACCESS_TOKEN/);
});

test('webhook segue bloqueado sem configuração da Meta', async () => {
  const handle=createHandler({});
  const res=await handle(new Request('https://romeu-whatsapp.onrender.com/webhook',{method:'POST',body:'{}'}));
  assert.equal(res.status,503);
});
