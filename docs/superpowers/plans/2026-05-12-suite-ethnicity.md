# Suite Ethnicity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-suite ethnicity/race selection, defaulting to yellow/Asian, and apply it to buyer-show image prompts.

**Architecture:** Extend the existing suite schema with a small enum and keep the option at suite level. Reuse the main generation prompt builder for both initial image generation and single-image regeneration so the behavior stays consistent.

**Tech Stack:** Next.js, React, TypeScript, Zod, Node test runner.

---

### Task 1: Failing Contract Tests

**Files:**
- Modify: `tests/buyer-show-schemas.test.mjs`
- Modify: `tests/static-prototype.test.mjs`
- Modify: `tests/provider-adapters.test.mjs`

- [ ] Add assertions for `personEthnicity`, `yellow`, `white`, `black`, labels `黄种人`, `白种人`, `黑种人`, and prompt guidance markers.
- [ ] Run `npm test` and confirm the new assertions fail before production code changes.

### Task 2: Schema And Prompt Implementation

**Files:**
- Modify: `lib/buyer-show/schemas.ts`
- Modify: `lib/buyer-show/generation-service.ts`
- Modify: `app/api/buyer-show/regenerate-image/route.ts`

- [ ] Add `personEthnicitySchema`, exported `PersonEthnicity`, and default `personEthnicity: 'yellow'` to generation sets.
- [ ] Make `buildImagePrompt` exported and accept `personEthnicity`.
- [ ] Add prompt guidance for the three values and pass the suite value during generation.
- [ ] Use `buildImagePrompt` in the regenerate-image route.

### Task 3: Client Implementation

**Files:**
- Modify: `app/buyer-show/BuyerShowAgentClient.tsx`
- Modify: `app/buyer-show/buyerShowAgent.module.css`

- [ ] Parse, save, load, reset, and render `personEthnicity` per suite.
- [ ] Default migrated and new suites to `yellow`.
- [ ] Pass the suite ethnicity when regenerating a single image.
- [ ] Add compact styling using existing chip/segmented patterns.

### Task 4: Verify

**Files:**
- Existing test suite and build config.

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Report any failures with exact command output.

