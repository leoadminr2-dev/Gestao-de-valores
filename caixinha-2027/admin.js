'use strict';
(function(){
 const $=id=>document.getElementById(id);
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const brl=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0)/100);
 let state=null;
 function tell(t,bad=false){$('message').className='note'+(bad?' bad':'');$('message').textContent=t;}
 async function api(path,method='GET',body){
  const r=await fetch('/api/2027/admin/'+path,{method,credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});
  const d=await r.json().catch(()=>({error:'Falha na rede.'}));
  if(!r.ok)throw Error(d.error||'Não foi possível executar esta operação.');return d;
 }
 async function refresh(){
  try{
   state=await api('dashboard');$('content').hidden=false;
   const ms=state.members||[], rs=state.receipts||[],es=state.events||[],ns=state.numbers||[];
   $('members').innerHTML=ms.length?ms.map(m=>'<tr><td><strong>'+esc(m.full_name)+'</strong><br><small>CPF ***.***.'+esc(m.cpf_last4)+'</small></td><td>'+esc(m.phone)+'<br><small>'+esc(m.address)+'</small></td><td>'+esc(m.status==='pending'?'Aguardando':m.status==='active'?'Ativo':'Bloqueado')+'<br><small>'+esc(new Date(m.created_at).toLocaleDateString('pt-BR'))+'</small></td><td><div class="actions">'+
    (m.status!=='active'?'<button data-member="'+esc(m.id)+'" data-status="active">Aprovar</button>':'')+
    (m.status!=='blocked'?'<button class="danger" data-member="'+esc(m.id)+'" data-status="blocked">Bloquear</button>':'')+
   '</div></td></tr>').join(''):'<tr><td colspan="4">Ainda não há associados cadastrados.</td></tr>';
   $('receipts').innerHTML=rs.length?rs.map(r=>'<tr><td><strong>'+esc(r.full_name)+'</strong><br><small>'+esc(new Date(r.submitted_at).toLocaleString('pt-BR'))+'</small></td><td>'+brl(r.amount_cents)+'<br><small>'+esc(String(r.paid_on).slice(0,10))+'</small></td><td>'+esc((r.allocations||[]).map(a=>a.category+': '+brl(a.amountCents)+(a.competence?' ('+a.competence+')':'')).join(' / '))+'</td>'+
   '<td><a class="link" target="_blank" rel="noreferrer" href="/api/2027/admin/receipt-file?id='+encodeURIComponent(r.id)+'">Ver comprovante</a></td><td>'+
   (r.status==='pending'?'<div><input data-note="'+esc(r.id)+'" placeholder="Justificativa obrigatória" maxlength="500" aria-label="Observação da conferência"><div class="actions" style="margin-top:7px"><button data-receipt="'+esc(r.id)+'" data-decision="approved">Aprovar</button><button class="danger" data-receipt="'+esc(r.id)+'" data-decision="rejected">Corrigir</button></div></div>':'<span class="status '+esc(r.status)+'">'+(r.status==='approved'?'Aprovado':'Correção solicitada')+'</span><br><small>'+esc(r.review_notes||'')+'</small>')+
   '</td></tr>').join(''):'<tr><td colspan="5">Nenhum comprovante recebido.</td></tr>';
   $('events').innerHTML=es.length?es.map(e=>{
     const picked=ns.filter(n=>n.event_id===e.id);
     return '<tr><td><strong>'+esc(e.title)+'</strong><br><small>'+esc(String(e.event_date||'A definir').slice(0,10))+'</small></td><td>'+esc(e.status==='open'?'Aberto':'Fechado')+'</td><td>'+picked.length+' de '+e.total_numbers+'</td>'+
     '<td><details><summary>Ver pessoas e números</summary><div style="max-height:220px;overflow:auto">'+(picked.length?picked.map(n=>esc(n.full_name)+' — '+String(n.number).padStart(3,'0')).join('<br>'):'Nenhum número ainda')+'</div></details></td>'+
     '<td><button data-event="'+esc(e.id)+'" data-eventstatus="'+(e.status==='open'?'closed':'open')+'" class="secondary">'+(e.status==='open'?'Fechar':'Reabrir')+'</button></td></tr>';
   }).join(''):'<tr><td colspan="5">Nenhum evento cadastrado.</td></tr>';
   tell('Painel atualizado. Cadastros pendentes: '+ms.filter(x=>x.status==='pending').length+' • Comprovantes aguardando: '+rs.filter(x=>x.status==='pending').length);
  }catch(e){$('content').hidden=true;tell(e.message+' Acesse a Gestão de Valores com sua conta autorizada antes de voltar.',true);}
 }
 $('refresh').onclick=refresh;
 $('eventForm').onsubmit=async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;
  try{await api('event','POST',{title:$('eventTitle').value,eventDate:$('eventDate').value,totalNumbers:Number($('eventTotal').value),description:$('eventDescription').value});$('eventForm').reset();await refresh();tell('Evento criado com sucesso.');}
  catch(err){tell(err.message,true);}finally{btn.disabled=false;}
 };
 document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-member],[data-receipt],[data-event]');if(!b)return;
  b.disabled=true;try{
   if(b.dataset.member){
    const status=b.dataset.status;if(!window.confirm(status==='active'?'Confirma a identidade deste associado e aprova o acesso?':'Deseja bloquear o acesso?'))return;
    await api('member','POST',{memberId:b.dataset.member,status});
   }else if(b.dataset.receipt){
    const decision=b.dataset.decision,notes=document.querySelector('[data-note="'+b.dataset.receipt+'"]')?.value.trim()||'';
    if(notes.length<8)throw Error('Descreva a conferência com pelo menos 8 caracteres.');
    if(decision==='approved'&&!window.confirm('Você confirmou este crédito no extrato bancário? A aprovação vai lançar os valores nas finalidades indicadas.'))return;
    await api('review','POST',{receiptId:b.dataset.receipt,decision,notes});
   }else if(b.dataset.event){await api('event-status','POST',{eventId:b.dataset.event,status:b.dataset.eventstatus});}
   await refresh();
  }catch(err){tell(err.message,true);}finally{b.disabled=false;}
 });refresh();
})();
