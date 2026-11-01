'use strict';
(function(){
 const $=id=>document.getElementById(id);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const brl=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(c||0)/100);
 let lastLink='';
 const msg=(t,error=false)=>{$('message').textContent=t;$('message').style.background=error?'#ffe9e6':'#e5f7f0';};
 async function api(endpoint,method='GET',body){
  const res=await fetch('/api/portal/admin/'+endpoint,{method,headers:{...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',credentials:'same-origin'});
  const j=await res.json().catch(()=>({error:'Erro de comunicação.'}));
  if(!res.ok)throw new Error(j.error||'Operação não concluída.');
  return j;
 }
 async function refresh(){
  const data=await api('list');
  const items=data.receipts||[];
  $('receipts').innerHTML=items.length?'<table><thead><tr><th>Associado / remetente</th><th>Pagamento informado</th><th>Finalidades</th><th>Comprovante</th><th>Conferência</th></tr></thead><tbody>'+
   items.map(row=>{
    const allocations=(row.allocations||[]).map(a=>esc(a.category)+(a.competence?' ('+esc(a.competence)+')':'')+': <b>'+brl(a.cents)+'</b>').join('<br>');
    const status=row.status==='pending'?'Pendente':row.status==='reviewed'?'Conferido — sem lançar':'Correção solicitada';
    return '<tr><td><strong>'+esc(row.payer_full_name)+'</strong><small>Cadastro: '+esc(row.participant_name||row.participant_id)+'</small>'+
       '<small>Enviado em '+esc(new Date(row.submitted_at).toLocaleDateString('pt-BR'))+'</small></td>'+
       '<td><strong>'+brl(row.amount_cents)+'</strong><small>Pix de '+esc(String(row.paid_on).slice(0,10))+'</small></td>'+
       '<td>'+allocations+(row.notes?'<small>'+esc(row.notes)+'</small>':'')+'</td>'+
       '<td><a href="/api/portal/admin/file?id='+encodeURIComponent(row.id)+'" target="_blank" rel="noreferrer">Baixar arquivo</a></td>'+
       '<td><strong>'+status+'</strong>'+(row.review_notes?'<small>'+esc(row.review_notes)+'</small>':'')+
       (row.status==='pending'?'<div><label>Motivo/observação</label><input class="reason" data-id="'+esc(row.id)+'" placeholder="Ex.: conferido com extrato" maxlength="500">'+
         '<button data-review="reviewed" data-id="'+esc(row.id)+'">Conferido</button> '+
         '<button class="secondary" data-review="rejected" data-id="'+esc(row.id)+'">Solicitar correção</button></div>':'')+
       '</td></tr>';
   }).join('')+'</tbody></table>':'<p>Nenhum comprovante enviado até o momento.</p>';
  const invites=data.links||[];
  $('links').innerHTML=invites.length?'<table><thead><tr><th>Associado</th><th>Gerado em</th><th>Validade</th><th>Situação</th><th>Ação</th></tr></thead><tbody>'+
    invites.map(link=>'<tr><td>'+esc(link.participant_name)+'</td><td>'+esc(new Date(link.created_at).toLocaleDateString('pt-BR'))+'</td>'+
      '<td>'+esc(new Date(link.expires_at).toLocaleDateString('pt-BR'))+'</td><td>'+(link.is_active?'Ativo':'Revogado')+'</td>'+
      '<td>'+(link.is_active?'<button class="secondary" data-revoke="'+esc(link.id)+'">Revogar</button>':'—')+'</td></tr>').join('')+'</tbody></table>':'<p>Nenhum acesso gerado.</p>';
 }
 async function load(){
  try{
   const x=await api('participants');
   const p=(x.participants||[]).sort((a,b)=>a.name.localeCompare(b.name,'pt'));
   $('person').innerHTML=p.map(v=>'<option value="'+esc(v.id)+'">'+esc(v.name)+'</option>').join('');
   $('adminArea').hidden=false;
   await refresh();
   msg('Acesso administrativo confirmado. Os comprovantes só são registrados no caixa após conciliação separada.');
  }catch(e){msg(e.message+'. Entre no painel principal primeiro e volte a esta página.',true);}
 }
 $('createLink').onclick=async()=>{
  const btn=$('createLink');btn.disabled=true;
  try{
   const r=await api('invite','POST',{participantId:$('person').value});
   lastLink=r.link;$('linkResult').textContent='Link individual para '+r.name+': '+lastLink;
   $('linkResult').hidden=false;$('copyLink').hidden=false;
   msg('Link gerado. Compartilhe apenas com o associado. Qualquer link anterior dessa pessoa foi revogado.');
   await refresh();
  }catch(e){msg(e.message,true);}finally{btn.disabled=false;}
 };
 $('copyLink').onclick=async()=>{try{await navigator.clipboard.writeText(lastLink);msg('Link copiado para enviar por WhatsApp.');}catch{msg('Copie manualmente o link exibido acima.',true);}};
 document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-review],[data-revoke]');if(!b)return;
  if(b.dataset.revoke){
   if(!window.confirm('Revogar este link? O associado precisará de novo convite.'))return;
   b.disabled=true;try{await api('revoke','POST',{id:b.dataset.revoke});await refresh();msg('Acesso revogado.');}catch(err){msg(err.message,true);}return;
  }
  const id=b.dataset.id,status=b.dataset.review;
  const note=document.querySelector('input.reason[data-id="'+id+'"]')?.value.trim()||'';
  if(note.length<8)return msg('Descreva a conferência em pelo menos 8 caracteres.',true);
  b.disabled=true;try{await api('review','POST',{id,status,note});await refresh();msg('Conferência registrada. Não houve lançamento automático no livro-caixa.');}catch(err){msg(err.message,true);b.disabled=false;}
 });
 void load();
})();