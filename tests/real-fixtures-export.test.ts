import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import AdmZip from "adm-zip";
import { parseCdrDocument } from "../server/document_pipeline/parse_cdr";
import { parseGtDocument } from "../server/document_pipeline/parse_gt";
import { mapLessonsToChapters } from "../server/services/lesson_mapper";
import { buildLessonDocumentModel } from "../server/services/normalizer";
import { exportLessonDocument } from "../server/document_pipeline/export_docx";
import { CDR_FIXTURE, GT_FIXTURE } from "./fixtures";

test("exports all mapped lessons from the supplied CDR and GT fixtures", () => {
  const cdr = parseCdrDocument(CDR_FIXTURE);
  const gt = parseGtDocument(GT_FIXTURE);
  const mapping = mapLessonsToChapters(cdr, gt);

  assert.equal(cdr.lessons.length, 10);
  assert.equal(Object.keys(mapping).length, cdr.lessons.length);

  for (const lesson of cdr.lessons) {
    const chapterNumber = mapping[lesson.lesson_number];
    const chapter = gt.chapters.find((item) => item.chapter_number === chapterNumber);
    assert.ok(chapter, `expected a mapped chapter for lesson ${lesson.lesson_number}`);
    const model = buildLessonDocumentModel(`lesson-${lesson.lesson_number}`, lesson, chapter);
    const outputPath = path.join(os.tmpdir(), `k5-real-fixture-${lesson.lesson_number}.docx`);

    try {
      exportLessonDocument(model, [], outputPath);
      const zip = new AdmZip(outputPath);
      const documentXml = zip.readAsText("word/document.xml");
      assert.ok(zip.getEntry("word/styles.xml"));
      assert.ok(zip.getEntry("word/numbering.xml"));
      assert.ok(zip.getEntry("word/fontTable.xml"));
      assert.match(documentXml, /<w:sectPr/);
    } finally {
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
    }
  }
});
