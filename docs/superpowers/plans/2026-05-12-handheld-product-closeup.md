# Handheld Product Closeup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a close-up hand-held product image type and keep bathroom/vanity scenes free of visible people.

**Architecture:** Extend the existing `ImageType` enum and per-type count object, then reuse the current suite controls and prompt builder. Prompt behavior stays centralized in `lib/buyer-show/generation-service.ts` so initial generation and image regeneration share the same wording.

**Tech Stack:** Next.js 15, React 19, TypeScript, Zod, Node test runner.

---

### Task 1: Add Failing Tests

**Files:**
- Modify: `tests/buyer-show-schemas.test.mjs`
- Modify: `tests/static-prototype.test.mjs`
- Create: `tests/image-prompts.test.mjs`

- [ ] **Step 1: Update schema and prototype tests**

Add `handheld_product_closeup` to expected schema text and static prototype markers. Add `手持商品特写图` to required UI text.

- [ ] **Step 2: Add prompt behavior test**

Create a test that imports `buildImagePrompt` and verifies:
- `handheld_product_closeup` prompt contains close-up hand-held product guidance;
- close-up hand-held product prompt forbids selfie/full-person/face framing;
- `bathroom_vanity` prompt forbids visible people, hands, faces, body parts, and mirror reflections.

- [ ] **Step 3: Run tests and verify failure**

Run: `npm test`

Expected: FAIL because `handheld_product_closeup` is not yet in source and prompt construction does not include the new type.

### Task 2: Implement Type and UI Wiring

**Files:**
- Modify: `lib/buyer-show/schemas.ts`
- Modify: `app/buyer-show/BuyerShowAgentClient.tsx`
- Modify: `index.html`

- [ ] **Step 1: Extend schema**

Add `handheld_product_closeup` to `imageTypeSchema`, `imageTypeCountsSchema`, and default generation set count objects.

- [ ] **Step 2: Extend frontend state parsing and label**

Add `handheld_product_closeup` to the supported saved-state type set, `createEmptyImageTypeCounts`, and `imageTypeLabels` with label `手持商品特写图`.

- [ ] **Step 3: Extend static prototype**

Add the fourth image type control with `data-image-type="handheld_product_closeup"` and label `手持商品特写图`.

### Task 3: Implement Prompt Behavior

**Files:**
- Modify: `lib/buyer-show/generation-service.ts`

- [ ] **Step 1: Add close-up prompt branch**

Add `handheld_product_closeup` instructions to `typeInstruction` and `sceneInstruction`: tight smartphone close-up, product front label visible, one hand naturally holding product, no selfie, no full person, no face.

- [ ] **Step 2: Strengthen bathroom prompt**

Update `bathroom_vanity` instructions to explicitly describe product-only bathroom/vanity scene and forbid people, hands, faces, arms, body parts, and mirror reflections.

- [ ] **Step 3: Keep ethnicity guidance contextual**

Make ethnicity guidance apply only when visible body parts or people are expected, so product-only bathroom scenes do not encourage people to appear.

### Task 4: Verify

**Files:**
- No production files.

- [ ] **Step 1: Run focused tests**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 2: Run type/build verification**

Run: `npm run build`

Expected: build exits 0.

- [ ] **Step 3: Report**

Summarize changed files, test/build results, and note that no git commit was made because the workspace is not a git repository.
