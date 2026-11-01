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

test('armazenar comprovante temporario com ROLLBACK sem gerar registros financeiros',async t=>{
 if(!process.env.PORTAL_DATABASE_URL){t.skip('Conexao nao definida neste ambiente');return;}
 const {randomUUID,randomBytes}=require('node:crypto');
 const db=new Pool({connectionString:process.env.PORTAL_DATABASE_URL,max:1,connectionTimeoutMillis:7000});
 const client=await db.connect(),p='test_'+randomUUID();
 try{
  await client.query('BEGIN');
  const invite=await client.query("INSERT INTO public.portal_invites (participant_id,participant_name,token_hash,expires_at,created_by) VALUES($1,'Pessoa Exemplo',$2,now()+interval '1 hour','teste') RETURNING id",[p,randomBytes(32).toString('hex')]);
  const pdf=Buffer.from('%PDF-1.4\n'+('x'.repeat(80)));
  const receipt=await client.query("INSERT INTO public.portal_receipts (invite_id,participant_id,payer_full_name,amount_cents,paid_on,allocations,notes,receipt_media_type,receipt_filename,receipt_bytes,receipt_sha256) VALUES ($1,$2,'Pessoa Exemplo',17000,'2026-05-15',$3::jsonb,'Teste reversivel','application/pdf','teste.pdf',$4,$5) RETURNING id",[invite.rows[0].id,p,JSON.stringify([{category:'Mensalidade',cents:16000,competence:'2026-05'},{category:'Rifa',cents:1000}]),pdf,randomBytes(32).toString('hex')]);
  assert.ok(receipt.rows[0].id);
  const loaded=await client.query('SELECT amount_cents,octet_length(receipt_bytes) AS file_size FROM public.portal_receipts WHERE id=$1',[receipt.rows[0].id]);
  assert.equal(loaded.rows[0].amount_cents,17000);
  assert.equal(loaded.rows[0].file_size,pdf.length);
 }finally{
  await client.query('ROLLBACK').catch(()=>{});
  client.release();
  const final=await db.query('SELECT count(*)::integer AS total FROM public.portal_receipts WHERE participant_id=$1',[p]);
  assert.equal(final.rows[0].total,0);
  await db.end();
 }
});
