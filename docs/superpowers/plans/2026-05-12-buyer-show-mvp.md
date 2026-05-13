# Buyer Show MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved buyer-show MVP as a real Next.js/TypeScript app with local image state, generation-set configuration, multilingual comment generation, compliance checks, and image generation API routes.

**Architecture:** Keep the current static `index.html` as a reference prototype while creating a new Next.js app under `app/` and `lib/buyer-show/`. The browser stores uploaded/generated images and fixed tags locally; server API routes call the configured model providers and return structured results. The first implementation phase ships a working end-to-end development app with mockable API boundaries and real provider adapters.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS Modules, Node test runner, Zod, browser localStorage/IndexedDB, Shanbaob OpenAI-compatible chat API using `gemini-3.1-pro-preview`, yunwu image generation API using `gpt-image-2-all`.

---

## File Structure

- Create `package.json`: project scripts, runtime dependencies, and test command.
- Create `tsconfig.json`, `next-env.d.ts`, `next.config.mjs`, `.gitignore`: minimal Next.js TypeScript setup.
- Create `app/layout.tsx`: root metadata and global document shell.
- Create `app/page.tsx`: redirect/render the buyer-show agent page.
- Create `app/globals.css`: global CSS reset and body defaults.
- Create `app/buyer-show/page.tsx`: server page entry.
- Create `app/buyer-show/BuyerShowAgentClient.tsx`: React client implementation of the approved UI and state.
- Create `app/buyer-show/buyerShowAgent.module.css`: migrated visual system from `index.html`.
- Create `app/api/buyer-show/generate/route.ts`: generate comments and images for configured sets.
- Create `app/api/buyer-show/regenerate-comment/route.ts`: regenerate one language-specific comment.
- Create `app/api/buyer-show/regenerate-image/route.ts`: regenerate one image.
- Create `app/api/buyer-show/compliance-check/route.ts`: re-check a manually edited comment.
- Create `lib/buyer-show/schemas.ts`: Zod schemas, TypeScript contracts, languages, image types, and default sets.
- Create `lib/buyer-show/humanizer-rules.ts`: comment style rules and language instructions.
- Create `lib/buyer-show/provider-config.ts`: environment variable names and provider defaults.
- Create `lib/buyer-show/text-provider.ts`: Shanbaob chat client and JSON parsing helpers.
- Create `lib/buyer-show/image-provider.ts`: yunwu image generation client, forcing HTTP/1.1-compatible fetch fallback where needed.
- Create `lib/buyer-show/generation-service.ts`: orchestrates product inference, comments, compliance, and images.
- Create `lib/buyer-show/local-images.ts`: browser IndexedDB helpers.
- Create `tests/static-prototype.test.mjs`: keep existing static prototype regression tests.
- Create `tests/buyer-show-schemas.test.mjs`: contract tests for language/set validation.
- Create `tests/provider-config.test.mjs`: provider config tests that do not use real API keys.

## Task 1: Project Skeleton

**Files:**
- Create: `/Users/a123/Desktop/买家秀1/package.json`
- Create: `/Users/a123/Desktop/买家秀1/tsconfig.json`
- Create: `/Users/a123/Desktop/买家秀1/next-env.d.ts`
- Create: `/Users/a123/Desktop/买家秀1/next.config.mjs`
- Create: `/Users/a123/Desktop/买家秀1/.gitignore`
- Test: `/Users/a123/Desktop/买家秀1/tests/static-prototype.test.mjs`

- [ ] **Step 1: Write failing package smoke test**

Append these assertions to `tests/static-prototype.test.mjs`:

```js
const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
assert.equal(packageJson.scripts.dev, 'next dev');
assert.equal(packageJson.scripts.build, 'next build');
assert.equal(packageJson.dependencies.next !== undefined, true);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/static-prototype.test.mjs
```

Expected: FAIL with `ENOENT: no such file or directory, open ... package.json`.

- [ ] **Step 3: Create minimal Next.js project files**

Create `package.json`:

```json
{
  "name": "buyer-show-agent",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "node --test tests/*.test.mjs"
  },
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.8.0"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

Create `next-env.d.ts`:

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

Create `next.config.mjs`:

```js
const nextConfig = {};

export default nextConfig;
```

Create `.gitignore`:

```gitignore
node_modules
.next
out
.env
.env.local
.DS_Store
```

- [ ] **Step 4: Install dependencies**

Run:

```bash
npm install
```

Expected: creates `package-lock.json` and exits 0.

- [ ] **Step 5: Run test to verify it passes**

Run:

```bash
npm test
```

Expected: all static prototype tests pass.

## Task 2: Data Contracts and Defaults

**Files:**
- Create: `/Users/a123/Desktop/买家秀1/lib/buyer-show/schemas.ts`
- Create: `/Users/a123/Desktop/买家秀1/tests/buyer-show-schemas.test.mjs`

- [ ] **Step 1: Write failing schema test**

Create `tests/buyer-show-schemas.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const schemaSource = readFileSync(resolve('lib/buyer-show/schemas.ts'), 'utf8');

const expectedTexts = [
  'zh-CN',
  'en-US',
  'th-TH',
  'ms-MY',
  'texture_on_hand',
  'bathroom_vanity',
  'selfie_holding_product',
  'comment_only',
  'image_with_comment',
  'manual',
  'ai_inferred',
  'mixed'
];

for (const text of expectedTexts) {
  assert.ok(schemaSource.includes(text), `schemas.ts should include ${text}`);
}

assert.match(schemaSource, /export const supportedLanguages/, 'schemas.ts should export supportedLanguages');
assert.match(schemaSource, /export const defaultGenerationSets/, 'schemas.ts should export defaultGenerationSets');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/buyer-show-schemas.test.mjs
```

Expected: FAIL with missing `lib/buyer-show/schemas.ts`.

- [ ] **Step 3: Create schemas**

Create `lib/buyer-show/schemas.ts` with Zod enums and exported defaults for product info, assets, generation sets, generated comments, generated images, and results. Include:

```ts
export const supportedLanguages = [
  { code: 'zh-CN', label: '中文', generationName: 'Simplified Chinese' },
  { code: 'en-US', label: 'English', generationName: 'English' },
  { code: 'th-TH', label: 'ไทย', generationName: 'Thai' },
  { code: 'ms-MY', label: 'Bahasa Melayu', generationName: 'Malay' }
] as const;
```

Also include `defaultGenerationSets` with the approved A/B/C language choices:

```ts
export const defaultGenerationSets = [
  { id: 'set-a', name: '真实素人', mode: 'image_with_comment', imageCount: 3, imageTypes: ['texture_on_hand', 'bathroom_vanity', 'selfie_holding_product'], languages: ['zh-CN', 'en-US'], commentCount: 2 },
  { id: 'set-b', name: '只评论结果', mode: 'comment_only', imageCount: 0, imageTypes: [], languages: ['zh-CN'], commentCount: 1 },
  { id: 'set-c', name: '自拍持产品', mode: 'image_with_comment', imageCount: 1, imageTypes: ['selfie_holding_product'], languages: ['th-TH', 'ms-MY'], commentCount: 2 }
] as const;
```

- [ ] **Step 4: Run schema test**

Run:

```bash
node --test tests/buyer-show-schemas.test.mjs
```

Expected: PASS.

## Task 3: Provider Configuration

**Files:**
- Create: `/Users/a123/Desktop/买家秀1/lib/buyer-show/provider-config.ts`
- Create: `/Users/a123/Desktop/买家秀1/tests/provider-config.test.mjs`

- [ ] **Step 1: Write failing provider config test**

Create `tests/provider-config.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve('lib/buyer-show/provider-config.ts'), 'utf8');

assert.ok(source.includes('SHANBAOB_API_KEY'));
assert.ok(source.includes('SHANBAOB_BASE_URL'));
assert.ok(source.includes('BUYER_SHOW_TEXT_MODEL'));
assert.ok(source.includes('gemini-3.1-pro-preview'));
assert.ok(source.includes('YUNWU_IMAGE_API_KEY'));
assert.ok(source.includes('YUNWU_IMAGE_MODEL'));
assert.ok(source.includes('gpt-image-2-all'));
assert.ok(!source.includes('sk-'), 'provider config must not hardcode API keys');
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/provider-config.test.mjs
```

Expected: FAIL with missing `provider-config.ts`.

- [ ] **Step 3: Create provider config**

Create `lib/buyer-show/provider-config.ts`:

```ts
export const providerConfig = {
  textBaseUrl: process.env.SHANBAOB_BASE_URL ?? 'https://www.shanbaob.net/v1',
  textApiKey: process.env.SHANBAOB_API_KEY,
  textModel: process.env.BUYER_SHOW_TEXT_MODEL ?? 'gemini-3.1-pro-preview',
  imageBaseUrl: process.env.YUNWU_IMAGE_BASE_URL ?? 'https://yunwu.ai/v1',
  imageApiKey: process.env.YUNWU_IMAGE_API_KEY,
  imageModel: process.env.YUNWU_IMAGE_MODEL ?? 'gpt-image-2-all',
  imageSize: process.env.YUNWU_IMAGE_SIZE ?? '1152x2048'
};
```

- [ ] **Step 4: Run provider config test**

Run:

```bash
node --test tests/provider-config.test.mjs
```

Expected: PASS.

## Task 4: React UI Migration

**Files:**
- Create: `/Users/a123/Desktop/买家秀1/app/layout.tsx`
- Create: `/Users/a123/Desktop/买家秀1/app/page.tsx`
- Create: `/Users/a123/Desktop/买家秀1/app/globals.css`
- Create: `/Users/a123/Desktop/买家秀1/app/buyer-show/page.tsx`
- Create: `/Users/a123/Desktop/买家秀1/app/buyer-show/BuyerShowAgentClient.tsx`
- Create: `/Users/a123/Desktop/买家秀1/app/buyer-show/buyerShowAgent.module.css`
- Modify: `/Users/a123/Desktop/买家秀1/tests/static-prototype.test.mjs`

- [ ] **Step 1: Write failing app source assertions**

Append assertions to `tests/static-prototype.test.mjs` that read `app/buyer-show/BuyerShowAgentClient.tsx` and require the existing UI concepts:

```js
const clientSource = readFileSync(resolve('app/buyer-show/BuyerShowAgentClient.tsx'), 'utf8');
for (const text of ['评论语言', '中文', 'English', 'ไทย', 'Bahasa Melayu', '保存为固定标签', '重生成单图']) {
  assert.ok(clientSource.includes(text), `BuyerShowAgentClient should include ${text}`);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test
```

Expected: FAIL with missing `BuyerShowAgentClient.tsx`.

- [ ] **Step 3: Create app files**

Create the Next pages and migrate the approved UI from `index.html` into `BuyerShowAgentClient.tsx` using React state. Keep the same sections: upload, product info, set configuration with independent language selection, and generated results. Preserve fixed tag behavior using `localStorage` behind `useEffect`.

- [ ] **Step 4: Create CSS module**

Move the approved visual system from `index.html` into `buyerShowAgent.module.css`. Use CSS Modules class names and keep responsive behavior.

- [ ] **Step 5: Run tests and build**

Run:

```bash
npm test
npm run build
```

Expected: tests pass and Next.js build exits 0.

## Task 5: Text and Image Provider Adapters

**Files:**
- Create: `/Users/a123/Desktop/买家秀1/lib/buyer-show/humanizer-rules.ts`
- Create: `/Users/a123/Desktop/买家秀1/lib/buyer-show/text-provider.ts`
- Create: `/Users/a123/Desktop/买家秀1/lib/buyer-show/image-provider.ts`
- Create: `/Users/a123/Desktop/买家秀1/lib/buyer-show/generation-service.ts`

- [ ] **Step 1: Write failing source assertions**

Create `tests/provider-adapters.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const textProvider = readFileSync(resolve('lib/buyer-show/text-provider.ts'), 'utf8');
const imageProvider = readFileSync(resolve('lib/buyer-show/image-provider.ts'), 'utf8');
const generationService = readFileSync(resolve('lib/buyer-show/generation-service.ts'), 'utf8');

assert.ok(textProvider.includes('/chat/completions'));
assert.ok(textProvider.includes('gemini-3.1-pro-preview'));
assert.ok(textProvider.includes('JSON'));
assert.ok(imageProvider.includes('/images/generations'));
assert.ok(imageProvider.includes('gpt-image-2-all'));
assert.ok(imageProvider.includes('curl') || imageProvider.includes('fetch'));
assert.ok(generationService.includes('generateBuyerShowResults'));
assert.ok(generationService.includes('compliance'));
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/provider-adapters.test.mjs
```

Expected: FAIL with missing provider files.

- [ ] **Step 3: Implement providers and service**

Implement:
- `createChatCompletion(messages, options)` in `text-provider.ts`.
- `generateBuyerShowImage(prompt, imageUrls)` in `image-provider.ts`.
- `generateBuyerShowResults(input)` in `generation-service.ts`.
- `checkCommentCompliance(comment, language)` in `generation-service.ts`.

Do not hardcode API keys. Throw clear errors when environment variables are missing.

- [ ] **Step 4: Run provider tests**

Run:

```bash
npm test
```

Expected: all tests pass.

## Task 6: API Routes

**Files:**
- Create: `/Users/a123/Desktop/买家秀1/app/api/buyer-show/generate/route.ts`
- Create: `/Users/a123/Desktop/买家秀1/app/api/buyer-show/regenerate-comment/route.ts`
- Create: `/Users/a123/Desktop/买家秀1/app/api/buyer-show/regenerate-image/route.ts`
- Create: `/Users/a123/Desktop/买家秀1/app/api/buyer-show/compliance-check/route.ts`

- [ ] **Step 1: Write failing route source assertions**

Create `tests/api-routes.test.mjs`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

for (const route of ['generate', 'regenerate-comment', 'regenerate-image', 'compliance-check']) {
  const source = readFileSync(resolve(`app/api/buyer-show/${route}/route.ts`), 'utf8');
  assert.ok(source.includes('export async function POST'), `${route} should export POST`);
  assert.ok(source.includes('NextResponse'), `${route} should use NextResponse`);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/api-routes.test.mjs
```

Expected: FAIL with missing route files.

- [ ] **Step 3: Implement routes**

Each route should:
- Parse `await request.json()`.
- Validate using schemas.
- Call the service method.
- Return `NextResponse.json({ ok: true, ...data })`.
- Return `NextResponse.json({ ok: false, error: message }, { status: 400 or 500 })` on validation/provider errors.

- [ ] **Step 4: Run tests and build**

Run:

```bash
npm test
npm run build
```

Expected: all tests and build pass.

## Task 7: End-to-End Local Check

**Files:**
- Modify: `/Users/a123/Desktop/买家秀1/app/buyer-show/BuyerShowAgentClient.tsx`

- [ ] **Step 1: Wire Start Generating button**

The button should send current product info and generation sets to `/api/buyer-show/generate`, set a loading state, then render returned results grouped by set and language.

- [ ] **Step 2: Wire result actions**

Copy, regenerate language-specific comment, regenerate single image, and compliance re-check should call their respective API routes and update only the affected result block.

- [ ] **Step 3: Verify with dev server**

Run:

```bash
npm run dev -- --port 3000
```

Open `http://127.0.0.1:3000` in the browser. Confirm the four-step UI loads, fixed tags persist, language selectors are per set, and mock/error states are readable when API keys are not configured.

- [ ] **Step 4: Final verification**

Run:

```bash
npm test
npm run build
```

Expected: all tests pass and build exits 0.

## Self-Review

- Spec coverage: upload areas, product info source, fixed tags, suite configuration, multilingual comments, result actions, text API, image API, and compliance routes are covered.
- Scope check: PostgreSQL/Prisma and persistent task history are intentionally deferred because the current workspace has no app skeleton yet and MVP can first ship a local browser state plus API route flow. Add database persistence after the generation flow works.
- Secret handling: API keys must remain in `.env.local`, never committed or hardcoded.
- Git note: current directory is not a git repository, so commit steps are omitted until a repository is initialized.
