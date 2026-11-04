// Atendimento empático e guiado da Leonardo Moreira Refrigeração.
// O bot nunca confirma preço final, visita, contrato ou compra sem avaliação do responsável.
export const PLATFORM_URL = "https://headless-qqhigtkprnz-leoadminr2-140a.wix-site-host.com/";
export const MENU = [
  "❄️ *Leonardo Moreira Refrigeração*",
  "",
  "Olá! 👋 Seja muito bem-vindo(a).",
  "É um prazer receber você. Vou ajudar a encontrar a melhor solução para sua casa ou empresa.",
  "",
  "*Como podemos ajudar hoje?*",
  "1️⃣ *Instalação* — ar-condicionado Split e de janela.",
  "2️⃣ *Manutenção e consertos* — Split, janela, geladeira, freezer e máquina de lavar.",
  "3️⃣ *Limpeza profunda* — higienização de ar-condicionado Split e de janela.",
  "4️⃣ *Atendimento residencial* — soluções para sua casa.",
  "5️⃣ *Atendimento empresarial* — comércios, escritórios e empresas.",
  "6️⃣ *Contratos de manutenção e limpeza* — planejamento preventivo e periódico.",
  "7️⃣ *Compra e venda* — geladeiras, ar-condicionado e máquinas de lavar.",
  "8️⃣ *Acompanhar solicitação* — envie seu protocolo para conferência.",
  "9️⃣ *Falar com Leonardo* — atendimento com o responsável.",
  "",
  "🌐 *Plataforma de atendimento:* " + PLATFORM_URL,
  "",
  "Responda com o número ou conte com suas palavras o que precisa. 💬"
].join("\n");

export const norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const HUMAN_REPLY = "Claro! 💬 Vou deixar a conversa com Leonardo, que responderá assim que possível. Você não precisa repetir as informações que já enviou.\n\nSe quiser voltar ao atendimento automático, escreva *MENU*.";
const RESIDENTIAL_MENU = "🏠 Você está no atendimento residencial. O que você precisa?\n*1* Instalação de ar-condicionado\n*2* Manutenção ou conserto\n*3* Limpeza profunda de ar-condicionado\n\nPode responder com o número ou descrever o problema.";
const BUSINESS_MENU = "🏢 Vamos cuidar da sua empresa. O que você procura?\n*1* Manutenção ou conserto pontual\n*2* Limpeza profunda dos aparelhos\n*3* Contrato de manutenção e limpeza periódica\n\nResponda com o número ou descreva sua necessidade.";
const MARKET_MENU = "♻️ Você deseja *comprar* ou *vender* um equipamento?\n*1* Quero comprar\n*2* Quero vender\n\nTrabalhamos com consultas sobre geladeiras, ar-condicionado e máquinas de lavar; disponibilidade e condições são confirmadas pelo responsável.";
const AIR_MENU = "❄️ Entendi que você precisa de ajuda com ar-condicionado. Qual serviço?\n*1* Instalação\n*2* Manutenção ou conserto\n*3* Limpeza profunda\n\nAtendemos modelos Split e de janela.";

function human(stage, data) {
  return {stage, mode:"human", data, reply:HUMAN_REPLY};
}
function orderFlow(servico, previous={}, extra={}) {
  const data={...previous,...extra,servico,fotos:Number(previous.fotos || 0)};
  const isCompany=data.tipoAtendimento==="Empresarial";
  const intro=servico.startsWith("Compra") || servico.startsWith("Venda")
    ? "Vou organizar sua consulta, sem compromisso."
    : servico.startsWith("Contrato")
    ? "Vou reunir os detalhes para uma proposta adequada à sua empresa."
    : "Perfeito! Vou organizar as informações para avaliarmos seu atendimento.";
  return isCompany && !data.empresa
    ? {stage:"empresa",mode:"bot",data,reply:intro+"\n\nQual é o nome da empresa ou estabelecimento?"}
    : {stage:"nome",mode:"bot",data,reply:intro+"\n\nComo posso chamar você? Informe seu nome, por favor."};
}
function route(raw, previous={}) {
  const t=norm(raw);
  if(t==="1" || /\b(instalar|instalacao)\b/.test(t)) return orderFlow("Instalação de ar-condicionado",previous);
  if(t==="2" || /(manutencao|conserto|reparo|defeito|nao gela|nao liga|nao centrifuga|vazamento)/.test(t))
    return orderFlow("Manutenção e consertos",previous);
  if(t==="3" || /(limpeza|higienizac|higieniza)/.test(t))
    return orderFlow("Limpeza profunda e higienização",previous);
  return null;
}
function initialIntent(t, previous={}) {
  if(t==="1" || /instalac|instalar/.test(t))return orderFlow("Instalação de ar-condicionado",previous);
  if(t==="2" || /(manutencao|consert|reparo|defeito|nao gela|nao liga|nao centrifuga|parou de funcionar|geladeira|freezer|maquina de lavar|lavadora)/.test(t))
    return orderFlow("Manutenção e consertos",previous);
  if(t==="3" || /limpeza|higieniz/.test(t))return orderFlow("Limpeza profunda e higienização",previous);
  if(t==="4" || /residencial|minha casa|apartamento/.test(t))
    return {stage:"residencial",mode:"bot",data:{...previous,tipoAtendimento:"Residencial"},reply:RESIDENTIAL_MENU};
  if(t==="5" || /empresarial|para empresa|comercio|escritorio/.test(t))
    return {stage:"empresa_escolha",mode:"bot",data:{...previous,tipoAtendimento:"Empresarial"},reply:BUSINESS_MENU};
  if(t==="6" || /contrato|preventiva|periodic/.test(t))
    return orderFlow("Contrato de manutenção e limpeza",previous,{tipoAtendimento:"Empresarial"});
  if(t==="7" || /compra e venda|comprar|vender|quero comprar|quero vender/.test(t))
    return {stage:"mercado",mode:"bot",data:{...previous},reply:MARKET_MENU};
  if(t==="8" || /acompanhar|protocolo|andamento do pedido/.test(t))
    return {stage:"protocolo",mode:"bot",data:{...previous},reply:"🧾 Posso ajudar a encaminhar sua consulta. Envie o número do protocolo da solicitação. Se não tiver, informe seu nome e bairro. Leonardo verificará o andamento; não vou informar um status sem conferência."};
  if(/ar condicionado|split|modelo de janela/.test(t))
    return {stage:"ar_escolha",mode:"bot",data:{...previous},reply:AIR_MENU};
  return null;
}
export function price(text, selected="") {
  const t=norm(text),s=norm(selected);
  if(/compressor/.test(t))return "A mão de obra para troca de compressor começa em R$ 550,00. Peças e condições precisam de avaliação.";
  if(/maquina de lavar|lavadora/.test(t) || /maquina de lavar|lavadora/.test(s))
    return "Para máquina de lavar, o valor depende do defeito e do diagnóstico. Posso organizar uma avaliação, sem compromisso de orçamento final.";
  if(/contrato|empresa/.test(t) || /contrato/.test(s))
    return "Os contratos e serviços empresariais são planejados conforme quantidade de equipamentos, frequência e local. Podemos solicitar uma proposta personalizada.";
  if(/instalac/.test(t) || /instalac/.test(s))
    return "A instalação de ar-condicionado começa em R$ 650,00 de mão de obra, sujeita à avaliação da infraestrutura.";
  if(/limpeza|higieniza/.test(t) || /limpeza|higieniza/.test(s))
    return "A limpeza de ar-condicionado começa em R$ 280,00, dependendo do aparelho e das condições de acesso.";
  if(/geladeira|freezer/.test(t) || /geladeira|freezer/.test(s))
    return "O atendimento de manutenção de geladeira começa em R$ 280,00 e depende do diagnóstico. Freezers e outros casos exigem avaliação.";
  return "Os valores dependem do serviço e das condições do equipamento. Diga se procura instalação, limpeza, manutenção ou contrato para eu orientar melhor.";
}
function askEquipment(data) {
  const t=norm(data.servico);
  if(t.includes("contrato"))return "Quantos equipamentos precisam de acompanhamento e de quais tipos? Informe também a frequência de manutenção ou limpeza que imagina ideal.";
  if(t.includes("compra"))return "Qual equipamento pretende comprar (geladeira, ar-condicionado ou máquina de lavar)? Conte suas preferências de modelo e capacidade.";
  if(t.includes("venda"))return "Qual equipamento deseja vender? Se souber, informe marca, modelo, idade aproximada e estado de conservação. Você poderá mandar fotos nesta conversa.";
  if(t.includes("instalacao"))return "O ar-condicionado é *Split ou de janela*? Se souber, informe BTUs, marca e detalhes do local de instalação.";
  if(t.includes("limpeza"))return "O aparelho é *Split ou de janela*? Quantos aparelhos precisam de limpeza e há alguma situação específica (odor, sujeira, acesso difícil)?";
  return "Qual equipamento precisa de reparo: Split, ar de janela, geladeira, freezer ou máquina de lavar? Conte o que está acontecendo e, se souber, a marca/modelo.";
}
function askPreference(data) {
  return /compra|venda/.test(norm(data.servico))
    ? "Obrigado! Qual período é melhor para Leonardo entrar em contato e conversar sobre a negociação?"
    : /contrato/.test(norm(data.servico))
    ? "Você prefere receber um contato para planejar a proposta ou sugerir uma data para avaliação no local? A disponibilidade será confirmada."
    : "Qual dia ou período seria melhor para uma visita? É apenas uma preferência: Leonardo confirmará a disponibilidade antes de agendar.";
}
function review(data) {
  const lines=[
    "🧾 *Confira sua solicitação*",
    "Serviço: "+data.servico,
    "Atendimento: "+(data.tipoAtendimento || "A definir"),
    ...(data.empresa ? ["Empresa: "+data.empresa] : []),
    "Contato: "+data.cliente,
    "Bairro / cidade: "+data.bairro,
    "Equipamento / detalhes: "+data.equipamento,
    "Preferência: "+data.preferencia,
    "",
    "Para autorizar o registro desses dados para o atendimento, responda *SIM*.",
    "Para desistir, responda *CANCELAR*.",
    "",
    "Nenhuma visita, orçamento ou negociação está confirmada neste momento."
  ];
  return lines.join("\n");
}
export function advance(session, incoming) {
  let stage=session?.stage||"menu",mode=session?.mode||"bot";
  const data={...(session?.data||{})};
  const raw=String(incoming?.text||"").trim().slice(0,1000),t=norm(raw);
  if(/^(menu|inicio|reiniciar|0)$/.test(t))return {stage:"menu",mode:"bot",data:{},reply:MENU};
  if(mode==="human")return {stage,mode,data,reply:null};
  if(/^(9|humano|atendente|responsavel|falar com leonardo|falar com responsavel|pessoa de verdade)$/.test(t))
    return human(stage,data);
  if(/^(cancelar|desistir|cancela)$/.test(t))
    return {stage:"menu",mode:"bot",data:{},reply:"Tudo bem, sem problema. Não registrei nenhum novo pedido.\n\n"+MENU};
  if(/cheiro de queimado|fumaca|faisca|choque eletrico|principio de incendio/.test(t))
    return {stage,mode:"human",data,reply:"⚠️ Sinto muito por essa situação. Por segurança, pare de usar o equipamento e, se puder fazer isso sem risco, desligue a energia. Havendo fogo ou perigo imediato, acione a emergência. Não tente abrir ou reparar o aparelho. Vou deixar a conversa para Leonardo avaliar seu relato."};
  if(incoming?.type==="image") {
    data.fotos=Math.min(3,Number(data.fotos||0)+1);
    return {stage,mode,data,reply:"📷 Obrigado pela foto! Ela pode ajudar Leonardo a entender a situação. "+(stage==="menu"?"Conte também o que está acontecendo com o equipamento.\n\n"+MENU:"Pode continuar com as informações que estávamos preenchendo.")};
  }
  if(/(plataforma|acessar o site|acessar plataforma|link do site|formulario online|agendar online)/.test(t))
    return {stage,mode,data,reply:"🌐 Claro! Você pode acessar nossa plataforma por aqui:\n"+PLATFORM_URL+"\n\nLá é possível enviar uma solicitação de atendimento e obter um protocolo. Se preferir, podemos continuar pelo WhatsApp. A visita depende de confirmação."};
  if(/preco|valor|quanto custa|quanto fica|orcamento|quanto cobram/.test(t))
    return {stage,mode,data,reply:price(raw,data.servico)+"\n\nSe desejar, posso registrar uma solicitação; escreva *MENU* para ver as opções."};
  if(stage==="menu"){
    const intent=initialIntent(t,data);
    if(intent){
      if(/nao gela|parou de funcionar|nao centrifuga/.test(t))
        intent.reply="Entendo a preocupação com o equipamento. Vamos organizar seu atendimento com atenção. 💙\n\n"+intent.reply;
      return intent;
    }
    return {stage,mode,data,reply:MENU};
  }
  if(["residencial","empresa_escolha","ar_escolha"].includes(stage)){
    const next=route(raw,data);
    if(!next)return {stage,mode,data,reply:stage==="residencial"?RESIDENTIAL_MENU:stage==="empresa_escolha"?BUSINESS_MENU:AIR_MENU};
    if(stage==="empresa_escolha"){
      next.data.tipoAtendimento="Empresarial";
      if(t==="3"||/contrato|periodica|preventiva/.test(t))next.data.servico="Contrato de manutenção e limpeza";
      next.stage="empresa";
      next.reply="Perfeito, vamos organizar a necessidade da sua empresa. 🏢\n\nQual o nome da empresa ou estabelecimento?";
    }
    if(stage==="residencial")next.data.tipoAtendimento="Residencial";
    return next;
  }
  if(stage==="mercado"){
    if(t==="1"||/comprar|compra/.test(t))return orderFlow("Compra de equipamento",data);
    if(t==="2"||/vender|venda/.test(t))return orderFlow("Venda de equipamento",data);
    return {stage,mode,data,reply:MARKET_MENU};
  }
  if(stage==="protocolo"){
    if(raw.length<3)return {stage,mode,data,reply:"Pode enviar o protocolo ou seu nome e bairro, por favor?"};
    data.protocoloConsultado=raw.slice(0,120);
    return {stage:"menu",mode:"human",data,reply:"Obrigado! Recebi sua referência. 🧾 Leonardo verificará a solicitação e responderá por aqui assim que possível. Não vou inventar uma atualização sem consultar o registro. Para reiniciar o atendimento automático, escreva *MENU*."};
  }
  if(stage==="empresa"){
    if(raw.length<2)return {stage,mode,data,reply:"Informe o nome da empresa ou estabelecimento, por favor."};
    data.empresa=raw.slice(0,120);
    return {stage:"nome",mode,data,reply:"Obrigado! Qual seu nome para que Leonardo saiba com quem conversar?"};
  }
  if(stage==="nome"){
    if(raw.length<3||/^\d+$/.test(raw))return {stage,mode,data,reply:"Como posso chamar você? Informe seu nome, por favor."};
    data.cliente=raw.slice(0,120);
    return {stage:"bairro",mode,data,reply:"Prazer, "+data.cliente.split(" ")[0]+"! 😊 Em qual bairro e cidade fica o atendimento?"};
  }
  if(stage==="bairro"){
    if(raw.length<2)return {stage,mode,data,reply:"Informe o bairro e a cidade, por favor."};
    data.bairro=raw.slice(0,150);
    return {stage:"equipamento",mode,data,reply:askEquipment(data)};
  }
  if(stage==="equipamento"){
    if(raw.length<3)return {stage,mode,data,reply:"Conte um pouco mais sobre o equipamento ou a necessidade, por favor."};
    data.equipamento=raw.slice(0,500);
    return {stage:"preferencia",mode,data,reply:askPreference(data)};
  }
  if(stage==="preferencia"){
    if(raw.length<3)return {stage,mode,data,reply:"Pode informar um dia/período de preferência ou escrever *a combinar*?"};
    data.preferencia=raw.slice(0,180);
    return {stage:"confirmar",mode,data,reply:review(data)};
  }
  if(stage==="confirmar"){
    if(/^(sim|confirmar|confirmo|ok)$/.test(t))
      return {stage:"menu",mode:"bot",data:{},reply:null,order:{...data}};
    if(/^(nao|não)$/.test(t))
      return {stage:"menu",mode:"bot",data:{},reply:"Sem problemas! Não foi criado um pedido.\n\n"+MENU};
    return {stage,mode,data,reply:"Para proteger seus dados, só registro a solicitação com sua autorização. Responda *SIM* para registrar ou *CANCELAR* para desistir."};
  }
  return {stage:"menu",mode:"bot",data:{},reply:MENU};
}
