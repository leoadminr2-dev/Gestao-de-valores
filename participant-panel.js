'use strict';
// Painel por participante. Somente renderiza o estado privado recebido após autenticação.
// Não grava nem pressupõe dívidas: meses sem comprovantes ficam "Sem conferência".
(function(){
  const MONTHS=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro'];
  const SECTIONS=[
    ['Mensalidade','Mensalidades'],
    ['Juros de mensalidade','Juros da mensalidade'],
    ['Rifa','Rifas'],
    ['Evento','Eventos'],
    ['Empréstimo concedido','Empréstimos'],
    ['Pagamento de empréstimo','Devoluções dos empréstimos'],
    ['Juros de empréstimo','Juros dos empréstimos'],
    ['Outros','Outros / a conferir']
  ];
  function section(category){
    if(category==='Devolução de empréstimo')return 'Pagamento de empréstimo';
    if(SECTIONS.some(([value])=>value===category))return category;
    return 'Outros';
  }
  const isYear=(date,year)=>String(date||'').startsWith(String(year)+'-');
  function competence(tx,dues){
    if(/^\d{4}-(0[1-9]|1[0-2])$/.test(String(tx.competence||'')))return tx.competence;
    if(tx.dueId){const due=dues.find(d=>d.id===tx.dueId);if(due)return due.month;}
    return String(tx.date||'').slice(0,7);
  }
  const sum=a=>a.reduce((total,x)=>total+(Number(x.amount)||0),0);
  function report({state,participant,year,esc,brl,day,loanTotal}){
    if(!participant)return '<div class="empty">Selecione um participante válido.</div>';
    const id=participant.id, tx=state.transactions.filter(t=>t.participantId===id),
      personLoans=state.loans.filter(l=>l.participantId===id && isYear(l.date,year)),
      dues=state.dues.filter(d=>d.participantId===id), yearTx=tx.filter(t=>isYear(t.date,year)||isYear(t.competence,year));
    const confirmedIn=sum(yearTx.filter(t=>t.kind==='in')), confirmedOut=sum(yearTx.filter(t=>t.kind==='out'));
    const loanUnlinked=yearTx.filter(t=>section(t.category)==='Pagamento de empréstimo'&&!t.loanId);
    const uncertain=sum(loanUnlinked);
    const fees=year==='2026'&&Array.isArray(state.config?.fees)?state.config.fees:[];
    const basePerQuota=year==='2026'?Number(state.config?.monthlyBasePerQuota??50):null;
    const additionPerQuota=year==='2026'&&Array.isArray(state.config?.monthlyAdditionalPerQuota2026)?state.config.monthlyAdditionalPerQuota2026:[];
    const rafflePerQuota=Number(state.config?.rafflePricePerQuota??10);
    const quotas=Number(participant.quotas)||0;
    const now=new Date().toISOString().slice(0,7);
    const today=new Date().toISOString().slice(0,10);
    const official=typeof window!=='undefined'?window.CaixinhaRules:null;
    const stale=official?.lateMonths({dues,participantId:id,asOf:today});
    const months=MONTHS.map((name,i)=>{
      const m=year+'-'+String(i+1).padStart(2,'0');
      const records=dues.filter(d=>d.month===m);
      const assigned=tx.filter(t=>t.category==='Mensalidade'&&t.kind==='in'&&competence(t,dues)===m);
      const byTx=sum(assigned), byDue=records.reduce((a,d)=>a+Number(d.paidAmount||0),0);
      // Mensalidade registrada tanto no contrato quanto no livro-caixa não entra duas vezes.
      const paid=Math.max(byTx,byDue);
      const additional=additionPerQuota[i]===undefined||additionPerQuota[i]===null?null:Number(additionPerQuota[i]);
      const baseReference=basePerQuota!==null&&quotas>0?basePerQuota*quotas:null;
      const extraReference=additional!==null&&Number.isFinite(additional)&&quotas>0?additional*quotas:null;
      const reference=Number(fees[i]);
      const forecast=fees[i]!==null&&fees[i]!==undefined&&Number.isFinite(reference)&&quotas>0?reference*quotas:null;
      const expected=records.length?records.reduce((a,d)=>a+Number(d.amount||0),0):forecast;
      const hasDue=records.length>0;
      const direct=assigned.filter(t=>!t.competence&&!t.dueId).length;
      const flags=assigned.length?direct?'Pelo mês da entrada • conferir competência':'Competência atribuída':'Sem pagamento localizado';
      let status=paid>0?'Valor registrado':m>now?'Futuro • sem registro':'Sem conferência';
      if(hasDue&&records.every(d=>d.status==='paid')&&paid>0)status='Pago no cadastro';
      else if(paid>0&&expected!==null&&paid+0.005<expected)status='Parcial / conferir';
      const assessed=records.reduce((total,d)=>{
        const paidDate=d.paidDate||(Number(d.paidAmount||0)>=Number(d.amount||0)?'':today);
        const needReview=paidDate>m+'-15'&&Number(d.amount||0)>0;
        return total+Math.max(Number(d.lateInterestAssessed||0),needReview&&official?official.lateFee({month:m,dueAmount:d.amount,paymentDate:paidDate}):0);
      },0);
      const interestPaid=records.reduce((total,d)=>total+Number(d.lateInterestPaid||0),0);
      const interestOpen=Math.max(0,assessed-interestPaid);
      return '<article class="month-card"><div class="month-head"><strong>'+name+'</strong><span>'+esc(status)+'</span></div>'+
       (baseReference===null?'':'<div class="month-breakdown"><span>Mensalidade-base</span><strong>'+brl(baseReference)+'</strong></div>')+
       (extraReference===null?'':'<div class="month-breakdown"><span>Adicional mensal</span><strong>'+brl(extraReference)+'</strong></div>')+
       '<div class="month-fig"><small>Total previsto'+(hasDue?' cadastrado':' de referência')+'</small><strong>'+(expected===null?'Não definido':brl(expected))+'</strong></div>'+
       '<div class="month-fig"><small>Recebido / registrado</small><strong>'+brl(paid)+'</strong></div>'+
       (interestOpen>0?'<div class="month-fig"><small>Juros de atraso 10% — conferir cobrança</small><strong>'+brl(interestOpen)+'</strong></div>':'')+
       '<div class="month-foot">'+esc(flags)+'</div></article>';
    }).join('');

    // Cada categoria tem saldo próprio. Previsões e registros bancários não classificados nunca viram receita.
    const groupAmount=(category,kind)=>sum(yearTx.filter(t=>section(t.category)===category&&t.kind===kind));
    const monthlyPaid=MONTHS.reduce((n,_,i)=>{
      const m=year+'-'+String(i+1).padStart(2,'0');
      const confirmed=tx.filter(t=>t.kind==='in'&&t.category==='Mensalidade'&&competence(t,dues)===m);
      const declared=dues.filter(d=>d.month===m);
      return n+Math.max(sum(confirmed),declared.reduce((a,d)=>a+Number(d.paidAmount||0),0));
    },0);
    const monthlyExpected=MONTHS.reduce((n,_,i)=>{
      const m=year+'-'+String(i+1).padStart(2,'0');
      const recorded=dues.filter(d=>d.month===m);
      return n+(recorded.length?recorded.reduce((a,d)=>a+Number(d.amount||0),0):fees[i]?Number(fees[i])*quotas:0);
    },0);
    const categories=[
      ['Mensalidades',monthlyPaid,'Previsto: '+brl(monthlyExpected),'Mensalidade','new-person-month'],
      ['Juros da mensalidade',groupAmount('Juros de mensalidade','in'),'Juros efetivamente recebidos','Juros de mensalidade','person-category'],
      ['Rifas',groupAmount('Rifa','in'),'Por sorteio: '+brl(rafflePerQuota*quotas),'Rifa','person-category'],
      ['Eventos',groupAmount('Evento','in'),'Somente valores de eventos lançados','Evento','person-category'],
      ['Empréstimo',personLoans.reduce((a,l)=>a+Number(l.principal||0),0),'Principal concedido','Empréstimo concedido','person-new-loan'],
      ['Devolução do empréstimo',groupAmount('Pagamento de empréstimo','in'),'Principal recebido e classificado','Pagamento de empréstimo','person-loan-payment'],
      ['Juros do empréstimo',groupAmount('Juros de empréstimo','in'),'Juros recebidos separadamente','Juros de empréstimo','person-loan-payment']
    ];
    const categoryCards='<section class="panel"><h3>Valores por categoria</h3>'+
      '<p class="note">Valores previstos não são pagamentos. Zero significa ausência de lançamento classificado, não prova de inadimplência.</p>'+
      '<div class="value-category-grid">'+categories.map(c=>
        '<article class="value-category-card"><div class="value-category-name">'+esc(c[0])+'</div>'+
        '<div class="value-category-amount">'+brl(c[1])+'</div><p>'+esc(c[2])+'</p>'+
        '<small>'+(c[1]?'Valor registrado':'Sem valor classificado')+'</small>'+
        '<button class="action-btn" data-action="'+esc(c[4])+'" data-id="'+esc(id)+'" data-category="'+esc(c[3])+'">Registrar / conferir</button></article>').join('')+
      '</div></section>';

    // Apresentação estilo planilha: uma linha por competência, sem criar débitos ou receitas.
    const worksheetRows=MONTHS.map((month,i)=>{
      const m=year+'-'+String(i+1).padStart(2,'0');
      const registered=dues.filter(d=>d.month===m);
      const posted=tx.filter(t=>t.kind==='in'&&t.category==='Mensalidade'&&competence(t,dues)===m);
      const bank=sum(posted),imported=registered.reduce((n,d)=>n+Number(d.paidAmount||0),0);
      const paid=Math.max(bank,imported);
      const forecast=fees[i]!==null&&fees[i]!==undefined&&quotas>0?Number(fees[i])*quotas:null;
      const expected=registered.length?registered.reduce((n,d)=>n+Number(d.amount||0),0):forecast;
      const base=basePerQuota!==null&&quotas>0?basePerQuota*quotas:null;
      const extra=additionPerQuota[i]!==undefined&&additionPerQuota[i]!==null&&quotas>0?Number(additionPerQuota[i])*quotas:null;
      const possibleBalance=expected===null?null:Math.max(0,expected-paid);
      const verified=registered.length&&registered.every(d=>d.status==='paid')&&paid>0;
      const inferred=posted.length&&posted.some(t=>!t.competence&&!t.dueId);
      let status=verified?'Conferido no cadastro':paid>0?(expected!==null&&paid<expected-.005?'Parcial / conferir':'Registrado / conferir'):'Sem conferência';
      if(m>now&&!paid)status='Mês futuro';
      const cell=n=>n===null?'—':brl(n);
      const mark=paid>0?brl(paid):'—';
      return '<tr><td><strong>'+esc(month)+'</strong></td><td>'+esc(quotas||'—')+'</td><td>'+cell(base)+'</td>'+
        '<td>'+cell(extra)+'</td><td><strong>'+cell(expected)+'</strong></td>'+
        '<td><strong>'+mark+'</strong></td><td>'+(paid?cell(possibleBalance):'A conferir')+'</td>'+
        '<td>'+esc(status)+(inferred?'<small class="person-row-sub">Competência pelo mês do depósito</small>':'')+'</td></tr>';
    }).join('');
    const worksheetMonths='<section class="panel sheet-section" id="sheet-months">'+
      '<div class="sheet-header"><h3>1. MENSALIDADES — JANEIRO A NOVEMBRO</h3>'+
      '<button class="action-btn" data-action="new-person-month" data-id="'+esc(id)+'">Lançar mensalidade</button></div>'+
      '<p class="note">Uma linha por mês, como na planilha. R$ 50 por cota + adicional de R$ 20, R$ 30 ou R$ 40 conforme o período. Diferença é apenas referência para conferência, não cobrança automática.</p>'+
      '<div class="table-wrap"><table class="sheet-table"><thead><tr><th>Mês</th><th>Cotas</th><th>Base</th><th>Adicional</th><th>Previsto</th><th>Registrado</th><th>Diferença*</th><th>Situação</th></tr></thead><tbody>'+worksheetRows+'</tbody></table></div></section>';
    const sheetCategories=[
      {title:'2. JUROS DA MENSALIDADE',category:'Juros de mensalidade',description:'10% por atraso, quando efetivamente identificado'},
      {title:'3. RIFAS',category:'Rifa',description:'R$ '+rafflePerQuota.toFixed(2).replace('.',',')+' por bilhete; '+quotas+' cota(s) exigem '+quotas+' bilhete(s) por rifa'},
      {title:'4. EVENTOS',category:'Evento',description:'Somente contribuições de eventos identificados'},
      {title:'5. EMPRÉSTIMO',category:'Empréstimo concedido',description:'Concessões realizadas e juros contratuais'},
      {title:'6. DEVOLUÇÃO DO EMPRÉSTIMO',category:'Pagamento de empréstimo',description:'Devolução do principal recebida, separada dos juros'},
      {title:'7. JUROS DO EMPRÉSTIMO',category:'Juros de empréstimo',description:'Juros efetivamente recebidos, não apenas previstos'}
    ];
    const sheetTables=sheetCategories.map(c=>{
      const entries=yearTx.filter(t=>section(t.category)===c.category).slice().sort((a,b)=>String(a.date).localeCompare(String(b.date)));
      const total=sum(entries.filter(t=>t.kind==='in'));
      const isLoan=c.category==='Empréstimo concedido';
      const loanOptions=isLoan?personLoans.slice().sort((a,b)=>String(a.date).localeCompare(String(b.date))):[];
      const action=isLoan?'person-new-loan':['Pagamento de empréstimo','Juros de empréstimo'].includes(c.category)?'person-loan-payment':'person-category';
      const label=isLoan?'Novo empréstimo':action==='person-loan-payment'?'Conferir contratos':'Registrar / conferir';
      const loanRows=loanOptions.map(l=>'<tr><td>'+day(l.date)+'</td><td>'+brl(l.principal)+'</td><td>'+esc(l.rate||0)+'%</td>'+
         '<td>'+brl(l.paidTotal||0)+'</td><td>'+brl(Math.max(0,loanTotal(l)-Number(l.paidTotal||0)))+'</td>'+
         '<td>'+esc(l.status||'A revisar')+'</td></tr>').join('');
      const standardRows=entries.map(t=>{
        const comp=t.competence?'Competência '+t.competence:'';
        const ref=[comp,t.description||'',t.notes||''].filter(Boolean).join(' · ');
        return '<tr><td>'+day(t.date)+'</td><td>'+brl(t.amount)+'</td>'+
         '<td>'+esc(t.kind==='out'?'Saída':'Entrada')+'</td><td>'+esc(ref||'Registro sem observação')+'</td></tr>';
      }).join('');
      const content=isLoan?'<div class="table-wrap"><table class="sheet-table"><thead><tr><th>Data</th><th>Principal</th><th>Juros</th><th>Recebido</th><th>Saldo estimado</th><th>Situação</th></tr></thead><tbody>'+loanRows+'</tbody></table></div>':
       '<div class="table-wrap"><table class="sheet-table"><thead><tr><th>Data</th><th>Valor</th><th>Tipo</th><th>Observação</th></tr></thead><tbody>'+standardRows+'</tbody></table></div>';
      return '<section class="panel sheet-section"><div class="sheet-header"><h3>'+esc(c.title)+'</h3>'+
        '<button class="action-btn" data-action="'+esc(action)+'" data-id="'+esc(id)+'" data-category="'+esc(c.category)+'">'+esc(label)+'</button></div>'+
        '<p class="sheet-subtitle">'+esc(c.description)+'</p>'+
        (isLoan?'<p class="sheet-subtitle">Total concedido: '+brl(personLoans.reduce((n,l)=>n+Number(l.principal||0),0))+'</p>':'<p class="sheet-subtitle">Total recebido nesta categoria: <strong>'+brl(total)+'</strong></p>')+
        ((isLoan?loanOptions.length:entries.length)?content:'<p class="person-empty">Nenhum lançamento classificado. Isso não significa que o associado não pagou.</p>')+'</section>';
    }).join('');
    const sheetIntro='<div class="panel"><h3>Ficha organizada como planilha</h3><p class="note">As seções ficam sempre na mesma ordem. Valores de extrato ainda não conciliados aparecem mais abaixo, sem aumentar os recebimentos registrados.</p></div>';
    const evidence=Array.isArray(participant.bankEvidence2026)?participant.bankEvidence2026.filter(x=>isYear(x.date,year)):[];
    const pending=evidence.filter(x=>x.status==='pending');
    const pendingAmount=pending.reduce((n,x)=>n+Number(x.amount||0),0);
    const proof='<section class="panel"><h3>Extratos bancários — a classificar</h3>'+
      '<p class="note">Os comprovantes devem ser conferidos antes de separar mensalidade, juros, rifa, evento ou empréstimo. Valores pendentes não são somados ao livro-caixa.</p>'+
      (evidence.length?'<p><strong>'+brl(pendingAmount)+'</strong> · '+pending.length+' depósito(s) pendentes de classificação</p>'+
        '<div class="table-wrap"><table><thead><tr><th>Data</th><th>Referência</th><th>Valor</th><th>Situação</th><th>Conferência</th></tr></thead><tbody>'+
        evidence.map(x=>'<tr><td>'+day(x.date)+'</td><td>'+esc(x.memo||'Extrato')+'</td><td>'+brl(x.amount)+'</td><td>'+esc(x.status==='pending'?'A conferir':x.status==='excluded'?'Fora da caixinha':'Classificado')+'</td><td>'+(x.status==='pending'?'<button type="button" class="action-btn" data-action="classify-bank-evidence" data-id="'+esc(id)+'" data-evidence-id="'+esc(x.id)+'">Classificar</button>':'<small>Conferido</small>')+'</td></tr>').join('')+
        '</tbody></table></div>':
        '<p class="person-empty">Ainda não foram vinculados extratos bancários a esta ficha. Os valores classificados aparecem nos sete quadros acima.</p>')+
      '</section>';
    const sectionPanels=SECTIONS.slice(1).map(([key,label])=>{
      const rows=yearTx.filter(t=>section(t.category)===key);
      const incoming=sum(rows.filter(t=>t.kind==='in')),outgoing=sum(rows.filter(t=>t.kind==='out'));
      const lines=rows.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(t=>{
        const aux=key==='Evento'&&t.eventName?' · '+t.eventName:'';
        return '<li><span>'+day(t.date)+' · '+esc(t.description||label+aux)+'</span><strong>'+esc(t.kind==='out'?'− ':'+ ')+brl(t.amount)+'</strong></li>';
      }).join('');
      const raffleNote=key==='Rifa'&&quotas>0?'<p class="person-raffle-reference">Referência por rifa: '+brl(rafflePerQuota)+' × '+quotas+' cota(s) = <strong>'+brl(rafflePerQuota*quotas)+'</strong> (somente quando houver cobrança, não gera dívida).</p>':'';
      return '<section class="person-section"><div class="person-section-head"><div><h3>'+esc(label)+'</h3><small>'+rows.length+' lançamento(s)</small></div><div><strong>'+brl(incoming)+'</strong><small>Entradas'+(outgoing?' · Saídas '+brl(outgoing):'')+'</small></div></div>'+raffleNote+
      (rows.length?'<ul class="person-entries">'+lines+'</ul>':'<p class="person-empty">Nenhum valor comprovado nesta categoria.</p>')+'</section>';
    }).join('');
    const loanRows=personLoans.map(l=>{
      const total=loanTotal(l),paid=Number(l.paidTotal||0),remaining=Math.max(0,total-paid);
      return '<tr><td>'+day(l.date)+'</td><td>'+brl(l.principal)+'</td><td>'+esc(l.rate||0)+'%</td><td>'+brl(paid)+'</td><td>'+brl(remaining)+'</td><td>'+esc(l.status||'A revisar')+'</td></tr>';
    }).join('');
    const transactionRows=yearTx.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(t=>{
      const cat=section(t.category);
      const canMove=!t.loanId&&!t.dueId&&cat!=='Empréstimo concedido';
      let extra=t.competence?' · competência '+t.competence:(cat==='Mensalidade'?' · mês pela data (provisório)':'');
      if(t.eventName)extra+=' · '+t.eventName;
      return '<tr><td>'+day(t.date)+'</td><td>'+esc(t.description||'Sem descrição')+'<small class="person-row-sub">'+esc(extra)+'</small></td><td>'+esc(t.category||'Sem categoria')+'</td>'+
       '<td>'+esc(t.kind==='out'?'Saída':'Entrada')+'</td><td><strong>'+brl(t.amount)+'</strong></td><td>'+
       (canMove?'<button type="button" class="action-btn" data-action="classify-person-tx" data-id="'+esc(t.id)+'">Classificar</button>':'<small>Vinculado</small>')+'</td></tr>';
    }).join('');
    const linkedPaymentCount=yearTx.filter(t=>section(t.category)==='Pagamento de empréstimo'&&t.loanId).length;
    const header='<div class="person-hero"><div><span class="person-eyebrow">FICHA FINANCEIRA INDIVIDUAL</span><h2>'+esc(participant.name)+'</h2><p>'+
      esc(quotas?quotas+' cota(s)':'Cotas ainda não identificadas')+' · '+esc(participant.active===false?'Inativo':'Ativo')+
      (participant.activationEvidence?'<span class="bank-evidence-badge"> • Atividade confirmada por depósitos recorrentes ('+esc(participant.activationEvidence.monthsWithPayments)+' meses)</span>':'')+
      '</p></div><div class="person-actions"><button type="button" class="secondary" data-action="back-participants">← Voltar</button>'+
      '<button type="button" class="primary" data-action="new-person-tx" data-id="'+esc(id)+'">+ Registrar valor</button>'+
      '<button type="button" class="secondary" data-action="new-person-raffle" data-id="'+esc(id)+'">+ Registrar rifa</button></div></div>';
    const kpis='<div class="kpis">'+[
      ['Recebimentos registrados',brl(confirmedIn),'Soma de entradas existentes, sem duplicar repasses'],
      ['Saídas registradas',brl(confirmedOut),'Empréstimos e outras saídas já lançadas'],
      ['Devoluções sem contrato',brl(uncertain),loanUnlinked.length+' pagamento(s) pendente(s) de vínculo'],
      ['Empréstimos no período',String(personLoans.length),linkedPaymentCount+' parcela(s) com vínculo']
    ].map(c=>'<div class="kpi"><div class="key">'+esc(c[0])+'</div><div class="value">'+esc(c[1])+'</div><div class="note">'+esc(c[2])+'</div></div>').join('')+'</div>';
    const loanTable='<section class="panel"><h3>Contratos de empréstimo</h3>'+
    (personLoans.length?'<div class="table-wrap"><table><thead><tr><th>Data</th><th>Principal</th><th>Juros</th><th>Recebido</th><th>Saldo estimado</th><th>Situação</th></tr></thead><tbody>'+loanRows+'</tbody></table></div>':'<p class="note">Nenhum contrato lançado neste período.</p>')+
    '<p class="note">Contratos históricos podem ter pagamentos não vinculados. O saldo não é cobrança definitiva.</p></section>';
    const ledger='<section class="panel"><h3>Movimentações da pessoa</h3>'+
    '<p class="note">Reclassificar altera somente a classificação do lançamento, nunca cria outra entrada ou altera seu valor. Contratos vinculados são protegidos.</p>'+
    (transactionRows?'<div class="table-wrap"><table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Tipo</th><th>Valor</th><th>Ação</th></tr></thead><tbody>'+transactionRows+'</tbody></table></div>':'<p class="person-empty">Sem lançamentos individuais neste período.</p>')+'</section>';
    const threeMonthAlert=stale?.reviewRequired?
      '<div class="warning">Há 3 ou mais competências seguidas com cobrança cadastrada sem quitação confirmada. Verificar extratos e pagamentos antes de qualquer exclusão ou perda de cotas. Nenhum bloqueio automático foi feito.</div>':'';
    const payout=official?.settlement({quotas});
    const settlementProjection=payout&&year==='2026'?'<div class="panel"><h3>Encerramento da caixinha — até 10 de dezembro</h3><p class="note">Valor-base teórico das cotas (R$ 50 × 11 meses): <strong>'+brl(payout.baseAccumulated)+'</strong>. Taxa administrativa de 4% sobre o valor bruto apurado; saldos de empréstimos até 30/11 poderão ser compensados. Distribuição final depende de conferir todas as entradas, eventos, juros e parcela apurada. Nenhuma quantia líquida definida e nenhum desconto executado.</p></div>':'';
    return header+sheetIntro+worksheetMonths+sheetTables+proof+threeMonthAlert+
      '<details class="sheet-more"><summary>Ver informações adicionais e histórico completo</summary>'+
      kpis+categoryCards+settlementProjection+ledger+'</details>';
  }
  window.GestaoPersonPanel={render:report,section,competence,sections:SECTIONS.map(x=>x[0])};
})();