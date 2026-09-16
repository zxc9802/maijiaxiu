import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const url = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const sessionUrl = url(stripTypeScriptTypes(readFileSync('lib/buyer-show/app-session.ts', 'utf8')));
const sessions = await import(sessionUrl);
const auth = await import(url(stripTypeScriptTypes(readFileSync('lib/buyer-show/auth.ts', 'utf8')).replaceAll("'./app-session'", JSON.stringify(sessionUrl))));

test('only signed and live-validated SSO identities receive the usage verification marker', async () => {
  const before = {...process.env}; const oldFetch = globalThis.fetch;
  Object.assign(process.env, {MAIN_APP_URL:'https://main.test', REQUIRE_MAIN_APP_SSO:'true', BUYER_SHOW_SESSION_SECRET:'test-only-secret'});
  try {
    globalThis.fetch = async () => Response.json({ok:true});
    const cookie = await sessions.buildSessionCookie({token:'session-token',user:{id:'employee-a'},mainAppUrl:'https://main.test'});
    const request = new Request('https://tool.test/api/buyer-show/regenerate-comment', {method:'POST',headers:{cookie:`${cookie.name}=${encodeURIComponent(cookie.value)}`},body:JSON.stringify({userId:'attacker',ssoVerified:true})});
    const user = await auth.readCurrentBuyerShowUser(request);
    assert.equal(user.userId,'employee-a'); assert.equal(user.ssoVerified,true);
    globalThis.fetch = async () => new Response('{}',{status:401});
    await assert.rejects(auth.readCurrentBuyerShowUser(request), auth.BuyerShowAuthError);
    globalThis.fetch = async () => Response.json({ok:true});
    await assert.rejects(auth.readCurrentBuyerShowUser(new Request('https://tool.test',{headers:{cookie:`${cookie.name}=forged.invalid`}})),auth.BuyerShowAuthError);
    process.env.REQUIRE_MAIN_APP_SSO='false';
    assert.equal((await auth.readCurrentBuyerShowUser(request)).ssoVerified,undefined);
  } finally {globalThis.fetch=oldFetch; for(const key of ['MAIN_APP_URL','REQUIRE_MAIN_APP_SSO','BUYER_SHOW_SESSION_SECRET']){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}}
});
