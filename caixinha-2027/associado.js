'use strict';
(function(){
 const $=id=>document.getElementById(id);
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const brl=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(c||0)/100);
 const cats=['Mensalidade','Juros de mensalidade','Rifa','Evento','Pagamento de empréstimo','Juros de empréstimo','Outros'];
 let data=null, selected=new Map(), correctingId='';
 const tell=(s,bad=false)=>{const el=$('alert');el.hidden=false;el.textContent=s;el.className='notice'+(bad?' bad':'');window.scrollTo({top:0,behavior:'smooth'});};
 async function api(path,method='GET',body){
  const r=await fetch('/api/2027/'+path,{method,headers:body?{'Content-Type':'application/json'}:{},credentials:'same-origin',cache:'no-store',...(body?{body:JSON.stringify(body)}:{})});
  const d=await r.json().catch(()=>({error:'Falha na conexão'}));if(!r.ok)throw Error(d.error||'Operação não concluída.');return d;
 }
 function authMode(mode){$('loginForm').hidden=mode!=='login';$('registerForm').hidden=mode!=='register';$('showLogin').classList.toggle('selected',mode==='login');$('showRegister').classList.toggle('selected',mode==='register');}
 $('showLogin').onclick=()=>authMode('login');$('showRegister').onclick=()=>authMode('register');
 $('registerForm').onsubmit=async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;try{
  await api('register','POST',{fullName:$('fullName').value,cpf:$('cpf').value,phone:$('phone').value,address:$('address').value,password:$('password').value});
  $('registerForm').reset();authMode('login');tell('Cadastro recebido! Aguarde a aprovação dos responsáveis antes de entrar.');
 }catch(err){tell(err.message,true);}finally{btn.disabled=false;}};
 $('loginForm').onsubmit=async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;try{
  await api('login','POST',{cpf:$('loginCpf').value,password:$('loginPassword').value});$('loginPassword').value='';await load();
 }catch(err){tell(err.message,true);}finally{btn.disabled=false;}};
 $('logout').onclick=async()=>{try{await api('logout','POST',{});}catch{}data=null;$('app').style.display='none';$('loginArea').hidden=false;authMode('login');tell('Sessão encerrada.');};
 function tab(name){for(const b of document.querySelectorAll('[data-tab]'))b.classList.toggle('selected',b.dataset.tab===name);for(const x of ['payments','submit','ledger','events','profile'])$('tab-'+x).hidden=x!==name;}
 $('tabs').onclick=e=>{const btn=e.target.closest('[data-tab]');if(btn)tab(btn.dataset.tab);};
 function allocRow(){
  const root=document.createElement('div');root.className='item allocation';root.innerHTML='<div class="grid2"><div><label>Finalidade</label><select class="cat">'+cats.map(c=>'<option>'+esc(c)+'</option>').join('')+'</select></div><div><label>Valor (R$)</label><input class="part" inputmode="decimal" placeholder="50,00" required></div></div><div class="grid2"><div><label>Mês de referência</label><input class="month" type="month" min="2027-01" max="2027-12"></div><div><label>Nome do evento (quando necessário)</label><input class="event" maxlength="90"></div></div><div class="actions"><button type="button" class="secondary remove">Remover esta finalidade</button></div>';
  root.querySelector('.remove').onclick=()=>{if(document.querySelectorAll('.allocation').length>1)root.remove();};
  $('allocationList').appendChild(root);
 }
 $('addAllocation').onclick=allocRow;allocRow();
 function cents(s){
  const v=String(s||'').trim().replace(/[R$\s.]/g,'').replace(',','.');if(!/^\d+(\.\d{1,2})?$/.test(v))throw Error('Informe valores no formato 50,00.');
  const n=Math.round(Number(v)*100);if(!Number.isSafeInteger(n)||n<1)throw Error('Valor inválido.');return n;
 }
 function readFile(file){return new Promise((resolve,reject)=>{
  const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Não foi possível ler o comprovante.'));reader.readAsDataURL(file);
 });}
 async function prepareFile(file) {
  const max=1024*1024;
  if (!file) throw Error('Selecione o comprovante.');
  if (!['image/jpeg','image/png','application/pdf'].includes(file.type)) throw Error('Use um arquivo JPG, PNG ou PDF.');
  if (file.size<=max) return {fileType:file.type,fileName:file.name,fileBase64:await readFile(file)};
  if (file.type==='application/pdf') throw Error('O PDF ultrapassa 1 MB. Envie uma versão menor.');
  const url=URL.createObjectURL(file);let img;
  try {img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(Error('Não foi possível abrir esta foto.'));i.src=url;});}
  finally {URL.revokeObjectURL(url);}
  const canvas=document.createElement('canvas');
  const scale=Math.min(1,1600/Math.max(img.naturalWidth,img.naturalHeight));
  canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
  canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('O navegador não permitiu preparar a imagem.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
  let base64='';
  for(const quality of [0.82,0.68,0.52,0.38]){
   base64=canvas.toDataURL('image/jpeg',quality).split(',')[1]||'';
   if(Math.ceil(base64.length*3/4)<=max)break;
  }
  if(Math.ceil(base64.length*3/4)>max)throw Error('A foto ainda está muito grande. Faça um recorte mais próximo do comprovante.');
  return {fileType:'image/jpeg',fileName:file.name.replace(/\.(jpg|jpeg|png)$/i,'')+'.jpg',fileBase64:base64};
 }
 function resetCorrection() {
  correctingId='';$('receiptFile').disabled=false;$('receiptFile').required=true;
  $('cancelCorrection').hidden=true;$('sendReceipt').textContent='Enviar comprovante';
 }
 $('cancelCorrection').onclick=()=>{
  resetCorrection();$('receiptForm').reset();$('allocationList').replaceChildren();allocRow();
  tell('Correção cancelada. Você pode enviar um novo comprovante.');
 };
 $('receiptForm').onsubmit=async e=>{e.preventDefault();const btn=$('sendReceipt');btn.disabled=true;try{
  const receiptFile=correctingId?{}:await prepareFile($('receiptFile').files[0]);
  const amountCents=cents($('amount').value),allocations=[...document.querySelectorAll('.allocation')].map(el=>({
   category:el.querySelector('.cat').value,amountCents:cents(el.querySelector('.part').value),competence:el.querySelector('.month').value,eventName:el.querySelector('.event').value.trim()
  }));
  await api(correctingId?'receipt/correct':'receipt','POST',{...(correctingId?{receiptId:correctingId}:{}),paidOn:$('paidOn').value,amountCents,allocations,notes:$('notes').value,...receiptFile});
  $('receiptForm').reset();resetCorrection();$('allocationList').innerHTML='';allocRow();await load();tab('payments');tell('Informações recebidas e aguardando conferência administrativa.');
 }catch(err){tell(err.message,true);}finally{btn.disabled=false;}};
 function status(s){return s==='approved'?'<span class="tag ok">Aprovado</span>':s==='rejected'?'<span class="tag no">Correção solicitada</span>':'<span class="tag">Pendente</span>';}
 function payments(){
  const rows=data.receipts||[];$('receiptRows').innerHTML=rows.length?rows.map(r=>'<tr><td>'+esc(String(r.paid_on).slice(0,10))+'</td><td>'+brl(r.amount_cents)+'</td><td>'+esc((r.allocations||[]).map(x=>x.category).join(', '))+'</td><td>'+status(r.status)+(r.review_notes?'<small style="display:block">'+esc(r.review_notes)+'</small>':'')+(r.status==='rejected'?'<button type="button" class="secondary" data-correct="'+esc(r.id)+'" style="margin-top:7px">Corrigir informações</button>':'')+'</td></tr>').join(''):'<tr><td colspan="4">Nenhum comprovante registrado ainda.</td></tr>';
  $('approvedTotal').textContent=brl(data.approvedCents);
  $('pendingCount').textContent=rows.filter(x=>x.status==='pending').length;
  $('numbersCount').textContent=(data.numbers||[]).length;
  const lines=data.ledger||[], sums=new Map();
  for(const l of lines)sums.set(l.category,(sums.get(l.category)||0)+Number(l.amount_cents));
  $('ledgerByCategory').innerHTML=[...sums.entries()].map(([name,c])=>'<div class="stat">'+esc(name)+'<strong>'+brl(c)+'</strong></div>').join('')||'<p class="muted">Nenhum depósito aprovado ainda.</p>';
  $('ledgerRows').innerHTML=lines.map(l=>'<tr><td>'+esc(new Date(l.created_at).toLocaleDateString('pt-BR'))+'</td><td>'+esc(l.category)+'</td><td>'+esc(l.competence||l.event_name||'—')+'</td><td>'+brl(l.amount_cents)+'</td></tr>').join('')||'<tr><td colspan="4">Nenhum lançamento confirmado.</td></tr>';
 }
 $('receiptRows').onclick=e=>{
  const button=e.target.closest('[data-correct]');if(!button)return;
  const r=(data?.receipts||[]).find(x=>x.id===button.dataset.correct&&x.status==='rejected');
  if(!r)return;
  correctingId=r.id;$('receiptFile').disabled=true;$('receiptFile').required=false;$('receiptFile').value='';
  $('cancelCorrection').hidden=false;$('sendReceipt').textContent='Reenviar para conferência';
  $('paidOn').value=String(r.paid_on).slice(0,10);
  $('amount').value=(Number(r.amount_cents)/100).toFixed(2).replace('.',',');
  $('allocationList').replaceChildren();
  for(const a of r.allocations||[]){allocRow();const el=$('allocationList').lastElementChild;
   el.querySelector('.cat').value=a.category;
   el.querySelector('.part').value=(Number(a.amountCents)/100).toFixed(2).replace('.',',');
   el.querySelector('.month').value=a.competence||'';el.querySelector('.event').value=a.eventName||'';
  }
  if(!document.querySelectorAll('.allocation').length)allocRow();
  $('notes').value=r.notes||'';tab('submit');
  tell('Corrija os dados informados. A imagem original será mantida e enviada novamente para conferência.');
 };
 function events(){
  const root=$('eventList');root.replaceChildren();
  for(const ev of data.events||[]){
   const occupied=new Set((data.occupied||[]).filter(x=>x.event_id===ev.id).map(x=>Number(x.number)));
   const mine=new Set((data.numbers||[]).filter(x=>x.event_id===ev.id).map(x=>Number(x.number)));
   const sel=selected.get(ev.id)||new Set();selected.set(ev.id,sel);
   const box=document.createElement('div');box.className='item';
   box.innerHTML='<h3>'+esc(ev.title)+'</h3><p>'+esc(ev.description||'')+'</p><p class="muted">Data: '+esc(ev.event_date?String(ev.event_date).slice(0,10):'A definir')+' • '+ev.total_numbers+' números • '+(ev.status==='open'?'Inscrições abertas':'Encerrado')+'</p><p><strong>Meus números:</strong> '+esc([...mine].sort((a,b)=>a-b).map(x=>String(x).padStart(3,'0')).join(', ')||'Nenhum')+'</p>';
   if(ev.status==='open'){
    const grid=document.createElement('div');grid.className='numbergrid';
    for(let n=1;n<=ev.total_numbers;n++){
     const b=document.createElement('button');b.type='button';b.textContent=String(n).padStart(3,'0');b.className='num'+(mine.has(n)?' mine':occupied.has(n)?' taken':sel.has(n)?' selected':'');
     if(occupied.has(n)){b.disabled=true;b.title=mine.has(n)?'Seu número':'Indisponível';}
     else b.onclick=()=>{if(sel.has(n))sel.delete(n);else sel.add(n);b.classList.toggle('selected',sel.has(n));};
     grid.appendChild(b);
    }
    box.appendChild(grid);
    const send=document.createElement('button');send.textContent='Confirmar números selecionados';send.onclick=async()=>{
     if(!sel.size)return tell('Escolha um ou mais números deste evento.',true);
     send.disabled=true;try{await api('numbers','POST',{eventId:ev.id,numbers:[...sel]});sel.clear();await load();tab('events');tell('Seus números foram confirmados com sucesso.');}
     catch(err){tell(err.message,true);await load();tab('events');}
     finally{send.disabled=false;}
    };box.appendChild(send);
   }root.appendChild(box);
  }if(!(data.events||[]).length)root.innerHTML='<p>Nenhum evento de 2027 foi aberto pela administração ainda.</p>';
 }
 async function load(){
  data=await api('me');$('loginArea').hidden=true;$('app').style.display='block';
  $('memberName').textContent=data.member.name.split(' ')[0];$('cpfLast4').textContent=data.member.cpfLast4;
  $('profileName').textContent=data.member.name;$('profileCpf').textContent=data.member.cpfLast4;$('profilePhone').textContent=data.member.phone;$('profileAddress').textContent=data.member.address;
  payments();events();
 }
 load().catch(()=>{});})();
