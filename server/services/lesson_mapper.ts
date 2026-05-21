import { ParsedCdrDocument } from "../document_pipeline/parse_cdr";
import { ParsedGtDocument } from "../document_pipeline/parse_gt";

function normalizeTitle(title: string): string {
  const normalized = title.toLowerCase().replace(/[^\w\s]/g, " ");
  const stripped = normalized.replace(/\b(chương|bài)\b/g, " ");
  return stripped.split(/\s+/).filter(Boolean).join(" ");
}

export function mapLessonsToChapters(
  cdrDocument: ParsedCdrDocument,
  gtDocument: ParsedGtDocument
): Record<number, number> {
  const chapterByNumber: Record<number, number> = {};
  for (const chapter of gtDocument.chapters) {
    chapterByNumber[chapter.chapter_number] = chapter.chapter_number;
  }

  const mapping: Record<number, number> = {};

  for (const lesson of cdrDocument.lessons) {
    if (chapterByNumber[lesson.lesson_number] !== undefined) {
      mapping[lesson.lesson_number] = lesson.lesson_number;
      continue;
    }

    const lessonTitleNormalized = normalizeTitle(lesson.title);
    for (const chapter of gtDocument.chapters) {
      if (normalizeTitle(chapter.title) === lessonTitleNormalized) {
        mapping[lesson.lesson_number] = chapter.chapter_number;
        break;
      }
    }
  }

  return mapping;
}
