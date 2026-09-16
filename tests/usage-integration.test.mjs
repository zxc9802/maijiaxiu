import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

test('all actual request adapters and verified job/user entry points carry usage', () => {
  for (const file of ['text-provider.ts', 'image-provider.ts']) {
    const source = readFileSync(`lib/buyer-show/${file}`, 'utf8');
    assert.ok(source.includes('trackProviderRequest'), `${file} must meter each HTTP attempt`);
    assert.ok(source.includes('() => requestJsonOverHttp1'), 'fallback must have a separate metered attempt');
  }
  const jobs = readFileSync('lib/buyer-show/generation-job-store.ts', 'utf8');
  assert.ok(jobs.includes('withUsageUser') && jobs.includes('claimedJob.userId') && jobs.includes('ssoVerified'), 'background jobs restore trusted owner attribution');
  const auth = readFileSync('lib/buyer-show/auth.ts', 'utf8');
  assert.ok(auth.includes('ssoVerified: true'), 'live SSO users must be explicitly verified');
  for (const route of ['regenerate-comment', 'regenerate-image', 'compliance-check']) {
    const source = readFileSync(`app/api/buyer-show/${route}/route.ts`, 'utf8');
    assert.ok(source.includes('withUsageUser(user,'), `${route} must use its verified user`);
  }
});
