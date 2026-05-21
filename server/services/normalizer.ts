import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
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

function toRoman(value: number): string {
  const numerals: [number, string][] = [
    [1000, "M"],
    [900, "CM"],
    [500, "D"],
    [400, "CD"],
    [100, "C"],
    [90, "XC"],
    [50, "L"],
    [40, "XL"],
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"]
  ];
  let remaining = value;
  const result: string[] = [];
  for (const [amount, marker] of numerals) {
    while (remaining >= amount) {
      result.push(marker);
      remaining -= amount;
    }
  }
  return result.join("");
}

function extractHeadingDepth(title: string): [number, string] {
  const stripped = title.trim();
  const alphaMatch = stripped.match(/^([a-z])\)\s*(.+)$/i);
  if (alphaMatch) {
    return [3, alphaMatch[2].trim()];
  }

  const numberMatch = stripped.match(/^(\d+(?:\s*\.\s*\d+)*)\s*\.?\s*(.+)$/);
  if (numberMatch) {
    const segments = numberMatch[1].match(/\d+/g) || [];
    const depth = segments.length;
    const normalizedDepth = depth <= 2 ? 1 : 2;
    return [normalizedDepth, numberMatch[2].trim()];
  }

  const romanMatch = stripped.match(/^([IVXLC]+)\s*\.?\s*(.+)$/i);
  if (romanMatch) {
    return [1, romanMatch[2].trim()];
  }

  return [2, stripped];
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

function rewriteBlockText(block: BlockNode, newText: string): BlockNode {
  if (!block.xml) {
    block.text_preview = newText;
    return block;
  }

  const doc = new DOMParser().parseFromString(block.xml, "text/xml");
  const textNodes = doc.getElementsByTagName("w:t");
  if (textNodes.length === 0) {
    block.text_preview = newText;
    return block;
  }

  textNodes[0].textContent = newText;
  for (let i = 1; i < textNodes.length; i++) {
    textNodes[i].textContent = "";
  }

  block.text_preview = newText;
  block.xml = new XMLSerializer().serializeToString(doc);
  return block;
}

function normalizeOutlineTitles(outline: OutlineNode[]): OutlineNode[] {
  let romanIndex = 0;
  let numericIndex = 0;
  const normalizedOutline: OutlineNode[] = [];

  for (const node of outline) {
    const [normalizedLevel, body] = extractHeadingDepth(node.original_title);
    const updated = { ...node };
    updated.level = normalizedLevel;

    if (normalizedLevel === 1) {
      romanIndex++;
      numericIndex = 0;
      updated.normalized_title = `${toRoman(romanIndex)}. ${body}`;
    } else if (normalizedLevel === 2) {
      numericIndex++;
      updated.normalized_title = `${numericIndex}. ${body}`;
    } else {
      updated.normalized_title = node.original_title;
    }

    normalizedOutline.push(updated);
  }

  return normalizedOutline;
}

function normalizePartTwo(
  gtChapter: ParsedGtChapter
): [BlockNode[], OutlineNode[]] {
  let partTwoBlocks = cloneBlocks(gtChapter.blocks);
  const blockIdMap: Record<string, string> = {};

  for (let i = 0; i < gtChapter.blocks.length; i++) {
    blockIdMap[gtChapter.blocks[i].id] = partTwoBlocks[i].id;
  }

  const normalizedOutline = normalizeOutlineTitles(gtChapter.outline);
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

  for (const block of partTwoBlocks) {
    const outlineNode = outlineByBlockId[block.id];
    if (outlineNode) {
      rewriteBlockText(block, outlineNode.normalized_title);
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
