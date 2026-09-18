import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { LessonDocumentModel, GeneratedInsertion } from "../services/normalizer";
import { composeDocumentBlocks } from "../services/document_composer";
import { DocxBlockInput, ExtraPackageMedia, mergeDocxPackages } from "./docx_package_merger";
import { buildLessonDiagramData, renderLessonDiagramPng } from "./lesson_diagram";

function buildExportBlocks(
  lesson: LessonDocumentModel,
  insertions: GeneratedInsertion[],
  diagramOptions?: { rId?: string; cx?: number; cy?: number }
): DocxBlockInput[] {
  const cdrPath = lesson.cdr_lesson.range.document_path;
  const gtPath = lesson.gt_chapter.range.document_path;
  return composeDocumentBlocks(lesson, insertions, { diagramOptions })
    .filter((block) => !!block.xml)
    .map((block) => ({
      xml: block.xml!,
      sourcePath: path.resolve(block.source === "cdr" ? cdrPath : gtPath)
    }));
}

export function exportLessonDocument(
  lesson: LessonDocumentModel,
  insertions: GeneratedInsertion[],
  outputPath: string
): string {
  const cdrPath = path.resolve(lesson.cdr_lesson.range.document_path);
  const gtPath = path.resolve(lesson.gt_chapter.range.document_path);

  // Render diagram PNG
  const diagramData = buildLessonDiagramData(lesson);
  const tempPngPath = path.join(os.tmpdir(), `diagram_${lesson.lesson_id}_${Date.now()}.png`);
  let diagramDims = { width: 1200, height: 600 };
  let diagramBytes: Buffer | null = null;

  try {
    diagramDims = renderLessonDiagramPng(diagramData, tempPngPath);
    if (fs.existsSync(tempPngPath)) {
      diagramBytes = fs.readFileSync(tempPngPath);
    }
  } catch (err) {
    console.warn("Failed to generate diagram for export:", err);
  } finally {
    if (fs.existsSync(tempPngPath)) {
      try {
        fs.unlinkSync(tempPngPath);
      } catch {}
    }
  }

  const cx = 5760000;
  const cy = Math.round(cx * (diagramDims.height / (diagramDims.width || 1)));

  const blocks = buildExportBlocks(lesson, insertions, { rId: "rIdDiagramEnding", cx, cy });

  const extraMedia: ExtraPackageMedia[] = diagramBytes
    ? [
        {
          partPath: "word/media/lesson_diagram.png",
          bytes: diagramBytes,
          relId: "rIdDiagramEnding",
          contentType: "image/png"
        }
      ]
    : [];

  return mergeDocxPackages(gtPath, cdrPath, blocks, outputPath, extraMedia);
}
