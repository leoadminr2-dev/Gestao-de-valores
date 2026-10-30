'use strict';
// Regulamento informado pelo responsável em 29/10/2026.
// Somente cálculos e sinais para revisão, nunca expulsa nem movimenta dinheiro automaticamente.
(function(){
  const YEAR=2026;
  const BASE=50;
  const EXTRAS=[20,20,20,20,30,30,30,30,40,40,40];
  const RAFFLE=10,LOAN_RATE=20,LATE_RATE=10,ADMIN_RATE=4;
  const round=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
  const integerCotas=n=>Number.isInteger(Number(n))&&Number(n)>=1&&Number(n)<=10;
  const refMonth=m=>/^2026-(0[1-9]|10|11)$/.test(String(m||''))?Number(m.slice(5,7))-1:-1;
  function dueAmount(month,quotas){
    const i=refMonth(month);
    if(i<0||!integerCotas(quotas))return null;
    return {base:round(BASE*quotas),additional:round(EXTRAS[i]*quotas),total:round((BASE+EXTRAS[i])*quotas),perQuota:BASE+EXTRAS[i],dueDate:month+'-15'};
  }
  const raffleAmount=quotas=>integerCotas(quotas)?RAFFLE*Number(quotas):null;
  const loanLimit=quotas=>integerCotas(quotas)?BASE*11*Number(quotas):null;
  function loanCheck({participant,date,principal,loans=[]}){
    const limit=loanLimit(participant?.quotas);
    if(!limit)return {ok:false,reason:'Quantidade de cotas inválida (1 a 10).'};
    if(participant.active!==true)return {ok:false,reason:'Apenas associados ativos podem solicitar novos empréstimos.'};
    if(!/^2026-(0[1-9]|1[0-2])-\d\d$/.test(String(date||''))||date<'2026-02-01'||date>'2026-10-31')
      return {ok:false,reason:'Empréstimos permitidos de 01/02/2026 até 31/10/2026.'};
    const used=loans.filter(l=>l.participantId===participant.id && l.status!=='paid')
      .reduce((n,l)=>n+Math.max(0,Number(l.principal||0)-Math.min(Number(l.principal||0),Number(l.paidPrincipal||0))),0);
    // Sem divisão comprovada dos retornos entre juros/principal, trata contratos abertos como principal integral em risco.
    if(!(Number(principal)>0&&Number.isFinite(Number(principal))))
      return {ok:false,reason:'Valor de empréstimo inválido.'};
    if(round(used+Number(principal))>limit+.005)
      return {ok:false,limit,used,reason:'Limite por cotas excedido ou contratos antigos ainda não conciliados.'};
    return {ok:true,limit,used,remaining:round(limit-used-Number(principal))};
  }
  function lateFee({dueAmount:charge,month,paymentDate,alreadyPaidOnTime=false}){
    const due=refMonth(month)>=0?month+'-15':null;
    if(!due||!paymentDate||paymentDate<=due||alreadyPaidOnTime)return 0;
    return round(Number(charge||0)*LATE_RATE/100);
  }
  function lateMonths({dues=[],participantId,asOf='2026-11-30'}){
    const by=new Map(dues.filter(d=>d.participantId===participantId&&refMonth(d.month)>=0).map(d=>[d.month,d]));
    let streak=0,maxStreak=0,reviewCandidates=[];
    for(let i=0;i<11;i++){
      const m='2026-'+String(i+1).padStart(2,'0'),d=by.get(m);
      if(m+'-15'>asOf)break;
      // Ausência de cobrança não é prova de dívida: interrompe sequência e sinaliza pendência documental.
      if(!d){streak=0;continue;}
      const verifiedMissing=Number(d.paidAmount||0)+.005<Number(d.amount||0)&&d.status!=='paid';
      if(verifiedMissing){streak++;maxStreak=Math.max(maxStreak,streak);if(streak>=3)reviewCandidates.push(m);}
      else streak=0;
    }
    return {reviewRequired:reviewCandidates.length>0,months:reviewCandidates,maxStreak,
      note:'Sinalização documental; jamais exclusão ou perda de valores automática. Verificar extratos e competências antes.'};
  }
  function settlement({quotas,assignedSurplus=null,outstandingLoan=null,excluded=false}){
    if(!integerCotas(quotas))return {status:'invalid_quotas'};
    const accumulated=BASE*11*Number(quotas);
    const result={baseAccumulated:accumulated,surplusAssigned:assignedSurplus,loanBalance:outstandingLoan,
      feePercent:ADMIN_RATE,loanDueDate:'2026-11-30',expectedDistributionBy:'2026-12-10',
      status:'review_required',excluded:!!excluded};
    if(excluded)return {...result,status:'excluded_pending_manual_review'};
    // Sem apuração da parcela de rendimento ou dívida conciliada não é possível emitir líquido a pagar.
    if(assignedSurplus===null||outstandingLoan===null||!Number.isFinite(Number(assignedSurplus))||!Number.isFinite(Number(outstandingLoan)))
      return result;
    const gross=round(accumulated+Number(assignedSurplus));
    if(gross<0||Number(outstandingLoan)<0)return {...result,status:'invalid_values'};
    const admin=round(gross*ADMIN_RATE/100);
    return {...result,gross,adminFee:admin,loanOffset:round(Number(outstandingLoan)),
      estimatedNet:round(gross-admin-Number(outstandingLoan)),status:'simulation_requires_approval'};
  }
  const info={
    title:'Caixinha 2026',paymentDeadlineDay:15,lateInterestPercent:LATE_RATE,
    consecutiveDelinquentMonthsForReview:3,monthlyBase:BASE,monthlyAdditional:EXTRAS.slice(),
    rafflePerQuota:RAFFLE,maxQuotas:10,loanInterestPercent:LOAN_RATE,
    loanStart:'2026-02-01',lastLoanDate:'2026-10-31',loanRepaymentDeadline:'2026-11-30',
    administrationPercent:ADMIN_RATE,distributionDeadline:'2026-12-10',
    obligatoryParticipation:'rifas, sorteios e eventos',doNotAutoForfeit:true
  };
  const api={info,dueAmount,raffleAmount,loanLimit,loanCheck,lateFee,lateMonths,settlement};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(typeof window!=='undefined')window.CaixinhaRules=api;
})();