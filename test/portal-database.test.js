'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Pool}=require('pg');
test('portal independente consulta tabelas do Neon sem acessar saldo da caixinha',async t=>{
 if(!process.env.PORTAL_DATABASE_URL){t.skip('Conexao nao definida neste ambiente');return;}
 const db=new Pool({connectionString:process.env.PORTAL_DATABASE_URL,max:1,connectionTimeoutMillis:7000,idleTimeoutMillis:3000});
 try{
  const r=await db.query('SELECT current_database() AS db');
  assert.equal(r.rows[0].db,'gestao_valores');
  const invites=await db.query('SELECT id FROM public.portal_invites LIMIT 0');
  const receipts=await db.query('SELECT id FROM public.portal_receipts LIMIT 0');
  assert.equal(invites.rowCount,0);
  assert.equal(receipts.rowCount,0);
 }finally{await db.end();}
});
