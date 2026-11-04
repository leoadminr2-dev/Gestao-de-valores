// Ativação seletiva: não interromper conversas particulares.
// Nada é enviado nem persistido para mensagens sem intenção comercial.
const EXACT = new Set([
  "refrigeracao", "geladeira", "geladeiras", "freezer", "freezers",
  "ar condicionado", "ar de janela", "ar condicionado de janela", "split",
  "maquina de lavar", "lavadora", "manutencao", "orcamento", "conserto",
  "instalacao", "limpeza", "limpeza profunda", "higienizacao", "visita tecnica"
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

  const equipment = /\b(refrigeracao|geladeiras?|freezers?|ar condicionado|ar de janela|splits?|maquinas? de lavar|lavadoras?|evaporadora|condensadora)\b/.test(value);
  const service = /\b(manutencao|orcamento|conserto|consertar|reparo|instalacao|instalar|limpeza|limpar|higienizacao|higienizar|visita tecnica|assistencia tecnica|contrato preventivo|contrato de manutencao)\b/.test(value);
  const fault = /\b(nao gela|nao esfria|nao liga|nao centrifuga|parou|quebrou|queimou|vazamento|vazando|pingando|nao esta gelando|sem gelar|gelando pouco|barulho|defeito|problema|congelando demais|cheiro de queimado)\b/.test(value);
  const seeking = /\b(preciso|quero|queria|gostaria|pode|voce faz|voces fazem|faz|atende|solicitar|agendar|marcar|quanto custa|quanto fica|quanto cobra|quanto cobram|qual valor|qual preco|valor|preco|cotacao|comprar|vender)\b/.test(value);
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
    return recentlyActive && /^(menu|inicio|reiniciar|0)$/.test(normalizeText(text));
  }
  if (recentlyActive) return true;
  return messageType === "text" && isCommercialIntent(text);
}
