'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

function harness(){
  const elements=new Map(),listeners={};
  const element=id=>{
    if(!elements.has(id))elements.set(id,{id,innerHTML:'',textContent:'',value:'',hidden:false,style:{},addEventListener(){},focus(){},setSelectionRange(){}});
    return elements.get(id);
  };
  const document={getElementById:element,addEventListener:(event,handler)=>listeners[event]=handler};
  const window={secureSync:{queueSave(){}}};
  class FakeFormData{
    constructor(form){this.form=form;}
    entries(){return Object.entries(this.form.fields||{});}
  }
  const sandbox={window,document,FormData:FakeFormData,structuredClone,
    setTimeout:()=>1,clearTimeout:()=>{}};
  for(const file of ['caixinha-rules.js','nominal-audit.js','participant-panel.js','app-ui.js'])
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),sandbox,{timeout:2000,filename:file});
  const state={participants:[{id:'p1',name:'Pessoa teste',active:true,quotas:1,
    bankEvidence2026:[{id:'credit1',date:'2026-05-18',amount:880,source:'Itaú',memo:'PIX PESSOA',status:'pending'},{id:'credit2',date:'2026-05-18',amount:70,source:'Itaú',memo:'PIX TESTE',status:'pending'}]}],
    transactions:[],dues:[],loans:[],review2026:[],
    config:{fees:[70,70,70,70,80,80,80,80,90,90,90],monthlyBasePerQuota:50,monthlyAdditionalPerQuota2026:[20,20,20,20,30,30,30,30,40,40,40],rafflePricePerQuota:10}};
  window.gestaoBridge.load(state);
  const action=(type,evidenceId='credit1')=>listeners.click({target:{closest:s=>s==='[data-action]'?{dataset:{action:type,id:'p1',evidenceId}}:null}});
  const submit=fields=>{const form=element('editForm');form.fields=fields;form.onsubmit({preventDefault(){},target:form});};
  const fields=(rest={})=>({decision:'caixinha',monthly:800,monthlyInterest:80,raffle:0,event:0,loanReturn:0,loanInterest:0,competence:'2026-05',eventName:'',notes:'Comprovante conferido',payerFullName:'Pessoa Teste',payerRelation:'associado',confirm:'yes',...rest});
  return {window,element,action,submit,fields,state};
}

test('a ficha exibe ação de classificar apenas crédito pendente',()=>{
  const h=harness();
  h.action('open-person');
  const html=h.element('view').innerHTML;
  assert.ok(html.includes('Extratos bancários'));
  assert.ok(html.includes('data-action="classify-bank-evidence"'));
  assert.equal((html.match(/data-action="classify-bank-evidence"/g)||[]).length,2);
});
test('um PIX pode ser dividido entre mensalidade e juros sem duplicidade no caixa',()=>{
  const h=harness();
  h.action('open-person');h.action('classify-bank-evidence','credit1');
  h.submit(h.fields());
  const current=h.window.gestaoBridge.snapshot();
  assert.equal(current.transactions.length,2);
  assert.deepEqual(current.transactions.map(x=>x.amount),[800,80]);
  assert.deepEqual(current.transactions.map(x=>x.category),['Mensalidade','Juros de mensalidade']);
  assert.equal(current.transactions[0].competence,'2026-05');
  assert.equal(current.participants[0].bankEvidence2026[0].status,'classified');
  assert.equal(current.transactions.reduce((n,x)=>n+x.amount,0),880);
  h.action('classify-bank-evidence','credit1');
  assert.equal(h.window.gestaoBridge.snapshot().transactions.length,2);
});
test('não contabilizar PIX alheio à caixinha',()=>{
  const h=harness();h.action('open-person');h.action('classify-bank-evidence','credit2');
  h.submit(h.fields({decision:'excluded',monthly:0,monthlyInterest:0}));
  const current=h.window.gestaoBridge.snapshot();
  assert.equal(current.transactions.length,0);
  assert.equal(current.participants[0].bankEvidence2026[1].status,'excluded');
});
test('não aceitar valor diferente do crédito bancário',()=>{
  const h=harness();h.action('open-person');h.action('classify-bank-evidence','credit1');
  h.submit(h.fields({monthly:800,monthlyInterest:0}));
  const current=h.window.gestaoBridge.snapshot();
  assert.equal(current.transactions.length,0);
  assert.equal(current.participants[0].bankEvidence2026[0].status,'pending');
});
