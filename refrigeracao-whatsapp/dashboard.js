"use strict";
const el=id=>document.getElementById(id);
const base="/painel/api";
const labels={novo:"Novo pedido",orcamento:"Orçamento pendente",agendado:"Agendado",andamento:"Em andamento",concluido:"Concluído",cancelado:"Cancelado"};
let csrf="",allOrders=[],metrics={},filter="todos",selected="",search="";
let replyProposal=null,replyKey="",lastReplyProtocol="";
const fmt=new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
const longDate=new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",weekday:"long",day:"numeric",month:"long",year:"numeric"});
function dateText(d){if(!d)return"—";const x=new Date(d);return Number.isNaN(x.getTime())?"—":fmt.format(x);}
function localDate(d){if(!d)return"";const x=new Date(d);if(Number.isNaN(x.getTime()))return"";return new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(x).replace(" ","T");}
function text(id,v){el(id).textContent=v==null?"—":String(v);}
function showLogin(message=""){
 el("loginView").hidden=false;el("appView").hidden=true;
 el("loginError").hidden=!message;el("loginError").textContent=message;
}
function showApp(){
 el("appView").hidden=false;el("loginView").hidden=true;
 el("todayText").textContent=longDate.format(new Date());
}
async function call(path,options={}){
 const res=await fetch(base+path,{credentials:"same-origin",cache:"no-store",...options,headers:{"Content-Type":"application/json",...options.headers}});
 const data=await res.json().catch(()=>({}));
 if(!res.ok){const e=Error(data.error||"Falha de conexão");e.status=res.status;throw e;}
 return data;
}
async function init(){
 try{const data=await call("/me");csrf=data.csrf;showApp();await refresh();}
 catch{showLogin();}
}
async function login(e){
 e.preventDefault();const btn=el("loginButton");btn.disabled=true;btn.textContent="Verificando acesso...";
 try{
  const data=await call("/login",{method:"POST",body:JSON.stringify({password:el("password").value})});
  csrf=data.csrf;el("password").value="";showApp();await refresh();
 }catch(err){
  const msgs={senha_incorreta:"Senha incorreta. Confira e tente novamente.",muitas_tentativas:"Acesso temporariamente bloqueado por segurança.",painel_nao_configurado:"O administrador ainda não ativou o acesso seguro."};
  showLogin(msgs[err.message]||"Não foi possível entrar. Tente novamente.");}
 finally{btn.disabled=false;btn.textContent="Acessar central →";}
}
async function refresh(){
 text("lastUpdate","Atualizando dados...");
 try{
  const data=await call("/overview");
  allOrders=data.orders||[];
  metrics=Object.fromEntries((data.metrics||[]).map(x=>[x.status,Number(x.total)]));
  const total=Object.values(metrics).reduce((a,b)=>a+b,0);
  [["metricTotal",total],["metricNew",metrics.novo||0],["metricQuotes",metrics.orcamento||0],["metricScheduled",metrics.agendado||0],["metricProgress",metrics.andamento||0],["metricDone",metrics.concluido||0]].forEach(([id,value])=>text(id,value));
  text("lastUpdate","Atualizado às "+new Intl.DateTimeFormat("pt-BR",{timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit"}).format(new Date()));
  renderOrders();
  if(selected){const row=allOrders.find(x=>x.protocol===selected);if(row)renderDetail(row);else{selected="";renderDetail(null);}}
 }catch(err){
  text("lastUpdate","Falha ao atualizar");
  if(err.status===401)showLogin("A sessão expirou. Entre novamente.");
  else showMessage("Não foi possível carregar as ordens. Tente atualizar.",true);
 }
}
function setFilter(value){
 filter=value;
 el("statusFilter").value=value;
 [...document.querySelectorAll(".stat-card")].forEach(b=>b.classList.toggle("selected",b.dataset.filter===value));
 renderOrders();
}
function setNav(id){
 ["navOverview","navOrders","navCalendar","navQuotes"].forEach(n=>el(n).classList.toggle("active",n===id));
 const titles={navOverview:"Visão geral",navOrders:"Ordens de serviço",navCalendar:"Agenda",navQuotes:"Orçamentos"};
 text("sectionName",titles[id]);
}
function make(tag,cls,txt){
 const n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n;
}
function renderOrders(){
 const list=el("ordersList");list.replaceChildren();
 const items=allOrders.filter(o=>(filter==="todos"||o.operation_status===filter)&&
  (!search||[o.protocol,o.phone,o.payload?.cliente,o.payload?.bairro,o.payload?.servico,o.payload?.equipamento].some(v=>String(v||"").toLocaleLowerCase("pt-BR").includes(search))));
 text("listCount",items.length+" pedidos nesta lista");
 if(!items.length){
  const empty=make("div","empty-list","Nenhuma ordem encontrada nesta seleção.");list.append(empty);return;
 }
 for(const o of items){
  const item=make("button","order-item"+(o.protocol===selected?" active":""));
  item.type="button";item.setAttribute("aria-label","Abrir ordem "+o.protocol);
  const initial=String(o.payload?.cliente||"Cliente").trim().split(/\s+/).slice(0,2).map(w=>w[0]||"").join("").toUpperCase();
  item.append(make("span","order-avatar",initial||"CL"));
  const main=make("span","order-main");
  const line=make("span","order-line");
  line.append(make("strong","",o.payload?.cliente||"Cliente sem nome"),make("span","pill "+(o.operation_status||"novo"),labels[o.operation_status]||"Novo pedido"));
  main.append(line,make("span","order-sub",o.payload?.servico||"Serviço a definir"));
  const meta=make("span","order-meta");
  meta.append(make("span","",o.payload?.bairro||"Bairro não informado"),make("span","",dateText(o.created_at)));
  main.append(meta,make("span","source-label",o.source==="site"?"🌐 Atendimento Expresso · Site":"◉ WhatsApp Business"));item.append(main);
  item.addEventListener("click",()=>{
   selected=o.protocol;renderOrders();renderDetail(o);
   if(window.matchMedia("(max-width: 1250px)").matches)el("detailContent").scrollIntoView({behavior:"smooth",block:"start"});
  });
  list.append(item);
 }
}
function renderDetail(o){
 el("detailEmpty").hidden=!!o;el("detailContent").hidden=!o;
 if(!o)return;
 text("detailName",o.payload?.cliente||"Cliente sem nome");
 text("detailProtocol",o.protocol);
 const badge=el("detailBadge");badge.className="pill "+(o.operation_status||"novo");badge.textContent=labels[o.operation_status]||"Novo pedido";
 text("detailService",o.payload?.servico||"Não informado");
 text("detailEquipment",o.payload?.equipamento||"Não informado");
 text("detailDistrict",o.payload?.bairro||"Não informado");
 text("detailPreference",o.payload?.preferencia||"A combinar");
 text("detailCreated",dateText(o.created_at));
 text("detailSync",o.wix_update_pending?"Alterações aguardando sincronização":o.wix_update_error?"Erro na atualização Wix":o.sync_status==="synced"?"Sincronizado com Wix":"Sincronização inicial pendente");
 const phone=String(o.phone||"").replace(/\D/g,"");
 const wa=el("detailWhatsApp");wa.href=phone?"https://wa.me/"+phone:"https://wa.me/5521970338222";
 wa.hidden=!phone;
 el("editStatus").value=o.operation_status||"novo";
 el("editAmount").value=o.estimate_amount==null?"":Number(o.estimate_amount).toFixed(2);
 el("editDate").value=localDate(o.appointment_at);
 el("editNotes").value=o.admin_notes||"";
 text("saveStatus","");
 if(lastReplyProtocol!==o.protocol){el("customerExtra").value="";el("replyKind").value="retorno";lastReplyProtocol=o.protocol;}
 clearReplyPreview();
 void loadReplyHistory(o.protocol);
}
function showMessage(message,error=false){
 const v=el("saveStatus");v.textContent=message;v.classList.toggle("error",error);
}
async function saveOrder(e){
 e.preventDefault();const o=allOrders.find(x=>x.protocol===selected);
 if(!o)return;
 const btn=el("saveOrder");btn.disabled=true;showMessage("Salvando alterações...");
 try{
  const date=el("editDate").value;
  const payload={status:el("editStatus").value,appointment:date?new Date(date).toISOString():null,amount:el("editAmount").value?Number(el("editAmount").value):null,notes:el("editNotes").value};
  const saved=await call("/ordens/"+encodeURIComponent(selected),{method:"PATCH",headers:{"x-csrf-token":csrf},body:JSON.stringify(payload)});
  await refresh();
  showMessage(saved.order?.wix_update_pending?"Alterações salvas. Atualização do Wix na próxima sincronização.":"Alterações salvas com sucesso.");
 }catch(err){
  if(err.status===401){showLogin("Sua sessão expirou.");return;}
  showMessage("Falha ao salvar. Confira os campos e tente novamente.",true);
 }finally{btn.disabled=false;}
}
function clearReplyPreview(){
 replyProposal=null;replyKey="";
 el("replyPreviewWrap").hidden=true;
 el("sendReplyApi").disabled=false;
 text("replyFeedback","");
}
async function loadReplyHistory(protocol){
 const history=el("replyHistory");history.replaceChildren();history.append(make("p","","Consultando histórico..."));
 try{
  const result=await call("/customer/history?protocol="+encodeURIComponent(protocol));
  if(selected!==protocol)return;
  history.replaceChildren();
  if(!result.entries?.length){history.append(make("p","","Nenhum retorno enviado pela API nesta ordem."));return;}
  const states={accepted:"Aceito pela YCloud (entrega não confirmada)",rejected:"Rejeitado pela API",unknown:"Envio incerto: conferir no WhatsApp",sending:"Processamento pendente"};
  const labels={retorno:"Retorno",orcamento:"Orçamento",agendamento:"Agendamento",andamento:"Andamento"};
  for(const entry of result.entries){
   const p=make("div","reply-history-entry");
   p.append(make("strong","",labels[entry.kind]||entry.kind),make("span","",states[entry.status]||entry.status),make("small","",dateText(entry.created_at)));
   history.append(p);
  }
 }catch(e){if(selected===protocol)history.replaceChildren(make("p","","Histórico indisponível no momento."));}
}
function pendingEdit(o){
 return el("editStatus").value!==(o.operation_status||"novo")||
  el("editDate").value!==localDate(o.appointment_at)||
  (el("editAmount").value?Number(el("editAmount").value):null)!==(o.estimate_amount===null||o.estimate_amount===undefined?null:Number(o.estimate_amount));
}
function replyError(err){
 const map={valor_nao_informado:"Preencha e salve o valor do orçamento antes de preparar a mensagem.",data_nao_informada:"Defina e salve uma data e horário antes de preparar a proposta.",telefone_do_cliente_invalido:"O telefone deste pedido não está válido para o WhatsApp. Confira o cadastro.",janela_de_atendimento_encerrada:"A janela para envio pela API terminou. Abra o WhatsApp Business para enviar manualmente.",dados_alterados_revisar_proposta:"A ordem foi alterada. Atualize a Central e gere uma nova prévia.",envio_incerto_nao_repetir:"Envio incerto. Confira a conversa do cliente antes de tentar novamente para evitar duplicidade.",provedor_rejeitou_mensagem:"A YCloud recusou a mensagem. Você pode enviá-la pelo WhatsApp Business."};
 return map[err?.message]||"Falha na operação. Confira os dados e tente novamente.";
}
async function previewCustomerReply(){
 const o=allOrders.find(x=>x.protocol===selected);
 if(!o)return;
 const feedback=el("replyFeedback");
 if(pendingEdit(o)){el("replyPreviewWrap").hidden=false;text("replyNotice","Salve as alterações de data, status ou valor antes de preparar a mensagem.");text("replyPreview","");text("replyFeedback","");el("sendReplyApi").hidden=true;el("sendReplyManual").hidden=true;return;}
 const btn=el("previewReply");btn.disabled=true;
 try{
  const reply=await call("/customer/preview",{method:"POST",headers:{"x-csrf-token":csrf},body:JSON.stringify({protocol:o.protocol,kind:el("replyKind").value,extra:el("customerExtra").value})});
  if(selected!==o.protocol)return;
  replyProposal=reply;
  replyKey=crypto.randomUUID();
  el("replyPreviewWrap").hidden=false;
  text("replyPreview",reply.message);
  text("replyNotice",reply.notice);
  text("replyFeedback","");
  const api=el("sendReplyApi");
  api.hidden=!reply.eligible;api.disabled=false;
  const manual=el("sendReplyManual");
  manual.hidden=false;
  manual.href="https://wa.me/"+reply.phone+"?text="+encodeURIComponent(reply.message);
 }catch(err){
  el("replyPreviewWrap").hidden=false;
  text("replyPreview","");
  text("replyNotice",replyError(err));
  el("sendReplyApi").hidden=true;el("sendReplyManual").hidden=true;
  replyProposal=null;
 }finally{btn.disabled=false;}
}
async function sendCustomerReply(){
 if(!replyProposal||!replyKey||!replyProposal.eligible)return;
 if(!confirm("Você autoriza o envio desta mensagem ao cliente pelo WhatsApp agora?"))return;
 const btn=el("sendReplyApi");
 btn.disabled=true;btn.textContent="Enviando...";
 try{
  const r=await call("/customer/send",{method:"POST",headers:{"x-csrf-token":csrf},body:JSON.stringify({protocol:replyProposal.protocol,kind:replyProposal.kind,extra:el("customerExtra").value,requestKey:replyKey,expectedUpdatedAt:replyProposal.updatedAt})});
  if(r.status==="accepted"){
   text("replyFeedback","Mensagem aceita pela YCloud. Entrega ao cliente ainda não confirmada. O robô permanecerá em modo humano nesta conversa.");
   btn.hidden=true;el("sendReplyManual").hidden=true;
   void loadReplyHistory(replyProposal.protocol);
  }else{text("replyFeedback","Essa solicitação já foi registrada ("+r.status+"). Verifique o histórico antes de reenviar.");}
 }catch(err){
  text("replyFeedback",replyError(err));
  if(err.status===409||err.status===502){btn.hidden=true;}
  // When API outcome is uncertain, do not automatically retry.
 }finally{btn.disabled=false;btn.textContent="Autorizar e enviar agora";}
}
function openPassword(){
 el("passwordCover").hidden=false;
 el("currentPassword").focus();
}
function closePassword(){
 el("passwordCover").hidden=true;
 el("passwordForm").reset();
 text("passwordMessage","");
}
async function changePassword(e){
 e.preventDefault();
 const oldPwd=el("currentPassword").value;
 const newPwd=el("newPassword").value;
 const confirm=el("confirmPassword").value;
 if(newPwd!==confirm){text("passwordMessage","As novas senhas não coincidem.");return;}
 if(newPwd.length<14){text("passwordMessage","Use no mínimo 14 caracteres.");return;}
 const btn=el("passwordSave");btn.disabled=true;btn.textContent="Salvando...";
 try{
  await call("/password",{method:"POST",headers:{"x-csrf-token":csrf},body:JSON.stringify({currentPassword:oldPwd,newPassword:newPwd})});
  csrf="";
  closePassword();
  showLogin("Sua senha foi alterada. Entre com a nova senha.");
 }catch(err){
  text("passwordMessage",err.message==="senha_atual_incorreta"?"Senha atual incorreta.":err.message==="senha_nova_invalida"?"Escolha uma senha mais longa e diferente.":"Não foi possível salvar. Tente novamente.");
 }finally{btn.disabled=false;btn.textContent="Trocar senha e encerrar sessões";}
}
async function logout(){
 try{await call("/logout",{method:"POST",headers:{"x-csrf-token":csrf},body:"{}"});}catch{}
 csrf="";allOrders=[];showLogin();el("password").focus();
}
document.addEventListener("DOMContentLoaded",()=>{
 el("loginForm").addEventListener("submit",login);
 el("togglePassword").addEventListener("click",()=>{
  const pwd=el("password");pwd.type=pwd.type==="password"?"text":"password";
  text("togglePassword",pwd.type==="password"?"Mostrar":"Ocultar");
 });
 el("refreshBtn").addEventListener("click",refresh);
 el("logoutBtn").addEventListener("click",logout);
 el("passwordOpen").addEventListener("click",openPassword);
 el("passwordClose").addEventListener("click",closePassword);
 el("passwordForm").addEventListener("submit",changePassword);
 el("passwordCover").addEventListener("click",e=>{if(e.target===el("passwordCover"))closePassword();});
 document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!el("passwordCover").hidden)closePassword();});
 el("openAllOrders").addEventListener("click",()=>{setFilter("todos");setNav("navOrders");el("ordersSection").scrollIntoView({behavior:"smooth"});});
 el("searchInput").addEventListener("input",e=>{search=e.target.value.trim().toLocaleLowerCase("pt-BR");renderOrders();});
 el("statusFilter").addEventListener("change",e=>setFilter(e.target.value));
 document.querySelectorAll(".stat-card").forEach(b=>b.addEventListener("click",()=>{setFilter(b.dataset.filter);setNav("navOrders");el("ordersSection").scrollIntoView({behavior:"smooth"});}));
 const nav={navOverview:"todos",navOrders:"todos",navCalendar:"agendado",navQuotes:"orcamento"};
 Object.entries(nav).forEach(([id,value])=>el(id).addEventListener("click",()=>{setNav(id);setFilter(value);if(id!=="navOverview")el("ordersSection").scrollIntoView({behavior:"smooth"});else window.scrollTo({top:0,behavior:"smooth"});}));
 el("orderForm").addEventListener("submit",saveOrder);
 el("previewReply").addEventListener("click",previewCustomerReply);
 el("sendReplyApi").addEventListener("click",sendCustomerReply);
 el("sendReplyManual").addEventListener("click",()=>{
   if(replyProposal){text("replyFeedback","Conversa aberta com a mensagem pronta. Confira e toque em enviar dentro do WhatsApp Business.");el("sendReplyApi").disabled=true;}
 });
 el("replyKind").addEventListener("change",clearReplyPreview);
 el("customerExtra").addEventListener("input",clearReplyPreview);
 void init();
});
