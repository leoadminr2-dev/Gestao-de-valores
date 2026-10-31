'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const audit=require('../nominal-audit.js');
const participants=[
 {name:'Ana Cristina Damasceno'},{name:'Ana Paula'},{name:'Ana Paula Oliveira'},
 {name:'Bruna Fraga'},{name:'Bruna Braga'},{name:'Leila'},
 {name:'Alessandra Alves'},{name:'Alexandra'},{name:'Zu'},{name:'Taiz Caparica'}
];
const match=(memo,name)=>audit.check(memo,{name},participants);
test('primeiro e inicio do segundo nome sustentam melhor correspondencia sem confirmar identidade plena',()=>{
  assert.equal(match('PIX TRANSF ANA CRI15/06','Ana Cristina Damasceno').level,'dois_nomes_parciais');
  assert.equal(match('PIX BRUNA F','Bruna Fraga').level,'dois_nomes_parciais');
  assert.equal(match('PIX BRUNA F','Bruna Braga').level,'segundo_nome_divergente');
  assert.equal(match('PIX TAIZ CA','Taiz Caparica').level,'dois_nomes_parciais');
});
test('sobrenome omitido, apelido e primeiro nome abreviado pedem verificacao',()=>{
  assert.equal(match('PIX LEILA D','Leila').level,'sobrenome_ausente');
  assert.equal(match('PIX ZULEIDE','Zu').level,'apelido_sem_confirmacao');
  assert.equal(match('PIX ALESSAN','Alessandra Alves').level,'primeiro_nome_apenas');
  assert.equal(match('PIX ALEXAND','Alexandra').level,'primeiro_nome_apenas');
  assert.notEqual(audit.aliasFromMemo('PIX TRANSF ALESSAN02/03'),audit.aliasFromMemo('PIX TRANSF ALEXAND02/03'));
});
