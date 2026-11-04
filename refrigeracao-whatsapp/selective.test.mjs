import { test } from "node:test";
import assert from "node:assert/strict";
import { isCommercialIntent, isProtectedPhone, shouldHandleMessage } from "./selective.mjs";

for (const word of [
  "refrigeração", "Geladeira", "freezer", "ar-condicionado",
  "ar-condicionado de janela", "split", "máquina de lavar",
  "manutenção", "orçamento", "instalação", "limpeza profunda"
]) {
  test("palavra-chave comercial: " + word, () => assert.equal(isCommercialIntent(word), true));
}

for (const [message, expected] of [
  ["Quero instalar um ar-condicionado split", true],
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
