'use strict';
(function(){
  let state={participants:[],transactions:[],loans:[],dues:[],activities:[],imports:[],review2026:[],config:{}};
  let page='dashboard',filter='',period='2026',modalSave=null,selectedPersonId=null;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const brl=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);
  const day=v=>v?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'—';
  const today=()=>new Date().toISOString().slice(0,10);
  const money=key=>Number(key)||0;
  const person=id=>state.participants.find(p=>p.id===id)?.name||'Não identificado';
  const byYear=x=>period==='todos'||String(x.date||x.month||x.paidDate||'').startsWith(period);
  const newID=prefix=>`${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,9)}`;
  function normal(d){const s=d&&typeof d==='object'?d:{};return {...s,participants:Array.isArray(s.participants)?s.participants:[],transactions:Array.isArray(s.transactions)?s.transactions:[],loans:Array.isArray(s.loans)?s.loans:[],dues:Array.isArray(s.dues)?s.dues:[],activities:Array.isArray(s.activities)?s.activities:[],imports:Array.isArray(s.imports)?s.imports:[],review2026:Array.isArray(s.review2026)?s.review2026:[],config:s.config||{}};}
  function notify(txt,bad){const el=$('toast');el.textContent=txt;el.style.background=bad==='error'?'#ba4155':'#112340';el.hidden=false;clearTimeout(notify.t);notify.t=setTimeout(()=>el.hidden=true,4500);}
  function persist(){window.secureSync?.queueSave(structuredClone(state));render();}
  const VIEWS=[['dashboard','◈ Painel'],['participants','♙ Participantes'],['loans','⇄ Empréstimos'],['reconcile','✓ Conciliar'],['dues','▦ Mensalidades'],['cash','▤ Livro-caixa'],['review','◇ Conferência 2026'],['reports','▧ Relatórios'],['rules','⚖ Regulamento']];
  function nav(){ $('nav').innerHTML=VIEWS.map(([k,l])=>`<button type="button" data-view="${k}" class="${page===k?'active':''}">${esc(l)}</button>`).join(''); $('crumb').textContent=(page==='person'?'Ficha do participante':VIEWS.find(x=>x[0]===page)?.[1])||'Gestão de Valores'; }
  const txs=()=>state.transactions.filter(byYear);
  const amount=(items)=>items.reduce((v,x)=>v+Number(x.amount||0),0);
  const uiTitle=(title,sub,action,label)=>`<div class="page-title"><div><h2>${esc(title)}</h2><p>${esc(sub)}</p></div>${action?`<button class="primary" data-action="${action}">${esc(label||'Novo registro')}</button>`:''}</div>`;
  const td=(value)=>`<td>${value}</td>`;
  function table(headers,rows){return `<div class="panel table-wrap">${rows.length?`<table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`:'<div class="empty">Nenhum lançamento nesta visualização.</div>'}</div>`;}
  function pageDash(){const tx=txs(),inflow=amount(tx.filter(x=>x.kind==='in')),outflow=amount(tx.filter(x=>x.kind==='out')),loans=state.loans.filter(byYear),dues=state.dues.filter(d=>period==='todos'||String(d.month).startsWith(period));
    const active=loans.filter(l=>l.status!=='paid'),open=active.reduce((s,l)=>s+Math.max(0,loanTotal(l)-Number(l.paidTotal||0)),0);
    return uiTitle('Painel financeiro','Visão consolidada do período selecionado')+`<div class="kpis">${[['Saldo dos lançamentos',brl(inflow-outflow),'Não é o saldo bancário; registros ainda em conciliação'],['Entradas',brl(inflow),'Total de recebimentos'],['Saídas',brl(outflow),'Total de pagamentos'],['Saldo contratual bruto',brl(open),'Provisório: devoluções antigas sem vínculo podem reduzir o saldo']].map(x=>`<div class="kpi"><div class="key">${x[0]}</div><div class="value">${x[1]}</div><div class="note">${x[2]}</div></div>`).join('')}</div><div class="warning">Valores importados de 2026 ainda exigem conciliação individual. Devoluções não vinculadas a contratos não reduzem automaticamente o saldo.</div>`+
      `<div class="panel"><h3>Resumo de 2026</h3><p class="note">${state.participants.length} participantes · ${tx.length} lançamentos · ${loans.length} empréstimos · ${dues.length} mensalidades cadastradas · ${state.review2026.length} registros para conferência.</p></div>`+table(['Data','Participante','Categoria','Movimento','Valor'],tx.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,15).map(t=>`<tr>${td(day(t.date))}${td(esc(person(t.participantId)))}${td(esc(t.category))}${td(t.kind==='in'?'<span class="chip">Entrada</span>':'<span class="chip warn">Saída</span>')}${td(`<strong>${brl(t.amount)}</strong>`)}</tr>`));
  }
  function people(){return state.participants.filter(p=>!filter||p.name.toLowerCase().includes(filter.toLowerCase())).sort((a,b)=>a.name.localeCompare(b.name,'pt'));}
  function pagePeople(){return uiTitle('Participantes','Cadastro de pessoas, cotas e histórico financeiro','new-person','+ Participante')+`<div class="inline-tools"><input id="find" placeholder="Pesquisar participante" value="${esc(filter)}"><span class="muted">${state.participants.length} pessoas · ${state.participants.filter(p=>p.active).length} ativos · ${state.participants.filter(p=>!p.active).length} inativos/pendentes</span></div>`+table(['Participante','Cotas','Situação','Telefone','Ações'],people().map(p=>`<tr>${td(`<strong>${esc(p.name)}</strong><div class="muted">${esc(p.notes||'')}</div>`)}${td(esc(p.quotas||1))}${td(p.active?'<span class="chip">Ativo</span>':'<span class="chip warn">Inativo</span>')}${td(esc(p.phone||'—'))}${td(`<button class="action-btn" data-action="open-person" data-id="${esc(p.id)}">Painel individual</button> <button class="action-btn" data-action="edit-person" data-id="${esc(p.id)}">Editar</button>`)}</tr>`));}
  function loanTotal(l){return Number(l.principal||0)*(1+Number(l.rate||0)/100);}
  function pageLoans(){const loans=state.loans.filter(l=>period==='todos'||String(l.date||'').startsWith(period)).filter(l=>!filter||person(l.participantId).toLowerCase().includes(filter.toLowerCase())).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    return uiTitle('Empréstimos','Concessões, juros, devoluções e saldo contratual','new-loan','+ Empréstimo')+`<div class="inline-tools"><input id="find" placeholder="Pesquisar pessoa" value="${esc(filter)}"></div><div class="warning">Empréstimos antigos importados podem ter pagamentos ainda não vinculados. O saldo contratual abaixo é provisório até a conciliação.</div>`+table(['Data','Participante','Principal','Juros','Recebido','A receber','Ação'],loans.map(l=>`<tr>${td(day(l.date))}${td(`<strong>${esc(person(l.participantId))}</strong>`)}${td(brl(l.principal))}${td(`${esc(l.rate||0)}%`)}${td(brl(l.paidTotal||0))}${td(`<strong>${brl(Math.max(0,loanTotal(l)-Number(l.paidTotal||0)))}</strong>`)}${td(`<button class="action-btn" data-action="pay-loan" data-id="${esc(l.id)}">Devolução</button>`)}</tr>`));}
  function pageReconcile(){
    const payments=state.transactions.filter(t=>['Pagamento de empréstimo','Devolução de empréstimo'].includes(t.category) && !t.loanId && (period==='todos'||String(t.date||'').startsWith(period)));
    const matched=state.transactions.filter(t=>['Pagamento de empréstimo','Devolução de empréstimo'].includes(t.category) && t.loanId && (period==='todos'||String(t.date||'').startsWith(period)));
    return uiTitle('Conciliar devoluções','Vincule os pagamentos históricos aos contratos corretos, sem duplicar entradas no caixa')+
      '<div class="warning">Esta etapa exige confirmação: não associamos devoluções automaticamente. A vinculação apenas ajusta o valor recebido no empréstimo e nunca cria outra entrada de dinheiro. Juros antigos precisam de conferência separada.</div>'+
      '<div class="panel"><p class="note">'+payments.length+' devoluções aguardando vínculo · '+matched.length+' já vinculadas.</p></div>'+
      table(['Data','Participante','Recebimento','Contratos compatíveis','Ação'],payments.map(t=>{
        const options=state.loans.filter(l=>l.participantId===t.participantId && String(l.date||'')<=String(t.date||'') && loanTotal(l)-Number(l.paidTotal||0)+0.005>=Number(t.amount));
        return '<tr>'+td(day(t.date))+td(esc(person(t.participantId)))+td(brl(t.amount))+td(esc(options.length))+
          td('<button class="action-btn" data-action="link-return" data-id="'+esc(t.id)+'" '+(options.length?'':'disabled')+'>Conferir vínculo</button>')+'</tr>';
      }));
  }
  function reconcilePayment(id){
    const tx=state.transactions.find(t=>t.id===id && ['Pagamento de empréstimo','Devolução de empréstimo'].includes(t.category) && !t.loanId);
    if(!tx){notify('Pagamento já vinculado ou indisponível.','error');return;}
    const options=state.loans.filter(l=>l.participantId===tx.participantId && String(l.date||'')<=String(tx.date||'') && loanTotal(l)-Number(l.paidTotal||0)+0.005>=Number(tx.amount));
    if(!options.length){notify('Não há contrato compatível. Confira o lançamento manualmente.','error');return;}
    openForm('Confirmar devolução já registrada',[
      {key:'loanId',label:'Contrato correspondente',type:'select',options:options.map(l=>({value:l.id,label:day(l.date)+' · '+brl(l.principal)+' · saldo estimado '+brl(Math.max(0,loanTotal(l)-Number(l.paidTotal||0)))}))},
      {key:'confirm',label:'Confirmação do responsável',type:'select',options:[{value:'no',label:'Escolher e conferir antes de salvar'},{value:'yes',label:'Confirmo que pertence a este contrato'}]}
    ],v=>{
      if(v.confirm!=='yes')throw Error('Confirme que o pagamento pertence ao contrato selecionado.');
      if(tx.loanId)throw Error('Essa devolução já foi conciliada.');
      const loan=state.loans.find(l=>l.id===v.loanId && l.participantId===tx.participantId);
      if(!loan || String(loan.date||'')>String(tx.date||''))throw Error('Contrato incompatível.');
      const remaining=loanTotal(loan)-Number(loan.paidTotal||0);
      if(Number(tx.amount)>remaining+0.005)throw Error('Pagamento acima do saldo estimado.');
      tx.loanId=loan.id;tx.reconciledAt=new Date().toISOString();
      loan.paidTotal=Number(loan.paidTotal||0)+Number(tx.amount);
      loan.status=loan.paidTotal>=loanTotal(loan)-0.005?'paid':'partial';
    });
  }

  function pagePerson(){
    const participant=state.participants.find(p=>p.id===selectedPersonId);
    if(!participant)return uiTitle('Participante não encontrado','Volte para a lista de participantes')+'<button class="secondary" data-action="back-participants">Voltar</button>';
    if(!window.GestaoPersonPanel)return '<div class="warning">Painel individual indisponível. Atualize a página.</div>';
    return window.GestaoPersonPanel.render({state,participant,year:personYear(),esc,brl,day,loanTotal});
  }
  const personYear=()=>period==='todos'?'2026':period;
  function profileMonths(){
    const y=personYear();
    return Array.from({length:11},(_,i)=>{
      const month=String(i+1).padStart(2,'0');
      return {value:y+'-'+month,label:new Date(y+'-'+month+'-15T12:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'})};
    });
  }
  function personCategories(kind){
    return (kind==='out'?['Evento','Rifa','Outros']:['Mensalidade','Juros de mensalidade','Rifa','Evento','Pagamento de empréstimo','Juros de empréstimo','Outros'])
      .map(x=>({value:x,label:x==='Pagamento de empréstimo'?'Devolução de empréstimo (vínculo pendente)':x}));
  }
  function classifyPersonTransaction(id){
    const t=state.transactions.find(x=>x.id===id&&x.participantId===selectedPersonId);
    if(!t)return notify('Lançamento não encontrado.','error');
    if(t.loanId||t.dueId||t.category==='Empréstimo concedido')return notify('Lançamento vinculado: edite pelo contrato original para preservar os saldos.','error');
    const opts=personCategories(t.kind);
    if(!opts.some(x=>x.value===t.category))opts.unshift({value:t.category||'Outros',label:'Categoria atual: '+(t.category||'Outros')});
    openForm('Classificar lançamento já recebido',[
      {key:'category',label:'Destino do valor',type:'select',value:t.category||'Outros',options:opts},
      {key:'competence',label:'Competência (mensalidade / juros)',type:'select',value:t.competence||'',options:[{value:'',label:'Sem competência definida'},...profileMonths()]},
      {key:'eventName',label:'Nome do evento (quando aplicável)',value:t.eventName||''}
    ],v=>{
      if(t.loanId||t.dueId)throw Error('Lançamento já vinculado.');
      if(!personCategories(t.kind).some(x=>x.value===v.category))throw Error('Categoria incompatível com o tipo de movimento.');
      if(['Mensalidade','Juros de mensalidade'].includes(v.category)&&!v.competence)throw Error('Informe o mês de competência.');
      if(v.category==='Evento'&&!String(v.eventName||'').trim())throw Error('Informe o evento.');
      const nextEvent=v.category==='Evento'?v.eventName.trim():'';
      if(t.category===v.category&&String(t.competence||'')===v.competence&&String(t.eventName||'')===nextEvent)return;
      (t.classificationHistory??=[]).push({category:t.category||'',competence:t.competence||'',eventName:t.eventName||'',changedAt:new Date().toISOString(),origin:'Revisão manual'});
      t.category=v.category;t.competence=v.competence||null;t.eventName=nextEvent||null;t.classifiedAt=new Date().toISOString();
      // Preservar valor, entrada/saída, origem e vínculos — nunca somar outro pagamento.
    });
  }
  function newPersonTransaction(id,preset=''){
    const p=state.participants.find(x=>x.id===id);
    if(!p)return notify('Pessoa não localizada.','error');
    const raffleAmount=Number(state.config?.rafflePricePerQuota??10)*Number(p.quotas||1);
    openForm((preset==='Rifa'?'Registrar rifa — ':'Registrar valor — ')+p.name,[
      {key:'kind',label:'Movimento',type:'select',options:[{value:'in',label:'Entrada'},{value:'out',label:'Saída'}]},
      {key:'category',label:'Categoria',type:'select',value:preset||'Mensalidade',options:personCategories('in')},
      {key:'amount',label:'Valor (R$)',type:'number',value:preset==='Rifa'?raffleAmount:'',min:0.01,step:'0.01',required:true},
      {key:'date',label:'Data do movimento',type:'date',value:today(),required:true},
      {key:'competence',label:'Competência',type:'select',options:[{value:'',label:'Sem competência definida'},...profileMonths()]},
      {key:'eventName',label:'Nome do evento (se houver)',value:''},
      {key:'notes',label:'Observação / comprovante',value:''}
    ],v=>{
      const amount=Number(v.amount);
      if(!(amount>0&&Number.isFinite(amount)))throw Error('Informe um valor positivo.');
      if(!personCategories(v.kind).some(x=>x.value===v.category))throw Error('Categoria incompatível. Empréstimo concedido deve ser lançado na aba Empréstimos.');
      if(['Mensalidade','Juros de mensalidade'].includes(v.category)&&!v.competence)throw Error('Informe a competência.');
      if(v.category==='Evento'&&!String(v.eventName||'').trim())throw Error('Informe o evento.');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(v.date))throw Error('Data inválida.');
      if(state.transactions.some(t=>t.participantId===id&&t.date===v.date&&t.kind===v.kind&&t.category===v.category&&Math.abs(Number(t.amount)-amount)<0.005&&String(t.competence||'')===v.competence))throw Error('Já existe uma movimentação idêntica. Evite registrar duas vezes.');
      state.transactions.push({id:newID('tx'),participantId:id,date:v.date,kind:v.kind,category:v.category,amount:Math.round(amount*100)/100,competence:v.competence||null,eventName:v.category==='Evento'?v.eventName.trim():null,
        description:v.category+(v.category==='Evento'?' · '+v.eventName.trim():'')+' · '+p.name,
        notes:v.notes||'',source:'Aplicativo · painel individual',createdAt:new Date().toISOString()});
    });
  }
  function pageDues(){const d=state.dues.filter(x=>period==='todos'||String(x.month||'').startsWith(period)).filter(x=>!filter||person(x.participantId).toLowerCase().includes(filter.toLowerCase())).sort((a,b)=>String(b.month).localeCompare(String(a.month)));
    return uiTitle('Mensalidades','Controle das cotas pagas, parciais e pendentes','new-due','+ Mensalidade')+`<div class="inline-tools"><input id="find" placeholder="Pesquisar pessoa" value="${esc(filter)}"></div>`+table(['Competência','Participante','Cotas','Previsto','Pago','Situação','Ação'],d.map(x=>`<tr>${td(esc(x.month))}${td(`<strong>${esc(person(x.participantId))}</strong>`)}${td(esc(x.quotas||1))}${td(brl(x.amount))}${td(brl(x.paidAmount||0))}${td(`<span class="chip ${x.status==='paid'?'':'warn'}">${x.status==='paid'?'Pago':x.status==='partial'?'Parcial':'Pendente'}</span>`)}${td(`<button class="action-btn" data-action="pay-due" data-id="${esc(x.id)}" ${Number(x.paidAmount||0)>=Number(x.amount)?'disabled':''}>Receber</button>`)}</tr>`));}
  function pageCash(){const tx=txs().filter(x=>!filter||`${x.description||''} ${x.category||''} ${person(x.participantId)}`.toLowerCase().includes(filter.toLowerCase())).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    return uiTitle('Livro-caixa','Histórico de entradas e saídas da caixinha','new-tx','+ Lançamento')+`<div class="inline-tools"><input id="find" placeholder="Buscar descrição ou pessoa" value="${esc(filter)}"></div>`+table(['Data','Natureza','Categoria','Pessoa','Descrição','Valor'],tx.map(x=>`<tr>${td(day(x.date))}${td(x.kind==='in'?'<span class="chip">Entrada</span>':'<span class="chip warn">Saída</span>')}${td(esc(x.category||''))}${td(esc(person(x.participantId)))}${td(esc(x.description||''))}${td(`<strong>${brl(x.amount)}</strong>`)}</tr>`));}
  function pageReview(){const rev=state.review2026.filter(x=>!filter||`${x.person||''} ${x.detail||''} ${x.category||''}`.toLowerCase().includes(filter.toLowerCase()));return uiTitle('Conferência de 2026','Registros incompletos preservados, sem lançar saldo fictício')+`<div class="warning">Os registros listados abaixo não devem alterar o saldo sem verificação. Consulte o histórico do WhatsApp e os comprovantes.</div><div class="inline-tools"><input id="find" placeholder="Buscar pessoa ou observação" value="${esc(filter)}"><span class="muted">${rev.length} para verificar</span></div>`+table(['Data','Pessoa','Classificação','Valor citado','Observação'],rev.slice(0,250).map(x=>`<tr>${td(day(x.date))}${td(`<strong>${esc(x.person)}</strong>`)}${td(esc(x.category))}${td(x.amount===null?'—':brl(x.amount))}${td(`<div class="muted">${esc(String(x.detail||'').slice(0,240))}</div>`)}</tr>`))+(rev.length>250?'<p class="muted">Exibindo os primeiros 250 para economizar dados. Use o campo de busca para localizar os demais.</p>':'');}
  function bankAuditSummary(){
    const audit=state.audit2026||{};
    const bank=audit.bankLoanReconciliation, tatiana=audit.tatianaItauJanJunReconciliation;
    const personal=audit.bankStatements2026?.purchasesToReview;
    if(!bank&&!tatiana&&!personal)return '';
    const unlinked=state.transactions.filter(t=>['Pagamento de empréstimo','Devolução de empréstimo'].includes(t.category)&&!t.loanId);
    const unlinkedSum=amount(unlinked);
    const cards=[];
    if(bank){
      cards.push(['Saldo Caixa até 27/10 (toda a conta)',brl(Number(bank.bankClosingCents||0)/100),'Inclui movimentações particulares; não é o caixa conciliado da caixinha']);
      cards.push(['Saídas de empréstimos compatíveis',String(bank.disbursementDayAmountMatches||0)+' de '+String(bank.appLoanCount||0),'Correspondência por data e valor; não comprova identidade do favorecido']);
    }
    if(tatiana){
      const a=tatiana.febJunInterAccount||{};
      cards.push(['Repasses Itaú → Caixa (fev–jun)',String(a.sameDaySameAmountCaixaPossibleCount||0)+' de '+String(a.fromTatianaCount||0),'Compatíveis em data e valor; sem contagem dupla como receita']);
    }
    cards.push(['Devoluções sem vínculo contratual',brl(unlinkedSum),unlinked.length+' recebimentos já incluídos nas entradas do livro-caixa; não representam falta de dinheiro']);
    if(personal)cards.push(['Compras particulares a conferir',brl(Number(personal.confirmedPersonalAmountCents||0)/100),'Valor bruto declarado particular; reposições ainda não abatidas']);
    return '<div class="panel"><h3>Saúde da conferência bancária — 2026</h3><p class="note">Dados da auditoria documental (Caixa e Itaú). Valores bancários e lançamentos do aplicativo não são bases equivalentes; não calcule desfalque subtraindo os totais.</p><div class="kpis">'+cards.map(c=>'<div class="kpi"><div class="key">'+esc(c[0])+'</div><div class="value">'+esc(c[1])+'</div><div class="note">'+esc(c[2])+'</div></div>').join('')+'</div><p class="note">Nenhum pagamento é duplicado por aparecer primeiro na conta da Tatiana e depois na conta do Leonardo. Contratos sem identificação nominal permanecem em revisão.</p></div>';
  }

  function pageRules(){
    const r=window.CaixinhaRules;if(!r)return '<div class="warning">Motor do regulamento indisponível.</div>';
    const c=state.config||{};
    const rules=[
      'Cada associado pode adquirir de 1 a 10 cotas de R$ 50,00.',
      'Mensalidades vencem no dia 15. Após o vencimento, juros de 10% sobre a mensalidade devida.',
      'Três meses consecutivos de inadimplência: exclusão e perda dos valores pagos, SOMENTE após conferência e decisão do responsável.',
      'Contribuição adicional por cota: R$ 20 (jan–abr), R$ 30 (mai–ago), R$ 40 (set–nov). Total R$ 70, R$ 80 ou R$ 90 por mês.',
      'Empréstimos permitidos de 01/02/2026 a 31/10/2026.',
      'Taxa de juros de empréstimos: 20%.',
      'Todos os associados devem participar dos sorteios, rifas e eventos.',
      'Limite de empréstimo: R$ 50 × 11 meses × número de cotas (até R$ 5.500).',
      'Empréstimos devem estar quitados até 30/11/2026; saldo remanescente previsto para desconto no encerramento.',
      'Taxa administrativa: 4% do valor bruto apurado a receber.',
      'Cada rifa exige a mesma quantidade de bilhetes que as cotas do associado; R$ 10 por bilhete.',
      'Encerramento até 10/12/2026, com devolução das cotas e acréscimo da parcela apurada conforme fechamento.'
    ];
    const rows=state.participants.filter(x=>x.active).map(p=>{
      const id=p.id,settlement=r.settlement({quotas:p.quotas});
      const loans=state.loans.filter(l=>l.participantId===id&&l.status!=='paid');
      const open=loans.reduce((total,l)=>total+Math.max(0,loanTotal(l)-Number(l.paidTotal||0)),0);
      const delinquency=r.lateMonths({participantId:id,dues:state.dues,asOf:today()});
      return '<tr><td>'+esc(p.name)+'</td><td>'+esc(p.quotas)+'</td><td>'+brl(settlement.baseAccumulated||0)+'</td><td>'+brl(open)+'</td><td>'+
        (delinquency.reviewRequired?'<span class="chip warn">Conferir 3 meses</span>':'<span class="chip">Histórico a conferir</span>')+'</td><td><strong>Pendente de apuração</strong></td></tr>';
    });
    return uiTitle('Regulamento oficial — Caixinha 2026','Regras e projeção do encerramento sem lançamentos artificiais')+
      '<div class="panel"><h3>Pagamento</h3><p class="note">Recebedora: '+esc(c.pixReceiverName||'Tatiana Abreu')+
      ' · Chave Pix cadastrada no acesso privado: '+esc(c.pixKey?'final '+String(c.pixKey).slice(-2):'não cadastrada')+
      ' · vencimento das mensalidades em 15 de cada mês.</p></div>'+
      '<div class="kpis">'+[
         ['Valor por cota',brl(50),'Base mensal'],['Limite de cotas','10','Por participante'],
         ['Multa por atraso','10%','Juros sobre mensalidade devida'],
         ['Taxa administrativa','4%','Sobre valor bruto a receber']
        ].map(k=>'<div class="kpi"><div class="key">'+esc(k[0])+'</div><div class="value">'+esc(k[1])+'</div><div class="note">'+esc(k[2])+'</div></div>').join('')+'</div>'+
      '<div class="panel"><h3>Regras vigentes</h3><ol class="rule-list">'+rules.map(v=>'<li>'+esc(v)+'</li>').join('')+'</ol></div>'+
      '<div class="panel"><h3>Projeção de encerramento — associados ativos</h3>'+
      '<p class="warning">Valores de base são previsão da mensalidade de R$ 50 × 11, não saldo efetivamente pago. Juros e repasses existentes não estão totalmente conciliados. Não há cálculo de rateio de excedente confirmado. A perda de cotas ou desconto de empréstimo NÃO é executada automaticamente.</p></div>'+
      table(['Associado','Cotas','Cotas-base de referência','Saldo contratual bruto','Situação','Líquido a distribuir'],rows);
  }
  function pageReports(){const t=txs(),group={};t.forEach(x=>{const k=x.category||'Outros';(group[k]??={ins:0,outs:0})[x.kind==='in'?'ins':'outs']+=Number(x.amount)||0;});return uiTitle('Relatórios e backup','Resumo de categorias, exportações e segurança')+`<div class="panel"><h3>Relatório por categoria</h3><div class="table-wrap"><table><thead><tr><th>Categoria</th><th>Entradas</th><th>Saídas</th><th>Saldo</th></tr></thead><tbody>${Object.entries(group).map(([k,v])=>`<tr>${td(esc(k))}${td(brl(v.ins))}${td(brl(v.outs))}${td(`<strong>${brl(v.ins-v.outs)}</strong>`)}</tr>`).join('')}</tbody></table></div></div><div class="panel"><h3>Exportação e segurança</h3><p class="note">As informações permanecem no banco Neon com acesso por conta autenticada. Faça um backup privado periodicamente e guarde em local seguro.</p><div class="inline-tools"><button class="primary" data-action="backup">Baixar backup JSON</button><button class="secondary" data-action="export-csv">Exportar lançamentos CSV</button></div></div>`+bankAuditSummary();}
  function render(){nav();const pages={dashboard:pageDash,participants:pagePeople,person:pagePerson,loans:pageLoans,reconcile:pageReconcile,dues:pageDues,cash:pageCash,review:pageReview,reports:pageReports,rules:pageRules};$('view').innerHTML=`<div class="inline-tools"><span class="filteryear">Período</span><select id="year"><option value="2026" ${period==='2026'?'selected':''}>2026</option><option value="2027" ${period==='2027'?'selected':''}>2027</option><option value="todos" ${period==='todos'?'selected':''}>Todos</option></select></div>`+(pages[page]||pages.dashboard)();}
  function openForm(title,fields,done){const modal=$('modal');const rows=fields.map(f=>`<label for="f_${esc(f.key)}">${esc(f.label)}</label>${f.type==='select'?`<select id="f_${esc(f.key)}" name="${esc(f.key)}">${(f.options||[]).map(v=>`<option value="${esc(v.value)}" ${String(v.value)===String(f.value)?'selected':''}>${esc(v.label)}</option>`).join('')}</select>`:`<input id="f_${esc(f.key)}" name="${esc(f.key)}" type="${esc(f.type||'text')}" value="${esc(f.value??'')}" ${f.required?'required':''} ${f.min!==undefined?`min="${f.min}"`:''} ${f.step?`step="${f.step}"`:''}>`}`).join('');
    $('modalContent').innerHTML=`<h3>${esc(title)}</h3><form id="editForm">${rows}<div class="modalactions"><button class="secondary" type="button" id="cancelForm">Cancelar</button><button class="primary" type="submit">Salvar</button></div></form>`;modal.hidden=false;$('cancelForm').onclick=()=>modal.hidden=true;
    $('editForm').addEventListener('change',e=>{
      if(e.target.name!=='kind')return;
      const category=e.target.form?.elements?.category;
      if(!category||category.tagName!=='SELECT')return;
      const previous=category.value,options=personCategories(e.target.value);
      category.innerHTML=options.map(v=>'<option value="'+esc(v.value)+'">'+esc(v.label)+'</option>').join('');
      if(options.some(v=>v.value===previous))category.value=previous;
    });
    $('editForm').onsubmit=e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.target).entries());try{done(v);modal.hidden=true;persist();notify('Alteração enviada. Aguarde o indicador "Sincronizado" no topo.');}catch(err){notify(err.message,'error');}};
  }
  const participantOptions=()=>state.participants.slice().sort((a,b)=>a.name.localeCompare(b.name,'pt')).map(p=>({value:p.id,label:p.name}));
  function newPerson(old){openForm(old?'Editar participante':'Novo participante',[{key:'name',label:'Nome completo',value:old?.name||'',required:true},{key:'phone',label:'Telefone',value:old?.phone||''},{key:'quotas',label:'Quantidade de cotas',type:'number',min:1,value:old?.quotas||1,required:true},{key:'active',label:'Situação',type:'select',value:old?.active===false?'no':'yes',options:[{value:'yes',label:'Ativo'},{value:'no',label:'Inativo'}]}],v=>{if(!v.name.trim())throw Error('Informe o nome.');if(!(Number(v.quotas)>0&&Number(v.quotas)<=10))throw Error('Cotas entre 1 e 10.');const p=old||{id:newID('person'),createdAt:new Date().toISOString()};Object.assign(p,{name:v.name.trim(),phone:v.phone.trim(),quotas:Number(v.quotas),active:v.active==='yes'});if(!old)state.participants.push(p);});}
  function newLoan(){
    if(!state.participants.length)return notify('Cadastre um associado primeiro.','error');
    const rules=window.CaixinhaRules;
    if(!rules)return notify('Regulamento indisponível. Atualize a página.','error');
    openForm('Empréstimo para associado · regras 2026',[
      {key:'participantId',label:'Associado (ativo)',type:'select',options:participantOptions()},
      {key:'principal',label:'Valor emprestado (R$)',type:'number',step:'0.01',min:0.01,required:true},
      {key:'date',label:'Data da concessão',type:'date',value:today(),required:true},
      {key:'dueDate',label:'Vencimento final (até 30/11)',type:'date',value:'2026-11-30',required:true},
      {key:'notes',label:'Observação sobre a conferência dos empréstimos anteriores'}
    ],v=>{
      const member=state.participants.find(p=>p.id===v.participantId);
      if(!member)throw Error('Associado não encontrado.');
      const principal=Number(v.principal);
      const checked=rules.loanCheck({participant:member,date:v.date,principal,loans:state.loans});
      if(!checked.ok)throw Error(checked.reason);
      if(v.dueDate<'2026-02-01'||v.dueDate>'2026-11-30'||v.dueDate<v.date)throw Error('Vencimento máximo 30/11/2026, posterior à concessão.');
      const l={id:newID('loan'),participantId:v.participantId,principal:Math.round(principal*100)/100,
        rate:20,interestMode:'flat',date:v.date,dueDate:v.dueDate,paidTotal:0,status:'open',
        notes:v.notes||'',createdAt:new Date().toISOString()};
      state.loans.push(l);
      state.transactions.push({id:newID('tx'),date:v.date,kind:'out',amount:l.principal,
        category:'Empréstimo concedido',participantId:v.participantId,loanId:l.id,
        description:'Empréstimo · '+person(v.participantId),source:'Aplicativo',
        createdAt:new Date().toISOString()});
    });
  }
  function payLoan(id){const l=state.loans.find(x=>x.id===id);if(!l)return;const left=Math.max(0,loanTotal(l)-Number(l.paidTotal||0));openForm('Registrar devolução',[{key:'amount',label:`Valor recebido (máximo ${brl(left)})`,type:'number',min:0.01,step:'0.01',required:true},{key:'date',label:'Data da devolução',type:'date',value:today(),required:true},{key:'notes',label:'Observações'}],v=>{const a=Number(v.amount);if(!(a>0&&a<=left+0.005))throw Error('Valor maior que o saldo ou inválido.');l.paidTotal=Number(l.paidTotal||0)+a;l.status=l.paidTotal>=loanTotal(l)-0.005?'paid':'partial';state.transactions.push({id:newID('tx'),date:v.date,kind:'in',amount:a,category:'Devolução de empréstimo',participantId:l.participantId,loanId:l.id,description:`Devolução · ${person(l.participantId)}`,notes:v.notes,source:'Aplicativo',createdAt:new Date().toISOString()});});}
  function newDue(){
    if(!state.participants.length)return notify('Cadastre uma pessoa primeiro.','error');
    const base=Number(state.config?.monthlyBasePerQuota??50);
    const extra=state.config?.monthlyAdditionalPerQuota2026||[20,20,20,20,30,30,30,30,40,40,40];
    const options=Array.from({length:11},(_,i)=>({value:'2026-'+String(i+1).padStart(2,'0'),label:new Date(2026,i,15).toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}));
    openForm('Lançar mensalidade · tabela 2026',[
      {key:'participantId',label:'Associado',type:'select',options:participantOptions()},
      {key:'month',label:'Competência (janeiro a novembro)',type:'select',value:today().slice(0,7),options},
      {key:'notes',label:'Observação (opcional)',value:''}
    ],v=>{
      const p=state.participants.find(x=>x.id===v.participantId);
      const idx=Number(String(v.month||'').slice(5,7))-1;
      if(!p||!/^(2026)-(0[1-9]|10|11)$/.test(String(v.month||''))||!Number.isInteger(idx)||idx<0||idx>10)throw Error('Associado ou competência inválida.');
      if(state.dues.some(d=>d.participantId===p.id&&d.month===v.month))throw Error('Essa pessoa já tem uma mensalidade cadastrada no mês.');
      const quotas=Number(p.quotas),additional=Number(extra[idx]),rate=base+additional;
      if(!(quotas>0&&quotas<=10&&Number.isFinite(rate)&&rate>=50))throw Error('Verifique as cotas e a tabela do mês.');
      // A criação do previsto não representa dinheiro recebido e não gera transação.
      state.dues.push({id:newID('due'),participantId:p.id,month:v.month,quotas,feePerQuota:rate,
        basePerQuota:base,additionalPerQuota:additional,amount:quotas*rate,
        baseAmount:quotas*base,additionalAmount:quotas*additional,
        paidAmount:0,status:'pending',dueDate:v.month+'-15',notes:v.notes||'',
        source:'Aplicativo · tabela por cota 2026',createdAt:new Date().toISOString()});
    });
  }
  function payDue(id){const d=state.dues.find(x=>x.id===id);if(!d)return;const left=Number(d.amount)-Number(d.paidAmount||0);openForm('Receber mensalidade',[{key:'amount',label:`Valor recebido (saldo ${brl(left)})`,type:'number',min:0.01,step:'0.01',required:true},{key:'date',label:'Data do pagamento',type:'date',value:today(),required:true}],v=>{const a=Number(v.amount);if(!(a>0&&a<=left+0.005))throw Error('Pagamento inválido.');d.paidAmount=Number(d.paidAmount||0)+a;d.status=d.paidAmount>=Number(d.amount)-0.005?'paid':'partial';d.paidDate=v.date;state.transactions.push({id:newID('tx'),date:v.date,kind:'in',amount:a,category:'Mensalidade',participantId:d.participantId,dueId:d.id,description:`Mensalidade ${d.month} · ${person(d.participantId)}`,source:'Aplicativo',createdAt:new Date().toISOString()});});}
  function newTx(){openForm('Novo lançamento financeiro',[{key:'kind',label:'Movimento',type:'select',options:[{value:'in',label:'Entrada'},{value:'out',label:'Saída'}]},{key:'amount',label:'Valor (R$)',type:'number',min:0.01,step:'0.01',required:true},{key:'category',label:'Categoria',required:true},{key:'date',label:'Data',type:'date',value:today(),required:true},{key:'description',label:'Descrição',required:true},{key:'participantId',label:'Participante (opcional)',type:'select',options:[{value:'',label:'Sem vínculo'},...participantOptions()]}],v=>{if(!(Number(v.amount)>0))throw Error('Valor inválido.');state.transactions.push({id:newID('tx'),date:v.date,kind:v.kind,amount:Number(v.amount),category:v.category,description:v.description,participantId:v.participantId||null,source:'Aplicativo',createdAt:new Date().toISOString()});});}
  function download(name,content,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const el=document.createElement('a');el.href=url;el.download=name;el.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function backup(){download(`Gestao_Valores_Backup_${today()}.json`,JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2),'application/json');}
  function csv(){const cols=['Data','Movimento','Categoria','Pessoa','Descrição','Valor'];const lines=[cols,...txs().map(x=>[x.date,x.kind==='in'?'Entrada':'Saída',x.category,person(x.participantId),x.description,x.amount])];const txt=lines.map(row=>row.map(v=>`"${String(v??'').replace(/^[=+@-]/, "'").replace(/"/g,'""')}"`).join(';')).join('\r\n');download(`Gestao_Valores_${period}.csv`,'\ufeff'+txt,'text/csv;charset=utf-8');}
  document.addEventListener('click',e=>{const nav=e.target.closest('[data-view]');if(nav){page=nav.dataset.view;filter='';render();return;}const a=e.target.closest('[data-action]');if(!a)return;const action=a.dataset.action,id=a.dataset.id;({ 'new-person':()=>newPerson(),'edit-person':()=>newPerson(state.participants.find(p=>p.id===id)),'open-person':()=>{selectedPersonId=id;page='person';filter='';render();},'back-participants':()=>{page='participants';filter='';render();},'classify-person-tx':()=>classifyPersonTransaction(id),'new-person-tx':()=>newPersonTransaction(id),'new-person-raffle':()=>newPersonTransaction(id,'Rifa'),'new-loan':newLoan,'pay-loan':()=>payLoan(id),'link-return':()=>reconcilePayment(id),'new-due':newDue,'pay-due':()=>payDue(id),'new-tx':newTx,'backup':backup,'export-csv':csv}[action]||(()=>{}))();});
  document.addEventListener('input',e=>{if(e.target.id==='find'){const pos=e.target.selectionStart;filter=e.target.value;render();const el=$('find');el.focus();el.setSelectionRange(pos,pos);}});
  document.addEventListener('change',e=>{if(e.target.id==='year'){period=e.target.value;render();}});
  $('modal').addEventListener('click',e=>{if(e.target.id==='modal')$('modal').hidden=true;});
  window.gestaoBridge={load(d){state=normal(d);render();},snapshot(){return structuredClone(state);},notify};
  render();
})();
