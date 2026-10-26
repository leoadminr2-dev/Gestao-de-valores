'use strict';
// Cliente 100% privado: dados só saem de /api/state após sessão e RLS.
(function(){
  const $=id=>document.getElementById(id);
  const gate=$('authGate'), app=$('privateApp'), error=$('authError');
  let registering=false, currentEmail='', version=null, authenticated=false;
  let pending=null, committing=false, conflict=false, saveTimeout=0;
  const status=$('secureStatus');
  function verificationVisible(enabled){
    $('otpGate').hidden=!enabled;
    $('loginForm').hidden=enabled;
    $('switchAuth').hidden=enabled;
    $('verifyEmailBtn').hidden=true;
    if(enabled)$('otpCode').focus();
  }
  async function sendOtp(email){await request('/api/auth/verify','POST',{email});}
  const showError=message=>{error.textContent=message;error.hidden=false;};
  const clearError=()=>{error.textContent='';error.hidden=true;};
  const setStatus=(s,bad=false)=>{status.textContent=s;status.style.color=bad?'#b84c59':'';status.style.background=bad?'#fff0f1':'';};
  const request=async(url,method='GET',body)=>{
    const r=await fetch(url,{method,credentials:'same-origin',headers:{...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store'});
    let d;try{d=await r.json();}catch{d={error:'Falha na comunicação.'};}
    if(!r.ok){const err=new Error(d.error||'Não foi possível completar a operação.');err.status=r.status;err.needsVerification=d.needsVerification;throw err;}
    return d;
  };
  async function openPrivate(){
    const data=await request('/api/state');version=data.version;
    window.gestaoBridge.load(data.data);
    currentEmail=(await request('/api/session')).email;
    verificationVisible(false);gate.hidden=true;app.hidden=false;authenticated=true;clearError();setStatus('● Sincronizado');
    if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
  }
  function returnToLogin(message){authenticated=false;gate.hidden=false;app.hidden=true;pending=null;version=null;verificationVisible(false);if(message)showError(message);}
  async function sessionStart(){
    try{await openPrivate();}catch(e){returnToLogin(e.status===401?'Faça login para acessar o Gestão de Valores.':e.message);
      if(e.needsVerification){verificationVisible(true);}
    }
  }
  function queueSave(data){
    if(!authenticated || conflict){window.gestaoBridge.notify('Alteração não salva. Verifique a conexão e entre novamente.','error');return;}
    pending=data;setStatus('● Alterações pendentes');clearTimeout(saveTimeout);
    saveTimeout=setTimeout(()=>{void flush();},450);
  }
  async function flush(){
    if(committing||!pending||!authenticated||conflict)return;
    committing=true;
    const draft=pending;pending=null;setStatus('● Salvando…');
    try{
      const resp=await request('/api/state','PUT',{data:draft,version});version=resp.version;
      setStatus(pending?'● Alterações pendentes':'● Sincronizado');
      if(!pending)window.gestaoBridge.notify('Alterações confirmadas no Neon.');
    }catch(e){
      if(e.status===409){
        conflict=true;pending=null;setStatus('● Conflito: atualizar',true);
        alert('Os dados foram alterados em outro aparelho. Sua alteração não foi gravada. A página será atualizada para proteger os registros.');
        try{const fresh=await request('/api/state');version=fresh.version;window.gestaoBridge.load(fresh.data);conflict=false;setStatus('● Sincronizado');}catch{setStatus('● Atualização necessária',true);}
      }else{pending=draft;setStatus('● Sem conexão — não salvo',true);window.gestaoBridge.notify('Não foi possível salvar no Neon. Não feche esta página; tente novamente.','error');}
    }finally{
      committing=false;
      if(pending && !conflict && authenticated && status.textContent!=='● Sem conexão — não salvo'){
        clearTimeout(saveTimeout);saveTimeout=setTimeout(()=>{void flush();},350);
      }
    }
  }
  window.secureSync={queueSave};
  $('loginForm').addEventListener('submit',async e=>{
    e.preventDefault();clearError();const email=$('loginEmail').value.trim();const password=$('loginPassword').value;
    const button=$('loginButton');button.disabled=true;button.textContent=registering?'Criando acesso…':'Entrando…';
    try{
      const result=await request(registering?'/api/auth/signup':'/api/auth/login','POST',{email,password});
      currentEmail=email;
      if(result.needsVerification){
        verificationVisible(true);
        showError(result.otpSent?'Enviamos um código para confirmar seu e-mail.':'Conta criada. Solicite um código de confirmação.');
        return;
      }
      await openPrivate();
    }catch(err){
      showError(err.needsVerification?'Verifique seu e-mail antes de entrar. Você pode solicitar o reenvio abaixo.':err.message);
      if(err.needsVerification){
        verificationVisible(true);
        try{await sendOtp(email);showError('Enviamos um código de confirmação para seu e-mail.');}
        catch{showError('Confirme seu e-mail. Utilize Reenviar código.');}
      } else if(registering){$('verifyEmailBtn').hidden=false;}
    }finally{button.disabled=false;button.textContent=registering?'Criar minha senha':'Entrar com segurança';}
  });
  $('switchAuth').addEventListener('click',()=>{
    registering=!registering;clearError();$('loginButton').textContent=registering?'Criar minha senha':'Entrar com segurança';
    $('switchAuth').textContent=registering?'Já tenho senha — entrar':'Primeiro acesso? Criar minha senha';
    $('loginPassword').autocomplete=registering?'new-password':'current-password';
  });
  $('verifyEmailBtn').addEventListener('click',async()=>{
    const email=$('loginEmail').value.trim()||currentEmail;
    try{await sendOtp(email);verificationVisible(true);showError('Código enviado ao e-mail autorizado.');}catch(e){showError(e.message);}
  });
  $('resendOtpButton').addEventListener('click',async()=>{
    const email=$('loginEmail').value.trim()||currentEmail;
    try{await sendOtp(email);showError('Novo código enviado. Verifique a caixa de entrada e o spam.');}catch(e){showError(e.message);}
  });
  $('backFromOtp').addEventListener('click',()=>{
    registering=false;verificationVisible(false);clearError();
    $('loginButton').textContent='Entrar com segurança';
    $('switchAuth').textContent='Primeiro acesso? Criar minha senha';
  });
  $('otpForm').addEventListener('submit',async e=>{
    e.preventDefault();clearError();
    const button=$('confirmOtpButton');button.disabled=true;
    try{
      await request('/api/auth/confirm-otp','POST',{email:$('loginEmail').value.trim()||currentEmail,otp:$('otpCode').value.trim()});
      registering=false;verificationVisible(false);
      $('loginButton').textContent='Entrar com segurança';
      $('switchAuth').textContent='Primeiro acesso? Criar minha senha';
      try{await openPrivate();}catch{showError('E-mail confirmado. Entre com sua senha para abrir o aplicativo.');}
    }catch(err){showError(err.message);}
    finally{button.disabled=false;}
  });
  $('logoutButton').addEventListener('click',async()=>{
    if(pending||committing){window.gestaoBridge.notify('Existem alterações não salvas. Aguarde a confirmação do banco.','error');return;}
    try{await request('/api/auth/logout','POST',{});}catch{}
    window.gestaoBridge.load({});returnToLogin('Sessão encerrada com segurança.');
  });
  window.addEventListener('online',()=>{if(pending)void flush();});
  document.addEventListener('visibilitychange',async()=>{
    if(!authenticated || document.hidden||committing||pending||conflict)return;
    try{const check=await request('/api/version');if(version!==check.version){const fresh=await request('/api/state');version=fresh.version;window.gestaoBridge.load(fresh.data);setStatus('● Atualizado por outro responsável');}}
    catch{setStatus('● Sem conexão',true);}
  });
  setInterval(async()=>{
    if(!authenticated||document.hidden||pending||committing||conflict)return;
    try{const check=await request('/api/version');if(check.version!==version){const fresh=await request('/api/state');version=fresh.version;window.gestaoBridge.load(fresh.data);setStatus('● Sincronizado');}}
    catch{setStatus('● Conexão instável',true);}
  },60000);
  sessionStart();
})();
