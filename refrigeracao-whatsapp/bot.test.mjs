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
