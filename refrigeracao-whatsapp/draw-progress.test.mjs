import test from "node:test";
import assert from "node:assert/strict";
import {createDrawRoute} from "./draw-route.mjs";

const ORIGIN="https://headless-fzouiqsvegf-leoadminr2-140a.wix-site-host.com";
function harness({enabled=true,open=true,total=1000,distributed=320,origin=ORIGIN}={}){
  let queried=0;
  let last=null;
  const route=createDrawRoute({
    pool:{query:async()=>{queried++;return {rows:[{total_numbers:total,registration_open:open,distributed}]};}},
    readBody:async()=>Buffer.from("{}"),
    json:(res,status,body)=>{last={status,body}},
    enabled,
    turnstileSecret:""
  });
  const req={method:"GET",headers:{origin}};
  const res={headers:{},setHeader(k,v){this.headers[k]=v},writeHead(){},end(){}};
  const run=async()=>{const handled=await route(req,res,new URL("https://api.example.com/api/draw/progress"));return {handled,queried,last,headers:res.headers};};
  return {run};
}
test("open campaign exposes only remaining percentage, no total, no PII",async()=>{
 const result=await harness().run();
 assert.equal(result.handled,true);
 assert.deepEqual(result.last,{status:200,body:{open:true,remainingPercent:68}});
 assert.deepEqual(Object.keys(result.last.body),["open","remainingPercent"]);
 assert.equal(result.headers["Access-Control-Allow-Origin"],ORIGIN);
});
test("disabled backend returns only closed status, never touches database",async()=>{
 const result=await harness({enabled:false}).run();
 assert.equal(result.queried,0);
 assert.deepEqual(result.last,{status:200,body:{open:false,remainingPercent:null}});
});
test("closed campaign hides percentage",async()=>{
 const result=await harness({enabled:true,open:false}).run();
 assert.deepEqual(result.last,{status:200,body:{open:false,remainingPercent:null}});
});
test("no availability returns 0 percent",async()=>{
 const result=await harness({total:1000,distributed:1000}).run();
 assert.equal(result.last.body.remainingPercent,0);
});
test("invalid other origin is rejected",async()=>{
 const result=await harness({origin:"https://other.example"}).run();
 assert.equal(result.last.status,403);
});
