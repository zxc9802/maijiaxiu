import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';

const path = resolve('lib/buyer-show/usage-monitor.ts');
test('OpenLux usage reporter exists', () => assert.ok(existsSync(path), 'metadata-only usage reporter is missing'));
if (existsSync(path)) {
 const m = await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(readFileSync(path, 'utf8'))).toString('base64'));
 test('hostname only; missing, zero, image and cache usage', () => {
  assert.equal(m.isOpenLux('https://api.openlux.ai/v1'), true);
  for (const url of ['https://yunwu.ai/v1', 'https://api.openlux.ai.evil.test/v1', 'https://yunwu.ai/api.openlux.ai', 'invalid']) assert.equal(m.isOpenLux(url), false);
  assert.equal(m.parseUsage({}).inputTokens, null);
  assert.equal(m.parseUsage({}).tokenBasis, 'missing');
  const u=m.parseUsage({usage:{input_tokens:0,output_tokens:0,input_tokens_details:{cached_tokens:0,image_tokens:0}}});
  assert.equal(u.inputTokens,0); assert.equal(u.totalTokens,0); assert.equal(u.imageInputTokens,0); assert.equal(u.tokenBasis,'reported');
  const v=m.parseUsage({usage:{prompt_tokens:100,completion_tokens:20,prompt_tokens_details:{cached_tokens:40,image_tokens:35},completion_tokens_details:{reasoning_tokens:10}}});
  assert.equal(v.totalTokens,120); assert.equal(v.cachedInputTokens,40); assert.equal(v.imageInputTokens,35); assert.equal(v.reasoningTokens,10);
  const gemini=m.parseUsage({usageMetadata:{promptTokenCount:80,candidatesTokenCount:5,thoughtsTokenCount:3,promptTokensDetails:[{modality:'IMAGE',tokenCount:50}]}});
  assert.equal(gemini.imageInputTokens,50); assert.equal(gemini.outputTokens,8); assert.equal(gemini.totalTokens,88);
  assert.equal(m.parseUsage({usage:{prompt_tokens:10,completion_tokens:5,total_tokens:99}}).totalTokens,15);
 });
 test('durable retry, per attempt IDs, verified user isolation and metadata-only storage', async () => {
  const dir=await mkdtemp(join(tmpdir(),'buyer-usage-'));
  const old={...process.env}; const oldFetch=globalThis.fetch; const delivered=[];
  Object.assign(process.env,{MAIN_APP_URL:'https://main.test',USAGE_MONITOR_INTERNAL_SECRET:'private-report-secret',USAGE_MONITOR_OUTBOX_DIR:dir});
  globalThis.fetch=async()=>{throw Error('offline')};
  try {
   let calls=0;
   const complete=async()=>{calls++; return {ok:true,status:200,body:JSON.stringify({data:[{b64_json:'PRIVATE_IMAGE'}],prompt:'PRIVATE_PROMPT'})};};
   await m.withUsageUser({userId:'unverified'},()=>m.trackProviderRequest('https://api.openlux.ai/v1','gpt-image-2',complete));
   await m.withUsageUser({userId:'employee-a',ssoVerified:true},()=>m.trackProviderRequest('https://yunwu.ai/v1','openlux-model',complete));
   assert.equal((await readdir(dir)).length,0);
   await Promise.all(['employee-a','employee-b'].map(userId=>m.withUsageUser({userId,ssoVerified:true},async()=>{
    await m.trackProviderRequest('https://api.openlux.ai/v1/images/generations','gpt-image-2',complete);
    await assert.rejects(m.trackProviderRequest('https://api.openlux.ai/v1/chat/completions','gemini',async()=>{throw Error('PRIVATE_KEY')}));
   })));
   const files=await readdir(dir); assert.equal(files.length,8);
   const events=await Promise.all(files.map(f=>readFile(join(dir,f),'utf8')));
   assert.ok(events.every(s=>!s.includes('PRIVATE_')&&!s.includes('private-report-secret')));
   const terminal=events.map(JSON.parse).filter(e=>e.status!=='pending');
   assert.equal(new Set(terminal.map(e=>e.requestId)).size,4);
   assert.equal(terminal.filter(e=>e.userId==='employee-a').length,2);
   assert.equal(terminal.filter(e=>e.userId==='employee-b').length,2);
   assert.ok(terminal.filter(e=>e.status==='completed').every(e=>e.inputTokens===null&&e.tokenBasis==='missing'));
   for (const body of ['{"success":false}', '<html>Sign in</html>', '{}']) {
    globalThis.fetch=async()=>new Response(body,{status:200});
    await m.drainUsageOutbox();
    assert.equal((await readdir(dir)).length,8,'unacknowledged events must remain');
   }
   globalThis.fetch=async(url,init)=>{assert.equal(url,'https://main.test/api/sso/usage');assert.equal(init.headers['x-usage-tool'],'maijiaxiu');delivered.push(JSON.parse(init.body));return new Response('{"success":true}',{status:200});};
   await m.drainUsageOutbox(); await m.drainUsageOutbox();
   assert.equal((await readdir(dir)).length,0);
   assert.deepEqual(new Set(delivered.map(e=>e.requestId)),new Set(terminal.map(e=>e.requestId)));
   assert.equal(calls,4);
  } finally {globalThis.fetch=oldFetch; for(const k of ['MAIN_APP_URL','USAGE_MONITOR_INTERNAL_SECRET','USAGE_MONITOR_OUTBOX_DIR']){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}await rm(dir,{recursive:true,force:true});}
 });
 test('async accepted response remains pending; completed stream captures usage', () => {
  assert.equal(m.parseProviderResponse({status:202,body:'{"id":"task-1"}'}).status,'pending');
  assert.equal(m.parseProviderResponse({status:200,body:'data: {"type":"image_generation.partial_image","b64_json":"PARTIAL"}\n\n'}).status,'interrupted');
  const parsed=m.parseProviderResponse({status:200,body:'data: {"type":"image_generation.completed","b64_json":"SECRET","usage":{"input_tokens":8,"output_tokens":4}}\n\ndata: [DONE]\n\n'});
  assert.equal(parsed.status,'completed'); assert.equal(parsed.usage.totalTokens,12);
 });
}
