'use strict';
(function(){
 const $=id=>document.getElementById(id);
 const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const brl=c=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(c||0)/100);
 const categories=['Mensalidade','Juros de mensalidade','Rifa','Evento','Pagamento de empréstimo','Juros de empréstimo','Outros'];
 const months=Array.from({length:11},(_,i)=>'2026-'+String(i+1).padStart(2,'0'));
 const maxBytes=300*1024;
 let token='';
 const fragment=new URLSearchParams(location.hash.slice(1));
 const fromLink=fragment.get('chave');
 if(fromLink&&/^[A-Za-z0-9_-]{35,120}$/.test(fromLink)){
  sessionStorage.setItem('caixinha_personal_key',fromLink);
  history.replaceState(null,'',location.pathname);
 }
 token=sessionStorage.getItem('caixinha_personal_key')||'';
 function message(text,error=false){
  $('message').hidden=false;$('message').textContent=text;$('message').className=error?'error':'info';
 }
 async function api(path,method='GET',body){
  const r=await fetch('/api/portal/'+path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store'});
  let data;try{data=await r.json();}catch{data={error:'Falha ao consultar o serviço.'};}
  if(!r.ok)throw new Error(data.error||'Não foi possível enviar o comprovante.');
  return data;
 }
 function item(){
  if($('items').children.length>=8)return message('Máximo de oito finalidades por Pix.',true);
  const div=document.createElement('div');
  div.className='item';
  div.innerHTML='<div class="row"><div><label>Finalidade</label><select class="cat">'+categories.map(c=>'<option value="'+h(c)+'">'+h(c)+'</option>').join('')+'</select></div><div><label>Valor desta finalidade (R$)</label><input class="value" type="number" min=".01" step=".01" required placeholder="Ex.: 80,00"></div></div>'+
    '<div class="row"><div><label>Mês a que se refere (para mensalidade/juros)</label><select class="competence"><option value="">Não se aplica / não informado</option>'+months.map(m=>'<option value="'+m+'">'+m.slice(5)+'/2026</option>').join('')+'</select></div>'+
    '<div><label>Nome do evento (quando for evento)</label><input class="eventName" maxlength="90" placeholder="Ex.: confraternização"></div></div>'+
    '<button type="button" class="alt remove">Remover esta finalidade</button>';
  div.querySelector('.remove').onclick=()=>{div.remove();updateSum();};
  div.querySelectorAll('input,select').forEach(e=>e.addEventListener('input',updateSum));
  $('items').append(div);updateSum();
 }
 function cents(value){return Math.round(Number(value||0)*100);}
 function updateSum(){
  const parts=[...$('items').children],split=parts.reduce((s,d)=>s+cents(d.querySelector('.value').value),0),total=cents($('total').value);
  $('sum').textContent='Finalidades: '+brl(split)+' / Pix: '+brl(total)+(total&&split!==total?' — valores não conferem':' — valores conferem');
  $('sum').className=total>0&&split===total?'info':'warning';
 }
 function parts(){
  return [...$('items').children].map(div=>({
   category:div.querySelector('.cat').value,
   cents:cents(div.querySelector('.value').value),
   competence:div.querySelector('.competence').value,
   eventName:div.querySelector('.eventName').value.trim()
  }));
 }
 async function encodeReceipt(file){
  if(!file)throw new Error('Selecione o comprovante.');
  let blob=file,media=file.type;
  if(!['image/jpeg','image/png','application/pdf'].includes(media))throw new Error('Use JPG, PNG ou PDF.');
  if(media.startsWith('image/')&&file.size>maxBytes){
   const bitmap=await createImageBitmap(file);
   let result;
   for(const width of [1400,1150,900,700]){
     const ratio=Math.min(1,width/bitmap.width);
     const canvas=document.createElement('canvas');
     canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
     canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
     for(const quality of [.78,.66,.54]){
       result=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
       if(result&&result.size<=maxBytes)break;
     }
     if(result&&result.size<=maxBytes)break;
   }
   bitmap.close?.();
   if(!result||result.size>maxBytes)throw new Error('Imagem muito grande. Faça uma foto mais nítida e aproxime o enquadramento.');
   blob=result;media='image/jpeg';
  }
  if(blob.size>maxBytes)throw new Error('Arquivo acima de 300 KB. Para PDF, gere uma versão menor ou envie uma foto JPG.');
  const encoded=await new Promise((resolve,reject)=>{
    const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Não foi possível ler o comprovante.'));reader.readAsDataURL(blob);
  });
  return {fileBase64:encoded,fileType:media,fileName:media==='image/jpeg'?'comprovante.jpg':file.name};
 }
 function historyRows(subs){
  if(!subs.length){$('history').textContent='Nenhum comprovante enviado ainda.';return;}
  const statuses={pending:'Aguardando conferência',reviewed:'Documento conferido (não lançado automaticamente)',rejected:'Correção solicitada'};
  $('history').innerHTML='<div style="overflow:auto"><table><thead><tr><th>Data do Pix</th><th>Valor</th><th>Finalidades informadas</th><th>Situação</th></tr></thead><tbody>'+
   subs.map(s=>'<tr><td>'+h(String(s.paid_on||'').slice(0,10).split('-').reverse().join('/'))+'</td><td>'+brl(s.amount_cents)+'</td><td>'+h((s.allocations||[]).map(a=>a.category+': '+brl(a.cents)).join(' • '))+'</td><td>'+h(statuses[s.status]||s.status)+(s.review_notes?'<small style="display:block">'+h(s.review_notes)+'</small>':'')+'</td></tr>').join('')+'</tbody></table></div>';
 }
 async function load(){
  if(!token){$('access').hidden=false;message('É necessário abrir o link individual enviado pela administração.',true);return;}
  try{
   const r=await api('me');
   $('privateArea').hidden=false;$('access').hidden=true;
   $('welcome').textContent='Acesso individual: '+r.name;
   historyRows(r.submissions);
   message('Acesso pessoal validado. Nenhum outro associado pode consultar seus comprovantes por este link.');
  }catch(e){$('access').hidden=false;$('privateArea').hidden=true;message(e.message,true);}
 }
 $('addItem').onclick=item;
 $('exit').onclick=()=>{sessionStorage.removeItem('caixinha_personal_key');token='';$('privateArea').hidden=true;$('access').hidden=false;message('Acesso encerrado neste aparelho. Guarde o link individual.',false);};
 $('total').addEventListener('input',updateSum);
 $('receiptForm').onsubmit=async event=>{
   event.preventDefault();const send=$('send');send.disabled=true;
   try{
     const alloc=parts(),amountCents=cents($('total').value);
     if(!amountCents||alloc.reduce((s,x)=>s+x.cents,0)!==amountCents)throw new Error('Os valores informados precisam somar exatamente o total depositado.');
     for(const a of alloc){
       if(['Mensalidade','Juros de mensalidade'].includes(a.category)&&!months.includes(a.competence))throw new Error('Informe o mês da mensalidade ou juros.');
       if(a.category==='Evento'&&!a.eventName)throw new Error('Informe qual evento foi pago.');
     }
     message('Preparando o comprovante…');
     const file=await encodeReceipt($('file').files[0]);
     await api('submit','POST',{payerName:$('payerName').value.trim(),paidOn:$('paidOn').value,amountCents,allocations:alloc,notes:$('notes').value,...file});
     $('receiptForm').reset();$('items').innerHTML='';item();await load();
     message('Comprovante recebido com sucesso! A administração vai conferir. Ainda não foi somado ao caixa.');
   }catch(err){message(err.message,true);}finally{send.disabled=false;}
 };
 item();void load();
})();