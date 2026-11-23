import {test} from "node:test";
import assert from "node:assert/strict";
import {advance,price,closingMessage} from "./bot.mjs";
const empty={stage:"menu",mode:"bot",data:{}};
test("boas-vindas não anunciam preços",()=>{const r=advance(empty,{text:"olá"});assert.match(r.reply,/atendimento automático/);assert.doesNotMatch(r.reply,/R\$\s*\d/);});
test("consultas explícitas mostram somente valores iniciais",()=>{assert.match(price("preço limpeza"),/R\$ 280/);assert.match(price("troca compressor"),/R\$ 550/);});
test("solicitação exige consentimento",()=>{
 let r=advance(empty,{text:"1"});assert.equal(r.stage,"ar_escolha");
 r=advance(r,{text:"1"});assert.equal(r.stage,"nome");
 r=advance(r,{text:"Ana Souza"});r=advance(r,{text:"Rua Exemplo, 10, Irajá, Rio"});r=advance(r,{text:"Split LG 9000"});
 assert.equal(r.stage,"aceite_orcamento");assert.doesNotMatch(r.reply,/Ana Souza|Rua Exemplo/);
 r=advance(r,{text:"SIM"});assert.equal(r.stage,"revisao_guiada");assert.equal(r.order,undefined);assert.doesNotMatch(r.reply,/650,00/);
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

test("menu curto e espaçado apresenta cinco categorias sem preços e sem Ler mais desnecessário",()=>{
 const r=advance(empty,{text:"menu"});
 for(const label of ["Ar-condicionado","Geladeiras, freezers e lavadoras","Empresas e contratos","Agendamento e acompanhamento","Falar com Leonardo"])
   assert.match(r.reply,new RegExp(label));
 for(let n=1;n<=5;n++)assert.match(r.reply,new RegExp(n+"️⃣"));
 assert.doesNotMatch(r.reply,/6️⃣|7️⃣|8️⃣|9️⃣/);
 assert.doesNotMatch(r.reply,/R\$\s*\d/);
 assert.ok(r.reply.length<650);
 assert.match(r.reply,/limpeza\n\n2️⃣/);
});
test("cliente pode abrir a plataforma diretamente pelo WhatsApp",()=>{
 const r=advance(empty,{text:"qual é o link da plataforma?"});
 assert.match(r.reply,/https:\/\//);
 assert.match(r.reply,/protocolo/);
 assert.equal(r.stage,"menu");
});
test("categorias abrem submenus antes de pedir dados",()=>{
 assert.equal(advance(empty,{text:"1"}).stage,"ar_escolha");
 assert.equal(advance(empty,{text:"2"}).stage,"eletro_escolha");
 assert.equal(advance(empty,{text:"3"}).stage,"empresa_escolha");
 assert.equal(advance(empty,{text:"4"}).stage,"agenda_escolha");
 assert.equal(advance(empty,{text:"5"}).mode,"human");
});
test("atendimento de ar-condicionado mantém instalação, manutenção e limpeza",()=>{
 const a=advance(empty,{text:"1"});
 assert.equal(advance(a,{text:"1"}).data.servico,"Instalação de ar-condicionado");
 assert.equal(advance(a,{text:"2"}).data.servico,"Manutenção e consertos");
 assert.equal(advance(a,{text:"3"}).data.servico,"Limpeza profunda e higienização");
});
test("geladeiras e lavadoras mantêm consertos e compra e venda",()=>{
 const a=advance(empty,{text:"2"});
 assert.equal(advance(a,{text:"1"}).data.servico,"Manutenção e consertos");
 assert.equal(advance(a,{text:"2"}).data.servico,"Compra de equipamento");
 assert.equal(advance(a,{text:"3"}).data.servico,"Venda de equipamento");
 assert.equal(advance(empty,{text:"Minha máquina de lavar não centrifuga"}).data.servico,"Manutenção e consertos");
 assert.equal(advance(empty,{text:"Minha geladeira não gela"}).reply.includes("freezer"),true);
});
test("residencial ainda funciona por linguagem natural",()=>{
 const a=advance(empty,{text:"atendimento residencial"});
 assert.equal(a.stage,"residencial");
 const b=advance(a,{text:"1"});
 assert.equal(b.data.tipoAtendimento,"Residencial");
 assert.equal(b.data.servico,"Instalação de ar-condicionado");
});
test("empresas coletam nome e informações do contrato",()=>{
 let r=advance(empty,{text:"3"});
 assert.equal(r.stage,"empresa_escolha");
 r=advance(r,{text:"3"});
 assert.equal(r.stage,"empresa");
 assert.equal(r.data.servico,"Contrato de manutenção e limpeza");
 r=advance(r,{text:"Mercado Exemplo"});
 assert.equal(r.data.empresa,"Mercado Exemplo");
 assert.equal(r.stage,"nome");
});
test("acompanhar protocolo não informa status sem conferência",()=>{
 let r=advance(empty,{text:"4"});
 assert.equal(r.stage,"agenda_escolha");
 r=advance(r,{text:"2"});
 assert.equal(r.stage,"protocolo");
 r=advance(r,{text:"WA-20261104-ABCD1234"});
 assert.equal(r.mode,"human");
 assert.match(r.reply,/verificará/);
});
test("agendamento envia plataforma sem prometer data confirmada",()=>{
 let r=advance(empty,{text:"4"});
 r=advance(r,{text:"1"});
 assert.match(r.reply,/wix-site-host\.com/);
 assert.match(r.reply,/confirmará/);
 assert.equal(r.stage,"menu");
});
test("cliente pode voltar ao menu principal",()=>{
 const a=advance(empty,{text:"1"});
 const b=advance(a,{text:"0"});
 assert.equal(b.stage,"menu");
 assert.match(b.reply,/Como podemos ajudar hoje/);
});
test("compra e venda anterior continua acessível",()=>{
 let r=advance(empty,{text:"7"});
 assert.equal(r.stage,"mercado");
 r=advance(r,{text:"2"});
 assert.equal(r.data.servico,"Venda de equipamento");
});
test("urgência elétrica instrui segurança e transfere ao humano",()=>{
 const r=advance(empty,{text:"Saiu fumaça e cheiro de queimado"});
 assert.equal(r.mode,"human");
 assert.match(r.reply,/segurança/);
});

test("pedido textual de contrato tem prioridade sobre limpeza genérica",()=>{
 const r=advance(empty,{text:"Quero um contrato de manutenção e limpeza para empresa"});
 assert.equal(r.stage,"empresa");
 assert.equal(r.data.servico,"Contrato de manutenção e limpeza");
});
test("atendimento empresarial escrito usa menu especializado",()=>{
 const r=advance(empty,{text:"Preciso de manutenção na minha empresa"});
 assert.equal(r.stage,"empresa_escolha");
 assert.equal(r.data.tipoAtendimento,"Empresarial");
});
test("enquanto a transferência humana está pendente o robô não faz novas perguntas",()=>{
 const r=advance({stage:"menu",mode:"bot",data:{handoffPending:true}},{text:"alô"});
 assert.equal(r.reply,null);
 const reset=advance({stage:"menu",mode:"bot",data:{handoffPending:true}},{text:"MENU"});
 assert.equal(reset.mode,"bot");
 assert.match(reset.reply,/Como podemos ajudar/);
});


test("venda apresenta e identifica antes de pedir fotos e video",()=>{
 let r=advance(empty,{text:"2"});
 r=advance(r,{text:"3"});
 assert.equal(r.stage,"nome");
 assert.match(r.reply,/Como posso chamar/);
 r=advance(r,{text:"Marina Vieira"});
 assert.equal(r.stage,"bairro");
 r=advance(r,{text:"Irajá, Rio de Janeiro"});
 assert.equal(r.stage,"venda_midia");
 assert.match(r.reply,/foto/i);assert.match(r.reply,/vídeo/i);
 r=advance(r,{text:"Tenho uma Brastemp"});
 assert.equal(r.stage,"venda_midia");
 r=advance(r,{type:"image",text:""});
 assert.equal(r.stage,"venda_midia");assert.match(r.reply,/falta.*vídeo/i);
 r=advance(r,{type:"video",text:""});
 assert.equal(r.stage,"equipamento");
 assert.equal(r.data.fotos,1);assert.equal(r.data.videoRecebido,true);
 r=advance(r,{text:"Geladeira Brastemp 400L, funciona, 4 anos"});
 assert.equal(r.stage,"venda_valor");
 r=advance(r,{text:"R$ 1.500,00"});
 assert.equal(r.stage,"venda_negociavel");
 r=advance(r,{text:"SIM"});
 assert.equal(r.stage,"preferencia");
 r=advance(r,{text:"Fim da tarde"});
 assert.equal(r.stage,"confirmar");assert.match(r.reply,/foto e vídeo enviados/i);
 assert.equal(r.order,undefined);
 r=advance(r,{text:"SIM"});
 assert.equal(r.order.servico,"Venda de equipamento");
 assert.equal(r.order.valorPretendido,"R$ 1.500,00");
 assert.equal(r.order.valorNegociavel,"Sim");
 assert.equal(r.order.videoRecebido,true);
});

test("venda aceita vídeo antes da foto depois da identificação",()=>{
 let r=advance(advance(empty,{text:"7"}),{text:"2"});
 r=advance(r,{text:"Joana"});
 r=advance(r,{text:"Méier, Rio de Janeiro"});
 assert.equal(r.stage,"venda_midia");
 r=advance(r,{type:"video",text:""});
 assert.equal(r.stage,"venda_midia");assert.match(r.reply,/falta.*foto/i);
 r=advance(r,{type:"image",text:""});
 assert.equal(r.stage,"equipamento");assert.equal(r.data.videoRecebido,true);
});
test("video recebido em outros fluxos nao e confundido com resposta textual",()=>{
 let r=advance(advance(empty,{text:"1"}),{text:"1"});
 r=advance(r,{type:"video",text:""});
 assert.equal(r.stage,"nome");
 assert.match(r.reply,/Vídeo recebido/);
});
test("finalizacao informa o tecnico responsavel e saudacao em horario do Rio",()=>{
 const protocol="WA-20261114-12345678";
 for(const [date,saudacao] of [
  ["2026-11-14T13:00:00.000Z","dia"],
  ["2026-11-14T18:00:00.000Z","tarde"],
  ["2026-11-15T01:00:00.000Z","noite"]
 ]){
  const msg=closingMessage(protocol,new Date(date));
  assert.match(msg,/Leonardo Moreira/);
  assert.match(msg,/entrará em contato em breve/);
  assert.match(msg,new RegExp("ótim[ao] "+saudacao));
 }
});
test("YCloud reconhece video do cliente comercial",()=>{
 const evt={id:"evt_video_876",type:"whatsapp.inbound_message.received",whatsappInboundMessage:{
   id:"wamid.abc",from:"+5521988887777",to:"+5521970338222",type:"video",video:{id:"media_123"}
 }};
 const result=relevantYCloudEvent(evt,"+5521970338222");
 assert.equal(result?.messageType,"video");
 assert.equal(result?.kind,"incoming");
});


test("venda registra valor pretendido e negociabilidade após o material",()=>{
 let r=advance(advance(empty,{text:"2"}),{text:"3"});
 r=advance(r,{text:"Marcos"});
 r=advance(r,{text:"Penha, Rio de Janeiro"});
 r=advance(r,{type:"video",text:""});
 r=advance(r,{type:"image",text:""});
 r=advance(r,{text:"Lavadora 10 kg funcionando"});
 assert.equal(r.stage,"venda_valor");
 r=advance(r,{text:"valor 1200"});
 assert.equal(r.stage,"venda_negociavel");
 assert.equal(r.data.valorPretendidoNumero,1200);
 r=advance(r,{text:"não"});
 assert.equal(r.data.valorNegociavel,"Não");
 r=advance(r,{text:"Noite, posso entregar"});
 assert.match(r.reply,/Valor pretendido pelo vendedor: R\$/);
 r=advance(r,{text:"SIM"});
 assert.equal(r.order.valorPretendidoNumero,1200);
 assert.equal(r.order.valorNegociavel,"Não");
});

test("venda aceita preço a combinar",()=>{
 let r=advance(advance(empty,{text:"2"}),{text:"3"});
 r=advance(r,{text:"Rosa"});
 r=advance(r,{text:"Cascadura"});
 r=advance(r,{type:"image",text:""});
 r=advance(r,{type:"video",text:""});
 r=advance(r,{text:"Freezer Electrolux não gela"});
 r=advance(r,{text:"a combinar"});
 assert.equal(r.stage,"preferencia");
 assert.equal(r.data.valorPretendido,"A combinar");
 assert.equal(r.data.valorNegociavel,"A combinar");
});

test("pergunta direta sobre comprar geladeira recebe saudação identificação e próxima pergunta",()=>{
 const r=advance(empty,{text:"Vc compra geladeira funcionando",receivedAt:"2026-11-23T17:19:00Z"});
 assert.equal(r.stage,"nome");
 assert.match(r.reply,/^Boa tarde! 👋/);
 assert.match(r.reply,/assistente virtual da Leonardo Moreira Refrigeração/);
 assert.match(r.reply,/avali/i);
 assert.match(r.reply,/Como posso chamar você/);
 const name=advance(r,{text:"Paulo",receivedAt:"2026-11-23T17:20:00Z"});
 assert.equal(name.stage,"bairro");
 assert.doesNotMatch(name.reply,/^(Bom dia|Boa tarde|Boa noite)!/);
 const neighborhood=advance(name,{text:"Quintino, Rio de Janeiro"});
 assert.equal(neighborhood.stage,"venda_midia");
 assert.match(neighborhood.reply,/foto/i);assert.match(neighborhood.reply,/vídeo/i);
});
test("saudação varia com o horário do Rio e ocorre uma só vez",()=>{
 for(const [when,greet] of [["2026-11-23T11:00:00Z","Bom dia"],["2026-11-23T17:00:00Z","Boa tarde"],["2026-11-23T23:00:00Z","Boa noite"]]){
  const first=advance(empty,{text:"Olá",receivedAt:when});
  assert.match(first.reply,new RegExp("^"+greet+"!"));
  const second=advance(first,{text:"Gostaria de instalar um split",receivedAt:when});
  assert.doesNotMatch(second.reply,/^(Bom dia|Boa tarde|Boa noite)!/);
  const menu=advance(second,{text:"0",receivedAt:when});
  assert.doesNotMatch(menu.reply,/^(Bom dia|Boa tarde|Boa noite)!/);
 }
});
test("instalação citada depois de comprar, endereço fragmentado e horário complementar",()=>{
 let r=empty;
 const send=text=>r=advance(r,{text});
 send("Tô pra comprar meu ar condicionado");assert.match(r.reply,/automático/);
 send("Queria fazer um orçamento de instalação contigo");send("Maria");
 send("Maria");assert.equal(r.stage,"bairro_inicial");
 send("Rua Exemplo");send("12");send("Tanque, Rio de Janeiro");
 send("Split, 9000 BTUs");assert.match(r.reply,/650,00/);
 send("SIM");send("Hoje");send("Manhã");assert.match(r.reply,/Hoje · Manhã/);
 send("SIM");assert.equal(r.order.bairro,"Tanque, Rio de Janeiro");
 send("Ok");assert.equal(r.reply,null);
});
test("limpeza de janela, correção do endereço e confirmação única",()=>{
 let r=empty;
 const send=text=>r=advance(r,{text});
 send("Quanto custa a lavagem de ar de janela?");assert.doesNotMatch(r.reply,/R\$/);
 send("Sim, fácil acesso");assert.match(r.reply,/250,00/);
 send("Pode marcar");send("Ana");send("Centro");send("Rua A, 24, Centro, Rio");send("corrigir");send("endereço");send("Rua B, 18, Penha, Rio");
 assert.match(r.reply,/Rua B/);send("SIM");assert.match(r.order.orcamento,/250,00/);
 send("SIM");assert.equal(r.order,undefined);
});

test("recusa e dúvida sobre preço não registram pedido",()=>{
 const session={stage:"aceite_orcamento",mode:"bot",data:{guided:true}};
 const decline=advance(session,{text:"Não"});
 assert.equal(decline.stage,"encerrado");assert.equal(decline.order,undefined);
 const question=advance(session,{text:"Inclui o material?"});
 assert.equal(question.mode,"human");assert.equal(question.order,undefined);
});
test("serviço sem preço pede avaliação antes da conferência",()=>{
 const input={stage:"necessidade",mode:"bot",data:{guided:true,servico:"Instalação de ar-condicionado"}};
 const offer=advance(input,{text:"Ar de janela"});
 assert.match(offer.reply,/solicitação de avaliação/);
 const address=advance(offer,{text:"Sim"});assert.equal(address.stage,"endereco_final");
 const review=advance(address,{text:"Rua B, 18, Penha, Rio"});
 assert.equal(review.stage,"revisao_guiada");assert.equal(review.order,undefined);
 assert.equal(advance(review,{text:"CONFIRMAR"}).order.interesseOrcamento,"Solicitou avaliação");
});

test("orçamento genérico esclarece assunto antes de pedir nome e endereço",()=>{
 const hello=advance(empty,{text:"Queria um orçamento"});
 assert.equal(hello.stage,"assunto");assert.match(hello.reply,/sobre refrigeração/);
 const personal=advance(hello,{text:"Outro assunto"});assert.equal(personal.stage,"outro_assunto");
 assert.equal(advance(personal,{text:"Bom dia, Léo"}).reply,null);
 const clear=advance(hello,{text:"Preciso instalar um split"});
 assert.equal(clear.stage,"nome");assert.match(clear.data.servico,/Instalação/);
 assert.equal(advance(empty,{text:"Quanto custa instalar um split?"}).stage,"nome");
});

test("orçamento com bairro; rua e número somente depois do aceite",()=>{
 let r=empty;
 const send=text=>r=advance(r,{text});
 send("Quero limpar meu ar de janela");assert.match(r.reply,/acesso/);
 send("Sim");assert.match(r.reply,/250,00/);
 assert.equal(r.data.endereco,undefined);
 assert.equal(advance(r,{text:"Não"}).stage,"encerrado");
 send("SIM");send("Ana");assert.match(r.reply,/bairro/);
 send("Tanque");assert.equal(r.stage,"endereco_final");assert.equal(r.order,undefined);
 send("Rua Exemplo");send("5");send("Rio de Janeiro");assert.equal(r.stage,"revisao_guiada");
 assert.match(r.reply,/Tanque/);send("CONFIRMAR");assert.equal(r.order.bairro,"Tanque");
 assert.match(r.order.endereco,/Rua Exemplo, 5, Rio de Janeiro/);
});

test("venda no fluxo guiado sai do ciclo e preserva os dados já informados",()=>{
 for(const text of ["Venda de máquina de lavar","Venda","Vender"]){
  let r=advance({stage:"necessidade",mode:"bot",data:{guided:true,cliente:"Ana",bairro:"Vaz Lobo",servico:""}},{text});
  assert.equal(r.stage,"venda_midia",text);
  assert.equal(r.data.guided,false);
  assert.equal(r.data.bairro,"Vaz Lobo");
  assert.doesNotMatch(r.reply,/instalação, limpeza, conserto/);
  r=advance(r,{text:"Venda"});assert.doesNotMatch(r.reply,/recebid/i);
  r=advance(r,{type:"image"});r=advance(r,{type:"video"});
  assert.equal(r.stage,"equipamento");assert.equal(r.data.cliente,"Ana");
  r=advance(r,{text:"Máquina Electrolux 12kg, funcionando"});
  assert.equal(r.stage,"venda_valor");
  r=advance(r,{text:"600"});r=advance(r,{text:"Sim"});r=advance(r,{text:"A combinar"});
  assert.equal(r.stage,"confirmar");assert.equal(r.order,undefined);
  r=advance(r,{text:"SIM"});assert.equal(r.order.bairro,"Vaz Lobo");
 }
});
test("pergunta se a empresa compra inicia avaliação de venda em qualquer entrada",()=>{
 for(const text of ["Você compra máquina de lavar??","Vocês compram geladeira?","Venda de máquina de lavar","Vender"]){
  for(const stage of ["menu","assunto","eletro_escolha"]){
   const r=advance({stage,mode:"bot",data:{}},{text});
   assert.equal(r.stage,"nome",stage+": "+text);
   assert.equal(r.data.servico,"Venda de equipamento");
  }
 }
});
test("compra no fluxo guiado aproveita nome e bairro",()=>{
 for(const text of ["Compra","Comprar","Quero comprar uma geladeira"]){
  const r=advance({stage:"necessidade",mode:"bot",data:{guided:true,cliente:"Ana",bairro:"Vaz Lobo"}},{text});
  assert.equal(r.stage,"equipamento");assert.equal(r.data.servico,"Compra de equipamento");
  assert.equal(r.data.guided,false);assert.equal(r.data.bairro,"Vaz Lobo");
 }
});


test("aceite com correção exige nova conferência antes do registro",()=>{
 let r={stage:"aceite_orcamento",mode:"bot",data:{guided:true,endereco:"Rua A, 15, Penha, Rio"}};
 r=advance(r,{text:"Por mim pode marcar, mas o número da casa é 42"});
 assert.equal(r.stage,"revisao_guiada");assert.equal(r.order,undefined);assert.match(r.reply,/Rua A, 42/);
 r=advance(r,{text:"o número correto é 43"});assert.equal(r.order,undefined);assert.match(r.reply,/Rua A, 43/);
 assert.equal(advance(r,{text:"Tudo certo"}).order.endereco,"Rua A, 43, Penha, Rio");
});
test("fachada e acesso difícil seguem para avaliação sem tarifa padrão",()=>{
 for(const [pedido,resposta] of [["Limpeza de ar de janela","Não"],["Instalar split no quinto andar","Na fachada"]]){
  const first=advance(empty,{text:pedido});
  assert.match(first.reply,/acesso/i);assert.doesNotMatch(first.reply,/R\$/);
  const second=advance(first,{text:resposta});
  assert.equal(second.data.avaliacaoPendente,true);assert.doesNotMatch(second.reply,/R\$/);
 }
});
