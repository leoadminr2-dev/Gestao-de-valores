(()=>{
'use strict';
const $=id=>document.getElementById(id);
let rows=[];
function showLogin(message=''){
 $('login').hidden=false;$('dashboard').hidden=true;$('refresh').hidden=true;
 $('loginError').textContent=message;
}
async function request(path,options={}){
 const response=await fetch(path,{
  credentials:'same-origin',
  cache:'no-store',
  ...options
 });
 let data;
 try{data=await response.json()}catch{data={};}
 if(!response.ok){
  const error=new Error(data.error||'Falha ao consultar os dados');
  error.status=response.status;throw error;
 }
 return data;
}
function setState(message,ready=false){
 const el=$('state');el.textContent=message;el.className='notice'+(ready?' ready':'');
}
function dateBR(value){
 try{return new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});}
 catch{return '—';}
}
function textCell(tr,value,className){
 const td=document.createElement('td');
 if(className)td.className=className;
 td.textContent=String(value);
 tr.appendChild(td);
}
function renderRows(){
 const filter=$('search').value.trim().toLocaleLowerCase('pt-BR');
 const selected=rows.filter(row=>{
  const haystack=[row.name,row.phone,row.quantity,...row.numbers].join(' ').toLocaleLowerCase('pt-BR');
  return haystack.includes(filter);
 });
 $('tableBody').replaceChildren();
 if(!selected.length){
  const tr=document.createElement('tr'),td=document.createElement('td');
  td.colSpan=5;
  td.textContent=filter?'Nenhum participante corresponde à pesquisa.':'Nenhuma inscrição confirmada.';
  tr.appendChild(td);$('tableBody').appendChild(tr);
 }else{
  for(const row of selected){
   const tr=document.createElement('tr');
   textCell(tr,row.name);
   textCell(tr,row.phone);
   textCell(tr,row.quantity);
   textCell(tr,row.numbers.join(', '),'numbers');
   textCell(tr,dateBR(row.date));
   $('tableBody').appendChild(tr);
  }
 }
 $('count').textContent=selected.length+' participante(s) exibido(s).';
}
async function load(){
 try{
  const data=await request('/painel/api/draw/overview');
  $('login').hidden=true;$('dashboard').hidden=false;$('refresh').hidden=false;
  $('total').textContent=data.total;
  $('entries').textContent=data.entries;
  $('occupied').textContent=data.allocated;
  $('available').textContent=data.available;
  setState(data.open?'Inscrições abertas.':'Inscrições fechadas — consulta administrativa.',!data.open);
  rows=(data.participants||[]).map(x=>({
   name:String(x.name||''),
   phone:String(x.phone||''),
   quantity:Number(x.quantity||0),
   numbers:Array.isArray(x.numbers)?x.numbers.map(n=>String(n).padStart(3,'0')):[],
   date:x.date
  }));
  renderRows();
 }catch(error){
  if(error.status===401)showLogin();
  else if(error.status===503)showLogin('Painel administrativo não configurado.');
  else setState('Falha ao atualizar: '+error.message);
 }
}
$('loginForm').addEventListener('submit',async event=>{
 event.preventDefault();
 const password=$('password').value;
 try{
  await request('/painel/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
  $('password').value='';
  await load();
 }catch(error){$('loginError').textContent=error.status===429?'Muitas tentativas. Tente mais tarde.':'Não foi possível entrar. Verifique a senha.';}
});
$('search').addEventListener('input',renderRows);
$('refresh').addEventListener('click',()=>{void load();});
void load();
})();
