import assert from "node:assert/strict";
import test from "node:test";
import { parseCdrDocument } from "../server/document_pipeline/parse_cdr";
import { parseGtDocument } from "../server/document_pipeline/parse_gt";
import { buildLessonDocumentModel } from "../server/services/normalizer";
import { CDR_FIXTURE, GT_FIXTURE } from "./fixtures";

test("preserves source GT heading text and XML when building a lesson model", () => {
  const cdr = parseCdrDocument(CDR_FIXTURE);
  const gt = parseGtDocument(GT_FIXTURE);
  const chapter = gt.chapters.find((item) => item.chapter_number === 2);

  assert.ok(chapter, "expected chapter 2 in the supplied GT fixture");
  const sourceHeading = chapter.blocks.find((block) => /^2\s*\.\s*2\s*\./.test(block.text_preview) && block.text_preview.includes("NH"));
  assert.ok(sourceHeading, "expected the 2.2 heading in the supplied GT fixture");

  const lesson = buildLessonDocumentModel("lesson-1", cdr.lessons[0], chapter);
  const copiedHeading = lesson.part_two_blocks.find((block) => block.id.startsWith(`${sourceHeading.id}-clone-`));

  assert.ok(copiedHeading, "expected the heading in the normalized model");
  assert.equal(copiedHeading.text_preview, "II. NHÂN CÁCH QUÂN NHÂN");
  assert.match(copiedHeading.xml || "", /II\./);
  assert.match(copiedHeading.xml || "", /NHÂN CÁCH QUÂN NHÂN/);
});
