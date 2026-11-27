import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApp } from './server.mjs';
import { SITE, CLIENT, APPLICATION, SELLER, PRICE, seal, monthAfter, entitlement } from './core.mjs';

const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222';
const DAY=86400000;
const key='ab'.repeat(32);
const env={CREDENTIALS_ENCRYPTION_KEY:key,SETUP_TOKEN:'test-admin',WEBHOOK_TOKEN:'test-hook',SETUP_EXPIRES_AT:String(Date.now()+DAY),BILLING_ENABLED:'true',PUBLIC_URL:'https://example.invalid'};
function fixture(){
  const accounts=new Map(),subs=new Map(),payments=new Map(),records=[];
  const providerSubs=new Map(),providerPayments=new Map();
  let creates=0;
  const db={async query(raw,p=[]){
    const sql=raw.replace(/\s+/g,' ').trim();
    const result=rows=>({rows,rowCount:rows.length});
    if(sql==='SELECT 1')return result([{}]);
    if(sql.startsWith('SELECT encrypted_token'))return result([{encrypted_token:seal('fake-token',key)}]);
    if(sql.startsWith('INSERT INTO refri_accounts')){
      if(!accounts.has(p[0]))accounts.set(p[0],{member_id:p[0],trial_until:new Date(Date.now()+7*DAY)});
      return result([]);
    }
    if(sql.startsWith('SELECT * FROM refri_accounts')||sql.startsWith('SELECT trial_until FROM refri_accounts'))return result([accounts.get(p[0])]);
    if(sql.startsWith('SELECT * FROM refri_subscriptions WHERE id'))return result(subs.has(p[0])?[{...subs.get(p[0])}]:[]);
    if(sql.startsWith('SELECT * FROM refri_subscriptions WHERE member_id')){
      let rows=[...subs.values()].filter(s=>s.member_id===p[0]);
      if(sql.includes("status IN"))rows=rows.filter(s=>['pending','authorized','paused'].includes(s.status));
      if(sql.includes("status NOT IN"))rows=rows.filter(s=>!['cancelled','canceled'].includes(s.status));
      return result(rows.map(s=>({...s})));
    }
    if(sql.startsWith('SELECT max(p.paid_until)')){
      const dates=[...payments.values()].filter(x=>subs.get(x.subscription_id)?.member_id===p[0]&&x.status==='approved').map(x=>x.paid_until.getTime());
      return result([{until:dates.length?new Date(Math.max(...dates)):null}]);
    }
    if(sql.startsWith('INSERT INTO refri_subscriptions')){
      subs.set(p[0],{id:p[0],member_id:p[1],status:p[2],checkout_url:p[3],checked_at:new Date()});return result([]);
    }
    if(sql.startsWith('UPDATE refri_subscriptions')){
      const s=subs.get(p[0]);if(sql.includes('status = $2'))s.status=p[1];
      if(sql.includes("status = 'cancelled'"))s.status='cancelled';
      if(sql.includes('checked_at = now()'))s.checked_at=new Date();
      return result([]);
    }
    if(sql.startsWith('INSERT INTO refri_payments')){
      payments.set(p[0],{id:p[0],subscription_id:p[1],status:p[2],paid_until:p[3]});return result([]);
    }
    if(sql.startsWith('INSERT INTO refri_records')){
      const r={id:randomUUID(),member:p[0],collection:p[1],data:JSON.parse(p[2])};
      records.push(r);return result([{id:r.id,data:r.data}]);
    }
    if(sql.startsWith('SELECT id,data FROM refri_records')||sql.startsWith('SELECT count(*) AS n FROM refri_records')){
      assert.ok(sql.includes('member_id=$1 AND collection=$2'),'Owner predicate must be present in actual SQL');
      let rows=records.filter(r=>r.member===p[0]&&r.collection===p[1]);
      if(sql.includes('id=$3')||sql.includes('id::text = $3'))rows=rows.filter(r=>r.id===p[2]);
      if(sql.includes('count(*)'))return result([{n:rows.length}]);
      return result(rows.map(r=>({id:r.id,data:r.data})));
    }
    if(sql.startsWith('UPDATE refri_records')){
      assert.ok(sql.includes('member_id=$1 AND collection=$2 AND id=$3'));
      const r=records.find(r=>r.member===p[0]&&r.collection===p[1]&&r.id===p[2]);
      if(!r)return result([]);r.data=JSON.parse(p[3]);return result([{id:r.id,data:r.data}]);
    }
    throw Error('Unimplemented SQL in test: '+sql);
  }};
  const fetcher=async(raw,o={})=>{
    const u=new URL(raw); const data=()=>JSON.parse(o.body||'{}'); const response=x=>new Response(JSON.stringify(x),{status:200});
    if(u.hostname==='www.wixapis.com'){
      if(u.pathname==='/oauth2/token-info'){
        const token=data().token;
        return response({active:true,subjectType:token==='visitor'?'VISITOR':'MEMBER',subjectId:token==='b'?B:A,siteId:token==='foreign'?'other':SITE,clientId:CLIENT,exp:Math.floor(Date.now()/1000)+3600});
      }
      if(u.pathname==='/members/v1/members/my')return response({member:{loginEmail:'test@example.invalid'}});
    }
    assert.equal(u.hostname,'api.mercadopago.com');
    if(u.pathname==='/users/me')return response({id:SELLER,site_id:'MLB'});
    if(u.pathname==='/preapproval/search')return response({results:[]});
    if(u.pathname==='/preapproval'&&o.method==='POST'){
      const d=data();assert.equal(d.auto_recurring.transaction_amount,PRICE);
      assert.equal(d.auto_recurring.frequency,1);assert.equal(d.auto_recurring.frequency_type,'months');
      assert.equal(d.auto_recurring.currency_id,'BRL');assert.equal(d.status,'pending');
      assert.ok(new Date(d.auto_recurring.start_date).getTime()>Date.now()+6*DAY);
      const id='sub'+(++creates);
      const s={...d,id,application_id:APPLICATION,collector_id:SELLER,init_point:'https://www.mercadopago.com.br/subscriptions/checkout?preapproval_id='+id};
      providerSubs.set(id,s);return response(s);
    }
    if(u.pathname.startsWith('/preapproval/')){
      const s=providerSubs.get(u.pathname.split('/').pop());assert.ok(s);
      if(o.method==='PUT'){assert.equal(data().status,'cancelled');s.status='cancelled';}
      return response(s);
    }
    if(u.pathname==='/authorized_payments/search'){
      const results=[...providerPayments.values()].filter(p=>u.searchParams.has('preapproval_id')?p.sub===u.searchParams.get('preapproval_id'):p.id===u.searchParams.get('payment_id')).map(p=>({preapproval_id:p.sub,payment:{id:p.id}}));
      return response({results,paging:{total:results.length}});
    }
    if(u.pathname.startsWith('/v1/payments/'))return response(providerPayments.get(u.pathname.split('/').pop()));
    throw Error('Unexpected external request '+u.pathname);
  };
  function payment(id,sub,status='approved',date=new Date(),amount=PRICE){
    providerPayments.set(id,{id,sub,status,date_approved:date.toISOString(),collector_id:SELLER,application_id:APPLICATION,currency_id:'BRL',transaction_amount:amount,live_mode:true,external_reference:'refriid:'+subs.get(sub).member_id});
  }
  return {db,fetcher,accounts,subs,payments,providerSubs,providerPayments,payment,get creates(){return creates}};
}
async function run(t,f,callback,overrides={}){
  const server=await createApp({db:f.db,fetcher:f.fetcher,env:{...env,...overrides}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  const base='http://127.0.0.1:'+server.address().port;
  const api=async(path,token='a',body)=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()}};
  const hook=(type,id)=>api('/webhooks/test-hook','',{type,data:{id}});
  await callback(api,hook);
}
test('clock simulation: seven full days, expiration, month ends, approved renewal',()=>{
  const start=Date.UTC(2026,10,27,12), account={trial_until:new Date(start+7*DAY)};
  assert.equal(entitlement(account,null,start).status,'trial');
  assert.equal(entitlement(account,null,start+7*DAY-1).allowed,true);
  assert.equal(entitlement(account,null,start+7*DAY).allowed,false);
  assert.equal(monthAfter('2027-01-31T12:00:00Z').toISOString(),'2027-02-28T12:00:00.000Z');
  const paid=new Date(start+30*DAY);
  assert.equal(entitlement(account,paid,start+8*DAY).status,'active');
  assert.equal(entitlement(account,paid,start+30*DAY).allowed,false);
});
test('HTTP simulated lifecycle: trial, checkout, duplicate click, rejection, approval, renewal, cancel and expiry',async t=>{
  const f=fixture();
  await run(t,f,async(api,hook)=>{
    const first=await api('/api/billing/status');assert.equal(first.status,200);assert.equal(first.data.status,'trial');
    const checkout=await api('/api/billing/subscribe','a',{});assert.equal(checkout.status,200);const sub=checkout.data.id;
    assert.equal((await api('/api/billing/subscribe','a',{})).data.id,sub);assert.equal(f.creates,1);
    f.accounts.get(A).trial_until=new Date(Date.now()-DAY);
    assert.equal((await api('/api/entitlement')).status,402);
    f.payment('p1',sub,'rejected');assert.equal((await hook('payment','p1')).status,200);
    assert.equal((await api('/api/entitlement')).status,402);
    f.payment('bad',sub,'approved',new Date(),1);assert.equal((await hook('payment','bad')).status,422);
    assert.equal((await api('/api/entitlement')).status,402);
    f.payment('p1',sub);assert.equal((await hook('payment','p1')).status,200);
    assert.equal((await hook('payment','p1')).status,200);assert.equal(f.payments.size,1);
    assert.equal((await api('/api/entitlement')).data.status,'active');
    const prior=f.payments.get('p1').paid_until.getTime();
    f.payment('p2',sub,'approved',new Date(Date.now()+28*DAY));
    assert.equal((await hook('payment','p2')).status,200);
    assert.ok(f.payments.get('p2').paid_until.getTime()>prior);
    const cancel=await api('/api/billing/cancel','a',{});assert.equal(cancel.status,200);assert.equal(cancel.data.cancelled,true);
    assert.equal(f.providerSubs.get(sub).status,'cancelled');assert.equal(cancel.data.allowed,true);
    for(const p of f.payments.values())p.paid_until=new Date(Date.now()-DAY);
    assert.equal((await api('/api/entitlement')).status,402);
    assert.equal((await api('/api/data','a',{collection:'RefriEquipamentos',action:'insert',fields:{title:'X',cliente:'Fictício',tipo:'Split'}})).status,402);
  });
});
test('HTTP simulated tenants: independent profiles and equipment, blocked cross-account references and anonymous tokens',async t=>{
  const f=fixture();
  await run(t,f,async(api)=>{
    const call=(token,collection,action,fields,extra={})=>api('/api/data',token,{collection,action,fields,...extra});
    assert.equal((await api('/api/billing/status','visitor')).status,401);
    assert.equal((await api('/api/billing/status','foreign')).status,401);
    const a=await call('a','RefriEmpresas','insert',{title:'Empresa A',perfil:{cor:'#123456'}});
    const b=await call('b','RefriEmpresas','insert',{title:'Empresa B',perfil:{cor:'#654321'}});
    assert.equal(a.status,200);assert.equal(b.status,200);
    const eq=await call('a','RefriEquipamentos','insert',{title:'EQ-001',cliente:'Cliente fictício A',tipo:'Split'});
    assert.equal(eq.status,200);const id=eq.data.dataItem.id;
    assert.equal((await call('b','RefriEquipamentos','query',undefined,{filter:{_id:id}})).data.dataItems.length,0);
    assert.equal((await call('b','RefriEquipamentos','patch',{title:'roubo'},{id})).status,404);
    assert.equal((await call('b','RefriServicos','insert',{title:'falso',equipamento:id,tipo:'Manutenção'})).status,404);
    assert.equal((await call('a','RefriServicos','insert',{title:'serviço',equipamento:id,tipo:'Manutenção'})).status,200);
    assert.equal((await call('b','RefriEquipamentos','count')).data.totalCount,0);
    assert.equal((await call('b','RefriEquipamentos','insert',{title:'EQ-001',cliente:'Cliente fictício B',tipo:'Split'})).status,200);
    assert.equal((await call('a','RefriEquipamentos','count')).data.totalCount,1);
    assert.equal((await call('a','RefriEmpresas','query')).data.dataItems[0].data.title,'Empresa A');
    assert.equal((await call('b','RefriEmpresas','query')).data.dataItems[0].data.title,'Empresa B');
  });
});
test('HTTP payment disabled: credentials exist but cannot start checkout or data access',async t=>{
  const f=fixture();
  await run(t,f,async(api)=>{
    assert.equal((await api('/api/billing/subscribe','a',{})).status,503);
    assert.equal(f.creates,0);
    assert.equal((await api('/api/entitlement')).status,503);
  },{BILLING_ENABLED:'false'});
});