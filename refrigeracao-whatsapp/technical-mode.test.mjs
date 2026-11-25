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
