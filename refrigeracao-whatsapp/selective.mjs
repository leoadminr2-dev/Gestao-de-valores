// Ativação seletiva: não interromper conversas particulares.
// Nada é enviado nem persistido para mensagens sem intenção comercial.
const EXACT = new Set([
  "refrigeracao", "geladeira", "geladeiras", "freezer", "freezers",
  "ar condicionado", "ar de janela", "ar condicionado de janela", "split",
  "maquina de lavar", "lavadora", "manutencao", "orcamento", "conserto",
  "instalacao", "limpeza", "limpeza profunda", "higienizacao", "visita tecnica",
  "cervejeira", "frigobar", "bebedouro", "adega", "camara fria", "ventilador de teto"
]);

export function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/[!?.,;:()]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isCommercialIntent(text) {
  const value = normalizeText(text).slice(0, 1000);
  if (!value) return false;
  if (EXACT.has(value)) return true;

  const equipment = /\b(refrigeracao|geladeiras?|freezers?|ar condicionado|ar de janela|splits?|maquinas? de lavar|lava e seca|lavadoras?|evaporadora|condensadora|compressor(?:es)?|cervejeiras?|frigobares?|adegas?|bebedouros?|expositores?|balcao refrigerado|camara fria|ventiladores? de teto)\b/.test(value);
  const service = /\b(manutencao|orcamento|conserto|consertar|reparo|reoperacao|carga de gas|troca de compressor|troca de motor|instalacao|instalar|limpeza|limpar|lavar|lavagem|lavacao|higienizacao|higienizar|visita tecnica|assistencia tecnica|contrato preventivo|contrato de manutencao)\b/.test(value);
  const fault = /\b(nao gela|nao esfria|nao refrigera|nao congela|nao liga|nao centrifuga|nao esta gelando|nao esta refrigerando|nao esta centrifugando|parou|quebrou|queimou|vazamento|vazando|pingando|sem gelar|gelando pouco|barulho|defeito|problema|congelando demais|cheiro de queimado|desarma o disjuntor|compressor nao liga|parte de cima nao gela|suc[cç]ao congelando|tubo de suc[cç]ao congelando|so ventila|so congela)\b/.test(value);
  const seeking = /\b(preciso|quero|queria|gostaria|pode|voce faz|voces fazem|faz|atende|solicitar|agendar|marcar|quanto custa|quanto fica|quanto cobra|quanto cobram|quanto (?:vc|vcs|voce|voces) (?:me )?cobram?|qto (?:vc|voce) (?:me )?cobram?|qual valor|qual preco|valor|preco|cotacao|compra|compram|venda|comprar|vender|vendem|vendo)\b/.test(value);
  const company = /\b(contrato de limpeza|contrato de manutencao|atendimento empresarial|servico para empresa|servico para empresas)\b/.test(value);

  // Termos de manutenção automotiva não devem ser tratados como refrigeração.
  if (!equipment && /\b(carro|moto|automovel|veiculo|pneu|freio|oficina mecanica)\b/.test(value)) return false;
  if (company && seeking) return true;
  if (equipment && (service || fault || seeking)) return true;
  if (service && seeking) return true;
  return false;
}

function digits(value) {
  return String(value || "").replace(/\D/g, "");
}
export function isProtectedPhone(phone, csv = "") {
  const target = digits(phone);
  if (!target) return false;
  return String(csv || "")
    .split(/[,;\n]/)
    .map(digits)
    .filter(Boolean)
    .includes(target);
}

// App echoes affect only recent commercial bot conversations, never private chats.
export function isExplicitCommercialRequest(text) {
  const value=normalizeText(text);
  return isCommercialIntent(value) &&
    /\b(quero|queria|gostaria|preciso|solicito|orcamento|agendar|marcar|contratar)\b|quanto (?:custa|fica|cobra)|qual (?:valor|preco)/.test(value);
}

export function shouldPauseForManualReply(session, now = Date.now()) {
  const last = Date.parse(session?.last_message_at || "");
  return session?.mode === "bot" && session?.data?.commercialActivated === true &&
    Number.isFinite(last) && now >= last && now - last <= 24 * 60 * 60 * 1000;
}

export function shouldHandleMessage({
  phone, messageType = "text", text = "", session = null,
  protectedPhones = "", now = Date.now()
}) {
  if (isProtectedPhone(phone, protectedPhones)) return false;

  const last = Date.parse(session?.last_message_at || "");
  const recentlyActive = session?.data?.commercialActivated === true &&
    Number.isFinite(last) && now >= last && now - last <= 24 * 60 * 60 * 1000;

  // Depois da transferência para Leonardo, só o comando de retomada
  // numa conversa comercial previamente ativa permite reabrir o robô.
  if (session?.mode === "human") {
    // Recover past personal contacts incorrectly tagged as human by app echoes.
    if (session?.data?.commercialActivated !== true)
      return messageType === "text" && isExplicitCommercialRequest(text);
    return recentlyActive && /^(menu|inicio|reiniciar|0)$/.test(normalizeText(text));
  }
  if (recentlyActive) return true;
  return messageType === "text" && isCommercialIntent(text);
}
