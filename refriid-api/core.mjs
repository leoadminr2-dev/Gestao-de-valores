import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual, createHash } from 'node:crypto';

export const SITE = '20eb7440-0899-4a5c-a8db-c1d850817b79';
export const CLIENT = '6b69e15d-6084-4999-a62a-73c46f308bcf';
export const APPLICATION = '3973755243076236';
export const SELLER = '81128886';
export const PRICE = 29.90;
export const ORIGIN = 'https://headless-ynataurgyhy-leoadminr2-140a.wix-site-host.com';

export function fail(status, message) { throw Object.assign(new Error(message), { status }); }
export function equalSecret(a, b) {
  if (!a || !b) return false;
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}
export function seal(value, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  const bytes = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), bytes].map(b => b.toString('base64url')).join('.');
}
export function unseal(value, key) {
  const [iv, tag, bytes] = value.split('.').map(v => Buffer.from(v, 'base64url'));
  const cipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(bytes), cipher.final()]).toString('utf8');
}
export function memberIdentity(info) {
  const get = (a, b) => info[a] ?? info[b];
  if (!info.active || get('subjectType', 'subject_type') !== 'MEMBER' ||
      String(get('siteId', 'site_id')) !== SITE || String(get('clientId', 'client_id')) !== CLIENT ||
      Number(info.exp) * 1000 <= Date.now()) fail(401, 'Entre na sua conta RefriID.');
  const id = get('subjectId', 'subject_id');
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) fail(401, 'Identidade inválida.');
  return id;
}
export function checkSubscription(s, account) {
  const r = s.auto_recurring;
  if (String(s.application_id) !== APPLICATION || String(s.collector_id) !== SELLER ||
      s.external_reference !== 'refriid:' + account || !r || r.currency_id !== 'BRL' ||
      Math.round(Number(r.transaction_amount) * 100) !== Math.round(PRICE * 100) ||
      r.frequency !== 1 || r.frequency_type !== 'months') fail(422, 'Assinatura fora da configuração RefriID.');
  return s;
}
export function monthAfter(value) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) fail(422, 'Data de pagamento inválida.');
  const day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}
export function entitlement(account, paidUntil, now = Date.now()) {
  const trial = new Date(account.trial_until).getTime();
  const paid = paidUntil ? new Date(paidUntil).getTime() : 0;
  const until = Math.max(trial, paid);
  return { allowed: until > now, status: paid > now ? 'active' : trial > now ? 'trial' : 'expired',
    accessUntil: new Date(until).toISOString(), amount: PRICE, currency: 'BRL' };
}
export async function jsonFetch(url, options = {}, fetcher = fetch) {
  const response = await fetcher(url, { ...options, signal: AbortSignal.timeout(12000) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) fail(response.status === 401 ? 401 : 502, 'Não foi possível confirmar os dados no provedor.');
  return result;
}
