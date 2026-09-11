# API And DOCX Preservation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Route all AI generation through the requested local OpenAI-compatible endpoint/model and export lesson DOCX files without changing source heading numbering, styles, or font formatting.

**Architecture:** Add one small server-side Chat Completions client that owns endpoint, model, authentication, JSON parsing, and retry behavior. Replace the two Gemini call sites with that client. Replace the minimal DOCX writer with a package-preserving exporter that uses the CDR package as the base, merges GT styles/numbering/relationships, and replaces only the document body while retaining the original section properties and package resources.

**Tech Stack:** React/Vite frontend, Express/TypeScript backend, `@xmldom/xmldom` for OOXML edits, `adm-zip` for DOCX packages, Node test runner with the repository's existing `tsx` dev dependency.

## Global Constraints

- AI base URL: `http://localhost:20128/v1`.
- AI model: `ag/gemini-3.6-flash-medium`.
- The API key must be read from `.env.local`/process environment and never committed or printed.
- Preserve source `w:p`, `w:tbl`, `w:pPr`, `w:rPr`, style references, numbering references, section properties, and package resources unless a resource ID must be remapped for a safe merge.
- Do not renumber headings from inferred local chapter order.
- No new runtime dependency is required.

---

### Task 1: Add and verify the OpenAI-compatible AI client

**Files:**
- Create: `server/services/openai_compatible_client.ts`
- Modify: `server/services/enrichment_service.ts`
- Modify: `server/services/bloom_service.ts`
- Modify: `.env.example`
- Modify: `README.md`
- Create locally, ignored: `.env.local`
- Test: `tests/openai-compatible-client.test.ts`

**Interfaces:**
- Produces `createOpenAICompatibleClient()` and `chatJson<T>()` for both AI services.
- Request payload uses `POST {baseUrl}/chat/completions` with `messages`, `model`, `response_format: { type: "json_object" }`, and a bounded output token setting.
- The client accepts a system message plus user message and returns parsed JSON.

- [ ] **Step 1: Write the failing request-shape test**

Test the client with an injected `fetch` implementation. Assert the URL, model, bearer header, system/user messages, JSON response format, and parsed result. Assert that the key value is not included in thrown error text.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npm test -- --test-name-pattern "OpenAI-compatible"`

Expected: FAIL because the client module does not exist yet.

- [ ] **Step 3: Implement the client and migrate both services**

Read `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL` with defaults matching the requested endpoint/model. Export an unavailable configuration error without logging the secret. Replace Gemini `generateContent` calls with the shared client and preserve existing JSON fallback/error behavior.

- [ ] **Step 4: Update environment documentation and local configuration**

Document the three variable names in `.env.example` and README. Write the user-provided key only to the ignored `.env.local` file.

- [ ] **Step 5: Run the focused test and typecheck**

Run: `npm test -- --test-name-pattern "OpenAI-compatible"`; `npm run lint`

Expected: request-shape test passes and TypeScript reports no errors.

### Task 2: Preserve heading titles and source block XML during normalization

**Files:**
- Modify: `server/services/normalizer.ts`
- Modify: `server/services/style_inheritance.ts`
- Test: `tests/normalizer-preservation.test.ts`

**Interfaces:**
- `buildLessonDocumentModel()` continues to return the same public model shape.
- `part_two_blocks` and `gt_chapter.outline` retain source heading text and XML; only block IDs are cloned/remapped.
- Inserted paragraphs inherit source paragraph/run properties without deleting font size or font family properties.

- [ ] **Step 1: Write the failing regression tests**

Construct a GT chapter containing a `2.2` heading with a numbering property and a run with a named font/size. Assert the model keeps the exact heading text/XML and that `buildInsertedParagraphXml()` retains the font properties from the reference block.

- [ ] **Step 2: Run the focused tests and confirm the old behavior fails**

Run: `npm test -- --test-name-pattern "preserve.*heading|preserve.*font"`

Expected: FAIL because the normalizer currently rewrites heading text and style inheritance strips font size/emphasis.

- [ ] **Step 3: Implement the minimal preservation change**

Remove local heading renumbering/text rewriting. Clone blocks and remap IDs only. Keep original outline level/title. Change style inheritance to copy source properties without deleting font or size attributes; generated insertions may explicitly add their requested bold/italic state but must not alter the inherited font face/size.

- [ ] **Step 4: Run the focused tests**

Run: `npm test -- --test-name-pattern "preserve.*heading|preserve.*font"`

Expected: PASS.

### Task 3: Replace the minimal DOCX writer with a package-preserving exporter

**Files:**
- Create: `server/document_pipeline/docx_package_merger.ts`
- Modify: `server/document_pipeline/export_docx.ts`
- Test: `tests/docx-package-merger.test.ts`
- Test: `tests/export-docx.test.ts`

**Interfaces:**
- `mergeDocxPackages(basePath, importedPath, blockXml, outputPath)` preserves the base ZIP package and returns the output path.
- `exportLessonDocument()` uses the CDR source package as base and the GT source package as imported package.

- [ ] **Step 1: Write the failing package-preservation tests**

Generate small synthetic DOCX packages containing document XML, styles, numbering, and a custom font. Export a lesson whose second-source block contains `2.2`, `w:numPr`, `w:pStyle`, and direct `w:rFonts`/`w:sz`. Assert the output still contains styles/numbering, the exact block XML properties, and the original `2.2` text. Assert the output base package retains its section properties and other resource entries.

- [ ] **Step 2: Run the tests and confirm the current writer fails**

Run: `npm test -- --test-name-pattern "DOCX|docx|heading numbering"`

Expected: FAIL because the current writer omits package parts and emits an empty section property.

- [ ] **Step 3: Implement the package merger**

Clone the base ZIP. Merge imported styles with collision-safe style IDs and rewrite imported block style references. Merge abstract numbering/number instances with collision-safe IDs and rewrite imported `w:numPr` references. Merge document relationships/media targets when imported blocks reference them. Preserve `[Content_Types].xml`, document relationships, settings, theme, font table, and base `sectPr`. Replace only body block children in `word/document.xml`.

- [ ] **Step 4: Wire exporter sources and run focused tests**

Obtain source paths from the lesson's CDR range and GT chapter range. Pass composed block XML and both package paths to the merger. Run the DOCX tests and inspect the output ZIP entries/XML.

### Task 4: Update UI copy and run the complete verification portfolio

**Files:**
- Modify: `src/pages/upload-page.tsx`
- Modify: `package.json`
- Test: `tests/api-config-and-label.test.ts`

- [ ] **Step 1: Add the literal acceptance test**

Assert the requested Vietnamese label exists exactly once in the upload page and the old label is absent. Assert the configured default endpoint/model strings are present in the client source without asserting the secret.

- [ ] **Step 2: Replace the label and add the test script**

Change the visible heading to `Chuẩn hóa bài giảng các môn KHXH&NV`. Add a `test` script using Node's test runner through the existing TypeScript runtime.

- [ ] **Step 3: Run the complete checks**

Run: `npm test`; `npm run lint`; `npm run build`.

Expected: all tests pass, typecheck passes, and the production bundle builds.

- [ ] **Step 4: Run direct boundary smoke checks**

Call the local AI `/v1/models` endpoint with the configured key without printing it, and run the DOCX fixture exporter. Verify the requested model is listed and the exported ZIP contains the expected OOXML parts and heading/font assertions.

- [ ] **Step 5: Review the diff and report evidence**

Inspect changed files, confirm `.env.local` is ignored, confirm no secret appears in tracked/source output, and report any runtime checks that remain unverified.
