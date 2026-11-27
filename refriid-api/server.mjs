import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { SITE, CLIENT, APPLICATION, SELLER, PRICE, ORIGIN, fail, equalSecret,
  seal, unseal, memberIdentity, checkSubscription, monthAfter, entitlement, jsonFetch } from './core.mjs';

export async function createApp({ db, env = process.env, fetcher = fetch }) {
  const master = env.CREDENTIALS_ENCRYPTION_KEY;
  if (!/^[0-9a-f]{64}$/.test(master || '') || !env.SETUP_TOKEN || !env.WEBHOOK_TOKEN) {
    throw new Error('Configuração segura do servidor ausente.');
  }
  const live = env.BILLING_ENABLED === 'true';
  const origin = env.PUBLIC_URL || env.RENDER_EXTERNAL_URL;
  const setupPage = await readFile(new URL('./setup.html', import.meta.url));
  const setupScript = await readFile(new URL('./setup.js', import.meta.url));
  const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
  const config = () => one('SELECT encrypted_token FROM refri_config WHERE id = true');
  const mp = async (path, options = {}) => {
    const row = await config();
    if (!row) fail(503, 'Mercado Pago ainda não configurado.');
    return jsonFetch('https://api.mercadopago.com' + path, { ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers,
        Authorization: 'Bearer ' + unseal(row.encrypted_token, master) } }, fetcher);
  };
  const authenticate = async req => {
    const token = (req.headers.authorization || '').replace(/^Bearer /i, '');
    if (!token || token.length > 16000) fail(401, 'Entre na sua conta RefriID.');
    const info = await jsonFetch('https://www.wixapis.com/oauth2/token-info', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }, fetcher);
    return memberIdentity(info);
  };
  const locks = new Map();
  async function serialize(id, action) {
    const previous = locks.get(id) || Promise.resolve();
    const work = previous.catch(() => {}).then(action);
    locks.set(id, work);
    try { return await work; } finally { if (locks.get(id) === work) locks.delete(id); }
  }
  async function syncSubscription(id) {
    const stored = await one('SELECT * FROM refri_subscriptions WHERE id = $1', [id]);
    if (!stored) return;
    const sub = checkSubscription(await mp('/preapproval/' + encodeURIComponent(id)), stored.member_id);
    await db.query('UPDATE refri_subscriptions SET status = $2, checked_at = now() WHERE id = $1', [id, sub.status]);
    // Reconcile invoices even when a notification is missed. Never accept browser payment claims.
    let offset = 0;
    for (let page = 0; page < 100; page++) {
      const invoices = await mp('/authorized_payments/search?preapproval_id=' + encodeURIComponent(id) + '&limit=100&offset=' + offset);
      for (const invoice of invoices.results || []) {
        if (String(invoice.preapproval_id) !== id) continue;
        if (invoice.payment?.id) await syncPayment(String(invoice.payment.id), stored);
      }
      const count = (invoices.results || []).length;
      offset += count;
      if (!count || offset >= Number(invoices.paging?.total ?? count)) break;
    }
    return sub;
  }
  async function syncPayment(id, known) {
    const payment = await mp('/v1/payments/' + encodeURIComponent(id));
    if (String(payment.collector_id) !== SELLER || String(payment.application_id) !== APPLICATION ||
        payment.currency_id !== 'BRL' || Math.round(Number(payment.transaction_amount) * 100) !== 1990 ||
        payment.live_mode !== true) fail(422, 'Pagamento incompatível com RefriID.');
    // A payment must be bound through an invoice retrieved from MP, not a supplied external reference.
    let subscription = known;
    if (!subscription) {
      const invoices = await mp('/authorized_payments/search?payment_id=' + encodeURIComponent(id));
      const invoice = (invoices.results || []).find(i => String(i.payment?.id) === id);
      if (!invoice) return;
      subscription = await one('SELECT * FROM refri_subscriptions WHERE id = $1', [String(invoice.preapproval_id)]);
    }
    if (!subscription || payment.external_reference !== 'refriid:' + subscription.member_id) return;
    const until = payment.status === 'approved' ? monthAfter(payment.date_approved) : null;
    await db.query(`INSERT INTO refri_payments (id, subscription_id, status, paid_until)
      VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO UPDATE
      SET status = EXCLUDED.status, paid_until = EXCLUDED.paid_until, updated_at = now()`,
    [id, subscription.id, payment.status, until]);
  }
  async function accountStatus(member, refresh = true) {
    await db.query('INSERT INTO refri_accounts (member_id) VALUES ($1) ON CONFLICT DO NOTHING', [member]);
    const account = await one('SELECT * FROM refri_accounts WHERE member_id = $1', [member]);
    const subs = (await db.query('SELECT * FROM refri_subscriptions WHERE member_id = $1', [member])).rows;
    if (refresh) for (const s of subs) if (Date.now() - new Date(s.checked_at).getTime() > 60000) await syncSubscription(s.id);
    const paid = await one(`SELECT max(p.paid_until) AS until FROM refri_payments p
      JOIN refri_subscriptions s ON s.id = p.subscription_id
      WHERE s.member_id = $1 AND p.status = 'approved'`, [member]);
    return { ...entitlement(account, paid?.until), subscriptions: subs.map(s => ({ id: s.id, status: s.status })) };
  }
  // All business records use the verified member ID, never an owner supplied by the browser.
  const recordFields = {
    RefriEmpresas: ['title','perfil'],
    RefriEquipamentos: ['title','cliente','marca','tipo','dados','status'],
    RefriServicos: ['title','equipamento','dataServico','tipo','dados'],
    RefriFotos: ['title','equipamento','servico','categoria','imagem']
  };
  const uuid = v => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
  const object = v => v && typeof v === 'object' && !Array.isArray(v);
  function cleanRecord(collection, source) {
    if (!object(source)) fail(400, 'Dados inválidos.');
    const allowed = recordFields[collection];
    const d = {};
    for (const key of Object.keys(source)) {
      if (!allowed.includes(key)) fail(400, 'Campo não permitido.');
      const v = source[key];
      if (['perfil','dados','imagem'].includes(key)) {
        if (!object(v)) fail(400, 'Objeto inválido.');
        if (key === 'imagem' && (typeof v.src !== 'string' || v.src.length > 140000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(v.src))) fail(400,'Imagem inválida.');
      } else if (typeof v !== 'string' || v.length > 500) fail(400, 'Campo inválido.');
      d[key] = v;
    }
    if (Buffer.byteLength(JSON.stringify(d)) > 180000) fail(413, 'Registro excede o limite.');
    return d;
  }
  function filterSql(collection, f, params, depth = 0) {
    if (!object(f) || depth > 3) fail(400, 'Filtro inválido.');
    const parts = [];
    const keys = Object.keys(f);
    if (keys.length > 12) fail(400,'Filtro excede o limite.');
    for (const key of keys) {
      const value = f[key];
      if (key === '$or' || key === '$and') {
        if (!Array.isArray(value) || !value.length || value.length > 12) fail(400,'Filtro inválido.');
        parts.push('(' + value.map(v => filterSql(collection,v,params,depth+1)).join(key === '$or' ? ' OR ' : ' AND ') + ')');
        continue;
      }
      if (key !== '_id' && !recordFields[collection].includes(key)) fail(400,'Campo não permitido.');
      if (['perfil','dados','imagem'].includes(key)) fail(400,'Campo não pesquisável.');
      const col = key === '_id' ? 'id::text' : "data->>'" + key + "'";
      if (typeof value === 'string' && value.length <= 500) { params.push(value); parts.push(col + ' = $' + params.length); }
      else if (object(value) && Object.keys(value).length === 1 && typeof value.$contains === 'string' && value.$contains.length <= 100) {
        params.push(value.$contains); parts.push('position(lower($' + params.length + ') in lower(' + col + ')) > 0');
      } else fail(400,'Filtro inválido.');
    }
    return parts.length ? parts.join(' AND ') : 'TRUE';
  }
  function recordResult(row) { return {id:row.id,data:{...row.data,_id:row.id}}; }
  async function ownRecord(member, collection, id) {
    if (!uuid(id)) fail(400,'Identificação inválida.');
    const row = await one('SELECT id,data FROM refri_records WHERE member_id=$1 AND collection=$2 AND id=$3',[member,collection,id]);
    if (!row) fail(404,'Registro não localizado nesta conta.');
    return row;
  }
  async function businessData(member, reqBody) {
    const {collection,action,filter={},limit=20,offset=0,id,fields} = reqBody;
    if (!Object.hasOwn(recordFields,collection)) fail(400,'Coleção inválida.');
    if (action === 'query' || action === 'count') {
      const params = [member,collection];
      const where = 'member_id=$1 AND collection=$2 AND (' + filterSql(collection,filter,params) + ')';
      if (action === 'count') return {totalCount:Number((await one('SELECT count(*) AS n FROM refri_records WHERE '+where,params)).n)};
      if (!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0||offset>100000) fail(400,'Página inválida.');
      params.push(limit,offset);
      const rows = (await db.query('SELECT id,data FROM refri_records WHERE '+where+' ORDER BY created_at DESC,id LIMIT $'+(params.length-1)+' OFFSET $'+params.length,params)).rows;
      return {dataItems:rows.map(recordResult)};
    }
    if (action !== 'insert' && action !== 'patch') fail(400,'Operação inválida.');
    const d=cleanRecord(collection,fields);
    let prior=null;
    if(action==='patch'){
      if(!['RefriEmpresas','RefriEquipamentos'].includes(collection))fail(400,'Operação inválida.');
      prior=await ownRecord(member,collection,id);
      Object.assign(d,{...prior.data,...d});
    }
    if(typeof d.title!=='string'||!d.title.trim())fail(400,'Título obrigatório.');
    if(collection==='RefriEquipamentos'){
      if(typeof d.cliente!=='string'||!d.cliente.trim()||typeof d.tipo!=='string'||!d.tipo.trim())fail(400,'Cliente e tipo obrigatórios.');
    }
    if(collection==='RefriServicos'||collection==='RefriFotos'){
      await ownRecord(member,'RefriEquipamentos',d.equipamento);
      if(collection==='RefriFotos'&&d.servico){
        const svc=await ownRecord(member,'RefriServicos',d.servico);
        if(svc.data.equipamento!==d.equipamento)fail(400,'Atendimento incompatível.');
      }
    }
    // Serialize writes in the process and enforce unique profile/equipment codes in PostgreSQL.
    try {
      if (prior) {
        const row=await one('UPDATE refri_records SET data=$4,updated_at=now() WHERE member_id=$1 AND collection=$2 AND id=$3 RETURNING id,data',[member,collection,id,JSON.stringify(d)]);
        return {dataItem:recordResult(row)};
      }
      const row=await one('INSERT INTO refri_records (member_id,collection,data) VALUES ($1,$2,$3) RETURNING id,data',[member,collection,JSON.stringify(d)]);
      return {dataItem:recordResult(row)};
    } catch(e) { if(e.code==='23505') fail(409,'Perfil ou código já cadastrado.'); throw e; }
  }

  const attempts = new Map();
  function rateLimit(req) {
    const ip = req.socket.remoteAddress;
    const now = Date.now();
    if (attempts.size > 10000) for (const [key, v] of attempts) if (v.reset < now) attempts.delete(key);
    const row = attempts.get(ip);
    if (!row || row.reset < now) attempts.set(ip, { count: 1, reset: now + 60000 });
    else if (++row.count > 120) fail(429, 'Aguarde um minuto.');
  }
  const admin = req => {
    const token = (req.headers.authorization || '').replace(/^Bearer /i, '');
    if (!equalSecret(token, env.SETUP_TOKEN) || Date.now() > Number(env.SETUP_EXPIRES_AT)) fail(401, 'Link de configuração inválido ou expirado.');
  };
  async function body(req, maxBytes = 20000) {
    let bytes = 0; const chunks = [];
    for await (const chunk of req) { bytes += chunk.length; if (bytes > maxBytes) fail(413, 'Conteúdo excede o limite.'); chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { fail(400, 'Dados inválidos.'); }
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    res.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'");
    if (req.headers.origin === ORIGIN) {
      res.setHeader('Access-Control-Allow-Origin', ORIGIN);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    function send(status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }
    try {
      rateLimit(req);
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'OPTIONS') return send(204, null);
      if (req.method === 'GET' && url.pathname === '/health') {
        await db.query('SELECT 1');
        return send(200, { ok: true, service: 'refriid-api', billingEnabled: live, credentialsConfigured: !!await config() });
      }
      if (req.method === 'GET' && url.pathname === '/setup') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(setupPage); }
      if (req.method === 'GET' && url.pathname === '/setup.js') { res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' }); return res.end(setupScript); }
      if (url.pathname === '/admin/config' && req.method === 'GET') {
        admin(req); return send(200, { configured: !!await config(), billingEnabled: live, application: APPLICATION });
      }
      if (url.pathname === '/admin/config' && req.method === 'POST') {
        admin(req);
        if (await config()) fail(409, 'Chave já cadastrada. Alterações exigem manutenção autenticada do servidor.');
        const { accessToken } = await body(req);
        if (typeof accessToken !== 'string' || !/^APP_USR-[A-Za-z0-9-]{20,500}$/.test(accessToken)) fail(400, 'Informe o Access Token de produção da aplicação RefriID.');
        const me = await jsonFetch('https://api.mercadopago.com/users/me', { headers: { Authorization: 'Bearer ' + accessToken } }, fetcher);
        if (String(me.id) !== SELLER || me.site_id !== 'MLB') fail(422, 'Essa chave não corresponde à sua conta brasileira cadastrada.');
        const stored = await db.query(`INSERT INTO refri_config (id, encrypted_token, seller_id) VALUES (true, $1, $2)
          ON CONFLICT DO NOTHING RETURNING id`, [seal(accessToken, master), SELLER]);
        if (!stored.rowCount) fail(409, 'Chave já cadastrada.');
        return send(200, { configured: true, billingEnabled: live, message: 'Chave protegida e conta validada. Cobranças continuam desativadas até a homologação.' });
      }
      if (url.pathname.startsWith('/webhooks/')) {
        if (req.method !== 'POST' || !equalSecret(url.pathname.slice('/webhooks/'.length), env.WEBHOOK_TOKEN)) fail(404, 'Não encontrado.');
        if (!live) fail(503, 'Cobranças desativadas.');
        const payload = await body(req);
        const id = String(payload.data?.id || url.searchParams.get('data.id') || url.searchParams.get('id') || '');
        const topic = payload.type || url.searchParams.get('topic');
        if (!/^[a-zA-Z0-9-]{1,100}$/.test(id)) fail(400, 'Identificação inválida.');
        if (topic === 'subscription_preapproval' || topic === 'preapproval') await serialize(id, () => syncSubscription(id));
        else if (topic === 'subscription_authorized_payment') {
          const invoice = await mp('/authorized_payments/' + id);
          await serialize(String(invoice.preapproval_id), () => syncSubscription(String(invoice.preapproval_id)));
        } else if (topic === 'payment') await serialize('payment:' + id, () => syncPayment(id));
        return send(200, { received: true });
      }
      if (url.pathname.startsWith('/api/')) {
        const member = await authenticate(req);
        if (!live) return send(503, { message: 'Integração em homologação. Nenhuma cobrança está habilitada.', allowed: false });
        if (req.method === 'POST' && url.pathname === '/api/data') {
          const state = await accountStatus(member);
          if (!state.allowed) return send(402, { message: 'Assinatura necessária para acessar o sistema.', ...state });
          const input=await body(req,200000);
          return await serialize('data:'+member, async()=>send(200,await businessData(member,input)));
        }
        if (req.method === 'GET' && url.pathname === '/api/billing/status') return send(200, await accountStatus(member));
        if (req.method === 'GET' && url.pathname === '/api/entitlement') {
          const state = await accountStatus(member);
          return send(state.allowed ? 200 : 402, state);
        }
        if (req.method === 'POST' && url.pathname === '/api/billing/subscribe') {
          return await serialize(member, async () => {
            await accountStatus(member);
            const old = await one(`SELECT * FROM refri_subscriptions WHERE member_id = $1
              AND status IN ('pending', 'authorized', 'paused') LIMIT 1`, [member]);
            if (old) return send(200, { id: old.id, checkoutUrl: old.checkout_url, status: old.status });
            const account = await one('SELECT trial_until FROM refri_accounts WHERE member_id = $1', [member]);
            const token = (req.headers.authorization || '').replace(/^Bearer /i, '');
            const me = await jsonFetch('https://www.wixapis.com/members/v1/members/my?fieldsets=EXTENDED', { headers: { Authorization: token } }, fetcher);
            const email = me.member?.loginEmail;
            if (!email) fail(422, 'E-mail da conta não disponível.');
            const start = new Date(Math.max(new Date(account.trial_until).getTime(), Date.now() + 120000)).toISOString();
            const notificationUrl = origin + '/webhooks/' + env.WEBHOOK_TOKEN;
            const sub = await mp('/preapproval?notification_url=' + encodeURIComponent(notificationUrl), {
              method: 'POST', body: JSON.stringify({ reason: 'RefriID • Plano Fundadores',
                external_reference: 'refriid:' + member, payer_email: email,
                auto_recurring: { frequency: 1, frequency_type: 'months', start_date: start, transaction_amount: PRICE, currency_id: 'BRL' },
                back_url: ORIGIN + '/?assinatura=retorno', status: 'pending' }) });
            checkSubscription(sub, member);
            if (!/^https:\/\/www\.mercadopago\.com\.br\//.test(sub.init_point || '')) fail(502, 'Checkout brasileiro não confirmado.');
            await db.query('INSERT INTO refri_subscriptions (id, member_id, status, checkout_url) VALUES ($1, $2, $3, $4)',
              [sub.id, member, sub.status, sub.init_point]);
            return send(200, { id: sub.id, checkoutUrl: sub.init_point, status: sub.status });
          });
        }
        if (req.method === 'POST' && url.pathname === '/api/billing/cancel') {
          return await serialize(member, async () => {
            const subs = (await db.query("SELECT * FROM refri_subscriptions WHERE member_id = $1 AND status != 'cancelled'", [member])).rows;
            for (const sub of subs) {
              checkSubscription(await mp('/preapproval/' + sub.id), member);
              const result = await mp('/preapproval/' + sub.id, { method: 'PUT', body: JSON.stringify({ status: 'cancelled' }) });
              if (result.status !== 'cancelled') fail(502, 'Cancelamento ainda não confirmado.');
              await db.query("UPDATE refri_subscriptions SET status = 'cancelled', checked_at = now() WHERE id = $1", [sub.id]);
            }
            return send(200, { cancelled: true, ...await accountStatus(member, false) });
          });
        }
      }
      fail(404, 'Não encontrado.');
    } catch (error) {
      // Do not log body, Authorization, URLs (webhook secret), provider replies or secrets.
      send(error.status || 503, { message: error.status ? error.message : 'Serviço temporariamente indisponível.' });
    }
  });
  server.requestTimeout = 20000;
  server.headersTimeout = 10000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3,
    connectionTimeoutMillis: 10000, idleTimeoutMillis: 10000 });
  await pool.query(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
  await pool.query(`CREATE TABLE IF NOT EXISTS refri_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id uuid NOT NULL REFERENCES refri_accounts(member_id),
    collection text NOT NULL CHECK (collection IN ('RefriEmpresas','RefriEquipamentos','RefriServicos','RefriFotos')),
    data jsonb NOT NULL CHECK (jsonb_typeof(data)='object'),
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS refri_records_owner ON refri_records(member_id,collection,created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS refri_one_profile ON refri_records(member_id) WHERE collection='RefriEmpresas';
    CREATE UNIQUE INDEX IF NOT EXISTS refri_equipment_code ON refri_records(member_id,lower(data->>'title')) WHERE collection='RefriEquipamentos';
    ALTER TABLE refri_records ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON refri_records FROM PUBLIC;`);

  const server = await createApp({ db: pool });
  server.listen(Number(process.env.PORT || 10000), '0.0.0.0', () => console.log('RefriID API pronta.'));
  process.on('SIGTERM', () => { server.close(async () => { await pool.end(); process.exit(0); }); });
}
