import test from "node:test";
import assert from "node:assert/strict";
import { connectRuntime } from "../utils/runtime-native";
import { loadCompanionSettings } from "../utils/companion-settings";

const grant = "a".repeat(64);
const config = () => ({ kind: "acu-tapnow-companion", schema: 1, apiKey: "sk-native-isolated-fixture", settings: {
  llmBaseUrl: "https://acu.best/v1", llmProtocol: "responses", llmModel: "acu-auto"
} });
const storage = () => {
  const data: Record<string, any> = { teamRule: "preserve" };
  return { data, get: async () => ({ ...data }), set: async (value: Record<string, any>) => { Object.assign(data, value); } };
};
test("native connection commits credentials locally and acknowledges only after readback", async () => {
  const local = storage();
  const runtime = { getManifest: () => ({version:"0.1.23"}), sendNativeMessage: async (host: string, msg: any) => {
    assert.equal(host,"com.acucompute.tapnow");
    if (msg.action === "connect") return {ok:true,grant,config:config()};
    assert.equal(local.data.apiKey,config().apiKey);assert.deepEqual(local.data.runtimeConnection.settings,config().settings);
    assert.equal(msg.success,true);return {ok:true};
  }};
  await connectRuntime("companion",runtime,local);
  assert.equal(local.data.teamRule,"preserve");assert.equal(local.data.runtimePendingReceipt,null);
  const loaded = await loadCompanionSettings({local:{get:async defaults=>({...defaults,...local.data}),set:local.set},sync:{get:async defaults=>({...defaults,requiredTerms:["team"]}),set:async()=>{throw Error("managed config must not sync")}}});
  assert.equal(loaded.settings.llmBaseUrl,"https://acu.best/v1");assert.equal(loaded.apiKey,config().apiKey);assert.deepEqual(loaded.settings.requiredTerms,["team"]);
});
test("backup never accepts a credential and failed readback sends negative receipt", async () => {
  for(const edition of ["backup","companion"] as const){
    const local=storage();let failed=false;
    const runtime={getManifest:()=>({version:"0.1.23"}),sendNativeMessage:async(_host:string,msg:any)=>{
      if(msg.action==="connect")return {ok:true,grant,config:config()};
      failed=msg.success===false;return {ok:true};
    }};
    if(edition==="companion")local.get=async()=>({});
    await assert.rejects(()=>connectRuntime(edition,runtime,local));assert.equal(failed,true);
  }
});
test("lost receipt can retry without claiming another key; no waiting grant causes no writes",async()=>{
  const local=storage();local.data.runtimePendingReceipt={grant,version:"0.1.23"};local.data.apiKey=config().apiKey;local.data.runtimeConnection={settings:config().settings};let calls=0;
  await connectRuntime("companion",{getManifest:()=>({version:"0.1.23"}),sendNativeMessage:async(_host,msg:any)=>{calls++;assert.equal(msg.action,"ack");return {ok:true};}},local);
  assert.equal(calls,1);assert.equal(local.data.apiKey,config().apiKey);
  const clean=storage();await assert.rejects(()=>connectRuntime("companion",{getManifest:()=>({version:"0.1.23"}),sendNativeMessage:async()=>({ok:false,error:"no grant"})},clean));
  assert.deepEqual(clean.data,{teamRule:"preserve"});
});

test("another connection page can confirm only existing valid local configuration",async()=>{
  const local=storage();local.data.apiKey=config().apiKey;local.data.runtimeConnection={version:"0.1.23",settings:config().settings,grant};
  const runtime={getManifest:()=>({version:"0.1.23"}),sendNativeMessage:async()=>({ok:true,confirmed:true,grant})};
  await connectRuntime("companion",runtime,local);
  delete local.data.apiKey;
  await assert.rejects(()=>connectRuntime("companion",runtime,local));
});

test("Chrome storage may reorder JSON keys without changing the saved configuration",async()=>{
  const local=storage();const get=local.get;
  local.get=async()=>{const value=await get();if(value.runtimeConnection){const s=value.runtimeConnection.settings;value.runtimeConnection={...value.runtimeConnection,settings:{llmModel:s.llmModel,llmProtocol:s.llmProtocol,llmBaseUrl:s.llmBaseUrl}}}return value};
  await connectRuntime("companion",{getManifest:()=>({version:"0.1.23"}),sendNativeMessage:async(_host,msg:any)=>msg.action==="connect"?{ok:true,grant,config:config()}:{ok:msg.success}},local);
});

test("lost acknowledgement resumes the original grant when Runtime still has a saving connection",async()=>{
 const local=storage();local.data.runtimePendingReceipt={grant,version:"0.1.30"};local.data.apiKey=config().apiKey;
 local.data.runtimeConnection={settings:config().settings};const messages:any[]=[];
 await connectRuntime("companion",{getManifest:()=>({version:"0.1.30"}),sendNativeMessage:async(_,msg:any)=>{
  messages.push(msg);
  if(messages.length===1)return {ok:false,error:"receipt not confirmed"};
  if(msg.action==="connect"){assert.equal(msg.grant,grant);return {ok:true,grant,config:config()};}
  return {ok:true};
 }},local);
 assert.deepEqual(messages.map(msg=>msg.action),["ack","connect","ack"]);
 assert.equal(local.data.runtimePendingReceipt,null);
});
