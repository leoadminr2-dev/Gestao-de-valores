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
  assert.equal((html.match(/class="month-card"/g)||[]).length,11);
  assert.match(html,/Janeiro/);assert.match(html,/Novembro/);
  assert.match(html,/R\$ 140\.00/);assert.match(html,/R\$ 180\.00/);
  assert.equal(state.dues.length,1);assert.equal(state.transactions.length,6);
});
test('pagamento mensal registrado em due e transaction não soma duas vezes',()=>{
  const {render}=harness(),html=render();
  const jan=html.match(/class="month-card"[\s\S]*?class="month-foot"/);
  assert.ok(jan);
  assert.match(jan[0],/Pago no cadastro/);
  assert.equal((jan[0].match(/R\$ 140\.00/g)||[]).length,2); // previsto e recebido, não 280
});
test('separa juros, rifas, eventos e empréstimo, sem imputar dívida a terceiro',()=>{
  const {render}=harness(),html=render();
  for(const name of ['Juros da mensalidade','Rifas','Eventos','Empréstimos','Juros dos empréstimos','Devoluções dos empréstimos'])assert.ok(html.includes(name),name);
  assert.match(html,/Devoluções sem contrato/);
  assert.doesNotMatch(html,/R\$ 1,000\.00/);
});
test('valor sem registro não aparece como atraso confirmado e anos futuros não recebem taxa de 2026',()=>{
  const {render}=harness(),now=render(),future=render('2027');
  assert.match(now,/Sem conferência/);
  assert.match(future,/Não definido/);
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
    const begin=html.indexOf('>'+name+'</strong>');
    const end=html.indexOf('class="month-card"',begin+2);
    return html.slice(begin,end<0?html.length:end);
  };
  assert.match(month('Janeiro'),/R\$ 500\.00/);
  assert.match(month('Janeiro'),/R\$ 200\.00/);
  assert.match(month('Janeiro'),/R\$ 700\.00/);
  assert.match(month('Maio'),/R\$ 300\.00/);
  assert.match(month('Maio'),/R\$ 800\.00/);
  assert.match(month('Setembro'),/R\$ 400\.00/);
  assert.match(month('Setembro'),/R\$ 900\.00/);
  assert.match(html,/Referência por rifa/);
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
  participant.bankEvidence2026=[{date:'2026-05-18',amount:880,memo:'ALESSAN',status:'pending'}];
  const before=JSON.stringify(state),html=render();
  assert.equal((html.match(/class="value-category-card"/g)||[]).length,7);
  for(const title of ['Mensalidades','Juros da mensalidade','Rifas','Eventos','Empréstimo','Devolução do empréstimo','Juros do empréstimo'])
    assert.ok(html.includes(title),title);
  assert.match(html,/Extratos bancários/);
  assert.match(html,/ALESSAN/);
  assert.match(html,/Valores previstos não são pagamentos/);
  assert.equal(JSON.stringify(state),before);
});
