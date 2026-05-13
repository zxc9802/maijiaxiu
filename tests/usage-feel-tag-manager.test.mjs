import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const clientSource = readFileSync(resolve('app/buyer-show/BuyerShowAgentClient.tsx'), 'utf8');
const html = readFileSync(resolve('index.html'), 'utf8');

assert.match(
  clientSource,
  /<TagManager[\s\S]*title="使用感"[\s\S]*inputLabel="自定义使用感"/,
  'usage feel should render through the same TagManager pattern as claims and skin types',
);

assert.ok(clientSource.includes('fixedUsageFeels'), 'usage feel should have reusable fixed tags');
assert.ok(clientSource.includes('usageFeelInput'), 'usage feel should have a custom tag input state');
assert.ok(clientSource.includes('saveUsageFeelAsFixed'), 'usage feel should support saving custom entries as fixed tags');

assert.ok(
  !clientSource.includes('<input onChange={(event) => setUsageFeel(event.target.value)} value={usageFeel} />'),
  'usage feel should not render as a plain text input',
);

for (const text of [
  'data-tag-group="usage-feels"',
  'data-fixed-tag-list="usage-feels"',
  'data-custom-tag-input="usage-feels"',
  'data-save-fixed-toggle="usage-feels"',
  'buyerShow.fixedTags.usageFeels',
]) {
  assert.ok(html.includes(text), `static prototype should include ${text}`);
}
