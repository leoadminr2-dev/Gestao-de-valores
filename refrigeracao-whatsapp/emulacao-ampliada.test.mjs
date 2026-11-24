import {test} from "node:test";
import assert from "node:assert/strict";
import {advance} from "./bot.mjs";
import {isCommercialIntent,shouldHandleMessage} from "./selective.mjs";

// Emulacao 100% local: NAO envia WhatsApp, NAO cria OS ou eventos externos.
const fresh=()=>({stage:"menu",mode:"bot",data:{}});
const send=(session,text,extra={})=>advance(session,{text,...extra});
const request=(text)=>send(fresh(),text,{receivedAt:"2026-11-23T22:00:00Z"});

const classification=[
  ["Minha geladeira não está gelando","Manutenção e consertos"],
  ["Meu freezer congelando demais","Manutenção e consertos"],
  ["O frigobar está fazendo barulho","Manutenção e consertos"],
  ["Minha cervejeira não refrigera","Manutenção e consertos"],
  ["O bebedouro não sai água","Manutenção e consertos"],
  ["Tenho um expositor com erro E4","Manutenção e consertos"],
  ["Minha lava e seca está vazando","Manutenção e consertos"],
  ["A máquina de lavar não centrifuga","Manutenção e consertos"],
  ["O compressor não liga na geladeira","Manutenção e consertos"],
  ["A cervejeira está com tubo de sucção congelando","Manutenção e consertos"],
  ["Preciso de reoperação na cervejeira","Manutenção e consertos"],
  ["Troca de compressor na geladeira","Manutenção e consertos"],
  ["Preciso fazer carga de gás do freezer","Manutenção e consertos"],
  ["A geladeira em cima não gela","Manutenção e consertos"],
  ["Ar de janela só ventila","Manutenção e consertos"],
  ["O ar-condicionado está pingando água","Manutenção e consertos"],
  ["O disjuntor desarma na máquina de lavar","Manutenção e consertos"],
  ["Quero higienizar um bebedouro","Limpeza profunda e higienização"],
  ["Preciso de limpeza de cervejeira","Limpeza profunda e higienização"],
  ["Limpeza da câmara fria","Limpeza profunda e higienização"],
  ["Limpeza profunda da geladeira","Limpeza profunda e higienização"],
  ["Limpeza do ar-condicionado split","Limpeza profunda e higienização"],
  ["Higienizar ar de janela","Limpeza profunda e higienização"],
  ["Quero instalar um split 12 mil BTUs","Instalação de ar-condicionado"],
  ["Instalação de ar-condicionado de janela","Instalação de ar-condicionado"],
  ["Preciso instalar ventilador de teto","Instalação de ventilador de teto"],
  ["Preciso puxar 220 do quadro até o split","Instalação elétrica para ar-condicionado"],
  ["Preciso fazer parte elétrica do split","Instalação elétrica para ar-condicionado"],
  ["Vocês compram uma geladeira usada?","Venda de equipamento"],
  ["Quero vender minha máquina de lavar","Venda de equipamento"],
  ["Vocês vendem geladeiras?","Compra de equipamento"],
  ["Gostaria de comprar um freezer","Compra de equipamento"],
];
test("matriz ampla: identificar o serviço correto sem presumir tipo de aparelho",()=>{
  for(const [text,expected] of classification){
    const r=request(text);
    assert.equal(r.data.servico,expected,text+" -> "+r.stage);
    assert.match(r.reply,/assistente virtual da Leonardo Moreira Refrigeração/,text);
    assert.doesNotMatch(r.reply,/solicitação recebida!|visita agendada/i,text);
  }
});

test("ativação comercial: cervejeira, freezer, bebedouro, compra, elétrica, linha branca",()=>{
  const cases=[
    "Minha cervejeira não refrigera",
    "Preciso de limpeza de câmara fria",
    "Quero vender minha lava e seca",
    "Vocês vendem geladeiras?",
    "Preciso puxar 220 para instalar um split",
    "Bebedouro não sai água",
    "Compressor não liga na geladeira"
  ];
  for(const text of cases)assert.equal(isCommercialIntent(text),true,text);
  for(const personal of ["Oi","Boa tarde","Quero consertar meu carro","Família, cheguei"])
    assert.equal(isCommercialIntent(personal),false,personal);
});

test("conversa de manutenção preserva bairro espontâneo e não o interpreta como nome",()=>{
  let r=request("Preciso de manutenção na geladeira");
  assert.equal(r.stage,"nome");
  r=send(r,"Irajá");
  assert.equal(r.stage,"nome");
  assert.equal(r.data.cliente,undefined);
  assert.equal(r.data.bairro,"Irajá");
  r=send(r,"Carlos");
  assert.equal(r.data.cliente,"Carlos");
  assert.equal(r.stage,"necessidade");
  assert.doesNotMatch(r.reply,/R\$\s*\d/);
});

test("higienização de cervejeira nunca pede para escolher split ou janela",()=>{
  let r=request("Quero limpeza de cervejeira");
  r=send(r,"Ana");
  r=send(r,"Irajá");
  r=send(r,"É uma cervejeira de 400 litros");
  assert.equal(r.stage,"aceite_orcamento");
  assert.equal(r.data.avaliacaoPendente,true);
  assert.doesNotMatch(r.reply,/split ou de janela/i);
  assert.doesNotMatch(r.reply,/R\$ 280,00/);
});

test("instalação de ventilador não herda tarifa nem descrição de instalação split",()=>{
  let r=request("Preciso instalar ventilador de teto");
  assert.equal(r.data.servico,"Instalação de ventilador de teto");
  r=send(r,"Marina");
  r=send(r,"Penha");
  assert.match(r.reply,/Quantos ventiladores/i);
  r=send(r,"Dois ventiladores no apartamento");
  assert.equal(r.stage,"aceite_orcamento");
  assert.equal(r.data.avaliacaoPendente,true);
  assert.doesNotMatch(r.reply,/650,00|split ou de janela/i);
});

test("ponto elétrico 220 V é tratado separado da instalação de split",()=>{
  let r=request("Preciso puxar 220 do quadro até o split");
  assert.equal(r.data.servico,"Instalação elétrica para ar-condicionado");
  r=send(r,"José");
  r=send(r,"Quintino");
  assert.match(r.reply,/220 V|circuito/i);
  r=send(r,"Precisa de circuito novo do quadro");
  assert.equal(r.data.avaliacaoPendente,true);
  assert.doesNotMatch(r.reply,/R\$ 650,00/);
});

test("informações fiscais e pagamento vão a humano sem promessas falsas",()=>{
  for(const inquiry of [
    "Vocês emitem nota fiscal?",
    "Qual a garantia do serviço?",
    "Aceita cartão e divide em 3x?",
    "Dá desconto e tem nota fiscal?"
  ]){
    const r=request(inquiry);
    assert.equal(r.mode,"human",inquiry);
    assert.match(r.reply,/Leonardo/);
    assert.doesNotMatch(r.reply,/confirmad[oa]|garantimos|emitimos nota fiscal|parcelamos em/i);
  }
});

test("urgências com gás, incêndio ou eletricidade priorizam segurança e humano",()=>{
  for(const symptom of [
    "Está com cheiro forte de gás no freezer",
    "Vazamento de gás na geladeira",
    "Saiu fumaça do ar-condicionado",
    "Levei choque elétrico na máquina de lavar",
    "Cheiro de queimado na tomada do ar"
  ]){
    const r=request(symptom);
    assert.equal(r.mode,"human",symptom);
    assert.match(r.reply,/segurança/i);
    assert.doesNotMatch(r.reply,/R\$\s*\d/);
  }
});

test("áudio encaminha ao técnico quando não há transcrição confiável",()=>{
  let r=request("Quero consertar uma geladeira");
  r=advance(r,{type:"audio",text:""});
  assert.equal(r.mode,"human");
  assert.match(r.reply,/áudio/);
  assert.match(r.reply,/Leonardo/);
});

test("foto recebida durante identificação preserva pergunta, sem avançar etapa",()=>{
  let r=request("Preciso instalar um split");
  assert.equal(r.stage,"nome");
  r=advance(r,{type:"image",text:""});
  assert.equal(r.stage,"nome");
  assert.match(r.reply,/Foto recebido|Foto recebida/);
  assert.match(r.reply,/Como posso chamar você/);
});

test("pergunta de preço com escopo incompleto não apresenta preço final inventado",()=>{
  for(const requestText of [
    "Quanto custa limpar uma cervejeira?",
    "Qual o valor para trocar compressor de um freezer?",
    "Quanto fica instalar um ar na fachada do quinto andar?"
  ]){
    const r=request(requestText);
    assert.equal(r.order,undefined);
    assert.doesNotMatch(r.reply,/preço final confirmado|R\$ 900,00/);
  }
});

test("compra e venda não são invertidas: empresa compra do cliente e vende ao cliente",()=>{
  const buy=request("Vocês vendem freezer?");
  assert.equal(buy.data.servico,"Compra de equipamento");
  const sell=request("Vocês compram freezer?");
  assert.equal(sell.data.servico,"Venda de equipamento");
});

test("transferência para o técnico silencia respostas automáticas até MENU",()=>{
  const r=request("Quero falar com Leonardo");
  assert.equal(r.mode,"human");
  assert.equal(send(r,"Preciso de ajuda").reply,null);
  assert.equal(send(r,"MENU").mode,"bot");
});

test("registro exige consentimento explícito, não confunde curiosidade com pedido",()=>{
  let r=request("Preciso instalar um split");
  r=send(r,"André");
  r=send(r,"Irajá");
  r=send(r,"Split 9 mil BTUs com acesso fácil");
  assert.equal(r.stage,"aceite_orcamento");
  assert.equal(r.order,undefined);
  const no=send(r,"Não");
  assert.equal(no.order,undefined);
  const yes=send(r,"SIM");
  assert.equal(yes.stage,"endereco_final");
  assert.equal(yes.order,undefined);
});

test("repetições da saudação não ocorrem em cada mensagem",()=>{
  let r=request("Quero instalar ar-condicionado");
  assert.match(r.reply,/^Boa noite!/);
  r=send(r,"Cláudia");
  assert.doesNotMatch(r.reply,/^Bom dia!|^Boa tarde!|^Boa noite!/);
  r=send(r,"Irajá");
  assert.doesNotMatch(r.reply,/^Bom dia!|^Boa tarde!|^Boa noite!/);
});

test("sessão comercial ativa aceita mídia, enquanto conversa particular não é interceptada",()=>{
  const phone="5521987614321",now=Date.now(),last=new Date(now-60000).toISOString();
  const sess={stage:"nome",mode:"bot",data:{commercialActivated:true},last_message_at:last};
  assert.equal(shouldHandleMessage({phone,messageType:"image",session:sess,now}),true);
  assert.equal(shouldHandleMessage({phone,messageType:"audio",session:sess,now}),true);
  assert.equal(shouldHandleMessage({phone,messageType:"text",text:"Olá",session:null,now}),false);
});

test("resposta livre e menu não criam ordem de serviço",()=>{
  const a=request("Quero orçamento de instalação");
  assert.equal(a.order,undefined);
  const b=send(a,"MENU");
  assert.equal(b.stage,"menu");
  assert.equal(b.order,undefined);
  const c=send(b,"Cancelar");
  assert.equal(c.order,undefined);
});
