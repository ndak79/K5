import { BlockNode, OutlineNode, ParsedGtChapter, normalizeTextKey } from "../document_pipeline/parse_gt";
import { ParsedCdrLesson } from "../document_pipeline/parse_cdr";
import { locateAnchors, Anchor } from "./anchor_locator";

export interface ExcludedRange {
  label: string;
  start_block_id: string | null;
  end_block_id: string | null;
  start_outline_id?: string | null;
  end_outline_id?: string | null;
}

export interface LessonDocumentModel {
  lesson_id: string;
  lesson_title: string;
  cdr_lesson: ParsedCdrLesson;
  gt_chapter: ParsedGtChapter;
  part_one_blocks: BlockNode[];
  part_two_blocks: BlockNode[];
  excluded_ranges: ExcludedRange[];
  anchors: Anchor[];
}

export interface GeneratedInsertion {
  id: string;
  anchor_id: string;
  block_id: string | null;
  label: string;
  block: BlockNode;
}

export function cloneBlocks(blocks: BlockNode[], source?: "cdr" | "gt" | "generated"): BlockNode[] {
  return blocks.map((block, index) => {
    const cloned = JSON.parse(JSON.stringify(block)) as BlockNode;
    cloned.id = `${block.id}-clone-${index}`;
    if (source) {
      cloned.source = source;
    }
    return cloned;
  });
}

function collectExcludedRanges(blocks: BlockNode[]): ExcludedRange[] {
  const excludedRanges: ExcludedRange[] = [];
  let activeStartBlockId: string | null = null;
  let activeEndBlockId: string | null = null;

  for (const block of blocks) {
    const text = block.text_preview.trim();
    if (!text) {
      if (activeStartBlockId !== null) {
        activeEndBlockId = block.id;
      }
      continue;
    }

    const normalizedKey = normalizeTextKey(text);
    if (activeStartBlockId === null && normalizedKey === "van de nghien cuu") {
      activeStartBlockId = block.id;
      activeEndBlockId = block.id;
      continue;
    }

    if (activeStartBlockId === null) {
      continue;
    }

    if (/^\d+\./.test(text)) {
      activeEndBlockId = block.id;
      continue;
    }

    excludedRanges.push({
      label: "van_de_nghien_cuu",
      start_block_id: activeStartBlockId,
      end_block_id: activeEndBlockId
    });
    activeStartBlockId = null;
    activeEndBlockId = null;
  }

  if (activeStartBlockId !== null) {
    excludedRanges.push({
      label: "van_de_nghien_cuu",
      start_block_id: activeStartBlockId,
      end_block_id: activeEndBlockId
    });
  }

  return excludedRanges;
}

function normalizePartTwo(
  gtChapter: ParsedGtChapter
): [BlockNode[], OutlineNode[]] {
  let partTwoBlocks = cloneBlocks(gtChapter.blocks);
  const blockIdMap: Record<string, string> = {};

  for (let i = 0; i < gtChapter.blocks.length; i++) {
    blockIdMap[gtChapter.blocks[i].id] = partTwoBlocks[i].id;
  }

  const normalizedOutline = gtChapter.outline.map((node) => ({ ...node }));
  for (const node of normalizedOutline) {
    if (node.block_id) {
      node.block_id = blockIdMap[node.block_id] || null;
    }
  }

  const outlineByBlockId: Record<string, OutlineNode> = {};
  for (const node of normalizedOutline) {
    if (node.block_id) {
      outlineByBlockId[node.block_id] = node;
    }
  }

  if (normalizedOutline.length > 0 && normalizedOutline[0].block_id) {
    const firstContentBlockId = normalizedOutline[0].block_id;
    const firstIndex = partTwoBlocks.findIndex((b) => b.id === firstContentBlockId);
    if (firstIndex !== -1) {
      partTwoBlocks = partTwoBlocks.slice(firstIndex);
    }
  }

  return [partTwoBlocks, normalizedOutline];
}

export function buildLessonDocumentModel(
  lessonId: string,
  cdrLesson: ParsedCdrLesson,
  gtChapter: ParsedGtChapter
): LessonDocumentModel {
  const [partTwoBlocks, normalizedOutline] = normalizePartTwo(gtChapter);
  const excludedRanges = collectExcludedRanges(partTwoBlocks);

  const normalizedGtChapter: ParsedGtChapter = {
    ...gtChapter,
    blocks: partTwoBlocks,
    outline: normalizedOutline
  };

  return {
    lesson_id: lessonId,
    lesson_title: cdrLesson.title,
    cdr_lesson: cdrLesson,
    gt_chapter: normalizedGtChapter,
    part_one_blocks: cloneBlocks(cdrLesson.blocks),
    part_two_blocks: partTwoBlocks,
    excluded_ranges: excludedRanges,
    anchors: locateAnchors(cdrLesson, normalizedGtChapter)
  };
}
