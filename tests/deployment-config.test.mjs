import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));

assert.equal(packageJson.engines?.node, '22', 'Zeabur deployment should pin the Node major version');
assert.equal(packageJson.packageManager, 'npm@10.9.2', 'Zeabur deployment should pin npm instead of updating globally');
