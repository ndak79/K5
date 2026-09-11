import * as path from "node:path";
import { LessonDocumentModel, GeneratedInsertion } from "../services/normalizer";
import { composeDocumentBlocks } from "../services/document_composer";
import { DocxBlockInput, mergeDocxPackages } from "./docx_package_merger";

function buildExportBlocks(lesson: LessonDocumentModel, insertions: GeneratedInsertion[]): DocxBlockInput[] {
  const cdrPath = lesson.cdr_lesson.range.document_path;
  const gtPath = lesson.gt_chapter.range.document_path;
  return composeDocumentBlocks(lesson, insertions)
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
  const blocks = buildExportBlocks(lesson, insertions);
  return mergeDocxPackages(gtPath, cdrPath, blocks, outputPath);
}
