'use strict';
(function(){
  const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toUpperCase().replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  const aliasFromMemo=s=>norm(String(s||'').replace(/^PIX\s*(TRANSF\s*)?/i,'').replace(/\s*\d{2}\/\d{2}\s*$/,''));
  function check(memo,person,people=[]){
    const alias=aliasFromMemo(memo);
    const full=norm(person?.name||'').split(' ').filter(Boolean),parts=alias.split(' ').filter(Boolean);
    if(!alias||!full.length)return {level:'sem_dados',label:'Dados insuficientes',risk:'high',alias};
    if(full[0]==='ZU'&&alias==='ZULEIDE')return {
      level:'apelido_sem_confirmacao',label:'Apelido: confirmar nome civil',risk:'high',alias};
    const candidates=people.filter(p=>{
      const t=norm(p.name).split(' ').filter(Boolean);
      if(parts.length>1)return t.length>1&&t[0].startsWith(parts[0])&&t[1].startsWith(parts[1]);
      return t.length>0&&(t[0].startsWith(alias)||alias.startsWith(t[0]));
    });
    if(parts.length>1){
      if(full.length<2&&full[0].startsWith(parts[0]))return {
        level:'sobrenome_ausente',label:'Segundo nome não cadastrado',risk:'high',alias};
      if(full[0].startsWith(parts[0])&&full[1]?.startsWith(parts[1])){
        return candidates.length===1
          ?{level:'dois_nomes_parciais',label:'Primeiro + início do segundo',risk:'medium',alias}
          :{level:'possiveis_homonimos',label:'Homônimos possíveis',risk:'high',alias};
      }
      return {level:'segundo_nome_divergente',label:'Segundo nome divergente',risk:'high',alias};
    }
    if(full[0].startsWith(alias)||alias.startsWith(full[0])){
      return candidates.length===1
        ?{level:'primeiro_nome_apenas',label:'Só primeiro nome no banco',risk:'medium',alias}
        :{level:'possiveis_homonimos',label:'Primeiro nome ambíguo',risk:'high',alias};
    }
    return {level:'nome_divergente',label:'Nome não corresponde',risk:'high',alias};
  }
  const api={normalize:norm,aliasFromMemo,check};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(typeof window!=='undefined')window.GestaoNominalAudit=api;
})();