import test from "node:test";
import assert from "node:assert/strict";
import {createTechnicalMode,validDuration,ABSENCE_MESSAGE} from "./technical-mode.mjs";
test("duration limits and message",()=>{assert.equal(validDuration(4),true);assert.equal(validDuration(0),false);assert.equal(validDuration(13),false);assert.match(ABSENCE_MESSAGE,/atendimento técnico/);});
test("contact capture uses persistent unique key and no body",async()=>{
 const calls=[];const pool={query:async(sql,params)=>{calls.push({sql,params});return {rowCount:1,rows:[]};}};
 const mode=createTechnicalMode(pool);
 assert.equal(await mode.capture("5521999999999"),true);
 assert.match(calls.at(-1).sql,/ON CONFLICT\(run_id,phone\)/);
 assert.deepEqual(calls.at(-1).params,["5521999999999"]);
 assert.match(calls.at(-1).sql,/active_until>now/);
});
test("inactive capture does not intercept",async()=>{const pool={query:async()=>({rowCount:0,rows:[]})};assert.equal(await createTechnicalMode(pool).capture("5521999999999"),false);});

test("manual reply starts or restarts per-contact pause and clears previous claim",async()=>{
 const calls=[];const pool={query:async(sql,params)=>{calls.push({sql,params});return {rowCount:1,rows:[]};}};
 await createTechnicalMode(pool).manual("5521999999999");
 assert.match(calls.at(-1).sql,/ON CONFLICT\(run_id,phone\) DO UPDATE SET responded_at=now\(\),attempted_at=NULL/);
 assert.deepEqual(calls.at(-1).params,["5521999999999"]);
});
test("resume requires an unanswered incoming message after the last manual reply and ten minutes",async()=>{
 const calls=[];const pool={query:async(sql)=>{calls.push(sql);return {rowCount:0,rows:[]};}};
 const mode=createTechnicalMode(pool);
 await mode.drain(()=>assert.fail("unexpected send"),()=>false);
 assert.match(calls.at(-1),/q.last_at>q.responded_at AND q.responded_at<=now\(\)-interval '10 minutes'/);
 await mode.nextDue();
 assert.match(calls.at(-1),/q.responded_at\+interval '10 minutes'/);
 assert.match(calls.at(-1),/q.last_at>q.responded_at/);
});
test("manual reply cancelling a claimed message prevents sending",async()=>{
 let checked=false;let claims=0;
 const pool={query:async(sql)=>{
  if(sql.startsWith("UPDATE wa_technical_waiting w"))return ++claims===1?{rowCount:1,rows:[{run_id:"r",phone:"5521999999999",claim_token:"2026-11-25 12:00:00+00"}]}:{rowCount:0,rows:[]};
  if(sql.startsWith("SELECT run_id"))return {rows:[{active:true,run_id:"r"}]};
  if(sql.startsWith("SELECT 1 FROM wa_technical_waiting")){checked=true;return {rowCount:0,rows:[]};}
  return {rowCount:1,rows:[]};
 }};
 await createTechnicalMode(pool).drain(()=>assert.fail("cancelled claim must not send"),()=>false);
 assert.equal(checked,true);
});
