import test from "node:test";
import assert from "node:assert/strict";
import { bindRuntimePopup } from "../utils/runtime-popup";

test("popup connects locally without tabs or URL navigation, retries, and never claims failed save", async () => {
  const old = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable:true, value:{locks:{request:async (_name:string,fn:()=>unknown)=>fn()}} });
  try {
    const events: Record<string,()=>void> = {};
    const button = {disabled:false,addEventListener:(event:string,fn:()=>void)=>{events[event]=fn;}};
    const status = {textContent:"",dataset:{state:""}};
    const data: Record<string,any> = {};
    let available = false, claims = 0, saved = 0;
    const runtime = {getManifest:()=>({version:"0.1.25"}),sendNativeMessage:async (_host:string,msg:any)=>{
      if (!available) return {ok:false,error:"no grant"};
      if (msg.action === "connect") {
        claims++;
        return {ok:true,grant:"a".repeat(64),config:{kind:"acu-tapnow-companion",schema:1,apiKey:"sk-popup-fixture",settings:{llmBaseUrl:"https://console.acucompute.com/v1",llmProtocol:"responses",llmModel:"gpt-6.1-sol"}}};
      }
      assert.equal(data.apiKey,"sk-popup-fixture");
      return {ok:true};
    }};
    bindRuntimePopup(button as unknown as HTMLButtonElement,status as unknown as HTMLElement,"companion",runtime,
      {get:async()=>({...data}),set:async value=>{Object.assign(data,value);}},async()=>{saved++;});
    const settle=()=>new Promise(resolve=>setImmediate(resolve));
    await settle();
    assert.match(status.textContent,/no grant/);assert.match(status.textContent,/副驾驶/);assert.match(status.textContent,/重新连接/);assert.equal(button.disabled,false);assert.equal(saved,0);
    assert.equal(status.dataset.state,"error");
    available=true;events.click();events.click();
    await settle();
    assert.equal(claims,1,"ignore double clicks while native save is running");
    assert.equal(saved,1);assert.match(status.textContent,/已连接/);assert.equal(button.disabled,false);
    assert.equal(status.dataset.state,"success");
    assert.equal(Object.keys(events).length,1,"only a local click handler, no navigation hooks");
  } finally {
    if (old) Object.defineProperty(globalThis,"navigator",old); else Reflect.deleteProperty(globalThis,"navigator");
  }
});

test("saved companion remains usable when Runtime authorization expires without claiming connection", async () => {
  const old = Object.getOwnPropertyDescriptor(globalThis,"navigator");
  Object.defineProperty(globalThis,"navigator",{configurable:true,value:{locks:{request:async (_:string,fn:()=>unknown)=>fn()}}});
  try {
    const data = {apiKey:"fixture-key",runtimeConnection:{settings:{llmBaseUrl:"https://acu.best/v1",llmProtocol:"responses",llmModel:"gpt-6.1-sol"}}};
    let connected = 0;
    const status = {textContent:"",dataset:{state:""}};
    bindRuntimePopup({disabled:false,addEventListener:()=>{}} as any,status as any,"companion",
      {getManifest:()=>({version:"0.1.30"}),sendNativeMessage:async()=>{throw Error("本机授权已过期");}},
      {get:async()=>data,set:async()=>{throw Error("must not rewrite saved credentials");}},async()=>{connected++;});
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(connected,1);assert.match(status.textContent,/本机配置已保存/);assert(!status.textContent.startsWith("已连接"));
    assert.equal(status.dataset.state,"saved");
  } finally {if(old)Object.defineProperty(globalThis,"navigator",old);else Reflect.deleteProperty(globalThis,"navigator");}
});
