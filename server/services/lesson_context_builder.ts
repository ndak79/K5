import { BlockNode, OutlineNode } from "../document_pipeline/parse_gt";
import { LessonDocumentModel } from "./normalizer";

export interface LessonContextSection {
  outline_id: string;
  level: number;
  title: string;
  path: string;
  is_leaf: boolean;
  duration_minutes: number;
  body_block_ids: string[];
  body_block_texts: string[];
  body_block_count: number;
  body_char_count: number;
  question_quota_min: number;
  question_quota_max: number;
}

export interface LessonContextPayload {
  lesson_id: string;
  lesson_title: string;
  excluded_range_labels: string[];
  sections: LessonContextSection[];
}

function findOutlineIndex(outlines: OutlineNode[], outlineId: string): number | null {
  const idx = outlines.findIndex((o) => o.id === outlineId);
  return idx === -1 ? null : idx;
}

function findBlockIndex(blocks: BlockNode[], blockId: string | null): number | null {
  if (!blockId) return null;
  const idx = blocks.findIndex((b) => b.id === blockId);
  return idx === -1 ? null : idx;
}

function isLeafOutline(outlines: OutlineNode[], outline: OutlineNode): boolean {
  const outlineIndex = findOutlineIndex(outlines, outline.id);
  if (outlineIndex === null) return true;

  for (let i = outlineIndex + 1; i < outlines.length; i++) {
    const candidate = outlines[i];
    if (candidate.level <= outline.level) {
      return true;
    }
    if (candidate.level > outline.level) {
      return false;
    }
  }
  return true;
}

function buildOutlinePath(outlines: OutlineNode[], outline: OutlineNode): string {
  const outlineIndex = findOutlineIndex(outlines, outline.id);
  if (outlineIndex === null) {
    return outline.normalized_title;
  }

  const path: string[] = [];
  let currentLevel = outline.level;

  for (let i = outlineIndex; i >= 0; i--) {
    const candidate = outlines[i];
    if (candidate.level <= currentLevel) {
      path.push(candidate.normalized_title);
      currentLevel = candidate.level - 1;
    }
    if (candidate.level === 1) {
      break;
    }
  }

  return path.reverse().join(" > ");
}

function collectExcludedBlockIds(lesson: LessonDocumentModel): Set<string> {
  const excludedIds = new Set<string>();
  const blockIds = lesson.part_two_blocks.map((b) => b.id);
  const idToIndex: Record<string, number> = {};
  blockIds.forEach((id, index) => {
    idToIndex[id] = index;
  });

  for (const range of lesson.excluded_ranges) {
    const startIndex = idToIndex[range.start_block_id || ""];
    let endIndex = idToIndex[range.end_block_id || ""];

    if (startIndex === undefined) continue;
    if (endIndex === undefined) {
      endIndex = startIndex;
    }

    for (let index = startIndex; index <= endIndex; index++) {
      excludedIds.add(blockIds[index]);
    }
  }

  return excludedIds;
}

function sectionBodyBlocks(
  lesson: LessonDocumentModel,
  outline: OutlineNode,
  excludedBlockIds: Set<string>
): BlockNode[] {
  const blocks = lesson.part_two_blocks;
  const outlines = lesson.gt_chapter.outline;
  const outlineIndex = findOutlineIndex(outlines, outline.id);
  const startIndex = findBlockIndex(blocks, outline.block_id);

  if (outlineIndex === null || startIndex === null) {
    return [];
  }

  let endIndex = blocks.length;
  for (let i = outlineIndex + 1; i < outlines.length; i++) {
    const candidate = outlines[i];
    const candidateBlockIndex = findBlockIndex(blocks, candidate.block_id);
    if (candidateBlockIndex === null) continue;
    if (candidate.level <= outline.level) {
      endIndex = candidateBlockIndex;
      break;
    }
  }

  const sectionBlocks = blocks.slice(startIndex, endIndex);
  const outlineBlockIds = new Set(outlines.map((o) => o.block_id).filter(Boolean));

  return sectionBlocks.filter(
    (block) =>
      block.kind === "paragraph" &&
      block.text_preview.trim().length > 0 &&
      !excludedBlockIds.has(block.id) &&
      !outlineBlockIds.has(block.id)
  );
}

function durationMinutesForOutline(lesson: LessonDocumentModel, outline: OutlineNode): number {
  let sectionTitle = "";
  if (outline.level === 1) {
    sectionTitle = outline.normalized_title;
  } else {
    sectionTitle = buildOutlinePath(lesson.gt_chapter.outline, outline).split(" > ")[0];
  }

  for (const item of lesson.cdr_lesson.schedule_items) {
    if (item.section_code && sectionTitle.startsWith(`${item.section_code}.`)) {
      return item.duration_minutes || 0;
    }
  }

  return 0;
}

function questionQuotaBounds(
  bodyBlockCount: number,
  bodyCharCount: number,
  durationMinutes: number
): [number, number] {
  if (bodyBlockCount <= 0 || bodyCharCount <= 2000) {
    return [0, 0];
  }
  if (bodyCharCount <= 6000) {
    return [1, 1];
  }
  if (bodyCharCount <= 8000) {
    return [2, 2];
  }
  return [3, 3];
}

export function buildLessonContext(lesson: LessonDocumentModel): LessonContextPayload {
  const excludedBlockIds = collectExcludedBlockIds(lesson);
  const sections: LessonContextSection[] = [];

  for (const outline of lesson.gt_chapter.outline) {
    const bodyBlocks = sectionBodyBlocks(lesson, outline, excludedBlockIds);
    if (bodyBlocks.length === 0) continue;

    const durationMinutes = durationMinutesForOutline(lesson, outline);
    const bodyCharCount = bodyBlocks.reduce((sum, b) => sum + b.text_preview.trim().length, 0);

    const [questionQuotaMin, questionQuotaMax] = questionQuotaBounds(
      bodyBlocks.length,
      bodyCharCount,
      durationMinutes
    );

    sections.push({
      outline_id: outline.id,
      level: outline.level,
      title: outline.normalized_title,
      path: buildOutlinePath(lesson.gt_chapter.outline, outline),
      is_leaf: isLeafOutline(lesson.gt_chapter.outline, outline),
      duration_minutes: durationMinutes,
      body_block_ids: bodyBlocks.map((b) => b.id),
      body_block_texts: bodyBlocks.map((b) => b.text_preview),
      body_block_count: bodyBlocks.length,
      body_char_count: bodyCharCount,
      question_quota_min: questionQuotaMin,
      question_quota_max: questionQuotaMax
    });
  }

  return {
    lesson_id: lesson.lesson_id,
    lesson_title: lesson.lesson_title,
    excluded_range_labels: lesson.excluded_ranges.map((r) => r.label),
    sections
  };
}
