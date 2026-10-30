'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const rules=require('../caixinha-rules.js');

test('tabela mensal 2026 preserva R$50 e adicionais 20/30/40 por cota',()=>{
  for(let m=1;m<=11;m++){
    const key='2026-'+String(m).padStart(2,'0'),d=rules.dueAmount(key,1);
    assert.equal(d.base,50);
    assert.equal(d.additional,m<=4?20:m<=8?30:40);
    assert.equal(d.total,m<=4?70:m<=8?80:90);
    assert.equal(d.dueDate,key+'-15');
  }
  assert.equal(rules.dueAmount('2026-12',1),null);
});
test('máximo 10 cotas e rifas por cota',()=>{
  assert.equal(rules.loanLimit(1),550);
  assert.equal(rules.loanLimit(10),5500);
  assert.equal(rules.loanLimit(11),null);
  assert.equal(rules.raffleAmount(10),100);
  assert.equal(rules.raffleAmount(0),null);
});
test('juros mensais 10% apenas depois do dia 15, sem duplicar pagamento',()=>{
  assert.equal(rules.lateFee({dueAmount:80,month:'2026-05',paymentDate:'2026-05-15'}),0);
  assert.equal(rules.lateFee({dueAmount:80,month:'2026-05',paymentDate:'2026-05-16'}),8);
  assert.equal(rules.lateFee({dueAmount:80,month:'2026-05',paymentDate:'2026-05-16',alreadyPaidOnTime:true}),0);
});
test('empréstimo começa fevereiro e termina outubro, juros 20% e limite respeitado',()=>{
  const member={id:'p',active:true,quotas:2};
  const check=(date,amount,loans=[])=>rules.loanCheck({participant:member,date,principal:amount,loans});
  assert.equal(check('2026-01-31',100).ok,false);
  assert.equal(check('2026-02-01',1000).ok,true);
  assert.equal(check('2026-10-31',1100).ok,true);
  assert.equal(check('2026-11-01',100).ok,false);
  assert.equal(check('2026-09-01',1101).ok,false);
  assert.equal(check('2026-09-01',200,[{participantId:'p',status:'open',principal:1000}]).ok,false);
  assert.equal(rules.loanCheck({participant:{...member,active:false},date:'2026-03-01',principal:20}).ok,false);
  assert.equal(rules.info.loanInterestPercent,20);
});
test('três meses de dívida registrada pedem conferência mas não exclusão automática',()=>{
  const dues=['2026-02','2026-03','2026-04'].map(month=>({participantId:'p',month,amount:70,paidAmount:0,status:'pending'}));
  assert.equal(rules.lateMonths({dues,participantId:'p',asOf:'2026-10-29'}).reviewRequired,true);
  assert.equal(rules.lateMonths({dues:[],participantId:'p',asOf:'2026-10-29'}).reviewRequired,false);
  assert.equal(rules.info.doNotAutoForfeit,true);
});
test('encerramento exige rateio confirmado; taxa de 4% e saldo de empréstimo são simulação',()=>{
  assert.equal(rules.settlement({quotas:2}).status,'review_required');
  const x=rules.settlement({quotas:1,assignedSurplus:320,outstandingLoan:100});
  assert.equal(x.gross,870);
  assert.equal(x.adminFee,34.8);
  assert.equal(x.estimatedNet,735.2);
  assert.equal(x.status,'simulation_requires_approval');
  assert.equal(x.expectedDistributionBy,'2026-12-10');
});
