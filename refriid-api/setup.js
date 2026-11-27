'use strict';
(() => {
  let token = location.hash.slice(1);
  history.replaceState(null, '', '/setup');
  const message = document.querySelector('#message');
  const form = document.querySelector('#form');
  const field = document.querySelector('#accessToken');
  const button = document.querySelector('#save');
  async function call(body) {
    const response = await fetch('/admin/config', { method: body ? 'POST' : 'GET', cache: 'no-store',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined });
    const data = await response.json();
    if (!response.ok) throw Error(data.message || 'Não foi possível salvar.');
    return data;
  }
  form.onsubmit = async event => {
    event.preventDefault(); button.disabled = true;
    try {
      const result = await call({ accessToken: field.value.trim() });
      field.value = ''; form.hidden = true; token = '';
      message.textContent = result.message;
    } catch (error) { field.value = ''; message.textContent = error.message; }
    finally { button.disabled = false; }
  };
  if (!token) { message.textContent = 'Abra pelo link exclusivo de configuração recebido nesta conversa.'; return; }
  call().then(result => {
    form.hidden = result.configured;
    message.textContent = result.configured ? 'Chave já cadastrada. Cobranças continuam desativadas até a homologação.' : 'Acesso autorizado. Cole abaixo a chave exclusiva do RefriID.';
  }).catch(error => { message.textContent = error.message; });
})();
