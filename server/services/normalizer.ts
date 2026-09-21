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

export function toRoman(num: number): string {
  const romanMap: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]
  ];
  let res = "";
  let n = num;
  for (const [val, letter] of romanMap) {
    while (n >= val) {
      res += letter;
      n -= val;
    }
  }
  return res || "I";
}

export function stripHeadingPrefix(text: string): string {
  let s = text.replace(/^\s*\d+(?:\s*\.\s*\d+)*\s*[.:]?\s+/, "");
  s = s.replace(/^\s*[IVXLC]+\s*[.:]\s+/, "");
  return s.trim();
}

export function updateHeadingXml(
  xml: string | null | undefined,
  newPrefix: string,
  isUpperCase = false
): string | null {
  if (!xml) return xml || null;
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const textNodes = Array.from(doc.getElementsByTagName("w:t"));
  if (textNodes.length === 0) return xml;

  const fullText = textNodes.map((n) => n.textContent || "").join("");
  const match = fullText.match(/^(\s*\d+(?:\s*\.\s*\d+)*\s*[.:]?\s+|\s*[IVXLC]+\s*[.:]\s+)/);
  if (!match) {
    return xml;
  }

  const prefixLen = match[0].length;
  let remaining = prefixLen;
  for (let i = 0; i < textNodes.length; i++) {
    const node = textNodes[i];
    const t = node.textContent || "";
    if (remaining > 0) {
      if (t.length <= remaining) {
        remaining -= t.length;
        node.textContent = "";
      } else {
        node.textContent = t.slice(remaining);
        remaining = 0;
      }
    }
    if (isUpperCase && node.textContent) {
      node.textContent = node.textContent.toLocaleUpperCase("vi-VN");
    }
  }

  textNodes[0].textContent = newPrefix + (textNodes[0].textContent || "");
  textNodes[0].setAttribute("xml:space", "preserve");
  return new XMLSerializer().serializeToString(doc.documentElement);
}

function renumberOutlineAndBlocks(
  partTwoBlocks: BlockNode[],
  outlines: OutlineNode[]
): void {
  const blockById: Record<string, BlockNode> = {};
  for (const block of partTwoBlocks) {
    blockById[block.id] = block;
  }

  let level1Counter = 0;
  let level2Counter = 0;

  for (const node of outlines) {
    if (node.level === 1) {
      level1Counter++;
      level2Counter = 0;
      const newPrefix = `${toRoman(level1Counter)}. `;
      const stripped = stripHeadingPrefix(node.original_title).toLocaleUpperCase("vi-VN");
      const newTitle = `${newPrefix}${stripped}`;
      node.normalized_title = newTitle;

      if (node.block_id && blockById[node.block_id]) {
        const block = blockById[node.block_id];
        block.text_preview = newTitle;
        if (block.xml) {
          block.xml = updateHeadingXml(block.xml, newPrefix, true) || block.xml;
        }
      }
    } else if (node.level === 2) {
      level2Counter++;
      const newPrefix = `${level2Counter}. `;
      const stripped = stripHeadingPrefix(node.original_title);
      const newTitle = `${newPrefix}${stripped}`;
      node.normalized_title = newTitle;

      if (node.block_id && blockById[node.block_id]) {
        const block = blockById[node.block_id];
        block.text_preview = newTitle;
        if (block.xml) {
          block.xml = updateHeadingXml(block.xml, newPrefix, false) || block.xml;
        }
      }
    }
  }
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

  renumberOutlineAndBlocks(partTwoBlocks, normalizedOutline);

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
