import {isCommercialIntent} from "./selective.mjs";
// Atendimento empático e guiado da Leonardo Moreira Refrigeração.
// O bot nunca confirma preço final, visita, contrato ou compra sem avaliação do responsável.
export const PLATFORM_URL = "https://headless-qqhigtkprnz-leoadminr2-140a.wix-site-host.com/";
export const MENU = [
  "❄️ *LEONARDO MOREIRA* ❄️",
  "*REFRIGERAÇÃO*",
  "🔧 Instalação • Manutenção • Higienização",
  "",
  "*Como podemos ajudar hoje?*",
  "",
  "1️⃣ *Ar-condicionado*",
  "Instalação, manutenção e limpeza",
  "",
  "2️⃣ *Geladeiras, freezers e lavadoras*",
  "Consertos, compra e venda",
  "",
  "3️⃣ *Empresas e contratos*",
  "Serviços e manutenção preventiva",
  "",
  "4️⃣ *Agendamento e acompanhamento*",
  "Solicitações e protocolos",
  "",
  "5️⃣ *Falar com Leonardo Moreira*",
  "Técnico responsável pela manutenção",
  "",
  "💬 Atendimento automático. Digite o número ou conte o que precisa."
].join("\n");

export const norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const HUMAN_REPLY = "👨‍🔧 Você será direcionado para falar com *Leonardo Moreira*, técnico responsável pela manutenção.\n\nPor favor, descreva brevemente sua necessidade. Assim, poderemos dar continuidade ao seu atendimento com mais agilidade.\n\nPara voltar ao atendimento automático, digite *MENU*.";
const RESIDENTIAL_MENU = "🏠 *Atendimento residencial*\n\n1️⃣ *Instalação de ar-condicionado*\n\n2️⃣ *Manutenção e consertos*\n\n3️⃣ *Limpeza profunda*\n\nResponda com o número ou conte seu problema.\nDigite *0* para voltar.";
const BUSINESS_MENU = "🏢 *Atendimento para empresas*\n\n1️⃣ *Manutenção e consertos*\n\n2️⃣ *Limpeza profunda*\n\n3️⃣ *Contrato preventivo e periódico*\n\nResponda com o número ou descreva sua necessidade.\nDigite *0* para voltar.";
const MARKET_MENU = "♻️ *Compra e venda de equipamentos*\n\n1️⃣ *Quero comprar*\n\n2️⃣ *Quero vender*\n\nGeladeiras, ar-condicionado e máquinas de lavar. Disponibilidade e condições serão confirmadas por Leonardo.\nDigite *0* para voltar.";
const AIR_MENU = "❄️ *Ar-condicionado Split e de janela*\n\n1️⃣ *Instalação*\n\n2️⃣ *Manutenção e consertos*\n\n3️⃣ *Limpeza profunda*\n\nResponda com o número ou descreva o serviço.\nDigite *0* para voltar.";
const APPLIANCE_MENU = "🏠 *Geladeiras, freezers e máquinas de lavar*\n\n1️⃣ *Manutenção e consertos*\n\n2️⃣ *Comprar equipamento*\n\n3️⃣ *Vender equipamento*\n\nResponda com o número ou conte o problema.\nDigite *0* para voltar.";
const SCHEDULE_MENU = "🗓️ *Agendamento e acompanhamento*\n\n1️⃣ *Solicitar atendimento online*\n\n2️⃣ *Consultar protocolo*\n\nAgendamentos só são confirmados após retorno de Leonardo.\nDigite *0* para voltar.";

const SALE_MEDIA_REPLY = "📷 Para que Leonardo possa avaliar o equipamento, envie *1 foto* mostrando o estado geral e *1 vídeo curto* mostrando o funcionamento ou eventual defeito. Pode enviar aqui mesmo, em qualquer ordem.\n\nDepois seguimos com os detalhes da proposta. Para voltar ao menu, digite *0*.";
const SALE_EXPLANATION = "♻️ Sim, trabalhamos com a avaliação de propostas de venda de geladeiras, freezers, ar-condicionado e máquinas de lavar, inclusive em funcionamento. Leonardo analisa o estado do equipamento antes de confirmar qualquer compra.";

function human(stage, data) {
  return {stage, mode:"human", data, reply:HUMAN_REPLY};
}
function orderFlow(servico, previous={}, extra={}) {
  const data={...previous,...extra,servico,fotos:Number(previous.fotos || 0)};
  if(servico.startsWith("Venda")){
    const saleData={...data,fotos:0,videoRecebido:false,mediaItems:[],guided:false};
    if(!saleData.cliente)
      return {stage:"nome",mode:"bot",data:saleData,reply:SALE_EXPLANATION+"\n\nPara começar, gostaria de saber seu nome. Como posso chamar você?"};
    if(!saleData.bairro)
      return {stage:"bairro",mode:"bot",data:saleData,reply:SALE_EXPLANATION+"\n\nEm qual bairro e cidade fica o equipamento?"};
    return {stage:"venda_midia",mode:"bot",data:saleData,reply:SALE_EXPLANATION+"\n\n"+SALE_MEDIA_REPLY};
  }
  if (serviceType(norm(servico)) && !servico.startsWith("Contrato") && data.tipoAtendimento!=="Empresarial") {
    return {stage:"nome",mode:"bot",data:{...data,guided:true},reply:"Vou entender sua necessidade antes de apresentar qualquer valor.\n\n"+nameQuestion};
  }
  const isCompany=data.tipoAtendimento==="Empresarial";
  const intro=servico.startsWith("Compra") || servico.startsWith("Venda")
    ? "Vou organizar sua consulta, sem compromisso."
    : servico.startsWith("Contrato")
    ? "Vou reunir os detalhes para uma proposta adequada à sua empresa."
    : "Perfeito! Vou organizar as informações para avaliarmos seu atendimento.";
  if(servico.startsWith("Compra") && data.cliente){
    return {stage:data.bairro?"equipamento":"bairro",mode:"bot",data,
      reply:data.bairro?askEquipment(data):"Em qual bairro e cidade será o atendimento?"};
  }
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
function marketIntent(t) {
  // “Vocês compram?” significa que o cliente quer vender para a empresa.
  if (/\b(voc[eê]s?|vc|vcs)\s+(?:tambem\s+)?compra(?:m)?\b/.test(t)) return "Venda de equipamento";
  if (/\b(venda|vender|vendo)\b/.test(t) && !/compra e venda/.test(t)) return "Venda de equipamento";
  if (/^(compra|comprar)[.!? ]*$/.test(t) || /\b(quero|pretendo|gostaria|preciso)\s+comprar\b/.test(t)) return "Compra de equipamento";
  return "";
}
function initialIntent(t, previous={}) {
  const market=marketIntent(t);
  if(market)return orderFlow(market,previous,{guided:false,relato:[previous.relato,t].filter(Boolean).join(" ").slice(-800)});
  // Compatibilidade: antigas opções 6-8 permanecem aceitas, mas não aparecem no menu.
  if(t==="6" || /contrato|preventiva|periodic/.test(t))
    return orderFlow("Contrato de manutenção e limpeza",previous,{tipoAtendimento:"Empresarial"});
  if(t==="3" || /empresarial|\bempresa\b|comercio|escritorio/.test(t))
    return {stage:"empresa_escolha",mode:"bot",data:{...previous,tipoAtendimento:"Empresarial"},reply:BUSINESS_MENU};
  if(t==="4" || /agendamento|agendar|acompanhar|protocolo|andamento do pedido/.test(t))
    return {stage:"agenda_escolha",mode:"bot",data:{...previous},reply:SCHEDULE_MENU};
  if(/\b(quero|pretendo|gostaria|preciso)\s+vender\b/.test(t)) return orderFlow("Venda de equipamento",previous);
  if(/\b(quero|pretendo|gostaria|preciso)\s+comprar\b/.test(t)) return orderFlow("Compra de equipamento",previous);
  if(t==="7" || /compra e venda|comprar|vender/.test(t))
    return {stage:"mercado",mode:"bot",data:{...previous},reply:MARKET_MENU};
  if(t==="8")return {stage:"protocolo",mode:"bot",data:{...previous},reply:"🧾 Envie o protocolo da solicitação. Se não tiver, informe seu nome e bairro. Leonardo verificará o andamento antes de informar qualquer status."};
  if(t==="1")return {stage:"ar_escolha",mode:"bot",data:{...previous},reply:AIR_MENU};
  if(t==="2")return {stage:"eletro_escolha",mode:"bot",data:{...previous},reply:APPLIANCE_MENU};
  if(/residencial|minha casa|apartamento/.test(t))
    return {stage:"residencial",mode:"bot",data:{...previous,tipoAtendimento:"Residencial"},reply:RESIDENTIAL_MENU};
  if(/instalac|instalar/.test(t))return orderFlow("Instalação de ar-condicionado",previous);
  if(/(manutencao|consert|reparo|defeito|nao gela|nao liga|nao centrifuga|parou de funcionar|vazamento)/.test(t))
    return orderFlow("Manutenção e consertos",previous);
  if(/limpeza|higieniz/.test(t))return orderFlow("Limpeza profunda e higienização",previous);
  if(/ar condicionado|split|modelo de janela/.test(t))
    return {stage:"ar_escolha",mode:"bot",data:{...previous},reply:AIR_MENU};
  if(/geladeira|freezer|maquina de lavar|lavadora/.test(t))
    return {stage:"eletro_escolha",mode:"bot",data:{...previous},reply:APPLIANCE_MENU};
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
  if(t.includes("contrato"))return "Quantos equipamentos precisam de atendimento, de quais tipos e com qual frequência de limpeza ou manutenção? Informe também os principais problemas, se houver.";
  if(t.includes("compra"))return "Qual equipamento deseja comprar (geladeira, freezer, ar-condicionado ou máquina de lavar)? Diga a capacidade, voltagem e faixa de orçamento desejadas, se souber.";
  if(t.includes("venda"))return "Qual equipamento deseja vender? Informe *tipo, marca, modelo, idade aproximada, estado de conservação, defeito (se houver) e se já passou por conserto*.";
  if(t.includes("instalacao"))return "Seu ar-condicionado é *Split ou de janela*? Informe os BTUs e, se souber, a voltagem. Já há ponto elétrico, suporte e tubulação? Se puder, envie foto do local.";
  if(t.includes("limpeza"))return "O aparelho é *Split ou de janela*? Quantos precisam de limpeza? Há mau cheiro, sujeira intensa, gotejamento ou dificuldade de acesso? Foto é bem-vinda.";
  return "Qual equipamento precisa de manutenção e o que está acontecendo? Se souber, informe a marca e o modelo. Foto ou vídeo são opcionais.";
}
function askPreference(data) {
  if(norm(data.servico).includes("venda"))return "Qual período é melhor para Leonardo entrar em contato? O equipamento está disponível para retirada no bairro informado?";
  return /compra/.test(norm(data.servico))
    ? "Qual período é melhor para Leonardo entrar em contato e confirmar a disponibilidade?"
    : /contrato/.test(norm(data.servico))
    ? "Você prefere contato para planejar a proposta ou quer sugerir uma data de avaliação no local? A disponibilidade será confirmada."
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
    ...(norm(data.servico).includes("venda") ? ["Valor pretendido pelo vendedor: "+(data.valorPretendido||"Não informado"),"Valor negociável: "+(data.valorNegociavel||"Não informado")] : []),
    "Preferência: "+data.preferencia,
    ...(norm(data.servico).includes("venda") ? ["Imagens: foto e vídeo enviados nesta conversa do WhatsApp"] : []),
    "",
    "Para autorizar o registro desses dados para o atendimento, responda *SIM*.",
    "Para desistir, responda *CANCELAR*.",
    "",
    "Nenhuma visita, orçamento ou negociação está confirmada neste momento."
  ];
  return lines.join("\n");
}
const welcome = "Olá! 👋 Você está no atendimento automático da Leonardo Moreira Refrigeração.";
const nameQuestion = "Como posso chamar você?";
const neighborhoodQuestion = "Em qual bairro será o atendimento?";
const bairroConhecido = text => /^(?:bairro\s+)?(?:iraja|madureira|meier|penha|quintino|vaz lobo|bras de pina|nilopolis|piedade|cascadura|engenho de dentro|del castilho|bonsucesso|tijuca|jacarepagua|campo grande|taquara|bangu|copacabana|ipanema|centro|ramos|olaria|vila da penha|ilha do governador|duque de caxias)(?:\s*,\s*(?:rj|rio de janeiro))?$/.test(norm(text));
const streetNumber = /\b\d+[a-z]?\b|s\s*\/\s*n|sem n[uú]mero/i;
const streetPrefix = /^(rua|r\.|avenida|av\.|estrada|travessa|praca|alameda|rodovia)\s/i;
const addressQuestion = "Qual é o endereço do serviço? Envie a rua, o número (ou s/n), o bairro e a cidade. Pode mandar em mensagens separadas.";
const serviceQuestion = "O que você precisa fazer e em qual aparelho?";
const timing = /^(hoje|amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo|de manha|manha|tarde|noite|a combinar|sem preferencia|\d{1,2}\/\d{1,2})\b/;
const ack = /^(ok|obrigad[oa]|valeu|certo|beleza|blz|👍)[.! ]*$/;
function serviceType(text) {
  if (/instala[cç]|instalar/.test(text)) return "Instalação de ar-condicionado";
  if (/limpeza|higieniz|lavagem|lavacao|limpar/.test(text)) return "Limpeza profunda e higienização";
  if (/manutencao|consert|reparo|defeito|nao (gela|liga|centrifuga)|parou|vazando|pingando|barulho/.test(text)) return "Manutenção e consertos";
  return "";
}
function explainService(service) {
  if (service?.startsWith("Instalação"))
    return "Antes de orçar, conferimos o modelo, o ponto elétrico e o acesso às unidades. Na instalação do split, fazemos o teste de estanqueidade, o vácuo e o teste de funcionamento.";
  if (service?.startsWith("Limpeza"))
    return "Na higienização, verificamos o estado do aparelho, limpamos os componentes e testamos o funcionamento após a montagem. O orçamento considera o tipo de aparelho e o acesso.";
  if (service?.startsWith("Manutenção"))
    return "Primeiro entendemos o sintoma. Na visita, Leonardo verifica a causa e explica o reparo, as peças e a mão de obra para você decidir antes da execução.";
  return "Aqui na Leonardo Moreira Refrigeração, primeiro entendemos o que você precisa. Depois explicamos como o serviço será feito, o que está incluído e quanto fica, para você decidir.";
}

function contactDetails(raw) {
  const fields={};
  const intro=raw.match(/(?:^|[.,!;]\s*|\b(?:oi|olá)[ ,]+)(?:sou (?:o |a )?|me chamo |meu nome é )([\p{L}'’-]+(?: [\p{L}'’-]+){0,4}?)(?=,|[.!;]|\s+(?:do bairro|do|da|de|moro|e quero|e preciso)\s|$)/iu);
  if (intro && !/\b(cliente|técnico|síndico|responsável)\b/i.test(intro[1])) fields.cliente=intro[1];
  const location=raw.match(/\b(?:no bairro |meu bairro é |moro (?:em|no|na) )([^,.;!?\n]+)/iu)
    || (intro && raw.slice(intro.index+intro[0].length).match(/^,?\s+(?:do bairro|de|da|do)\s+([^,.;!?\n]+)/iu));
  if(location){
    const value=location[1].split(/\s+(?:e (?:quero|preciso|gostaria)|no \d|no quinto andar)\b/i)[0].trim();
    if(/^[\p{L}\d][\p{L}\d '’-]{0,59}$/u.test(value))fields.bairro=value;
  }
  return fields;
}
function elevated(text) {
  return /\b(?:\d+\s*[º°o]?|primeiro|segundo|terceiro|quarto|quinto|sexto|setimo|oitavo|nono|decimo)\s+andar\b/.test(text);
}
function nextDetail(data) {
  const history=norm(data.relato);
  if (data.servico?.startsWith("Instalação") && elevated(history) && !/varanda|sacada|fachada/.test(history))
    return "Como o serviço é em andar elevado, precisamos conferir o acesso. A unidade externa vai ficar na varanda ou na fachada do prédio?";
  if (data.servico?.startsWith("Manutenção") && /geladeira|freezer/.test(history) && /parou|nao gel|sem gel/.test(history))
    return "Você percebeu a perda de refrigeração no aparelho inteiro ou só em um compartimento?";
  if (/split|janela/.test(history)) {
    if (data.servico?.startsWith("Instalação"))
      return /ponto eletrico|220|tomada|disjuntor/.test(history)
        ? "Como é o acesso ao local onde ficará a unidade externa?"
        : "Já existe um ponto elétrico preparado no local da instalação?";
    if (data.servico?.startsWith("Limpeza"))
      return "Há algum detalhe que devemos considerar, como gotejamento ou dificuldade de acesso? Se estiver tudo normal, pode dizer “limpeza de rotina”.";
  }
  return data.servico?askEquipment(data):serviceQuestion;
}

function serviceAnswer(t, service) {
  const answers=[];
  if (service?.startsWith("Instalação") && /materia(is|l)|tubulacao|suporte/.test(t))
    answers.push("Na instalação padrão, o cliente fornece o aparelho e os materiais. Leonardo confere o que será necessário para o seu local antes de fechar o orçamento.");
  if (service?.startsWith("Instalação") && /eletric|220\s*v|tomada|disjuntor/.test(t))
    answers.push("A instalação padrão considera um ponto elétrico adequado disponível. Se precisar de adequação, Leonardo avalia essa parte separadamente antes de fechar o valor.");
  if (service?.startsWith("Manutenção") && /abat|descont.*visita|visita.*descont/.test(t))
    answers.push("Se você aprovar o conserto, o valor da visita técnica é abatido. Leonardo apresenta o orçamento do reparo após o diagnóstico.");
  if (/como (voces |voce |a empresa )?(trabalha|funciona)|o que (inclui|esta incluso|esta incluido)|como e (feita|feito)/.test(t))
    answers.push(explainService(service));
  return answers.join("\n\n");
}

function beginService(data,raw,service,greet) {
  const info={...data,guided:true,relato:raw,servico:service};
  if(!service){return {stage:"assunto",mode:"bot",data:info,reply:"Qual equipamento ou serviço precisa de atendimento? Pode explicar com suas palavras."};}
  const nextStage=!info.cliente?"nome":!info.bairro?"bairro_inicial":"necessidade";
  const introduction=""; // A abertura é centralizada em advance().
  const t=norm(raw);
  const fridge=service.startsWith("Manutenção") && /geladeira|refrigerador/.test(t) && /parou|nao gel|sem gel/.test(t);
  const windowWash=service.startsWith("Limpeza") && /janela/.test(t);
  const upstairs=service.startsWith("Instalação") && elevated(t);
  if (fridge || windowWash || upstairs) {
    info.triagemDireta=true;
    let prompt=nextDetail(info);
    if(fridge) prompt=/freezer|parte de (baixo|cima)|compartimento/.test(t)
      ? "Há quanto tempo você percebeu essa mudança?" : "O freezer também parou de gelar ou o problema está só na parte de baixo?";
    if(windowWash) prompt=/acesso (simples|facil)|facil acesso|terreo/.test(t)
      ? "É uma unidade ou são vários aparelhos?" : "O aparelho fica em local de fácil acesso para a limpeza?";
    const intro=fridge?"Na visita, Leonardo verifica a causa antes de indicar peças ou reparos.":windowWash?"Na higienização, limpamos filtros, serpentina e bandeja e testamos o aparelho após a montagem.":"";
    return {stage:"necessidade",mode:"bot",data:info,reply:[introduction,intro,prompt].filter(Boolean).join("\n\n")};
  }
  const accessFirst=nextStage==="necessidade" && service.startsWith("Instalação") && elevated(t);
  const opening=nextStage==="nome"?"Vamos entender seu pedido antes de falar de valores.":((/\?|como funciona|como trabalham/.test(t) && serviceAnswer(t,service)) || (accessFirst?"":explainService(service)));
  const prompt=nextStage==="nome"?nameQuestion:nextStage==="bairro_inicial"?neighborhoodQuestion:nextDetail(info);
  return {stage:nextStage,mode:"bot",data:info,reply:[introduction,opening,prompt].filter(Boolean).join("\n\n")};
}

function quote(data) {
  const detail=norm(data.equipamento);
  if (data.servico.startsWith("Manutenção"))
    return "*Visita técnica*\nLeonardo avalia o aparelho e identifica a causa do problema.\n*Valor da visita · R$ 120,00* O valor da visita é abatido se você aprovar o conserto. Peças e mão de obra do reparo serão orçadas após o diagnóstico.";
  if (data.servico.startsWith("Instalação") && /fachada|andaime|rapel|precis[ao] (?:puxar|instalar) (?:o )?220/.test(detail)) return null;
  if (data.servico.startsWith("Instalação") && /split/.test(detail))
    return "❄️ *Instalação padrão de split*\nInclui fixação, interligação, teste de estanqueidade, vácuo e teste de funcionamento. O cliente fornece o aparelho e os materiais. Acesso especial e adequação elétrica exigem avaliação separada.\n*Mão de obra estimada · R$ 650,00 por aparelho*";
  if (data.servico.startsWith("Limpeza") && /acesso dificil|dificil acesso|fachada|andaime|rapel|nao (?:e |tem )?(?:de )?facil acesso/.test(detail)) return null;
  if (data.servico.startsWith("Limpeza") && /janela|split/.test(detail)) {
    const unit=/janela/.test(detail)?"R$ 250,00":/\b9\s*(mil|k|[., ]?000)\b/.test(detail)?"R$ 280,00":"";
    if (unit) return "❄️ *Higienização de ar-condicionado*\nInclui limpeza dos filtros, serpentina e bandeja, remontagem e teste de funcionamento.\n*Valor · "+unit+" por aparelho*";
  }
  return null;
}
function guidedReview(data) {
  return ["Confira os dados do pedido:",data.cliente,data.endereco,"Serviço: "+data.servico,"Detalhes: "+data.equipamento,"Preferência: "+(data.preferencia||"A combinar"),"Responda CONFIRMAR para confirmar os dados e registrar o pedido, ou CORRIGIR para ajustar. Leonardo confirmará a disponibilidade do horário."].join("\n");
}
function guidedStep(stage,data,raw,t) {
  const next=(stage,reply)=>({stage,mode:"bot",data,reply});
  const accepted=/^(?:sim|aceito|quero|(?:por mim )?pode (?:seguir|marcar|agendar|confirmar|registrar)|quero seguir|vamos seguir|fechado|de acordo|tudo certo|esta certo|confirmo|confirmar)[.! ]*$/.test(t);
  const correctedNumber=["aceite_orcamento","revisao_guiada","endereco_final"].includes(stage) && !/\?|\bnao\b/.test(t) && t.match(/\b(?:numero (?:da casa |do imovel |certo |correto )?(?:e |eh |para )?|corrigindo o numero (?:para )?)(\d+[a-z]?)\s*[.!]?$/);
  if(correctedNumber){
    data.numeroInformado=correctedNumber[1];
    if(data.endereco){
      const number=/(,\s*|\bn[º°.]\s*)(?:\d+[a-z]?|s\/n)(?=\s*(?:[,·]|$))/i;
      if(!number.test(data.endereco)){
        data.enderecoPartes=[];
        delete data.endereco;
        if(stage==="revisao_guiada")return next("ajustar_endereco","Anotei o número "+data.numeroInformado+". Para conferir o endereço, envie a rua, o número e a cidade.");
      }else{
        data.endereco=data.endereco.replace(number,(_,prefix)=>prefix+data.numeroInformado);
        data.enderecoPartes=[data.endereco];
        if(stage==="revisao_guiada")return next(stage,guidedReview(data));
      }
    }
    if(stage==="endereco_final")return next(stage,"Anotei o número "+data.numeroInformado+". Qual é a rua e a cidade?");
  }
  const question = /\?/.test(raw) || /^(quanto|qual (?:o )?(?:valor|preco)|como funciona|inclui|aceita[m]? |tem garantia|voces fazem)/.test(t);
  if (question && !marketIntent(t)) {
    const answer = serviceAnswer(t, data.servico || serviceType(t));
    const resume = {nome:nameQuestion,bairro_inicial:neighborhoodQuestion,necessidade:serviceQuestion,aceite_orcamento:"Quer seguir com a solicitação?",endereco_final:addressQuestion};
    if (answer) return next(stage, answer+(resume[stage]?"\n\n"+resume[stage]:""));
    const pricing = /quanto|preco|valor|custa|cobram/.test(t);
    if (pricing && ["nome","bairro_inicial"].includes(stage))
      return next(stage, explainService(data.servico || serviceType(t))+"\n\n"+resume[stage]);
    if (!(stage==="necessidade" && (pricing || serviceType(t))) && !(stage==="nome" && serviceType(t)))
      return {stage,mode:"human",data:{...data,duvidaCliente:raw},reply:"Vou deixar sua pergunta e o que você já contou com o Leonardo, para ele responder por aqui."};
  }
  if(stage==="identificacao_aceite"){
    const fields=contactDetails(raw);
    const neededName=!data.cliente;
    Object.assign(data,fields);
    if(!data.cliente){
      if(!/^[\p{L}][\p{L}'’ -]{1,79}$/u.test(raw))return next(stage,nameQuestion);
      data.cliente=raw;
    }else if(!neededName && !data.bairro && !fields.cliente)data.bairro=raw;
    if(!data.bairro)return next(stage,neighborhoodQuestion);
    return next("endereco_final",(data.numeroInformado?"Envie a rua e a cidade.":"Envie a rua, o número e a cidade.")+(data.numeroInformado?" Já anotei o número "+data.numeroInformado+".":""));
  }
  if (ack.test(t)) return next(stage,stage==="aceite_orcamento"?"Quer seguir? Responda SIM ou NÃO.":null);
  if (stage==="nome") {
    if (serviceType(t) || /comprar|ar.condicionado|orcamento/.test(t)) {
      data.relato=[data.relato,raw].filter(Boolean).join(" ").slice(-700);
      data.servico=serviceType(norm(data.relato));
      return next(stage,nameQuestion);
    }
    if(bairroConhecido(raw)) {data.bairro=raw;return next(stage,"Anotei *"+raw+"* como bairro. Para continuar, "+nameQuestion);}
    if (!/^[\p{L}][\p{L}'’ -]{1,79}$/u.test(raw)) return next(stage,nameQuestion);
    data.cliente=raw;
    if(data.bairro)return next("necessidade",nextDetail(data));
    return next("bairro_inicial",neighborhoodQuestion);
  }
  if (stage==="bairro_inicial" || stage==="endereco") {
    if(!data.cliente)return next("nome","Para continuar, "+nameQuestion);
    if(t===norm(data.cliente))return next(stage,neighborhoodQuestion);
    if(timing.test(t)){data.preferencia=raw;return next(stage,neighborhoodQuestion);}
    if(serviceType(t)){data.servico=serviceType(t);data.relato=raw;return next(stage,neighborhoodQuestion);}
    // Aproveita também endereços enviados espontaneamente ou em sessões anteriores.
    if(data.enderecoPartes?.length || streetPrefix.test(t) || streetNumber.test(raw)){
      const parts=data.enderecoPartes||[];
      if(!parts.some(p=>norm(p)===t))parts.push(raw);
      data.enderecoPartes=parts;
      const address=parts.join(", ");
      const suffix=address.split(streetNumber).at(-1).replace(/^[ ,;–-]+/,"");
      if(streetNumber.test(address) && suffix){
        data.endereco=address;data.bairro=suffix;
      }else if(parts.length>1 && !streetNumber.test(raw) && !streetPrefix.test(t)){
        data.bairro=raw;
      }else return next(stage,neighborhoodQuestion);
    }else data.bairro=raw;
    return next("necessidade","Obrigado, anotei *"+data.bairro+"*.\n\n"+(data.servico?nextDetail(data):serviceQuestion));
  }
  if(stage==="endereco_final" || stage==="ajustar_endereco"){
    if(timing.test(t)){data.preferencia=[data.preferencia,raw].filter(Boolean).join(" · ");return next(stage,"Anotei sua preferência. Falta completar o endereço.");}
    if(/^(sim|confirmar|confirmo)$/.test(t))return next(stage,"Envie o endereço para eu mostrar o pedido completo.");
    const parts=data.enderecoPartes||[];
    if(!parts.some(part=>norm(part)===t))parts.push(raw);
    data.enderecoPartes=parts;
    if(data.numeroInformado && parts.length && !parts.some(part=>streetNumber.test(part)) && streetPrefix.test(norm(parts[0]))){
      const [street,...locality]=parts[0].split(/,\s*/);
      parts.splice(0,1,street,data.numeroInformado,...locality);
    }
    const address=parts.join(", ");
    if(!streetNumber.test(address))return next(stage,"Qual é o número do imóvel? Se não houver, escreva s/n.");
    if(!/[a-z]{2}/i.test(norm(address).replace(streetNumber,"")))return next(stage,"Qual é o nome da rua?");
    const suffix=address.split(streetNumber).at(-1).replace(/^[ ,;–-]+/,"");
    if(!suffix && !data.bairro?.includes(","))return next(stage,"Em qual cidade fica esse endereço?");
    if(stage==="ajustar_endereco" && suffix)data.bairro=suffix;
    const includeBairro=data.bairro && !norm(address).includes(norm(data.bairro));
    data.endereco=includeBairro?address+" · Bairro: "+data.bairro:address;
    return next("revisao_guiada",guidedReview(data));
  }
  if(stage==="necessidade"){
    if(data.triagemDireta && data.servico?.startsWith("Limpeza") && /janela/.test(norm(data.relato)) && !marketIntent(t)){
      const access=norm(data.relato+" "+raw);
      const difficult=/fachada|andaime|rapel|dificil|complicado|sem acesso|nao sei|nao tenho certeza|nao.*facil/.test(access) || /^(nao|negativo)[.! ]*$/.test(t);
      if(difficult)data.acessoAvaliar=true;
      else if(!/sim|facil|simples|terreo|tranquilo/.test(t) && !/facil acesso|acesso (simples|facil)|terreo/.test(norm(data.relato)))
        return next(stage,"Para calcular a limpeza, preciso saber se o aparelho fica em local de fácil acesso. Pode responder sim, não ou explicar como é o local.");
    }
    const market=marketIntent(t);
    if(market)return orderFlow(market,data,{guided:false,relato:[data.relato,raw].filter(Boolean).join(" ").slice(-800)});
    const history=[data.relato,raw].filter(Boolean).join(" ").slice(-800);
    data.servico=serviceType(t)||data.servico||serviceType(norm(history));
    if(!data.servico){
      const special=initialIntent(t,data);
      if(special && /Venda|Compra|Contrato/.test(special.data.servico||""))return {...special,data:{...special.data,guided:false}};
      data.relato=history;
      return next(stage,"Você precisa de instalação, limpeza, conserto, compra ou venda? Pode explicar com suas palavras.");
    }
    data.relato=history;
    if(!/janela|split|geladeira|freezer|lavadora|maquina|ar[ -]condicionado|refrigerador/.test(norm(history)))
      return next(stage,askEquipment(data));
    if(!data.servico.startsWith("Manutenção") && !/janela|split/.test(norm(history)))
      return next(stage,"O ar-condicionado é split ou de janela? Se souber, informe também a capacidade em BTUs.");
    if(data.servico.startsWith("Manutenção") && !/nao |parou|vaz|barulho|ping|queb|gelando pouco|cheiro|ruido|falh|deslig|esquent|trav|trepid|erro|congel/.test(norm(history)) && !data.perguntouDefeito){
      data.perguntouDefeito=true;
      return next(stage,"O que acontece quando você liga o aparelho? Se ainda não souber, pode responder “preciso de avaliação”.");
    }
    if(data.triagemDireta && data.servico.startsWith("Limpeza") && /^(nao|dificil)[.! ]*$/.test(t))data.relato=history+" · acesso difícil";
    data.equipamento=data.relato;
    const unresolvedAccess=data.triagemDireta && data.servico.startsWith("Instalação") && elevated(norm(history)) && !/varanda|sacada|terreo|facil acesso|acesso (facil|simples)/.test(norm(history));
    const estimate=data.acessoAvaliar || unresolvedAccess?null:quote(data);
    data.orcamento=estimate || "Avaliação de Leonardo pendente para definir mão de obra, materiais e valor total.";
    data.avaliacaoPendente=!estimate;
    delete data.interesseOrcamento;
    const message=estimate
      ? estimate+"\n\nEsse orçamento atende ao que você procura?"
      : "*Orçamento sob avaliação*\nLeonardo vai conferir os detalhes e informar mão de obra, materiais e total. Quer seguir com a solicitação de avaliação?";
    return next("aceite_orcamento",message+"\nResponda SIM para seguir, NÃO para encerrar ou envie sua dúvida.");
  }
  if(stage==="aceite_orcamento"){
    if(accepted || correctedNumber && /^((por mim )?pode (marcar|agendar)|sim|aceito)[,. ]+(mas )?(o )?numero/.test(t)){

      data.interesseOrcamento=data.avaliacaoPendente?"Solicitou avaliação":"Quer seguir com o orçamento apresentado";
      if(data.triagemDireta && (!data.cliente || !data.bairro))return next("identificacao_aceite",data.cliente?neighborhoodQuestion:nameQuestion);
      if(!data.endereco){
        return next("endereco_final","Para completar o pedido, envie a rua, o número (ou s/n) e a cidade. Pode mandar em mensagens separadas."+(data.bairro?" Já anotei o bairro: "+data.bairro+".":""));
      }
      return next("revisao_guiada",guidedReview(data));
    }
    if(/^(nao|agora nao|nao quero|nao obrigado|nao obrigada)[.! ]*$/.test(t))
      return {stage:"encerrado",mode:"bot",data:{},reply:"Tudo bem! Obrigado pelo contato. Se precisar, estamos por aqui."};
    if(timing.test(t)){
      data.preferencia=[data.preferencia,raw].filter(Boolean).join(" · ").slice(-150);
      return next(stage,"Anotei sua preferência: "+data.preferencia+". Quer seguir? Responda SIM ou NÃO.");
    }
    return {stage,mode:"human",data:{...data,duvidaOrcamento:raw},reply:"Vou deixar sua dúvida com Leonardo. Ele dará continuidade por aqui."};
  }
  if(stage==="revisao_guiada"){
    if(accepted)return {stage:"encerrado",mode:"bot",data:{},reply:null,order:{...data}};
    if(timing.test(t)){
      data.preferencia=[data.preferencia,raw].filter(Boolean).join(" · ").slice(-150);
      return next(stage,guidedReview(data));
    }
    if(t==="corrigir")return next("campo_correcao","Qual dado quer corrigir? Escreva nome, endereço, serviço ou preferência.");
    return next(stage,"Para ajustar, escreva CORRIGIR. Para registrar os dados acima, responda CONFIRMAR.");
  }
  if(stage==="campo_correcao"){
    if(t==="nome")return next("ajustar_nome",nameQuestion);
    if(t==="endereco"){data.enderecoPartes=[];return next("ajustar_endereco",addressQuestion);}
    if(t==="servico"){data.relato="";data.servico="";return next("necessidade",serviceQuestion);}
    if(t==="preferencia")return next("ajustar_preferencia","Qual dia ou período você prefere?");
    return next(stage,"Qual campo deseja alterar: nome, endereço, serviço ou preferência?");
  }
  if(stage==="ajustar_nome"){data.cliente=raw;}
  else if(stage==="ajustar_preferencia"){data.preferencia=raw;}
  return next("revisao_guiada",guidedReview(data));
}

function advanceCore(session, incoming) {
  let stage=session?.stage||"menu",mode=session?.mode||"bot";
  const data={...(session?.data||{})};
  const raw=String(incoming?.text||"").trim().slice(0,1000),t=norm(raw);
  if(/^(menu|inicio|reiniciar|0)$/.test(t))return {stage:"menu",mode:"bot",data:{},reply:MENU};
  if(mode==="human" || data.handoffPending === true)return {stage,mode,data,reply:null};
  if((!["endereco_final","ajustar_endereco","bairro_inicial","endereco"].includes(stage) && /^(5|9)$/.test(t)) || /^(humano|atendente|responsavel|falar com leonardo|falar com responsavel|pessoa de verdade)$/.test(t))
    return human(stage,data);
  if(/^(cancelar|desistir|cancela)$/.test(t))
    return {stage:"menu",mode:"bot",data:{},reply:"Tudo bem, sem problema. Não registrei nenhum novo pedido.\n\n"+MENU};
  if(/cheiro de queimado|fumaca|faisca|choque eletrico|principio de incendio/.test(t))
    return {stage,mode:"human",data,reply:"⚠️ Sinto muito por essa situação. Por segurança, pare de usar o equipamento e, se puder fazer isso sem risco, desligue a energia. Havendo fogo ou perigo imediato, acione a emergência. Não tente abrir ou reparar o aparelho. Vou deixar a conversa para Leonardo avaliar seu relato."};
  const intake=["menu","encerrado","assunto","nome","bairro_inicial","necessidade","mercado","eletro_escolha"].includes(stage);
  const supplied=intake?contactDetails(raw):{};
  Object.assign(data,supplied);
  const topic=data.servico || serviceType(t);
  const conditions=[];
  if (/parcel|cartao|forma[s]? de pagamento/.test(t)) conditions.push("as condições de pagamento");
  if (/garantia/.test(t)) conditions.push("a garantia");
  if (/tem desconto|faz por menos|preco negociavel/.test(t)) conditions.push("a possibilidade de desconto");
  if (/prazo de entrega/.test(t)) conditions.push("o prazo de entrega");
  const parts=t.split(/\?+|\s+e\s+(?=(?:voces?|qual|quando|quem|como|quanto|por que|tem|aceita|fazem)\b)/).map(part=>part.trim()).filter(Boolean);
  const known=serviceAnswer(t,topic);
  const partial=Boolean(known && parts.length>1 && parts.some(part=>
    /^(voces?|qual|quando|quem|como|quanto|por que|tem|aceita|fazem)\b/.test(part) && !serviceAnswer(part,topic)));
  if ((conditions.length || partial) && (intake || data.guided) && !["venda_valor","venda_negociavel"].includes(stage)){
    const pending=conditions.length?"a confirmação sobre "+conditions.join(" e "):"a outra dúvida da sua mensagem";
    return {stage,mode:"human",data:{...data,servico:topic,duvidaCliente:raw},reply:[stage==="menu"?welcome:"",known,"Vou deixar com Leonardo "+pending+". Ele continua por aqui com os detalhes que você já enviou."].filter(Boolean).join("\n\n")};
  }
  if(stage==="venda_midia"){
    const m=incoming?.media;
    if(m&&m.type===incoming.type&&["image","video"].includes(incoming.type)&&["ycloud","meta"].includes(m.provider)&&/^[A-Za-z0-9_-]{1,160}$/.test(String(m.id||""))){
      const item={provider:m.provider,type:m.type,id:String(m.id),link:String(m.link||"").slice(0,4096),mimeType:String(m.mimeType||"").slice(0,80)};
      const list=Array.isArray(data.mediaItems)?data.mediaItems:[];
      data.mediaItems=[...list.filter(x=>x?.id!==item.id),item].slice(-10);
    }
    if(incoming?.type==="image") data.fotos=Math.min(20,Number(data.fotos||0)+1);
    if(incoming?.type==="video") data.videoRecebido=true;
    if(Number(data.fotos||0)>0 && data.videoRecebido===true){
      const nextStage=data.cliente?(data.bairro?"equipamento":"bairro"):"nome";
      const question=nextStage==="equipamento"?askEquipment(data):nextStage==="bairro"?"Em qual bairro e cidade fica o equipamento?":nameQuestion;
      return {stage:nextStage,mode,data,reply:"✅ *Foto e vídeo recebidos!* Obrigado por enviar as imagens para avaliação.\n\n"+question};
    }
    if(!["image","video"].includes(incoming?.type))return {stage,mode,data,reply:"Para avaliar o equipamento, envie "+(Number(data.fotos||0)>0?"um vídeo":data.videoRecebido?"uma foto":"uma foto e um vídeo")+" aqui na conversa."};
    if(Number(data.fotos||0)===0){
      return {stage,mode,data,reply:"🎥 Vídeo recebido! Para continuar, falta enviar *uma foto* do equipamento aqui na conversa."};
    }
    return {stage,mode,data,reply:"📷 Foto recebida! Para continuar, falta enviar *um vídeo* mostrando o aparelho."};
  }
  if(incoming?.type==="image" || incoming?.type==="video") {
    if(incoming.type==="image")data.fotos=Math.min(20,Number(data.fotos||0)+1);
    return {stage,mode,data,reply:(incoming.type==="image"?"📷 Foto":"🎥 Vídeo")+" recebido! Leonardo poderá visualizar na conversa. "+(stage==="menu"?"Conte também o que está acontecendo com o equipamento.\n\n"+MENU:"Pode continuar com as informações que estávamos preenchendo.")};
  }
  if(stage==="venda_valor"){
    const aCombinar=/^(a combinar|a negociar|nao sei|sem valor definido|prefiro conversar)$/.test(t);
    if(aCombinar){
      data.valorPretendido="A combinar";
      data.valorPretendidoNumero=null;
      data.valorNegociavel="A combinar";
      return {stage:"preferencia",mode,data,reply:askPreference(data)};
    }
    const match=t.match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?|\d+(?:\.\d{1,2})?)/);
    const token=match?.[1]||"";
    const valor=token.includes(",")?Number(token.replace(/\./g,"").replace(",",".")):
      /^\d{1,3}(?:\.\d{3})+$/.test(token)?Number(token.replace(/\./g,"")):Number(token);
    if(!token||!Number.isFinite(valor)||valor<=0||valor>999999.99){
      return {stage,mode,data,reply:"💰 Qual *valor em reais* você pretende receber pelo equipamento? Exemplo: *R$ 1.500,00*. Se ainda não souber, responda *A COMBINAR*."};
    }
    data.valorPretendidoNumero=Math.round(valor*100)/100;
    data.valorPretendido=new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(data.valorPretendidoNumero);
    return {stage:"venda_negociavel",mode,data,reply:"Obrigado! Registrei o valor pretendido de *"+data.valorPretendido+"*.\n\nEsse valor é negociável? Responda *SIM* ou *NÃO*."};
  }
  if(stage==="venda_negociavel"){
    if(/^(sim|s|negociavel|pode negociar)$/.test(t))data.valorNegociavel="Sim";
    else if(/^(nao|n|nao negociavel)$/.test(t))data.valorNegociavel="Não";
    else if(/^(a combinar|a negociar)$/.test(t))data.valorNegociavel="A combinar";
    else return {stage,mode,data,reply:"O valor pretendido é negociável? Responda *SIM*, *NÃO* ou *A COMBINAR*."};
    return {stage:"preferencia",mode,data,reply:askPreference(data)};
  }
  if(/(plataforma|acessar o site|acessar plataforma|link do site|formulario online|agendar online)/.test(t))
    return {stage,mode,data,reply:"🌐 Claro! Você pode acessar nossa plataforma por aqui:\n"+PLATFORM_URL+"\n\nLá é possível enviar uma solicitação de atendimento e obter um protocolo. Se preferir, podemos continuar pelo WhatsApp. A visita depende de confirmação."};
  const statedTopic=Boolean(serviceType(t)) || /refrigeracao|ar[ -]condicionado|geladeira|freezer|lavadora|maquina de lavar|split|ar de janela/.test(t);
  if(stage==="outro_assunto"){
    if(!isCommercialIntent(raw))return {stage,mode,data,reply:null};
    stage="menu";
  }
  if(["menu","assunto","eletro_escolha","mercado"].includes(stage) && marketIntent(t))
    return orderFlow(marketIntent(t),data,{guided:false,relato:[data.relato,raw].filter(Boolean).join(" ").slice(-800)});
  if(stage==="assunto"){
    if(/^(nao\b|outro\b|pessoal\b)/.test(t))
      return {stage:"outro_assunto",mode,data:{},reply:"Tudo bem! Vou deixar a conversa para o Leonardo."};
    if(/^(sim|isso|e sim)[.! ]*$/.test(t))
      return {stage,mode,data,reply:"Perfeito! Qual equipamento ou serviço precisa de atendimento? Pode contar o que está acontecendo."};
    if(statedTopic){
      const service=serviceType(t);
      if(service)return beginService(data,raw,service,false);
      return initialIntent(t,data) || {stage,mode,data,reply:"Qual serviço você procura para esse equipamento: instalação, manutenção ou higienização?"};
    }
    return {stage,mode,data,reply:"Seu contato é sobre refrigeração? Pode responder SIM, OUTRO ASSUNTO ou contar o que precisa."};
  }
  if(stage==="encerrado"){
    if(ack.test(t)||t==="sim")return {stage,mode,data,reply:null};
    stage="menu";
  }
  if(data.guided && ["nome","bairro_inicial"].includes(stage) && Object.keys(supplied).length)
    return beginService(data,[data.relato,raw].filter(Boolean).join(" ").slice(-800),data.servico || serviceType(t),false);
  if(data.guided)return guidedStep(stage,data,raw,t);
  if(stage==="menu" && !/^\d+$/.test(t) && !/contrato|empresa|residencial|protocolo|acompanhar|quero vender|quero comprar|agendar online/.test(t)){
    if(ack.test(t))return {stage,mode,data,reply:null};
    if(!statedTopic)return {stage:"assunto",mode,data,reply:"Para falar sobre refrigeração, conte qual equipamento ou serviço você procura. Se for outro assunto, responda *OUTRO ASSUNTO*."};
    return beginService(data,raw,serviceType(t),true);
  }
  if(/preco|valor|quanto custa|quanto fica|orcamento|quanto cobram/.test(t))
    return {stage,mode,data,reply:explainService(data.servico || serviceType(t))+"\n\n"+(data.servico?askEquipment(data):serviceQuestion)};
  if(stage==="menu"){
    const intent=initialIntent(t,data);
    if(intent){
      if(/nao gela|parou de funcionar|nao centrifuga/.test(t))
        intent.reply="Entendo a preocupação com o equipamento. Vamos organizar seu atendimento com atenção. 💙\n\n"+intent.reply;
      return intent;
    }
    return {stage,mode,data,reply:MENU};
  }
  if(stage==="agenda_escolha") {
    if(t==="1" || /agend|solicit|marcar/.test(t))
      return {stage:"menu",mode,data:{},reply:"🌐 *Solicite seu atendimento pela plataforma:*\n"+PLATFORM_URL+"\n\nVocê pode informar os detalhes do serviço e sua preferência de data. Leonardo confirmará a disponibilidade antes de fechar o agendamento.\n\nSe preferir continuar pelo WhatsApp, digite *0* para escolher o serviço."};
    if(t==="2" || /acompanhar|protocolo|andamento/.test(t))
      return {stage:"protocolo",mode,data,reply:"🧾 Envie seu protocolo para conferência. Se não tiver, informe seu nome e bairro. Leonardo verificará o andamento e responderá por aqui."};
    return {stage,mode,data,reply:SCHEDULE_MENU};
  }
  if(stage==="eletro_escolha") {
    if(t==="1" || /(manutencao|consert|reparo|defeito|nao gela|nao liga|nao centrifuga|geladeira|freezer|maquina de lavar|lavadora)/.test(t))
      return orderFlow("Manutenção e consertos",data);
    if(t==="2" || /comprar|compra/.test(t))return orderFlow("Compra de equipamento",data);
    if(t==="3" || /vender|venda/.test(t))return orderFlow("Venda de equipamento",data);
    return {stage,mode,data,reply:APPLIANCE_MENU};
  }
  if(stage==="empresa_escolha") {
    let servico="";
    if(t==="1" || /manutencao|consert|reparo/.test(t))servico="Manutenção e consertos";
    else if(t==="2" || /limpeza|higieniza/.test(t))servico="Limpeza profunda e higienização";
    else if(t==="3" || /contrato|preventiva|periodica/.test(t))servico="Contrato de manutenção e limpeza";
    else if(/instalac|instalar/.test(t))servico="Instalação de ar-condicionado";
    return servico?orderFlow(servico,data,{tipoAtendimento:"Empresarial"}):{stage,mode,data,reply:BUSINESS_MENU};
  }
  if(["residencial","ar_escolha"].includes(stage)){
    const next=route(raw,data);
    if(!next)return {stage,mode,data,reply:stage==="residencial"?RESIDENTIAL_MENU:AIR_MENU};
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
    if(bairroConhecido(raw))return {stage,mode,data:{...data,bairro:raw.slice(0,120)},reply:"Obrigado! Anotei *"+raw+"* como bairro. Agora, como posso chamar você?"};
    data.cliente=raw.slice(0,120);
    if(data.bairro)return {stage:"equipamento",mode,data,reply:askEquipment(data)};
    return {stage:"bairro",mode,data,reply:"Prazer, "+data.cliente.split(" ")[0]+"! 😊 Em qual bairro e cidade fica o atendimento?"};
  }
  if(stage==="bairro"){
    if(raw.length<2)return {stage,mode,data,reply:"Informe o bairro e a cidade, por favor."};
    data.bairro=raw.slice(0,150);
    if(norm(data.servico).includes("venda") && !(Number(data.fotos||0)>0 && data.videoRecebido===true))
      return {stage:"venda_midia",mode,data,reply:"Obrigado! Agora podemos fazer uma avaliação inicial.\n\n"+SALE_MEDIA_REPLY};
    return {stage:"equipamento",mode,data,reply:"Obrigado, anotei *"+data.bairro+"*.\n\n"+askEquipment(data)};
  }
  if(stage==="equipamento"){
    if(raw.length<3)return {stage,mode,data,reply:"Conte um pouco mais sobre o equipamento ou a necessidade, por favor."};
    data.equipamento=raw.slice(0,500);
    if(norm(data.servico).includes("venda"))return {stage:"venda_valor",mode,data,reply:"💰 *Qual valor você pretende receber pelo equipamento?* Informe o valor em reais (por exemplo, R$ 1.500,00). Se ainda não definiu, responda *A COMBINAR*."};
    return {stage:"preferencia",mode,data,reply:askPreference(data)};
  }
  if(stage==="preferencia"){
    if(raw.length<3)return {stage,mode,data,reply:"Pode informar um dia/período de preferência ou escrever *a combinar*?"};
    data.preferencia=raw.slice(0,180);
    return {stage:"confirmar",mode,data,reply:review(data)};
  }
  if(stage==="confirmar"){
    if(/^(sim|confirmar|confirmo|ok)$/.test(t))
      return {stage:"encerrado",mode:"bot",data:{},reply:null,order:{...data}};
    if(/^(nao|não)$/.test(t))
      return {stage:"menu",mode:"bot",data:{},reply:"Sem problemas! Não foi criado um pedido.\n\n"+MENU};
    return {stage,mode,data,reply:"Para proteger seus dados, só registro a solicitação com sua autorização. Responda *SIM* para registrar ou *CANCELAR* para desistir."};
  }
  return {stage:"menu",mode:"bot",data:{},reply:MENU};
}

function brazilHour(when=new Date()) {
  const validDate=when instanceof Date && !Number.isNaN(when.getTime()) ? when : new Date();
  return Number(new Intl.DateTimeFormat("en-GB",{timeZone:"America/Sao_Paulo",hour:"2-digit",hourCycle:"h23"}).format(validDate));
}

export function openingGreeting(when=new Date()) {
  const hour=brazilHour(when);
  const greeting=hour>=5&&hour<12?"Bom dia":hour>=12&&hour<18?"Boa tarde":"Boa noite";
  return greeting+"! 👋\n\nSou a *assistente virtual da Leonardo Moreira Refrigeração*. Nosso atendimento é automático e acompanhado pelo técnico Leonardo.";
}

export function advance(session,incoming) {
  const result=advanceCore(session,incoming);
  if(typeof result?.reply!=="string" || !result.reply.trim())return result;
  const greeted=session?.data?.saudacaoEnviada===true;
  const data={...(result.data||{}),saudacaoEnviada:true};
  let reply=result.reply.replaceAll(welcome+"\n\n","").replaceAll(welcome,"");
  if(!greeted){
    const received=incoming?.receivedAt ? new Date(incoming.receivedAt) : new Date();
    reply=openingGreeting(received)+"\n\n"+reply;
  }
  return {...result,data,reply};
}

export function closingMessage(protocol,when=new Date()) {
  const hour=brazilHour(when);
  const greeting=hour>=5&&hour<12?"um ótimo dia":hour>=12&&hour<18?"uma ótima tarde":"uma ótima noite";
  return "✅ *Solicitação recebida!*\nProtocolo: *"+protocol+"*\n\nO técnico *Leonardo Moreira*, responsável pelo atendimento, entrará em contato em breve para avaliar o pedido. Leonardo confirmará os próximos passos por aqui.\n\nObrigado pelo contato e tenha "+greeting+"!";
}
