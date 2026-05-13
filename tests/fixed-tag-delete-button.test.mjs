import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const clientSource = readFileSync(resolve('app/buyer-show/BuyerShowAgentClient.tsx'), 'utf8');
const cssSource = readFileSync(resolve('app/buyer-show/buyerShowAgent.module.css'), 'utf8');

assert.ok(
  clientSource.includes('className={styles.deleteTagButton}'),
  'fixed tag delete action should use a compact tag-specific button',
);

assert.ok(cssSource.includes('.deleteTagButton'), 'fixed tag delete button should have tag-specific sizing');
assert.ok(cssSource.includes('min-height: 14px'), 'fixed tag delete button should match checkbox height');
assert.ok(cssSource.includes('width: 14px'), 'fixed tag delete button should match checkbox width');
assert.ok(cssSource.includes('height: 14px'), 'fixed tag delete button should match checkbox height exactly');
