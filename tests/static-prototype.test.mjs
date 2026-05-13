import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const html = readFileSync(resolve('index.html'), 'utf8');
const packageJson = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
const clientSource = readFileSync(resolve('app/buyer-show/BuyerShowAgentClient.tsx'), 'utf8');
const cssSource = readFileSync(resolve('app/buyer-show/buyerShowAgent.module.css'), 'utf8');

assert.equal(packageJson.scripts.dev, 'next dev');
assert.equal(packageJson.scripts.build, 'prisma generate && next build');
assert.equal(packageJson.dependencies.next !== undefined, true);

for (const text of ['评论语言', '中文', 'English', 'ไทย', 'Bahasa Melayu', '保存为固定标签', '重生成单图', '删除套件', '新建项目']) {
  assert.ok(clientSource.includes(text), `BuyerShowAgentClient should include ${text}`);
}

for (const text of ['每类生成数量', 'updateSetImageTypeCount', 'getSetImageTotal']) {
  assert.ok(clientSource.includes(text), `BuyerShowAgentClient should include clarified image count copy ${text}`);
}

for (const text of ['runComplianceChecks', "complianceStatus: 'checking'", '审核中']) {
  assert.ok(clientSource.includes(text), `BuyerShowAgentClient should defer compliance review with marker ${text}`);
}

for (const text of ['人种', '黄种人', '白种人', '黑种人', 'personEthnicity', 'updateSetPersonEthnicity']) {
  assert.ok(clientSource.includes(text), `BuyerShowAgentClient should include suite ethnicity selector marker ${text}`);
}

for (const text of ['保存状态', '载入状态', 'buyerShow.savedState.v1', 'saveSnapshotState', 'loadSnapshotState']) {
  assert.ok(clientSource.includes(text), `BuyerShowAgentClient should include state persistence marker ${text}`);
}

for (const endpoint of [
  '/api/buyer-show/generate',
  '/api/buyer-show/regenerate-comment',
  '/api/buyer-show/regenerate-image',
  '/api/buyer-show/compliance-check',
]) {
  assert.ok(clientSource.includes(endpoint), `BuyerShowAgentClient should call ${endpoint}`);
}

for (const text of ['type="file"', 'handleAssetUpload', 'downloadImage', 'updateCommentText', 'setPreviewImage', 'removeGenerationSet', 'handleNewProject']) {
  assert.ok(clientSource.includes(text), `BuyerShowAgentClient should include interactive behavior marker ${text}`);
}

assert.ok(clientSource.includes('getSuiteDisplayName(index)'), 'suite cards should render simple sequential names');
assert.ok(!clientSource.includes('套件：{set.name}'), 'suite cards should not render descriptive set names in the header');
assert.ok(!clientSource.includes('当前项目'), 'sidebar should not render the current project card');
assert.ok(!clientSource.includes('商品 ID: BS-2026-0512'), 'sidebar should not render the fixed product id');
assert.ok(!html.includes('当前项目'), 'static prototype should not render the current project card');
assert.ok(!html.includes('商品 ID: BS-2026-0512'), 'static prototype should not render the fixed product id');

assert.ok(cssSource.includes('.field input:not([type="checkbox"])'), 'form input styles should not stretch tag checkboxes');
assert.ok(cssSource.includes('.customTagRow > input'), 'custom tag input styles should not stretch the save checkbox');
assert.ok(cssSource.includes('.imageType input[type="checkbox"]'), 'image type checkboxes should have dedicated sizing');
assert.ok(cssSource.includes('width: 22px'), 'image type checkboxes should be wider than the browser default');
assert.ok(cssSource.includes('height: 22px'), 'image type checkboxes should be taller than the browser default');
assert.ok(cssSource.includes('z-index: 1'), 'tag content should render above the chip background');
assert.ok(clientSource.includes('response.text()'), 'API helper should read raw text before parsing JSON');
assert.ok(!clientSource.includes('response.json()'), 'API helper should not blindly parse HTML error pages as JSON');
assert.ok(clientSource.includes('接口返回了 HTML 错误页'), 'API helper should show a clear message for HTML error pages');
assert.ok(clientSource.includes('getReferenceImageUrls'), 'client should collect uploaded reference images for single-image regeneration');
assert.ok(
  clientSource.includes('assets: assets.map(toAssetPayload)'),
  'client should send compact uploaded asset payloads for server-side R2 read URL signing',
);
assert.ok(
  !clientSource.includes('asset.temporaryObjectUrl ?? asset.localPreviewKey'),
  'client should not send browser-local base64 image data as model reference URLs',
);
assert.ok(clientSource.includes('const uploadInput = event.currentTarget;'), 'asset upload should capture the file input before async work');
assert.ok(clientSource.includes('Array.from(uploadInput.files ?? [])'), 'asset upload should read files from the captured input');
assert.ok(clientSource.includes("uploadInput.value = '';"), 'asset upload should clear the captured input after async work');
assert.ok(!clientSource.includes("event.currentTarget.value = '';"), 'asset upload should not use the React event currentTarget after async work');
assert.ok(clientSource.includes('setClaims([])'), 'new project should clear selected claim tags');
assert.ok(clientSource.includes('setSkinTypes([])'), 'new project should clear selected skin type tags');
assert.ok(clientSource.includes('setAssets([])'), 'new project should clear uploaded assets');
assert.ok(clientSource.includes('setSets(createClearedGenerationSets())'), 'new project should clear suite selections');
assert.ok(clientSource.includes("const defaultPersonEthnicity: PersonEthnicity = 'yellow'"), 'new and migrated generation suites should default person ethnicity to yellow');
assert.ok(clientSource.includes('setResults([])'), 'new project should clear generated results');
assert.ok(clientSource.includes('setSaveClaimAsFixed(false)'), 'new project should clear the claim fixed-tag toggle');
assert.ok(clientSource.includes('setSaveSkinAsFixed(false)'), 'new project should clear the skin fixed-tag toggle');
assert.ok(clientSource.includes('checked={saveAsFixed}'), 'fixed-tag toggle should be controlled so it can be reset');
assert.ok(cssSource.includes('min-width: 116px'), 'selectable chips should be a little wider');
assert.ok(clientSource.includes('list="buyer-show-category-suggestions"'), 'category field should expose quick suggestions');
assert.ok(clientSource.includes('normalizeCategoryForProductInfo(category)'), 'category input should normalize blank text for API payloads');
assert.ok(!clientSource.includes('<select onChange={(event) => setCategory'), 'category field should be a free-text input, not a fixed select');
assert.ok(
  clientSource.includes('{result.images.map((image) => ('),
  'result cards should render every generated image through the compact thumbnail grid',
);
assert.ok(!clientSource.includes('variant="hero"'), 'result cards should not render a large first-image hero preview');
assert.ok(!clientSource.includes('result.images.slice(1)'), 'result thumbnails should not split the first image from the rest');

for (const text of ['评论生成规则', 'sourceBar', 'sourceChipActive']) {
  assert.ok(!clientSource.includes(text), `BuyerShowAgentClient should not render ${text}`);
}

const requiredText = [
  '买家秀智能体',
  '上传素材',
  '商品信息',
  '配置套件',
  '生成结果',
  '产品图',
  '包装图',
  '质地图',
  '质地上手图',
  '浴室/化妆台场景图',
  '手持商品特写图',
  '真人自拍持产品图',
  '人种',
  '黄种人',
  '白种人',
  '黑种人',
  '只生成评论',
  '每类生成数量',
  '共 3 张图',
  'X图 + 1评论',
  '复制评论',
  '下载图片',
  '重生成单图',
  '重新审查',
  '审核中',
  'https://github.com/blader/humanizer',
  'manual',
  'ai_inferred',
  'mixed',
  '套件1',
  '手动修改后重新审查',
  '自定义卖点',
  '自定义肤质',
  '保存为固定标签',
  '固定标签',
  '删除固定标签',
  '评论语言',
  '中文',
  'English',
  'ไทย',
  'Bahasa Melayu',
  '同图多语言评论',
  '按语言分别自检',
];

for (const text of requiredText) {
  assert.ok(html.includes(text), `index.html should include "${text}"`);
}

for (const source of [html, clientSource]) {
  assert.ok(!source.includes('自定义图片数量'), 'image count controls should not use the ambiguous old label');
  assert.ok(!source.includes('生成图片总数'), 'image count controls should not use a suite-level total label');
  assert.ok(!source.includes('图片类型为候选类型，系统会按总数分配生成。'), 'image count controls should not describe total-based allocation');
}

const requiredPatterns = [
  [/class="app-shell"/, 'prototype should render the app shell instead of a planning article'],
  [/data-upload-type="product"/, 'prototype should include a product image upload zone'],
  [/data-upload-type="package"/, 'prototype should include a package image upload zone'],
  [/data-upload-type="texture"/, 'prototype should include a texture image upload zone'],
  [/data-info-source="manual"/, 'prototype should expose the manual product info source state'],
  [/data-info-source="ai_inferred"/, 'prototype should expose the ai_inferred product info source state'],
  [/data-info-source="mixed"/, 'prototype should expose the mixed product info source state'],
  [/list=['"]buyer-show-category-suggestions/, 'prototype should allow custom category text with suggestions'],
  [/data-image-type="texture_on_hand"/, 'prototype should include texture_on_hand image type'],
  [/data-image-type="bathroom_vanity"/, 'prototype should include bathroom_vanity image type'],
  [/data-image-type="handheld_product_closeup"/, 'prototype should include handheld_product_closeup image type'],
  [/data-image-type="selfie_holding_product"/, 'prototype should include selfie_holding_product image type'],
  [/data-person-ethnicity="yellow"/, 'prototype should include yellow ethnicity option'],
  [/data-person-ethnicity="white"/, 'prototype should include white ethnicity option'],
  [/data-person-ethnicity="black"/, 'prototype should include black ethnicity option'],
  [/data-result-mode="comment_only"/, 'prototype should include a comment-only result card'],
  [/data-action="regenerate-single-image"/, 'prototype should support single-image regeneration'],
  [/data-action="recheck-comment"/, 'prototype should support comment re-check after edits'],
  [/data-tag-group="claims"/, 'prototype should expose a custom/fixed tag group for claims'],
  [/data-tag-group="skin-types"/, 'prototype should expose a custom/fixed tag group for skin types'],
  [/data-custom-tag-input="claims"/, 'prototype should include a custom claim input'],
  [/data-custom-tag-input="skin-types"/, 'prototype should include a custom skin type input'],
  [/data-action="save-fixed-tag"/, 'prototype should allow saving custom entries as fixed tags'],
  [/data-action=['"]delete-fixed-tag/, 'prototype should allow deleting saved fixed tags'],
  [/data-action=['"]save-state/, 'prototype should expose a save-state action'],
  [/data-action=['"]load-state/, 'prototype should expose a load-state action'],
  [/buyerShow\.savedState\.v1/, 'prototype should persist full test state in browser storage'],
  [/localStorage/, 'prototype should persist fixed tags in browser storage'],
  [/data-language-selector="set-a"/, 'set A should have an independent language selector'],
  [/data-language-selector="set-b"/, 'set B should have an independent language selector'],
  [/data-language-selector="set-c"/, 'set C should have an independent language selector'],
  [/data-language-code="zh-CN"/, 'prototype should support Chinese comments'],
  [/data-language-code="en-US"/, 'prototype should support English comments'],
  [/data-language-code="th-TH"/, 'prototype should support Thai comments'],
  [/data-language-code="ms-MY"/, 'prototype should support Malay comments'],
  [/data-result-language="zh-CN"/, 'results should show Chinese language comment blocks'],
  [/data-result-language="en-US"/, 'results should show English language comment blocks'],
  [/data-result-language="th-TH"/, 'results should show Thai language comment blocks'],
  [/data-result-language="ms-MY"/, 'results should show Malay language comment blocks'],
];

for (const [pattern, message] of requiredPatterns) {
  assert.match(html, pattern, message);
}

const forbiddenText = [
  '可用点数',
  '预计消耗',
  '完成并导出',
  '图片合规风险',
  '图片与文案均符合平台指南',
];

for (const text of forbiddenText) {
  assert.ok(!html.includes(text), `MVP prototype should not include "${text}"`);
}
