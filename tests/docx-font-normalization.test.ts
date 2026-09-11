import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import AdmZip from "adm-zip";
import { DOMParser } from "@xmldom/xmldom";
import { parseCdrDocument } from "../server/document_pipeline/parse_cdr";
import { parseGtDocument } from "../server/document_pipeline/parse_gt";
import { buildLessonDocumentModel } from "../server/services/normalizer";
import { exportLessonDocument } from "../server/document_pipeline/export_docx";
import { compileOptimizedDocx } from "../server/services/bloom_service";
import { CDR_FIXTURE, GT_FIXTURE } from "./fixtures";

const REQUIRED_FONT = "Times New Roman";

function assertDocxUsesTimesNewRoman(filePath: string): void {
  const zip = new AdmZip(filePath);
  const xmlEntries = zip.getEntries().filter(
    (entry) => entry.entryName.startsWith("word/") && entry.entryName.endsWith(".xml")
  );
  let fontAssignmentCount = 0;

  for (const entry of xmlEntries) {
    const xml = zip.readAsText(entry);
    const doc = new DOMParser().parseFromString(xml, "text/xml");

    for (const run of Array.from(doc.getElementsByTagName("w:r")) as any[]) {
      const fonts = Array.from(run.getElementsByTagName("w:rFonts"))[0] as any;
      assert.ok(fonts, `${entry.entryName} has a run without a font assignment`);
      for (const attribute of ["ascii", "hAnsi", "eastAsia", "cs"]) {
        assert.equal(
          fonts.getAttribute(`w:${attribute}`),
          REQUIRED_FONT,
          `${entry.entryName} has a run with a non-Times New Roman ${attribute} assignment`
        );
      }
    }

    for (const fonts of Array.from(doc.getElementsByTagName("w:rFonts")) as any[]) {
      fontAssignmentCount++;
      for (const attribute of ["ascii", "hAnsi", "eastAsia", "cs"]) {
        assert.equal(
          fonts.getAttribute(`w:${attribute}`),
          REQUIRED_FONT,
          `${entry.entryName} has a non-Times New Roman ${attribute} assignment`
        );
      }
      for (const themeAttribute of ["asciiTheme", "hAnsiTheme", "eastAsiaTheme", "csTheme"]) {
        assert.equal(
          fonts.getAttribute(`w:${themeAttribute}`) || "",
          "",
          `${entry.entryName} still has a theme font assignment`
        );
      }
    }

    if (entry.entryName === "word/styles.xml") {
      const defaults = Array.from(doc.getElementsByTagName("w:docDefaults"))[0] as any;
      const defaultRunProperties = defaults
        ? (Array.from(defaults.getElementsByTagName("w:rPr"))[0] as any)
        : null;
      const defaultFonts = defaultRunProperties
        ? (Array.from(defaultRunProperties.getElementsByTagName("w:rFonts"))[0] as any)
        : null;
      assert.ok(defaultFonts, "word/styles.xml must define a Times New Roman document default font");
      for (const attribute of ["ascii", "hAnsi", "eastAsia", "cs"]) {
        assert.equal(defaultFonts.getAttribute(`w:${attribute}`), REQUIRED_FONT);
      }
    }

    if (entry.entryName === "word/theme/theme1.xml") {
      for (const font of Array.from(doc.getElementsByTagName("a:latin")) as any[]) {
        assert.equal(font.getAttribute("typeface"), REQUIRED_FONT);
      }
      for (const font of Array.from(doc.getElementsByTagName("a:ea")) as any[]) {
        assert.equal(font.getAttribute("typeface"), REQUIRED_FONT);
      }
      for (const font of Array.from(doc.getElementsByTagName("a:cs")) as any[]) {
        assert.equal(font.getAttribute("typeface"), REQUIRED_FONT);
      }
    }
  }

  assert.ok(fontAssignmentCount > 0, "expected the exported package to contain font assignments");
}

test("normal lesson DOCX export forces every font assignment to Times New Roman", () => {
  const cdr = parseCdrDocument(CDR_FIXTURE);
  const gt = parseGtDocument(GT_FIXTURE);
  const chapter = gt.chapters.find((item) => item.chapter_number === 2);
  assert.ok(chapter);
  const lesson = buildLessonDocumentModel("font-lesson", cdr.lessons[0], chapter);
  const outputPath = path.join(os.tmpdir(), `k5-font-normal-${Date.now()}.docx`);

  try {
    exportLessonDocument(lesson, [], outputPath);
    assertDocxUsesTimesNewRoman(outputPath);
  } finally {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  }
});

test("Bloom optimized DOCX export forces every font assignment to Times New Roman", () => {
  const cdr = parseCdrDocument(CDR_FIXTURE);
  const outputPath = path.join(os.tmpdir(), `k5-font-bloom-${Date.now()}.docx`);

  try {
    compileOptimizedDocx(
      {
        cdr_original_path: CDR_FIXTURE,
        parsed_cdr: cdr
      },
      outputPath
    );
    assertDocxUsesTimesNewRoman(outputPath);
  } finally {
    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
  }
});
