import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { providerConfig } from '../lib/buyer-show/provider-config.ts';

const providerSource = readFileSync(new URL('../lib/buyer-show/image-provider.ts', import.meta.url), 'utf8');
const configUrl = new URL('../lib/buyer-show/provider-config.ts', import.meta.url).href;
const compiled = ts.transpileModule(providerSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace("'./provider-config'", JSON.stringify(configUrl));
const { generateBuyerShowImage } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

const input = {
  prompt: 'A buyer holding the exact product from the reference image.',
  imageUrls: ['data:image/png;base64,aW1hZ2U='],
  imageType: 'handheld_product_closeup',
};
const expectedExistingOrder = Array.from({ length: 4 }, () => [
  'https://yunwu.example/v1/images/edits',
  'https://xai.example/v1/images/edits',
]).flat();
const falUrl = 'https://fal.run/openai/gpt-image-2.5/sunburst/edit';

function setup(t, respond, configOverrides = {}) {
  const originalConfig = { ...providerConfig };
  Object.assign(providerConfig, {
    imageBaseUrl: 'https://yunwu.example/v1',
    imageApiKey: 'test-yunwu-key',
    imageSize: '1152x2048',
    xaiImageBaseUrl: 'https://xai.example/v1',
    xaiImageApiKey: 'test-xai-key',
    falApiKey: 'test-fal-key',
    falImageModel: 'openai/gpt-image-2.5/sunburst/edit',
    ...configOverrides,
  });
  t.after(() => {
    for (const key of Object.keys(providerConfig)) delete providerConfig[key];
    Object.assign(providerConfig, originalConfig);
  });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    return respond(url, options, calls.length);
  });
  t.mock.method(console, 'error', () => {});
  return calls;
}

function existingFailure() {
  return Response.json({ error: { message: 'Provider temporarily unavailable' } }, { status: 503 });
}

test('returns a primary image immediately without calling fal', async (t) => {
  const calls = setup(t, () => Response.json({ data: [{ b64_json: 'primary-image' }] }));
  assert.deepEqual(await generateBuyerShowImage(input), {
    url: undefined, b64Json: 'primary-image', type: input.imageType,
  });
  assert.deepEqual(calls.map(({ url }) => url), expectedExistingOrder.slice(0, 1));
});

test('keeps XAI ahead of fal when the primary provider fails', async (t) => {
  const calls = setup(t, (url) => url.startsWith('https://xai.example')
    ? Response.json({ data: [{ b64_json: 'xai-image' }] })
    : existingFailure());
  assert.equal((await generateBuyerShowImage(input)).b64Json, 'xai-image');
  assert.deepEqual(calls.map(({ url }) => url), expectedExistingOrder.slice(0, 2));
});

test('does not call fal when the last existing-provider retry succeeds', async (t) => {
  const calls = setup(t, (_url, _options, count) => count === 8
    ? Response.json({ data: [{ url: 'https://images.example/recovered.png' }] })
    : existingFailure());
  assert.equal((await generateBuyerShowImage(input)).url, 'https://images.example/recovered.png');
  assert.deepEqual(calls.map(({ url }) => url), expectedExistingOrder);
});

test('calls the specified fal model only after both providers fail initially and on three retries', async (t) => {
  const calls = setup(t, (url) => url === falUrl
    ? Response.json({ images: [{ url: 'https://fal.media/fallback.png' }] })
    : existingFailure());
  assert.deepEqual(await generateBuyerShowImage(input), {
    url: 'https://fal.media/fallback.png', type: input.imageType,
  });
  assert.deepEqual(calls.map(({ url }) => url), [...expectedExistingOrder, falUrl]);
  const { options } = calls.at(-1);
  assert.equal(options.method, 'POST');
  assert.equal(options.headers.Authorization, 'Key test-fal-key');
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(options.body), {
    prompt: input.prompt,
    image_urls: input.imageUrls,
    image_size: { width: 1152, height: 2048 },
    num_images: 1,
    output_format: 'png',
  });
});

test('also falls back after malformed or empty existing-provider responses', async (t) => {
  const calls = setup(t, (url, _options, count) => url === falUrl
    ? Response.json({ images: [{ url: 'https://fal.media/fallback.png' }] })
    : count % 2 ? new Response('Bad Gateway', { status: 502 }) : Response.json({ data: [] }));
  assert.equal((await generateBuyerShowImage(input)).url, 'https://fal.media/fallback.png');
  assert.equal(calls.length, 9);
});

test('uses the same fallback model when the request has no reference images', async (t) => {
  const calls = setup(t, (url) => url === falUrl
    ? Response.json({ images: [{ url: 'https://fal.media/fallback.png' }] })
    : existingFailure());
  await generateBuyerShowImage({ ...input, imageUrls: [] });
  assert.deepEqual(calls.map(({ url }) => url), [
    ...expectedExistingOrder.map((url) => url.replace('/edits', '/generations')),
    falUrl,
  ]);
  assert.deepEqual(JSON.parse(calls.at(-1).options.body).image_urls, []);
});

test('passes hosted reference URLs to fal without downloading or dropping them', async (t) => {
  const referenceUrls = ['https://references.example/product.png', input.imageUrls[0]];
  const calls = setup(t, (url) => {
    if (url === referenceUrls[0]) {
      return new Response('image', { headers: { 'Content-Type': 'image/png' } });
    }
    return url === falUrl
      ? Response.json({ images: [{ url: 'https://fal.media/fallback.png' }] })
      : existingFailure();
  });
  await generateBuyerShowImage({ ...input, imageUrls: referenceUrls });
  assert.deepEqual(JSON.parse(calls.at(-1).options.body).image_urls, referenceUrls);
});

for (const [name, response] of [
  ['HTTP error', () => Response.json({ detail: 'Account unauthorized' }, { status: 401 })],
  ['non-JSON response', () => new Response('Bad Gateway', { status: 502 })],
  ['missing image', () => Response.json({ images: [] })],
  ['connection failure', () => { throw new Error('fetch failed'); }],
]) {
  test(`returns a safe failure if fal returns ${name}`, async (t) => {
    const calls = setup(t, (url) => url === falUrl ? response() : existingFailure());
    await assert.rejects(generateBuyerShowImage(input), { message: '图片生成失败，请稍后重试' });
    assert.deepEqual(calls.map(({ url }) => url), [...expectedExistingOrder, falUrl]);
  });
}

test('returns a safe failure without sending a fal request when its key is missing', async (t) => {
  const calls = setup(t, existingFailure, { falApiKey: undefined });
  await assert.rejects(generateBuyerShowImage(input), { message: '图片生成失败，请稍后重试' });
  assert.deepEqual(calls.map(({ url }) => url), expectedExistingOrder);
});
