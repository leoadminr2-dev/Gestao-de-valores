'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function harness(){
  const sandbox={window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..','participant-panel.js'),'utf8'),sandbox,{timeout:1000});
  const panel=sandbox.window.GestaoPersonPanel;
  const participant={id:'p1',name:'Pessoa <exemplo>',quotas:2,active:true};
  const state={
    config:{fees:[70,70,70,70,80,80,80,80,90,90,90,null],monthlyBasePerQuota:50,monthlyAdditionalPerQuota2026:[20,20,20,20,30,30,30,30,40,40,40],rafflePricePerQuota:10},
    transactions:[
      {id:'a',participantId:'p1',date:'2026-01-15',category:'Mensalidade',kind:'in',amount:140,description:'Janeiro'},
      {id:'b',participantId:'p1',date:'2026-02-15',category:'Juros de mensalidade',kind:'in',amount:10,description:'Juros'},
      {id:'c',participantId:'p1',date:'2026-03-15',category:'Rifa',kind:'in',amount:20,description:'Rifa'},
      {id:'d',participantId:'p1',date:'2026-04-15',category:'Evento',kind:'in',eventName:'Evento <teste>',amount:50,description:'Evento'},
      {id:'e',participantId:'p1',date:'2026-05-15',category:'Pagamento de empréstimo',kind:'in',amount:100,description:'Parcela sem loanId'},
      {id:'other',participantId:'p2',date:'2026-01-15',category:'Mensalidade',kind:'in',amount:1000,description:'Outro participante'}
    ],
    dues:[{id:'due1',participantId:'p1',month:'2026-01',amount:140,paidAmount:140,status:'paid'}],
    loans:[{id:'l1',participantId:'p1',date:'2026-03-01',principal:400,rate:20,paidTotal:0,status:'open'}]
  };
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const brl=x=>'R$ '+Number(x).toFixed(2);
  const render=(year='2026')=>panel.render({state,participant,year,esc,brl,day:x=>x,loanTotal:l=>Number(l.principal)*(1+Number(l.rate)/100)});
  return {panel,state,participant,render};
}
test('painel mostra janeiro a novembro sem cadastrar 11 cobranças automáticas',()=>{
  const {state,render}=harness(),html=render();
  assert.equal((html.match(/class="panel sheet-section"/g)||[]).length,7);
  assert.equal((html.match(/<td><strong>(Janeiro|Fevereiro|Março|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro)<\/strong><\/td>/g)||[]).length,11);
  assert.match(html,/Janeiro/);assert.match(html,/Novembro/);
  assert.match(html,/R\$ 140\.00/);assert.match(html,/R\$ 180\.00/);
  assert.equal(state.dues.length,1);assert.equal(state.transactions.length,6);
});
test('pagamento mensal registrado em due e transaction não soma duas vezes',()=>{
  const {render}=harness(),html=render();
  const jan=html.match(/<tr><td><strong>Janeiro<\/strong>[\s\S]*?<\/tr>/);
  assert.ok(jan);
  assert.match(jan[0],/Conferido no cadastro/);
  assert.equal((jan[0].match(/R\$ 140\.00/g)||[]).length,2); // previsto e recebido, não 280
});
test('separa juros, rifas, eventos e empréstimo, sem imputar dívida a terceiro',()=>{
  const {render}=harness(),html=render();
  for(const name of ['Juros da mensalidade','Rifas','Eventos','Empréstimos','Juros do empréstimo','Devolução do empréstimo'])assert.ok(html.includes(name),name);
  assert.match(html,/Devoluções sem contrato/);
  assert.doesNotMatch(html,/R\$ 1,000\.00/);
});
test('valor sem registro não aparece como atraso confirmado e anos futuros não recebem taxa de 2026',()=>{
  const {render}=harness(),now=render(),future=render('2027');
  assert.match(now,/Sem conferência/);
  assert.match(future,/Mês futuro|Sem conferência/);
  assert.ok(!future.includes('R$ 180.00'));
});
test('informação do participante é escapada e nenhuma movimentação é feita na renderização',()=>{
  const {state,render,panel}=harness(),old=JSON.stringify(state),html=render();
  assert.match(html,/Pessoa &lt;exemplo&gt;/);
  assert.doesNotMatch(html,/Pessoa <exemplo>/);
  assert.equal(JSON.stringify(state),old);
  assert.equal(panel.section('Devolução de empréstimo'),'Pagamento de empréstimo');
});

test('10 cotas exibem R$500 de mensalidade, adicionais 200/300/400 e rifa R$100',()=>{
  const {state,participant,render}=harness();
  participant.quotas=10;
  state.transactions=[];
  state.dues=[];
  const html=render();
  const month=name=>{
    return html.match(new RegExp('<tr><td><strong>'+name+'</strong>[\\s\\S]*?</tr>'))?.[0]||'';
  };
  assert.match(month('Janeiro'),/R\$ 500\.00/);
  assert.match(month('Janeiro'),/R\$ 200\.00/);
  assert.match(month('Janeiro'),/R\$ 700\.00/);
  assert.match(month('Maio'),/R\$ 300\.00/);
  assert.match(month('Maio'),/R\$ 800\.00/);
  assert.match(month('Setembro'),/R\$ 400\.00/);
  assert.match(month('Setembro'),/R\$ 900\.00/);
  assert.match(html,/Por sorteio/);
  assert.match(html,/R\$ 100\.00/);
  assert.equal(state.transactions.length,0,'renderização não cria receitas');
  assert.equal(state.dues.length,0,'renderização não cria cobranças');
});
test('status ativo por recorrência é exibido sem marcar pagamentos como mensalidade',()=>{
  const {state,participant,render}=harness();
  participant.active=true;
  participant.activationEvidence={monthsWithPayments:8};
  const html=render();
  assert.match(html,/depósitos recorrentes/);
  assert.match(html,/8 meses/);
  assert.equal(state.dues.length,1);
  assert.equal(state.transactions.length,6);
});

test('ficha destaca sete categorias sem somar créditos do extrato ao caixa',()=>{
  const {state,participant,render}=harness();
  participant.bankEvidence2026=[{date:'2026-05-18',amount:880,memo:'ALIAS EXEMPLO',status:'pending'}];
  const before=JSON.stringify(state),html=render();
  assert.equal((html.match(/class="value-category-card"/g)||[]).length,7);
  for(const title of ['Mensalidades','Juros da mensalidade','Rifas','Eventos','Empréstimo','Devolução do empréstimo','Juros do empréstimo'])
    assert.ok(html.includes(title),title);
  assert.match(html,/Extratos bancários/);
  assert.match(html,/ALIAS EXEMPLO/);
  assert.match(html,/Valores previstos não são pagamentos/);
  assert.equal(JSON.stringify(state),before);
});

test('formato planilha organiza onze meses e seções de cada movimento',()=>{
  const {render}=harness();
  const html=render();
  assert.equal((html.match(/class="panel sheet-section"/g)||[]).length,7);
  for(const name of ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro'])assert.ok(html.includes('<strong>'+name+'</strong>'),name);
  for(const label of ['1. MENSALIDADES','2. JUROS DA MENSALIDADE','3. RIFAS','4. EVENTOS','5. EMPRÉSTIMO','6. DEVOLUÇÃO DO EMPRÉSTIMO','7. JUROS DO EMPRÉSTIMO'])assert.ok(html.includes(label),label);
  assert.ok(html.indexOf('1. MENSALIDADES')<html.indexOf('7. JUROS DO EMPRÉSTIMO'));
});
test('linha da planilha mantém evidência bancaria separada e vazio não equivale a dívida',()=>{
  const {state,participant,render}=harness();
  participant.bankEvidence2026=[{id:'bank1',date:'2026-02-19',memo:'Pix do extrato',amount:770,status:'pending'}];
  const before=JSON.stringify(state),html=render();
  assert.match(html,/Pix do extrato/);
  assert.match(html,/Sem conferência/);
  assert.match(html,/Valores de extrato ainda não conciliados/);
  assert.match(html,/não cobrança automática/);
  assert.equal(JSON.stringify(state),before);
});

test('crédito bancário que soma devolução e juros já lançados gera alerta, sem duplicar',()=>{
  const {state,participant,render}=harness();
  state.transactions=[
    {id:'p1',participantId:participant.id,date:'2026-10-02',kind:'in',category:'Pagamento de empréstimo',amount:750},
    {id:'j1',participantId:participant.id,date:'2026-10-02',kind:'in',category:'Juros de empréstimo',amount:150}
  ];
  participant.bankEvidence2026=[{id:'bank',date:'2026-10-02',amount:900,memo:'PIX MODELO',status:'pending'}];
  const before=JSON.stringify(state),html=render();
  assert.match(html,/Possível duplicidade/);
  assert.match(html,/não lançar/);
  assert.equal(JSON.stringify(state),before);
});
