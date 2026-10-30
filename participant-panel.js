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
    const quotas=Number(participant.quotas)||0;
    const now=new Date().toISOString().slice(0,7);
    const months=MONTHS.map((name,i)=>{
      const m=year+'-'+String(i+1).padStart(2,'0');
      const records=dues.filter(d=>d.month===m);
      const assigned=tx.filter(t=>t.category==='Mensalidade'&&t.kind==='in'&&competence(t,dues)===m);
      const byTx=sum(assigned), byDue=records.reduce((a,d)=>a+Number(d.paidAmount||0),0);
      // Mensalidade registrada tanto no contrato quanto no livro-caixa não entra duas vezes.
      const paid=Math.max(byTx,byDue);
      const reference=Number(fees[i]);
      const forecast=fees[i]!==null&&fees[i]!==undefined&&Number.isFinite(reference)&&quotas>0?reference*quotas:null;
      const expected=records.length?records.reduce((a,d)=>a+Number(d.amount||0),0):forecast;
      const hasDue=records.length>0;
      const direct=assigned.filter(t=>!t.competence&&!t.dueId).length;
      const flags=assigned.length?direct?'Pelo mês da entrada • conferir competência':'Competência atribuída':'Sem pagamento localizado';
      let status=paid>0?'Valor registrado':m>now?'Futuro • sem registro':'Sem conferência';
      if(hasDue&&records.every(d=>d.status==='paid')&&paid>0)status='Pago no cadastro';
      else if(paid>0&&expected!==null&&paid+0.005<expected)status='Parcial / conferir';
      return '<article class="month-card"><div class="month-head"><strong>'+name+'</strong><span>'+esc(status)+'</span></div>'+
       '<div class="month-fig"><small>Previsto'+(hasDue?' cadastrado':' de referência')+'</small><strong>'+(expected===null?'Não definido':brl(expected))+'</strong></div>'+
       '<div class="month-fig"><small>Recebido / registrado</small><strong>'+brl(paid)+'</strong></div>'+
       '<div class="month-foot">'+esc(flags)+'</div></article>';
    }).join('');
    const sectionPanels=SECTIONS.slice(1).map(([key,label])=>{
      const rows=yearTx.filter(t=>section(t.category)===key);
      const incoming=sum(rows.filter(t=>t.kind==='in')),outgoing=sum(rows.filter(t=>t.kind==='out'));
      const lines=rows.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(t=>{
        const aux=key==='Evento'&&t.eventName?' · '+t.eventName:'';
        return '<li><span>'+day(t.date)+' · '+esc(t.description||label+aux)+'</span><strong>'+esc(t.kind==='out'?'− ':'+ ')+brl(t.amount)+'</strong></li>';
      }).join('');
      return '<section class="person-section"><div class="person-section-head"><div><h3>'+esc(label)+'</h3><small>'+rows.length+' lançamento(s)</small></div><div><strong>'+brl(incoming)+'</strong><small>Entradas'+(outgoing?' · Saídas '+brl(outgoing):'')+'</small></div></div>'+
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
      '</p></div><div class="person-actions"><button type="button" class="secondary" data-action="back-participants">← Voltar</button>'+
      '<button type="button" class="primary" data-action="new-person-tx" data-id="'+esc(id)+'">+ Registrar valor</button></div></div>';
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
    return header+kpis+
     '<div class="panel"><h3>Mensalidades — janeiro a novembro de '+esc(year)+'</h3>'+
     '<p class="note">Previsão por cotas usa a tabela do sistema e não cria cobranças. Sem comprovante significa <b>sem conferência</b>, não necessariamente atraso. Quando a competência não está indicada, o mês da entrada é apenas provisório.</p>'+
     '<div class="months-grid">'+months+'</div></div>'+
     '<div class="person-categories">'+sectionPanels+'</div>'+loanTable+ledger;
  }
  window.GestaoPersonPanel={render,section,competence,sections:SECTIONS.map(x=>x[0])};
})();