import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import AdmZip from "adm-zip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { parseCdrDocument } from "../server/document_pipeline/parse_cdr";
import { parseGtDocument } from "../server/document_pipeline/parse_gt";
import { buildLessonDocumentModel } from "../server/services/normalizer";
import { enrichLessonDocument } from "../server/services/enrichment_service";
import { exportLessonDocument } from "../server/document_pipeline/export_docx";
import { CDR_FIXTURE, GT_FIXTURE } from "./fixtures";

function textRuns(xml: string): string {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  return Array.from(doc.getElementsByTagName("w:t"))
    .map((node: any) => node.textContent || "")
    .join("");
}

test("exports a package that retains GT styles, fonts, section properties, and source heading XML", () => {
  const cdr = parseCdrDocument(CDR_FIXTURE);
  const gt = parseGtDocument(GT_FIXTURE);
  const chapter = gt.chapters.find((item) => item.chapter_number === 2);
  assert.ok(chapter);
  const sourceHeading = chapter.blocks.find(
    (block) => /^2\s*\.\s*2\s*\./.test(block.text_preview) && block.text_preview.includes("NH")
  );
  assert.ok(sourceHeading);

  const lesson = buildLessonDocumentModel("lesson-1", cdr.lessons[0], chapter);
  const outputPath = path.join(os.tmpdir(), `k5-docx-preservation-${Date.now()}.docx`);

  try {
    exportLessonDocument(lesson, [], outputPath);
    const zip = new AdmZip(outputPath);
    const documentXml = zip.readAsText("word/document.xml");
    const document = new DOMParser().parseFromString(documentXml, "text/xml");
    const serializer = new XMLSerializer();
    const headingParagraph = Array.from(document.getElementsByTagName("w:p")).find(
      (paragraph: any) => textRuns(serializer.serializeToString(paragraph)).includes("II. NHÂN CÁCH QUÂN NHÂN")
    ) as any;

    assert.ok(zip.getEntry("word/styles.xml"));
    assert.ok(zip.getEntry("word/numbering.xml"));
    assert.ok(zip.getEntry("word/fontTable.xml"));
    assert.ok(headingParagraph, "expected the renumbered heading text in docx");
    assert.ok(headingParagraph.getElementsByTagName("w:pPr").length > 0);
    assert.ok(headingParagraph.getElementsByTagName("w:rPr").length > 0);
    assert.match(documentXml, /w:rFonts/);
    assert.match(documentXml, /w:sectPr/);
  } finally {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  }
});

test("exported DOCX contains NỘI DUNG and puts generated methods below headings", async () => {
  const cdr = parseCdrDocument(CDR_FIXTURE);
  const gt = parseGtDocument(GT_FIXTURE);
  const chapter = gt.chapters.find((item) => item.chapter_number === 1);
  assert.ok(chapter);

  const lesson = buildLessonDocumentModel("lesson-format-rules", cdr.lessons[0], chapter);
  const enrichment = await enrichLessonDocument(lesson, new Set(["method"]));
  const outputPath = path.join(os.tmpdir(), `k5-docx-format-rules-${Date.now()}.docx`);

  try {
    exportLessonDocument(lesson, enrichment.insertions, outputPath);
    const documentXml = new AdmZip(outputPath).readAsText("word/document.xml");
    const document = new DOMParser().parseFromString(documentXml, "text/xml");
    const paragraphs = Array.from(document.getElementsByTagName("w:p"))
      .map((paragraph: any) => textRuns(new XMLSerializer().serializeToString(paragraph)).trim())
      .filter(Boolean);
    const headingPattern = /^(\s*[IVXLC]+\s*\.\s+\S|\s*\d+\s*\.\s+\S)/i;

    assert.equal(paragraphs[0], paragraphs[0].toLocaleUpperCase("vi-VN"));
    assert.ok(paragraphs.some((text) => text.startsWith("NỘI DUNG")));
    assert.equal(paragraphs.includes("CỦA TÂM LÝ HỌC QUÂN SỰ"), false);

    const generatedMethodIndexes = paragraphs
      .map((text, index) => (text.startsWith("Phương pháp:") ? index : -1))
      .filter((index) => index >= 0);
    assert.ok(generatedMethodIndexes.length > 0);
    for (const index of generatedMethodIndexes) {
      assert.match(paragraphs[index - 1] || "", headingPattern);
    }
  } finally {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  }
});
