import test from "node:test";
import assert from "node:assert/strict";
import {assignNumbers,chooseRandomNumbers,DrawError} from "./draw-allocation.mjs";

const ID = () => crypto.randomUUID();
import crypto from "node:crypto";

class FakePool {
  constructor(capacity=500,open=true) {
    this.state={campaign:{id:"split-inverter-9000-2026",total_numbers:capacity,registration_open:open},entries:[],allocations:[]};
    this.queue=Promise.resolve();
    this.failInsertAllocations=false;
  }
  async connect() {
    let unlock;
    const former=this.queue;
    this.queue=new Promise(resolve=>{unlock=resolve;});
    await former;
    let draft=structuredClone(this.state);
    let active=true;
    const query=async (sql,params=[])=>{
      if (/^BEGIN/.test(sql)) return {rows:[],rowCount:0};
      if (/^COMMIT/.test(sql)) {this.state=draft;active=false;unlock();return {rows:[],rowCount:0};}
      if (/^ROLLBACK/.test(sql)) {active=false;unlock();return {rows:[],rowCount:0};}
      if (sql.includes("FROM public.refrigeracao_draw_campaigns")) {
        return {rows: draft.campaign ? [draft.campaign] : [],rowCount: draft.campaign?1:0};
      }
      if (sql.includes("FROM public.refrigeracao_draw_entries WHERE")&&sql.includes("request_id")) {
        const found=draft.entries.filter(e=>e.campaign_id===params[0]&&e.request_id===params[1]);
        return {rows:found,rowCount:found.length};
      }
      if (sql.includes("FROM public.refrigeracao_draw_entries WHERE")&&sql.includes("phone_e164")) {
        const found=draft.entries.filter(e=>e.campaign_id===params[0]&&e.phone_e164===params[1]);
        return {rows:found,rowCount:found.length};
      }
      if (sql.includes("SELECT number FROM public.refrigeracao_draw_allocations")) {
        const found=draft.allocations.filter(x=>x.campaign_id===params[0]);
        return {rows:found,rowCount:found.length};
      }
      if (sql.includes("INSERT INTO public.refrigeracao_draw_entries")) {
        const [id,campaign_id,request_id,participant_name,phone_e164,requested_quantity,assigned_numbers]=params;
        if (draft.entries.some(e=>e.phone_e164===phone_e164||e.request_id===request_id)) {
          throw Object.assign(new Error("unique"),{code:"23505"});
        }
        const entry={id,campaign_id,request_id,participant_name,phone_e164,requested_quantity,assigned_numbers,created_at:new Date().toISOString()};
        draft.entries.push(entry);
        return {rows:[entry],rowCount:1};
      }
      if (sql.includes("INSERT INTO public.refrigeracao_draw_allocations")) {
        if(this.failInsertAllocations)throw new Error("injected database failure");
        const [campaign_id,numbers,entry_id]=params;
        for(const number of numbers) {
          if(draft.allocations.some(a=>a.campaign_id===campaign_id&&a.number===number))throw Object.assign(new Error("duplicate number"),{code:"23505"});
          draft.allocations.push({campaign_id,number,entry_id});
        }
        return {rows:[],rowCount:numbers.length};
      }
      throw new Error("unexpected query: "+sql);
    };
    return {query,release(){if(active){active=false;unlock();}}};
  }
}
function request(i,n=1) {
  const d=String(10000000+i).padStart(8,'0');
  return {name:"Pessoa Numero "+i,phone:"+55219"+d,quantity:n,requestId:ID()};
}

test("uniform pool sampling uses unique values and requested count",()=>{
 const numbers=chooseRandomNumbers(Array.from({length:50},(_,i)=>i+1),30,max=>max-1);
 assert.equal(numbers.length,30);
 assert.equal(new Set(numbers).size,30);
});
test("closed campaign cannot create registration",async()=>{
 const p=new FakePool(500,false);
 await assert.rejects(assignNumbers(p,request(1)),e=>e instanceof DrawError&&e.status===423);
 assert.equal(p.state.entries.length,0);
 assert.equal(p.state.allocations.length,0);
});
test("one number per registration committed exactly once",async()=>{
 const p=new FakePool();
 const item=request(2);
 const first=await assignNumbers(p,item);
 assert.equal(first.quantity,1);
 assert.equal(first.numbers.length,1);
 assert.equal(p.state.allocations.length,1);
 const retry=await assignNumbers(p,item);
 assert.equal(retry.repeated,true);
 assert.deepEqual(retry.numbers,first.numbers);
 assert.equal(p.state.entries.length,1);
});
test("duplicate phone with new request cannot collect more numbers",async()=>{
 const p=new FakePool();
 const first=request(3);
 await assignNumbers(p,first);
 await assert.rejects(assignNumbers(p,{...first,requestId:ID()}),e=>e.code==="ALREADY_REGISTERED");
 assert.equal(p.state.allocations.length,1);
});
test("simultaneous visitors get disjoint numbers",async()=>{
 const p=new FakePool();
 const results=await Promise.all(Array.from({length:10},(_,i)=>assignNumbers(p,request(i+10))));
 assert.equal(results.reduce((s,r)=>s+r.quantity,0),10);
 assert.equal(p.state.allocations.length,10);
 assert.equal(new Set(p.state.allocations.map(a=>a.number)).size,10);
});
test("insufficient remaining pool rolls back without partial registration",async()=>{
 const p=new FakePool(1);
 await assignNumbers(p,request(40));
 await assert.rejects(assignNumbers(p,request(41)),e=>e.code==="INSUFFICIENT_NUMBERS");
 assert.equal(p.state.entries.length,1);
 assert.equal(p.state.allocations.length,1);
});
test("database failure after creating registration rolls back entire transaction",async()=>{
 const p=new FakePool();
 p.failInsertAllocations=true;
 await assert.rejects(assignNumbers(p,request(50)),/injected database failure/);
 assert.equal(p.state.entries.length,0);
 assert.equal(p.state.allocations.length,0);
});
test("rejects all quantities other than one",async()=>{
 const p=new FakePool();
 for(const q of [0,-1,2,2.5,5,20,501,"nan"]) {
  await assert.rejects(assignNumbers(p,{...request(70),quantity:q}),e=>e.code==="INVALID_QUANTITY");
 }
 assert.equal(p.state.allocations.length,0);
});
