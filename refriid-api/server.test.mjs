import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './server.mjs';
import { SITE, CLIENT, APPLICATION, SELLER, memberIdentity, checkSubscription, seal, unseal,
  monthAfter, entitlement } from './core.mjs';

const member = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const key = 'a'.repeat(64);
const env = { CREDENTIALS_ENCRYPTION_KEY: key, SETUP_TOKEN: 'b'.repeat(64),
  SETUP_EXPIRES_AT: String(Date.now() + 3600000), WEBHOOK_TOKEN: 'c'.repeat(64), BILLING_ENABLED: 'false' };
const identity = () => ({ active: true, subjectType: 'MEMBER', subjectId: member, siteId: SITE,
  clientId: CLIENT, exp: Math.floor(Date.now() / 1000) + 300 });

test('Wix identity must be an active member of this exact OAuth application and site', () => {
  assert.equal(memberIdentity(identity()), member);
  for (const invalid of [{ active: false }, { subjectType: 'VISITOR' }, { siteId: 'other' },
    { clientId: 'other' }, { exp: 1 }, { subjectId: '../secret' }]) {
    assert.throws(() => memberIdentity({ ...identity(), ...invalid }));
  }
});
test('AES-GCM hides the access token and rejects tampering or another key', () => {
  const secret = 'APP_USR-example-secret-key';
  const encrypted = seal(secret, key);
  assert.ok(!encrypted.includes(secret));
  assert.equal(unseal(encrypted, key), secret);
  assert.throws(() => unseal(encrypted, 'b'.repeat(64)));
  const parts = encrypted.split('.');
  parts[2] = (parts[2][0] === 'a' ? 'b' : 'a') + parts[2].slice(1);
  assert.throws(() => unseal(parts.join('.'), key));
});
test('pending or cancelled subscriptions never grant indefinite access', () => {
  const now = Date.parse('2026-02-15T12:00:00Z');
  const account = { trial_until: '2026-02-10T00:00:00Z' };
  assert.equal(entitlement(account, null, now).allowed, false);
  assert.equal(entitlement(account, '2026-03-01T00:00:00Z', now).status, 'active');
  assert.equal(entitlement(account, '2026-03-01T00:00:00Z', Date.parse('2026-03-01T00:00:00Z')).allowed, false);
  assert.equal(monthAfter('2026-01-31T12:00:00Z').toISOString(), '2026-02-28T12:00:00.000Z');
  assert.equal(monthAfter('2028-01-31T12:00:00Z').toISOString(), '2028-02-29T12:00:00.000Z');
});
test('seller, application, member, price, currency and recurrence must all match', () => {
  const valid = { application_id: Number(APPLICATION), collector_id: Number(SELLER),
    external_reference: 'refriid:' + member, auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 29.90, currency_id: 'BRL' } };
  assert.equal(checkSubscription(valid, member), valid);
  for (const patch of [{ application_id: 1 }, { collector_id: 1 }, { external_reference: 'refriid:another' },
    { auto_recurring: { ...valid.auto_recurring, transaction_amount: 0.01 } },
    { auto_recurring: { ...valid.auto_recurring, currency_id: 'USD' } },
    { auto_recurring: { ...valid.auto_recurring, frequency_type: 'days' } }]) {
    assert.throws(() => checkSubscription({ ...valid, ...patch }, member));
  }
});
test('live HTTP setup is authenticated, encrypted, single-use and does not enable charging', async t => {
  let stored; let writes = 0; let mpCalls = 0;
  const db = { async query(sql, params) {
    if (sql.startsWith('SELECT encrypted_token')) return { rows: stored ? [stored] : [] };
    if (sql.includes('INSERT INTO refri_config')) {
      writes++; stored = { encrypted_token: params[0] }; return { rows: [{ id: true }], rowCount: 1 };
    }
    if (sql === 'SELECT 1') return { rows: [{}] };
    throw Error('Unexpected database mutation: ' + sql);
  } };
  const fetcher = async (url) => {
    if (url.endsWith('/oauth2/token-info')) return Response.json(identity());
    assert.equal(url, 'https://api.mercadopago.com/users/me');
    mpCalls++; return Response.json({ id: Number(SELLER), site_id: 'MLB' });
  };
  const server = await createApp({ db, env, fetcher });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const base = 'http://127.0.0.1:' + server.address().port;
  let r = await fetch(base + '/admin/config'); assert.equal(r.status, 401);
  const headers = { Authorization: 'Bearer ' + env.SETUP_TOKEN, 'Content-Type': 'application/json' };
  r = await fetch(base + '/admin/config', { method: 'POST', headers, body: JSON.stringify({ accessToken: 'TEST-invalid' }) });
  assert.equal(r.status, 400); assert.equal(writes, 0); assert.equal(mpCalls, 0);
  const secret = 'APP_USR-' + 'd'.repeat(64);
  r = await fetch(base + '/admin/config', { method: 'POST', headers, body: JSON.stringify({ accessToken: secret }) });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).billingEnabled, false);
  assert.equal(unseal(stored.encrypted_token, key), secret);
  r = await fetch(base + '/admin/config', { headers });
  const text = await r.text(); assert.ok(!text.includes(secret)); assert.ok(!text.includes(stored.encrypted_token));
  r = await fetch(base + '/admin/config', { method: 'POST', headers, body: JSON.stringify({ accessToken: secret }) });
  assert.equal(r.status, 409); assert.equal(writes, 1);
  r = await fetch(base + '/api/billing/subscribe', { method: 'POST', headers: { Authorization: 'Bearer valid-wix-test' } });
  assert.equal(r.status, 503); assert.equal(mpCalls, 1); assert.equal(writes, 1);
  r = await fetch(base + '/health'); assert.equal(r.status, 200);
  assert.equal((await r.json()).credentialsConfigured, true);
  r = await fetch(base + '/webhooks/wrong', { method: 'POST' }); assert.equal(r.status, 404);
  r = await fetch(base + '/setup');
  assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
});
