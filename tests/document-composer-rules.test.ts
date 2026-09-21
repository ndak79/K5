import assert from "node:assert/strict";
import test from "node:test";
import { parseCdrDocument } from "../server/document_pipeline/parse_cdr";
import { parseGtDocument } from "../server/document_pipeline/parse_gt";
import { buildLessonDocumentModel } from "../server/services/normalizer";
import { composeDocumentBlocks } from "../server/services/document_composer";
import { enrichLessonDocument, sanitizePedagogicalQuestion } from "../server/services/enrichment_service";
import { buildLessonDiagramData } from "../server/document_pipeline/lesson_diagram";
import { CDR_FIXTURE, GT_FIXTURE } from "./fixtures";
import * as fs from "node:fs";

const SECTION_HEADING_PATTERN = /^(\s*[IVXLC]+\s*\.\s+\S|\s*\d+\s*\.\s+\S)/i;

function fixtureLesson() {
  return fixtureLessonForChapter(2);
}

function fixtureLessonForChapter(chapterNumber: number) {
  const cdr = parseCdrDocument(CDR_FIXTURE);
  const gt = parseGtDocument(GT_FIXTURE);
  const chapter = gt.chapters.find((item) => item.chapter_number === chapterNumber);
  assert.ok(chapter);
  return buildLessonDocumentModel("lesson-rules", cdr.lessons[0], chapter);
}

test("export title is uppercase and content heading contains NỘI DUNG with total duration", () => {
  const lesson = fixtureLesson();
  const lessonWithDuration = {
    ...lesson,
    cdr_lesson: {
      ...lesson.cdr_lesson,
      schedule_items: [{ duration_minutes: 45 }]
    }
  } as typeof lesson;

  const blocks = composeDocumentBlocks(lessonWithDuration, []);

  assert.equal(blocks[0].text_preview, lesson.cdr_lesson.title.toLocaleUpperCase("vi-VN"));
  assert.equal(blocks.find((block) => block.id === "generated-content-title")?.text_preview, "NỘI DUNG (45 phút)");
});

test("teaching methods are inserted directly below numeric section headings", () => {
  const lesson = fixtureLesson();
  const methodInsertions = lesson.anchors
    .filter((anchor) => anchor.kind === "method")
    .map((anchor, index) => ({
      id: `method-${index}`,
      anchor_id: anchor.id,
      block_id: anchor.block_id,
      label: anchor.label,
      block: {
        id: `method-${index}`,
        kind: "inserted_paragraph" as const,
        source: "generated" as const,
        text_preview: `METHOD ${index}`,
        xml: `<w:p><w:r><w:t>METHOD ${index}</w:t></w:r></w:p>`,
        order_index: index
      }
    }));

  const composed = composeDocumentBlocks(lesson, methodInsertions);
  for (const insertion of methodInsertions) {
    const insertionIndex = composed.findIndex((block) => block.id === insertion.id);
    assert.ok(insertionIndex > 0, `missing method insertion ${insertion.id}`);
    const heading = composed[insertionIndex - 1];
    assert.match(
      heading.text_preview,
      SECTION_HEADING_PATTERN,
      `method ${insertion.id} must follow a section heading, not ${heading.text_preview}`
    );
  }
});

test("real enrichment places every generated method below its numeric section", async () => {
  const lesson = fixtureLessonForChapter(1);
  const enrichment = await enrichLessonDocument(lesson, new Set(["method"]));
  const composed = composeDocumentBlocks(lesson, enrichment.insertions);

  for (const insertion of enrichment.insertions) {
    const insertionIndex = composed.findIndex((block) => block.id === insertion.block.id);
    assert.ok(insertionIndex > 0, `missing generated method ${insertion.id}`);
    const prev = composed[insertionIndex - 1].text_preview;
    const prevPrev = insertionIndex > 1 ? composed[insertionIndex - 2].text_preview : "";
    assert.ok(
      SECTION_HEADING_PATTERN.test(prev) || SECTION_HEADING_PATTERN.test(prevPrev),
      `method must follow a section heading, got: ${prev}`
    );
  }
});

test("content starts with NỘI DUNG without a copied chapter-title continuation", () => {
  const lesson = fixtureLessonForChapter(1);
  const blocks = composeDocumentBlocks(lesson, []);
  const contentTitleIndex = blocks.findIndex((block) => block.id === "generated-content-title");

  assert.ok(contentTitleIndex >= 0);
  assert.match(blocks[contentTitleIndex + 1]?.text_preview || "", SECTION_HEADING_PATTERN);
  assert.doesNotMatch(blocks[contentTitleIndex + 1]?.text_preview || "", /CỦA TÂM LÝ HỌC QUÂN SỰ/i);
});

test("appends conclusion section III and diagram block at the end of the lesson", () => {
  const lesson = fixtureLesson();
  const blocks = composeDocumentBlocks(lesson, []);
  const conclusionTitle = blocks.find((b) => b.id === "generated-conclusion-title");
  const conclusionSubtitle = blocks.find((b) => b.id === "generated-conclusion-subtitle");
  const diagramBlock = blocks.find((b) => b.id === "generated-diagram-block");

  assert.ok(conclusionTitle, "missing conclusion title block");
  assert.equal(conclusionTitle.text_preview, "III. KẾT THÚC BÀI GIẢNG");
  assert.ok(conclusionSubtitle, "missing conclusion subtitle block");
  assert.match(conclusionSubtitle.text_preview, /Hệ thống nội dung bài giảng/);
  assert.ok(diagramBlock, "missing diagram block");
  assert.match(diagramBlock.xml || "", /w:drawing/);
});

test("pedagogical question sanitizer avoids mechanical definition questions like 'X là gì?'", () => {
  assert.equal(
    sanitizePedagogicalQuestion("Giáo dục là gì?", "Giáo dục"),
    "Theo các đồng chí, bản chất cốt lõi của Giáo dục thể hiện ở những đặc trưng nào?"
  );
  assert.equal(
    sanitizePedagogicalQuestion("Theo các đồng chí, Giáo dục học quân sự là gì?", "Giáo dục học quân sự"),
    "Theo các đồng chí, bản chất cốt lõi của Giáo dục học quân sự thể hiện ở những đặc trưng nào?"
  );
  assert.equal(
    sanitizePedagogicalQuestion("Theo đoạn nội dung vừa học, ý chính cần nắm là gì?", "Bài giảng"),
    "Theo các đồng chí, vấn đề cốt lõi cần nắm vững ở nội dung Bài giảng là gì?"
  );
  assert.equal(
    sanitizePedagogicalQuestion("Theo các đồng chí, giáo dục lúc này mang tính chất gì?", "Giáo dục"),
    "Theo các đồng chí, giáo dục lúc này mang tính chất gì?"
  );
});

test("extracts diagram data from CDR table if available with level 1 bold titles and level 2 bullets", () => {
  if (!fs.existsSync("CDR.docx")) return;
  const cdr = parseCdrDocument("CDR.docx");
  const gt = parseGtDocument(GT_FIXTURE);
  const chapter = gt.chapters.find((c) => c.chapter_number === 1);
  assert.ok(chapter);
  const lesson = buildLessonDocumentModel("lesson-cdr-diag", cdr.lessons[0], chapter);
  const diagram = buildLessonDiagramData(lesson);

  assert.ok(diagram.sections.length >= 2, "Expected at least 2 sections in lesson 1");
  assert.match(diagram.sections[0].title, /Đối tượng và những khái niệm/i);
  assert.ok(diagram.sections[0].children.length >= 3, "Expected at least 3 children in section 1");
  assert.match(diagram.sections[0].children[0], /Sơ lược về sự phát triển/i);
  assert.match(diagram.sections[1].title, /Nhiệm vụ, phương pháp nghiên cứu/i);
  assert.ok(diagram.sections[1].children.length >= 3, "Expected at least 3 children in section 2");
});
