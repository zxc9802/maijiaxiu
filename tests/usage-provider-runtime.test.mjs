import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';

const url = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const usageUrl = url(stripTypeScriptTypes(readFileSync('lib/buyer-show/usage-monitor.ts', 'utf8')));
const usage = await import(usageUrl);
const configUrl = url(`export const providerConfig = {textBaseUrl:'https://api.openlux.ai/v1',textApiKey:'FAKE',textModel:'gemini',imageBaseUrl:'https://api.openlux.ai/v1',imageApiKey:'FAKE',imageModel:'gpt-image-2',imageSize:'1024x1024',xaiImageBaseUrl:'https://yunwu.ai/v1',xaiImageApiKey:'FAKE',xaiImageModel:'gpt-image-2'}; export const requireProviderSecret = v => v;`);
const httpsUrl = url(`import {EventEmitter} from 'node:events'; export function request(options, callback) { globalThis.usageHttp1Calls++; const req = new EventEmitter(); req.setTimeout=()=>{}; req.write=()=>{}; req.end=()=>{const res = new EventEmitter(); res.statusCode=200;res.setEncoding=()=>{};callback(res);queueMicrotask(()=>{res.emit('data',JSON.stringify({choices:[{message:{content:'fallback result'}}],usage:{prompt_tokens:3,completion_tokens:2}}));res.emit('end');});};return req;}`);
async function load(file) {
  return import(url(stripTypeScriptTypes(readFileSync(`lib/buyer-show/${file}`, 'utf8')).replaceAll("'./usage-monitor'", JSON.stringify(usageUrl)).replaceAll("'./provider-config'", JSON.stringify(configUrl)).replaceAll("'node:https'", JSON.stringify(httpsUrl))));
}

test('actual fetch, HTTP/1 fallback and multipart image attempts are independently recorded', async () => {
  const directory=await mkdtemp(join(tmpdir(),'buyer-adapters-'));
  const old={...process.env}; const oldFetch=globalThis.fetch;
  Object.assign(process.env,{MAIN_APP_URL:'https://main.test',USAGE_MONITOR_INTERNAL_SECRET:'secret',USAGE_MONITOR_OUTBOX_DIR:directory});
  globalThis.usageHttp1Calls=0;
  let upstreamCalls=0;
  globalThis.fetch=async (url,init) => {
    if(String(url).startsWith('https://main.test')) throw Error('reporting offline');
    upstreamCalls++;
    if(String(url).includes('/chat/completions')) throw Error('fetch transport failed');
    assert.ok(init.body instanceof FormData);
    return Response.json({data:[{b64_json:'PRIVATE_IMAGE'}],usage:{input_tokens:6,output_tokens:1,input_tokens_details:{image_tokens:4}}});
  };
  try {
    const text=await load('text-provider.ts'); const images=await load('image-provider.ts');
    await usage.withUsageUser({userId:'employee-a',ssoVerified:true},async()=>{
      assert.equal(await text.createChatCompletion([{role:'user',content:'PRIVATE_PROMPT'}]),'fallback result');
      await images.generateBuyerShowImage({prompt:'PRIVATE_PROMPT',imageUrls:['data:image/png;base64,aGVsbG8=']});
    });
    const events=await Promise.all((await readdir(directory)).filter(f=>f.endsWith('-1.json')).map(async f=>JSON.parse(await readFile(join(directory,f),'utf8'))));
    assert.equal(upstreamCalls,2); assert.equal(globalThis.usageHttp1Calls,1);
    assert.equal(events.length,3); assert.equal(new Set(events.map(e=>e.requestId)).size,3);
    assert.equal(events.filter(e=>e.status==='failed').length,1);
    assert.ok(events.some(e=>e.imageInputTokens===4));
    assert.ok(events.every(e=>e.userId==='employee-a'));
  } finally {globalThis.fetch=oldFetch;delete globalThis.usageHttp1Calls;for(const k of ['MAIN_APP_URL','USAGE_MONITOR_INTERNAL_SECRET','USAGE_MONITOR_OUTBOX_DIR']){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}await rm(directory,{recursive:true,force:true});}
});
