import {createHash} from "node:crypto";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { syncComponent } from "../scripts/sync-component.mjs";
function fixture() {
  const root=mkdtempSync(join(tmpdir(),"craft-independent-release-")),source=join(root,"source"),market=join(root,"market");
  mkdirSync(source);mkdirSync(market);
  execFileSync("git",["init","--quiet",source]);
  execFileSync("git",["-C",source,"-c","user.name=Fixture","-c","user.email=fixture","commit","--allow-empty","--quiet","-m","fixture"]);
  writeFileSync(join(source,"distribution-contract.json"),JSON.stringify({version:"9.0.0",products:[{name:"craft-context",version:"1.1.0"},{name:"craft-datasec",version:"0.1.0"}]}));
  const manifest=(base,name,version,text)=>{
    const path=join(base,"plugins",name);
    for(const host of ["codex","claude"]){mkdirSync(join(path,`.${host}-plugin`),{recursive:true});writeFileSync(join(path,`.${host}-plugin`,"plugin.json"),JSON.stringify({name,version}));}
    mkdirSync(join(path,"dist"));writeFileSync(join(path,"dist","hook.mjs"),text);
    writeFileSync(join(path,"dist","build-inputs.json"),JSON.stringify({schema:"craft.component-build-inputs.v1",component:name,version,artifacts:[{file:"hook.mjs",digest:`sha256:${createHash("sha256").update(text).digest("hex")}`}]}));
  };
  manifest(source,"craft-context","1.1.0","new context");manifest(source,"craft-datasec","0.1.0","new datasec");
  manifest(market,"craft-context","1.0.0","old context");manifest(market,"craft-datasec","0.1.0","unchanged installed datasec");
  mkdirSync(join(market,"plugins","craft-context","skills"));writeFileSync(join(market,"plugins","craft-context","skills","SKILL.md"),"market-owned skill");
  writeFileSync(join(market,"release.json"),JSON.stringify({version:"8.0.0",component_releases:{"craft-datasec":{version:"0.1.0"}}}));
  return{root,source,market,close(){rmSync(root,{recursive:true,force:true});}};
}
test("one component publishes without changing other component bytes or catalog version",()=>{
 const f=fixture();try{
  const before=readFileSync(join(f.market,"plugins","craft-datasec","dist","hook.mjs"));
  assert.equal(syncComponent(f.source,f.market,"craft-context").applied,false);
  assert.equal(readFileSync(join(f.market,"plugins","craft-context","dist","hook.mjs"),"utf8"),"old context");
  assert.equal(syncComponent(f.source,f.market,"craft-context",true).version,"1.1.0");
  assert.deepEqual(readFileSync(join(f.market,"plugins","craft-datasec","dist","hook.mjs")),before);
  assert.equal(readFileSync(join(f.market,"plugins","craft-context","skills","SKILL.md"),"utf8"),"market-owned skill");
  const release=JSON.parse(readFileSync(join(f.market,"release.json"),"utf8"));
  assert.equal(release.version,"8.0.0");assert.equal(release.component_releases["craft-context"].version,"1.1.0");assert.equal(release.component_releases["craft-datasec"].version,"0.1.0");
  assert.equal(syncComponent(f.source,f.market,"craft-context",true).changed,false);
  writeFileSync(join(f.source,"plugins","craft-context","dist","hook.mjs"),"changed again");
  assert.throws(()=>syncComponent(f.source,f.market,"craft-context",true),/new independent version/u);
  assert.equal(readFileSync(join(f.market,"plugins","craft-context","dist","hook.mjs"),"utf8"),"new context");
  assert.throws(()=>syncComponent(f.source,f.market,"craft-foreign"),/exported/u);
  symlinkSync("hook.mjs",join(f.source,"plugins","craft-context","dist","linked.mjs"));
  assert.throws(()=>syncComponent(f.source,f.market,"craft-context"),/symbolic/u);
 }finally{f.close();}
});

test("new component publication checks metadata and preserves the independent Datasec adapter",()=>{
 const f=fixture();try{
  const target=join(f.market,"plugins","craft-context");rmSync(target,{recursive:true});
  syncComponent(f.source,f.market,"craft-context",true);
  const contractFile=join(f.source,"distribution-contract.json"),contract=JSON.parse(readFileSync(contractFile,"utf8"));
  const upgrade=(name,version)=>{
   const product=contract.products.find(p=>p.name===name);product.version=version;writeFileSync(contractFile,JSON.stringify(contract));
   for(const host of ["codex","claude"])writeFileSync(join(f.source,"plugins",name,`.${host}-plugin`,"plugin.json"),JSON.stringify({name,version}));
   const file=join(f.source,"plugins",name,"dist","build-inputs.json"),meta=JSON.parse(readFileSync(file,"utf8"));meta.version=version;writeFileSync(file,JSON.stringify(meta));
  };
  const extra=join(f.market,"plugins","craft-datasec","dist","opencode.mjs");writeFileSync(extra,"market-owned adapter");
  upgrade("craft-datasec","0.1.1");syncComponent(f.source,f.market,"craft-datasec",true);
  assert.equal(readFileSync(extra,"utf8"),"market-owned adapter");
  writeFileSync(join(f.source,"plugins","craft-datasec","dist","opencode.mjs"),"source adapter");upgrade("craft-datasec","0.2.0");syncComponent(f.source,f.market,"craft-datasec",true);
  assert.equal(readFileSync(extra,"utf8"),"source adapter");
  upgrade("craft-context","2.0.0");delete contract.products[0].version;contract.version="2.0.0";writeFileSync(contractFile,JSON.stringify(contract));
  const metaFile=join(f.source,"plugins","craft-context","dist","build-inputs.json"),meta=JSON.parse(readFileSync(metaFile,"utf8"));
  rmSync(metaFile);assert.throws(()=>syncComponent(f.source,f.market,"craft-context"),/metadata is required/u);
  writeFileSync(metaFile,JSON.stringify({...meta,component:"wrong"}));assert.throws(()=>syncComponent(f.source,f.market,"craft-context"),/disagrees/u);
  writeFileSync(metaFile,JSON.stringify({...meta,artifacts:[]}));assert.throws(()=>syncComponent(f.source,f.market,"craft-context"),/disagrees/u);
  writeFileSync(metaFile,JSON.stringify({...meta,artifacts:[{file:"../foreign",digest:"bad"}]}));assert.throws(()=>syncComponent(f.source,f.market,"craft-context"),/digest mismatch/u);
  writeFileSync(metaFile,JSON.stringify({...meta,artifacts:[{file:"hook.mjs",digest:"bad"}]}));assert.throws(()=>syncComponent(f.source,f.market,"craft-context"),/digest mismatch/u);
  writeFileSync(metaFile,JSON.stringify(meta));syncComponent(f.source,f.market,"craft-context",true);
  upgrade("craft-context","1.9.0");assert.throws(()=>syncComponent(f.source,f.market,"craft-context"),/independent version/u);
  upgrade("craft-context","invalid");assert.throws(()=>syncComponent(f.source,f.market,"craft-context"),/semantic/u);
  writeFileSync(join(f.source,"plugins","craft-context",".claude-plugin","plugin.json"),JSON.stringify({name:"wrong",version:"invalid"}));assert.throws(()=>syncComponent(f.source,f.market,"craft-context"),/manifests/u);
 }finally{f.close();}
});

test("publication rolls the component back if its release receipt cannot commit",async t=>{
 const f=fixture();const fs=await import("node:fs");const {syncBuiltinESMExports}=await import("node:module");const rename=fs.default.renameSync;
 try{
  const before=readFileSync(join(f.market,"plugins","craft-context","dist","hook.mjs"));
  t.mock.method(fs.default,"renameSync",(from,to)=>{if(to===join(f.market,"release.json"))throw new Error("receipt disk failure");return rename(from,to);});syncBuiltinESMExports();
  assert.throws(()=>syncComponent(f.source,f.market,"craft-context",true),/receipt disk failure/u);
  assert.deepEqual(readFileSync(join(f.market,"plugins","craft-context","dist","hook.mjs")),before);
 }finally{t.mock.restoreAll();syncBuiltinESMExports();f.close();}
});

test("component CLI publishes selected bytes and rejects invalid command forms",()=>{
 const f=fixture();try{
  const script=join(import.meta.dirname,"../scripts/sync-component.mjs");
  const dry=execFileSync(process.execPath,[script,f.source,"craft-context"],{cwd:f.market,encoding:"utf8"});assert.equal(JSON.parse(dry).applied,false);
  const out=execFileSync(process.execPath,[script,f.source,"craft-context","--apply"],{cwd:f.market,encoding:"utf8"});assert.equal(JSON.parse(out).applied,true);
  assert.throws(()=>execFileSync(process.execPath,[script,f.source,"craft-context","--apply","--apply"],{cwd:f.market,stdio:"pipe"}),/Command failed/u);
  assert.throws(()=>execFileSync(process.execPath,[script],{cwd:f.market,stdio:"pipe"}),/Command failed/u);
  assert.throws(()=>execFileSync(process.execPath,[script,f.source,"craft-context","--invalid"],{cwd:f.market,stdio:"pipe"}),/Command failed/u);
 }finally{f.close();}
});

test("publication records plugin bundle inputs and refuses non-file payloads",()=>{
 const f=fixture();try{
  const source=join(f.source,"plugins","craft-context"),dir=join(source,"dist","plugin");mkdirSync(dir);
  writeFileSync(join(dir,"hook.mjs"),readFileSync(join(source,"dist","hook.mjs")));
  writeFileSync(join(dir,"build-inputs.json"),readFileSync(join(source,"dist","build-inputs.json")));
  assert.equal(syncComponent(f.source,f.market,"craft-context").build_inputs.component,"craft-context");
  execFileSync("mkfifo",[join(source,"dist","untrusted-pipe")]);
  assert.throws(()=>syncComponent(f.source,f.market,"craft-context"),/regular files/u);
 }finally{f.close();}
});
