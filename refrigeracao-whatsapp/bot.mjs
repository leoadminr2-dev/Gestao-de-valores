// Atendimento guiado para Leonardo Moreira Refrigeração.
// Preços somente em resposta a perguntas explícitas. Agendamentos não são confirmados.
export const MENU="❄️ *Leonardo Moreira Refrigeração*\nOlá! Sou o atendimento automático.\n\nComo posso ajudar?\n1️⃣ Limpeza de ar-condicionado\n2️⃣ Instalação de ar-condicionado\n3️⃣ Geladeira ou freezer\n4️⃣ Compra ou venda de equipamentos\n5️⃣ Falar com Leonardo\n\nResponda com o número ou escreva MENU para recomeçar.";
export const norm=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
function service(text){
 const t=norm(text);
 if(/^(1|limpeza|higienizacao)$/.test(t)||/limpeza|higieniza/.test(t))return "Limpeza de ar-condicionado";
 if(/^(2|instalacao)$/.test(t)||/instalac/.test(t))return "Instalação de ar-condicionado";
 if(/^(3|geladeira|freezer)$/.test(t)||/geladeira|freezer|compressor/.test(t))return "Manutenção de geladeira/freezer";
 if(/^(4|compra|venda)$/.test(t)||/comprar|vender|anuncio/.test(t))return "Compra ou venda de equipamento";
 return "";
}
export function price(text,selected=""){
 const t=norm(text),s=service(t)||selected;
 if(/compressor/.test(t))return "A troca de compressor começa em R$ 550,00 de mão de obra; peças e condições serão avaliadas.";
 if(/geladeira|freezer/.test(t)||/geladeira|freezer/.test(norm(s)))return "A manutenção de geladeira começa em R$ 280,00, dependendo do diagnóstico.";
 if(/instalac/.test(t)||/instalac/.test(norm(s)))return "A instalação de ar-condicionado começa em R$ 650,00, sujeita à avaliação.";
 if(/limpeza|higieniza/.test(t)||/limpeza/.test(norm(s)))return "A limpeza começa em R$ 280,00, conforme aparelho e condições de acesso.";
 return "Qual serviço deseja consultar: limpeza, instalação, geladeira ou troca de compressor?";
}
export function advance(session,incoming){
 let stage=session?.stage||"menu",mode=session?.mode||"bot",data={...(session?.data||{})};
 const raw=String(incoming?.text||"").trim().slice(0,1000),t=norm(raw);
 if(/^(menu|inicio|reiniciar|0)$/.test(t))return {stage:"menu",mode:"bot",data:{},reply:MENU};
 if(/^(5|humano|atendente|responsavel|falar com leonardo|falar com responsavel)$/.test(t)){
  return {stage:"menu",mode:"human",data,reply:"Encaminhei para o responsável. Leonardo responderá por aqui assim que possível. Escreva MENU para voltar ao atendimento automático."};
 }
 if(mode==="human")return {stage,mode,data,reply:null};
 if(incoming?.type==="image"){
  data.fotos=Math.min(3,Number(data.fotos||0)+1);
  return {stage,mode,data,reply:"📷 Foto recebida. O responsável poderá analisá-la no WhatsApp. "+(stage==="menu"?MENU:"Continue respondendo às perguntas, por favor.")};
 }
 if(/preco|valor|quanto custa|quanto fica|orcamento/.test(t))return {stage,mode,data,reply:price(raw,data.servico)+"\n\nPara solicitar atendimento, continue ou escreva MENU."};
 if(stage==="menu"){
  if(/acompanhar|protocolo/.test(t))return {stage,mode:"human",data,reply:"Para acompanhar uma solicitação, envie seu protocolo aqui. Leonardo verificará o andamento. Escreva MENU para voltar ao robô."};
  const servico=service(t);
  if(!servico)return {stage,mode,data,reply:MENU};
  return {stage:"nome",mode,data:{servico,fotos:0},reply:"Você selecionou *"+servico+"*. Qual seu nome completo?"};
 }
 if(stage==="nome"){
  if(raw.length<3||/^\d+$/.test(raw))return {stage,mode,data,reply:"Informe seu nome completo, por favor."};
  data.cliente=raw.slice(0,120);
  return {stage:"bairro",mode,data,reply:"Obrigado! Em qual bairro será o atendimento?"};
 }
 if(stage==="bairro"){
  if(raw.length<2)return {stage,mode,data,reply:"Informe o bairro, por favor."};
  data.bairro=raw.slice(0,120);
  return {stage:"equipamento",mode,data,reply:"Qual equipamento precisa de atendimento? Se souber, informe marca, modelo e capacidade."};
 }
 if(stage==="equipamento"){
  if(raw.length<3)return {stage,mode,data,reply:"Informe o equipamento e, se possível, marca/modelo."};
  data.equipamento=raw.slice(0,250);
  return {stage:"preferencia",mode,data,reply:"Qual dia ou período prefere? Exemplo: terça-feira à tarde. A visita só será confirmada pelo responsável."};
 }
 if(stage==="preferencia"){
  if(raw.length<3)return {stage,mode,data,reply:"Informe uma data/período ou diga a combinar."};
  data.preferencia=raw.slice(0,180);
  return {stage:"confirmar",mode,data,reply:"🧾 *Confira sua solicitação*\nServiço: "+data.servico+"\nCliente: "+data.cliente+"\nBairro: "+data.bairro+"\nEquipamento: "+data.equipamento+"\nPreferência: "+data.preferencia+"\n\nPara autorizar o registro desses dados para atendimento, responda *SIM*. Para cancelar, responda *CANCELAR*. Ainda não há visita confirmada."};
 }
 if(stage==="confirmar"){
  if(/^(sim|confirmar|confirmo|ok)$/.test(t))return {stage:"menu",mode:"bot",data:{},reply:null,order:{...data}};
  if(/^(nao|cancelar|cancela)$/.test(t))return {stage:"menu",mode:"bot",data:{},reply:"Solicitação cancelada. Nada foi registrado.\n"+MENU};
  return {stage,mode,data,reply:"Responda SIM para registrar ou CANCELAR para desistir."};
 }
 return {stage:"menu",mode:"bot",data:{},reply:MENU};
}
