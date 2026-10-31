'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const audit=require('../nominal-audit.js');
const roster=[
 {name:'Ana Cristina Modelo'},{name:'Ana Paula Um'},{name:'Ana Paula Dois'},
 {name:'Bruna Flores'},{name:'Bruna Barros'},{name:'Lia'},
 {name:'Alessa Modelo'},{name:'Alexanda Modelo'},{name:'Mia'},{name:'Taiz Camila'}
];
const result=(memo,name)=>audit.check(memo,{name},roster);
test('primeiro nome e prefixo do segundo ajudam a desambiguar sem afirmar identidade',()=>{
 assert.equal(result('PIX TRANSF ANA CRI15/06','Ana Cristina Modelo').level,'dois_nomes_parciais');
 assert.equal(result('PIX BRUNA F','Bruna Flores').level,'dois_nomes_parciais');
 assert.equal(result('PIX BRUNA F','Bruna Barros').level,'segundo_nome_divergente');
 assert.equal(result('PIX TAIZ CA','Taiz Camila').level,'dois_nomes_parciais');
});
test('sobrenome ausente ou apelido exigem comprovante civil',()=>{
 assert.equal(result('PIX LIA S','Lia').level,'sobrenome_ausente');
 assert.equal(result('PIX MIABELA','Mia').level,'apelido_sem_confirmacao');
 assert.equal(result('PIX ALESSA','Alessa Modelo').level,'primeiro_nome_apenas');
 assert.equal(result('PIX ALEXAN','Alexanda Modelo').level,'primeiro_nome_apenas');
});
test('primeiro nome menor nao deve engolir outro nome maior',()=>{
 assert.equal(audit.check('PIX JULIANA',{name:'Julian'},[{name:'Julian'}]).level,'nome_divergente');
});
