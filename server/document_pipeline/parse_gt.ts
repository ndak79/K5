import { BlockNode, DocumentRange, findRangesByHeadingPattern } from "./ooxml_range_extractor";

export type { BlockNode, DocumentRange };

export interface OutlineNode {
  id: string;
  level: number;
  original_title: string;
  normalized_title: string;
  block_id: string | null;
  block_order_index: number | null;
  body?: string[];
}

export interface ParsedGtChapter {
  chapter_number: number;
  title: string;
  range: DocumentRange;
  blocks: BlockNode[];
  outline: OutlineNode[];
}

export interface ParsedGtDocument {
  source_path: string;
  chapters: ParsedGtChapter[];
}

const CHAPTER_HEADING_PATTERN = "^(Ch(?:ươ|uơ|uô|ươ|u)ng)\\s+\\d+";

function extractChapterNumber(title: string): number {
  const match = title.match(/(\d+)/);
  if (!match) {
    throw new Error(`Cannot extract chapter number from: {title}`);
  }
  return parseInt(match[1], 10);
}

export function normalizeTextKey(value: string): string {
  let normalized = value.normalize("NFKD");
  normalized = normalized.replace(/[\u0300-\u036f]/g, "");
  normalized = normalized.replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
  normalized = normalized.replace(/[^a-z0-9\s]/g, " ");
  normalized = normalized.replace(/\s+/g, " ");
  return normalized.trim();
}

function buildOutline(blocks: BlockNode[]): OutlineNode[] {
  const outlineNodes: OutlineNode[] = [];
  let insideResearchIssueList = false;

  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    const text = block.text_preview.trim();
    if (!text) continue;

    const normalizedKey = normalizeTextKey(text);
    if (normalizedKey === "van de nghien cuu") {
      insideResearchIssueList = true;
      continue;
    }

    if (insideResearchIssueList) {
      if (/^\d+\./.test(text)) {
        continue;
      }
      insideResearchIssueList = false;
    }

    let level: number | null = null;
    if (/^[IVXLC]+\b/i.test(text)) {
      level = 1;
    } else if (/^\d+(\.\d+)*\b/.test(text)) {
      level = 2;
    } else if (/^[a-z]\)/i.test(text)) {
      level = 3;
    }

    if (level === null) {
      continue;
    }

    outlineNodes.push({
      id: `outline-${index}`,
      level,
      original_title: text,
      normalized_title: text,
      block_id: block.id,
      block_order_index: block.order_index
    });
  }

  return outlineNodes;
}

export function parseGtDocument(documentPath: string): ParsedGtDocument {
  const chapters: ParsedGtChapter[] = [];
  const ranges = findRangesByHeadingPattern(documentPath, CHAPTER_HEADING_PATTERN, "gt");

  for (const [title, documentRange, blockNodes] of ranges) {
    chapters.push({
      chapter_number: extractChapterNumber(title),
      title: title,
      range: documentRange,
      blocks: blockNodes,
      outline: buildOutline(blockNodes)
    });
  }

  return {
    source_path: documentPath,
    chapters
  };
}
