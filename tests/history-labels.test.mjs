import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import * as historyLabels from '../lib/buyer-show/history-labels.ts';

const {
  createHistoryTitle,
  formatHistoryMeta,
  getHistoryMeta,
} = historyLabels;

const baseProductInfo = {
  category: 'unknown',
  productInfoSource: 'mixed',
  productClaims: [],
  skinTypes: [],
  avoidTerms: [],
};

const baseImageTypeCounts = {
  texture_on_hand: 0,
  bathroom_vanity: 0,
  handheld_product_closeup: 0,
  selfie_holding_product: 0,
};

test('history title falls back to useful generation details instead of unnamed record', () => {
  const input = {
    productInfo: {
      ...baseProductInfo,
      productClaims: ['补水保湿'],
    },
    generationSets: [
      {
        id: 'set-a',
        name: 'A 套件',
        mode: 'image_with_comment',
        imageTypeCounts: {
          ...baseImageTypeCounts,
          texture_on_hand: 2,
          handheld_product_closeup: 1,
        },
        languages: ['zh-CN', 'en-US'],
        commentCount: 2,
      },
    ],
    results: [
      {
        id: 'result-a',
        setId: 'set-a',
        setName: 'A 套件',
        mode: 'image_with_comment',
        images: [
          { id: 'image-1', type: 'texture_on_hand', promptSnapshot: 'a' },
          { id: 'image-2', type: 'texture_on_hand', promptSnapshot: 'b' },
          { id: 'image-3', type: 'handheld_product_closeup', promptSnapshot: 'c' },
        ],
        comments: [
          {
            id: 'comment-zh',
            language: 'zh-CN',
            text: '好用',
            tone: 'real_user',
            complianceStatus: 'passed',
            complianceReasons: [],
            promptSnapshot: 'zh',
          },
          {
            id: 'comment-en',
            language: 'en-US',
            text: 'Nice',
            tone: 'real_user',
            complianceStatus: 'passed',
            complianceReasons: [],
            promptSnapshot: 'en',
          },
        ],
        createdAt: '2026-05-13T09:54:00.000Z',
      },
    ],
  };

  assert.equal(createHistoryTitle(input), '补水保湿 · 1套3图2评');
  assert.equal(formatHistoryMeta(getHistoryMeta(input)), '1套 · 3图 · 2评 · 中/英 · 已通过');
});

test('history title prefers product name and meta surfaces review state', () => {
  const input = {
    productInfo: {
      ...baseProductInfo,
      productName: 'Aqualuxe Hydrating Essence Toner',
      category: '护肤 > 精华',
    },
    generationSets: [
      {
        id: 'set-a',
        name: 'A 套件',
        mode: 'comment_only',
        imageTypeCounts: baseImageTypeCounts,
        languages: ['zh-CN', 'ms-MY'],
        commentCount: 2,
      },
    ],
    results: [
      {
        id: 'result-a',
        setId: 'set-a',
        setName: 'A 套件',
        mode: 'comment_only',
        images: [],
        comments: [
          {
            id: 'comment-zh',
            language: 'zh-CN',
            text: '还可以',
            tone: 'real_user',
            complianceStatus: 'needs_review',
            complianceReasons: ['夸张表达'],
            promptSnapshot: 'zh',
          },
        ],
        createdAt: '2026-05-13T09:54:00.000Z',
      },
    ],
  };

  assert.equal(createHistoryTitle(input), 'Aqualuxe Hydrating Essence Toner');
  assert.equal(formatHistoryMeta(getHistoryMeta(input)), '1套 · 0图 · 1评 · 中/马 · 需人工判断');
});

test('history display title repairs old unnamed records from record content', () => {
  const input = {
    title: '未命名买家秀记录',
    productInfo: {
      ...baseProductInfo,
      productClaims: ['清爽不黏'],
    },
    generationSets: [
      {
        id: 'set-a',
        name: 'A 套件',
        mode: 'image_with_comment',
        imageTypeCounts: {
          ...baseImageTypeCounts,
          bathroom_vanity: 1,
        },
        languages: ['zh-CN'],
        commentCount: 1,
      },
    ],
    results: [],
  };

  assert.equal(typeof historyLabels.formatHistoryDisplayTitle, 'function');
  assert.equal(historyLabels.formatHistoryDisplayTitle(input), '清爽不黏 · 1套1图1评');
  assert.equal(historyLabels.formatHistoryDisplayTitle({ ...input, title: '人工备注版' }), '人工备注版');
});

test('buyer show history UI uses a scan-friendly panel instead of a single long select', () => {
  const clientSource = readFileSync(resolve('app/buyer-show/BuyerShowAgentClient.tsx'), 'utf8');
  const cssSource = readFileSync(resolve('app/buyer-show/buyerShowAgent.module.css'), 'utf8');

  assert.match(clientSource, /formatHistoryMeta/);
  assert.match(clientSource, /formatHistoryDisplayTitle/);
  assert.match(clientSource, /styles\.historyPanel/);
  assert.match(clientSource, /data-action="toggle-history-panel"/);
  assert.match(clientSource, /data-action="load-history"/);
  assert.doesNotMatch(clientSource, /<strong>\{item\.title\}<\/strong>/);
  assert.doesNotMatch(clientSource, /<select[\s\S]*data-action="load-history"/);
  assert.match(cssSource, /\.historyPanel/);
  assert.match(cssSource, /\.historyItemMeta/);
});
