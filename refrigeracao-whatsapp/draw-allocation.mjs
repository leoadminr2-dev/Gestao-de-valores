import {randomInt, randomUUID} from "node:crypto";

export class DrawError extends Error {
  constructor(message, status = 409, code = "DRAW_ERROR") {
    super(message);
    this.name = "DrawError";
    this.status = status;
    this.code = code;
  }
}

const CAMPAIGN_ID = "split-inverter-9000-2026";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateEntry(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new DrawError("Dados de cadastro inválidos.", 400, "INVALID_PAYLOAD");
  }
  const name = String(raw.name || "").trim().replace(/\s+/g, " ");
  const phone = String(raw.phone || "").trim();
  const quantity = Number(raw.quantity);
  const requestId = String(raw.requestId || "").trim();
  if (name.length < 5 || name.length > 120 || !name.includes(" ")) {
    throw new DrawError("Informe nome e sobrenome.", 400, "INVALID_NAME");
  }
  if (!/^\+55\d{10,11}$/.test(phone)) {
    throw new DrawError("Informe um WhatsApp válido com DDD.", 400, "INVALID_PHONE");
  }
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 500) {
    throw new DrawError("Informe uma quantidade entre 1 e 500.", 400, "INVALID_QUANTITY");
  }
  if (!UUID_PATTERN.test(requestId)) {
    throw new DrawError("Identificador de solicitação inválido.", 400, "INVALID_REQUEST_ID");
  }
  return {name, phone, quantity, requestId};
}

export function chooseRandomNumbers(available, requested, draw = randomInt) {
  if (!Number.isSafeInteger(requested) || requested < 1 || requested > available.length) {
    throw new DrawError("Quantidade indisponível. Escolha outra.", 409, "INSUFFICIENT_NUMBERS");
  }
  const pool = [...available];
  const selected = [];
  for (let i = 0; i < requested; i++) {
    const offset = draw(pool.length - i);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset >= pool.length - i) {
      throw new Error("Invalid random source");
    }
    const index = i + offset;
    [pool[i], pool[index]] = [pool[index], pool[i]];
    selected.push(pool[i]);
  }
  return selected;
}

function publicReceipt(entry) {
  return {
    id: entry.id,
    name: entry.participant_name,
    quantity: entry.requested_quantity,
    numbers: entry.assigned_numbers.map(n => String(n).padStart(3, "0")).sort(),
    createdAt: entry.created_at
  };
}

/**
 * All-or-nothing number assignment.
 * The campaign row is locked for the entire transaction: simultaneous requests
 * serialize. PK(campaign_id, number) independently rejects duplicate numbers.
 * UNIQUE(campaign_id, phone_e164) rejects a second registration by the same phone.
 * UNIQUE(campaign_id, request_id) makes retries idempotent.
 * Never place this function in browser code; run behind authenticated/captcha-checked API.
 */
export async function assignNumbers(pool, raw, options = {}) {
  const input = validateEntry(raw);
  const campaignId = options.campaignId || CAMPAIGN_ID;
  const client = await pool.connect();
  let inTransaction = false;
  try {
    await client.query("BEGIN");
    inTransaction = true;
    const campaignResult = await client.query(
      "SELECT id,total_numbers,registration_open FROM public.refrigeracao_draw_campaigns WHERE id=$1 FOR UPDATE",
      [campaignId]
    );
    const campaign = campaignResult.rows[0];
    if (!campaign || !campaign.registration_open) {
      throw new DrawError("Inscrições ainda não abertas.", 423, "REGISTRATION_CLOSED");
    }
    const existing = await client.query(
      "SELECT * FROM public.refrigeracao_draw_entries WHERE campaign_id=$1 AND request_id=$2",
      [campaignId, input.requestId]
    );
    if (existing.rowCount) {
      const saved = existing.rows[0];
      if (saved.phone_e164 !== input.phone || saved.requested_quantity !== input.quantity) {
        throw new DrawError("Solicitação já utilizada.", 409, "REQUEST_REUSED");
      }
      await client.query("COMMIT");
      inTransaction = false;
      return {...publicReceipt(saved), repeated: true};
    }
    const matchingPhone = await client.query(
      "SELECT id FROM public.refrigeracao_draw_entries WHERE campaign_id=$1 AND phone_e164=$2",
      [campaignId, input.phone]
    );
    if (matchingPhone.rowCount) {
      throw new DrawError("Este telefone já possui uma inscrição. Consulte seu comprovante.", 409, "ALREADY_REGISTERED");
    }
    if (input.quantity > campaign.total_numbers) {
      throw new DrawError("Quantidade acima do limite da campanha.", 409, "OVER_CAPACITY");
    }
    const allocations = await client.query(
      "SELECT number FROM public.refrigeracao_draw_allocations WHERE campaign_id=$1",
      [campaignId]
    );
    const used = new Set(allocations.rows.map(row => Number(row.number)));
    const available = Array.from({length: campaign.total_numbers}, (_, i) => i + 1).filter(n => !used.has(n));
    const picked = chooseRandomNumbers(available, input.quantity, options.randomInt || randomInt);
    const entryId = randomUUID();
    const inserted = await client.query(
      `INSERT INTO public.refrigeracao_draw_entries
       (id,campaign_id,request_id,participant_name,phone_e164,requested_quantity,assigned_numbers)
       VALUES($1,$2,$3,$4,$5,$6,$7::integer[]) RETURNING *`,
      [entryId, campaignId, input.requestId, input.name, input.phone, input.quantity, picked]
    );
    await client.query(
      `INSERT INTO public.refrigeracao_draw_allocations (campaign_id,number,entry_id)
       SELECT $1, assigned.number, $3 FROM unnest($2::integer[]) AS assigned(number)`,
      [campaignId, picked, entryId]
    );
    await client.query("COMMIT");
    inTransaction = false;
    return {...publicReceipt(inserted.rows[0]), repeated: false};
  } catch (error) {
    if (inTransaction) {
      try { await client.query("ROLLBACK"); } catch { /* preserve original error */ }
    }
    if (error.code === "23505") {
      throw new DrawError("Cadastro ou número já registrado. Tente novamente.", 409, "CONFLICT");
    }
    throw error;
  } finally {
    client.release();
  }
}
