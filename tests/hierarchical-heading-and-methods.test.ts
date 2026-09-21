import assert from "node:assert/strict";
import test from "node:test";
import { parseCdrDocument } from "../server/document_pipeline/parse_cdr";
import { parseGtDocument } from "../server/document_pipeline/parse_gt";
import { buildLessonDocumentModel } from "../server/services/normalizer";
import { composeDocumentBlocks } from "../server/services/document_composer";
import { enrichLessonDocument } from "../server/services/enrichment_service";
import { CDR_FIXTURE, GT_FIXTURE } from "./fixtures";
import * as fs from "node:fs";

test("normalizes headings to Roman numerals at Level 1, Arabic numbers at Level 2, and preserves Level 3", () => {
  const cdr = parseCdrDocument(CDR_FIXTURE);
  const gt = parseGtDocument(GT_FIXTURE);
  const chapter = gt.chapters.find((c) => c.chapter_number === 2);
  assert.ok(chapter);

  const lesson = buildLessonDocumentModel("lesson-headings-test", cdr.lessons[0], chapter);
  const outlines = lesson.gt_chapter.outline;

  const level1Outlines = outlines.filter((o) => o.level === 1);
  assert.ok(level1Outlines.length >= 2);
  assert.match(level1Outlines[0].normalized_title, /^I\.\s+/);
  assert.match(level1Outlines[1].normalized_title, /^II\.\s+/);

  const level2Outlines = outlines.filter((o) => o.level === 2);
  assert.ok(level2Outlines.length >= 2);
  assert.match(level2Outlines[0].normalized_title, /^1\.\s+/);
  assert.match(level2Outlines[1].normalized_title, /^2\.\s+/);

  const level3Outlines = outlines.filter((o) => o.level === 3);
  assert.ok(level3Outlines.length >= 1);
  assert.match(level3Outlines[0].normalized_title, /^[a-zA-Z]\)\s+/);
});

test("hierarchical teaching methods: level 2 aggregates level 3, level 1 aggregates level 2, and duration is above method", async () => {
  if (!fs.existsSync("CDR.docx") || !fs.existsSync("GT.docx")) return;
  const cdr = parseCdrDocument("CDR.docx");
  const gt = parseGtDocument("GT.docx");
  const chapter1 = gt.chapters.find((c) => c.chapter_number === 1);
  assert.ok(chapter1);

  const lesson = buildLessonDocumentModel("lesson-hierarchical-test", cdr.lessons[0], chapter1);
  const enrichment = await enrichLessonDocument(lesson, new Set(["section_duration", "method"]));
  const composed = composeDocumentBlocks(lesson, enrichment.insertions);

  const contentTitle = composed.find((b) => b.id === "generated-content-title");
  assert.ok(contentTitle);
  assert.equal(contentTitle.text_preview, "NỘI DUNG (65 phút)");

  // Check that for every method insertion, the block immediately before it is 'Thời gian: ... phút'
  const methodBlocks = composed.filter((b) => b.text_preview.startsWith("Phương pháp:"));
  assert.ok(methodBlocks.length >= 3);

  for (const methodBlock of methodBlocks) {
    const idx = composed.findIndex((b) => b.id === methodBlock.id);
    assert.ok(idx > 1);
    const durationBlock = composed[idx - 1];
    assert.match(durationBlock.text_preview, /^Thời gian:\s*\d+\s*phút/);
    const headingBlock = composed[idx - 2];
    assert.match(headingBlock.text_preview, /^([IVXLC]+\.|\d+\.)\s+/);
  }

  // Level 1 heading I method should contain methods from its level 2 children
  const l1Method = methodBlocks.find((b) => {
    const idx = composed.findIndex((x) => x.id === b.id);
    return composed[idx - 2].text_preview.startsWith("I.");
  });
  assert.ok(l1Method);
  assert.match(l1Method.text_preview, /Thuyết trình/);
  assert.match(l1Method.text_preview, /trực quan/i);
});
