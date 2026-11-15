import { test } from "node:test";
import assert from "node:assert/strict";
import { isCommercialIntent, isProtectedPhone, shouldHandleMessage, shouldPauseForManualReply, isExplicitCommercialRequest } from "./selective.mjs";

for (const word of [
  "refrigeração", "Geladeira", "freezer", "ar-condicionado",
  "ar-condicionado de janela", "split", "máquina de lavar",
  "manutenção", "orçamento", "instalação", "limpeza profunda"
]) {
  test("palavra-chave comercial: " + word, () => assert.equal(isCommercialIntent(word), true));
}

for (const [message, expected] of [
  ["Quero instalar um ar-condicionado split", true],
  ["Geladeira?", true],
  ["Orçamento!", true],
  ["Ar-condicionado?", true],
  ["Quanto cobra para limpar meu ar-condicionado?", true],
  ["Boa tarde, quanto vc me cobra para lavar um ar de janela + um split?", true],
  ["Quanto vc me cobra por um split?", true],
  ["Quanto custa uma lavagem de ar de janela?", true],
  ["Você lavou a louça?", false],
  ["Minha geladeira não está gelando", true],
  ["Preciso de orçamento para manutenção", true],
  ["Quero um contrato de manutenção para minha empresa", true],
  ["Quanto custa higienização?", true],
  ["Boa tarde, Leonardo!", false],
  ["Tatiana, já cheguei em casa", false],
  ["Minha geladeira está cheia de comida", false],
  ["Ontem comprei uma geladeira bonita", false],
  ["Você vai ao churrasco?", false],
  ["Preciso trocar o pneu do carro", false],
  ["Quanto custa a manutenção do meu carro?", false],
  ["MENU", false],
  ["2", false]
]) {
  test("classificação da mensagem: " + message, () => assert.equal(isCommercialIntent(message), expected));
}

test("proteção de telefone só faz correspondência exata", () => {
  assert.equal(isProtectedPhone("+5521981112222", "+55 21 98111-2222; 5521970000000"), true);
  assert.equal(isProtectedPhone("552198111222", "5521981112222"), false);
});

const now = Date.parse("2026-11-04T16:00:00.000Z");
const commercialSession = {
  stage: "nome", mode: "bot", data: {commercialActivated: true},
  last_message_at: "2026-11-04T15:30:00.000Z"
};
test("primeiro olá de contato desconhecido não ativa", () => {
  assert.equal(shouldHandleMessage({phone:"5521988887777",text:"Oi",now}), false);
});
test("primeiro pedido comercial ativa", () => {
  assert.equal(shouldHandleMessage({phone:"5521988887777",text:"conserto",now}), true);
});
test("contato protegido nunca ativa mesmo falando sobre orçamento", () => {
  assert.equal(shouldHandleMessage({
    phone:"5521988887777",text:"Orçamento de geladeira",protectedPhones:"5521988887777",now
  }), false);
});
test("somente foto não ativa, sem intenção prévia", () => {
  assert.equal(shouldHandleMessage({phone:"5521988887777",messageType:"image",now}), false);
});
test("foto e cumprimento são aceitos depois da ativação comercial recente", () => {
  assert.equal(shouldHandleMessage({phone:"5521988887777",messageType:"image",session:commercialSession,now}), true);
  assert.equal(shouldHandleMessage({phone:"5521988887777",text:"Obrigado",session:commercialSession,now}), true);
});
test("conversa não fica ativada para sempre", () => {
  assert.equal(shouldHandleMessage({
    phone:"5521988887777",text:"Olá",
    session:{...commercialSession,last_message_at:"2026-11-02T15:30:00.000Z"},now
  }), false);
});
test("atendimento humano bloqueia o bot; MENU retoma só conversa comercial", () => {
  const human={...commercialSession,mode:"human"};
  assert.equal(shouldHandleMessage({phone:"5521988887777",text:"Oi",session:human,now}),false);
  assert.equal(shouldHandleMessage({phone:"5521988887777",text:"MENU",session:human,now}),true);
  assert.equal(shouldHandleMessage({
    phone:"5521988887777",text:"MENU",
    session:{...human,data:{}},now
  }),false);
});

test("mensagem manual pessoal não aciona o robô", () => {
  assert.equal(shouldPauseForManualReply(null,now),false);
  assert.equal(shouldPauseForManualReply({mode:"human",data:{},last_message_at:commercialSession.last_message_at},now),false);
  assert.equal(shouldPauseForManualReply({mode:"bot",data:{},last_message_at:commercialSession.last_message_at},now),false);
  assert.equal(shouldPauseForManualReply(commercialSession,now),true);
  assert.equal(shouldPauseForManualReply({...commercialSession,last_message_at:"2026-11-02T15:30:00.000Z"},now),false);
  assert.equal(shouldPauseForManualReply({...commercialSession,mode:"human"},now),false);
});
test("contato pessoal marcado human anteriormente aceita um novo pedido comercial", () => {
  const legacy={mode:"human",stage:"menu",data:{},last_message_at:commercialSession.last_message_at};
  assert.equal(shouldHandleMessage({phone:"5521988887777",text:"Oi",session:legacy,now}),false);
  assert.equal(shouldHandleMessage({phone:"5521988887777",text:"Quero vender minha geladeira",session:legacy,now}),true);
  assert.equal(shouldHandleMessage({phone:"5521988887777",text:"MENU",session:legacy,now}),false);
});

test("conversa pessoal antiga não aciona com palavras comerciais isoladas",()=>{
 assert.equal(isExplicitCommercialRequest("Geladeira?"),false);
 assert.equal(isExplicitCommercialRequest("Minha geladeira não gela"),false);
 assert.equal(isExplicitCommercialRequest("Vou vender a geladeira para meu primo"),false);
 assert.equal(isExplicitCommercialRequest("Quero vender minha geladeira"),true);
 assert.equal(isExplicitCommercialRequest("Quanto custa consertar meu freezer?"),true);
 const privateSession={mode:"human",stage:"menu",data:{},last_message_at:commercialSession.last_message_at};
 assert.equal(shouldHandleMessage({phone:"5521988887777",text:"Minha geladeira não gela",session:privateSession,now}),false);
 assert.equal(shouldHandleMessage({phone:"5521988887777",text:"Quero vender minha geladeira",session:privateSession,now}),true);
});
