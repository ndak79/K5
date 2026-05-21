import { DOMParser } from "@xmldom/xmldom";
import { BlockNode, DocumentRange, findRangesByHeadingPattern } from "./ooxml_range_extractor";

export interface ScheduleItem {
  section_code: string;
  section_title: string;
  duration: string | null;
  duration_minutes: number | null;
  original_methods: string[];
  expected_outcomes: string[];
  cdr_refs: string[];
}

export interface ParsedCdrLesson {
  lesson_number: number;
  title: string;
  range: DocumentRange;
  blocks: BlockNode[];
  raw_outcomes: string[];
  schedule_items: ScheduleItem[];
}

export interface ParsedCdrDocument {
  source_path: string;
  lessons: ParsedCdrLesson[];
}

const LESSON_HEADING_PATTERN = "^(Bài|BÃ\u00A0i)\\s+\\d+";

function extractLessonNumber(title: string): number {
  const match = title.match(/(\d+)/);
  if (!match) {
    throw new Error(`Cannot extract lesson number from: ${title}`);
  }
  return parseInt(match[1], 10);
}

function normalizeCellText(text: string): string {
  return text.replace(/\xa0/g, " ").replace(/\s+/g, " ").trim();
}

function extractTableRows(block: BlockNode): string[][] {
  if (block.kind !== "table" || !block.xml) return [];

  const doc = new DOMParser().parseFromString(block.xml, "text/xml");
  const trs = doc.getElementsByTagName("w:tr");
  const rows: string[][] = [];

  for (let r = 0; r < trs.length; r++) {
    const tr = trs[r];
    const tcs = tr.getElementsByTagName("w:tc");
    const cells: string[] = [];

    for (let c = 0; c < tcs.length; c++) {
      const tc = tcs[c];
      const tElements = tc.getElementsByTagName("w:t");
      const parts: string[] = [];

      for (let t = 0; t < tElements.length; t++) {
        const textNode = tElements[t];
        if (textNode && textNode.textContent) {
          parts.push(textNode.textContent);
        }
      }
      cells.push(normalizeCellText(parts.join(" ")));
    }

    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  return rows;
}

function isScheduleHeader(row: string[]): boolean {
  const normalized = row.map(v => v.toLowerCase()).join(" ");
  const hasDuration = normalized.includes("thời gian") || normalized.includes("thá»\u0091i gian") || normalized.includes("thá» i gian");
  const hasMethods = normalized.includes("phương pháp") || normalized.includes("phÆ°Æ¡ng phÃ¡p");
  return hasDuration && hasMethods;
}

function extractDurationMinutes(rawValue: string): number | null {
  const normalized = normalizeCellText(rawValue);
  if (!normalized) return null;

  const compact = normalized.replace(/\s+/g, "");
  const hhmmMatch = compact.match(/(\d{1,2})[.:](\d{2})/);
  if (hhmmMatch) {
    return parseInt(hhmmMatch[1], 10) * 60 + parseInt(hhmmMatch[2], 10);
  }

  const minuteMatch = normalized.match(/(\d+)\s*phút/i);
  if (minuteMatch) {
    return parseInt(minuteMatch[1], 10);
  }

  const digitsMatch = compact.match(/^0*(\d{1,3})$/);
  if (digitsMatch) {
    return parseInt(digitsMatch[1], 10);
  }

  return null;
}

function normalizeSectionCode(rawValue: string): string | null {
  const compact = normalizeCellText(rawValue).replace(/\.+$/, "");
  if (/^[IVXLC]+$/.test(compact)) {
    return compact;
  }
  return null;
}

function splitRefs(rawValue: string): string[] {
  return rawValue.match(/\d+(?:\.\d+)+/g) || [];
}

function mergeRowValue(current: string | null, incoming: string): string | null {
  const normalized = normalizeCellText(incoming);
  if (!normalized) return current;
  if (!current) return normalized;
  return `${current}\n${normalized}`;
}

function extractScheduleItems(blocks: BlockNode[]): ScheduleItem[] {
  const scheduleItems: ScheduleItem[] = [];
  let currentItem: ScheduleItem | null = null;

  for (const block of blocks) {
    const rows = extractTableRows(block);
    for (const row of rows) {
      const paddedRow = [...row, "", "", "", "", "", ""].slice(0, 6);
      if (isScheduleHeader(paddedRow)) {
        currentItem = null;
        continue;
      }

      const sectionCode = normalizeSectionCode(paddedRow[0]);
      const sectionTitle = paddedRow[1];
      const duration = paddedRow[2];
      const methods = paddedRow[3];
      const outcomes = paddedRow[4];
      const refs = paddedRow[5];

      if (sectionCode) {
        currentItem = {
          section_code: sectionCode,
          section_title: normalizeCellText(sectionTitle),
          duration: normalizeCellText(duration) || null,
          duration_minutes: extractDurationMinutes(duration),
          original_methods: normalizeCellText(methods) ? [normalizeCellText(methods)] : [],
          expected_outcomes: normalizeCellText(outcomes) ? [normalizeCellText(outcomes)] : [],
          cdr_refs: splitRefs(refs)
        };
        scheduleItems.push(currentItem);
        continue;
      }

      if (currentItem === null) {
        continue;
      }

      currentItem.section_title = mergeRowValue(currentItem.section_title, sectionTitle) || "";
      currentItem.duration = mergeRowValue(currentItem.duration, duration);
      if (currentItem.duration_minutes === null) {
        currentItem.duration_minutes = extractDurationMinutes(duration);
      }
      if (normalizeCellText(methods)) {
        currentItem.original_methods.push(normalizeCellText(methods));
      }
      if (normalizeCellText(outcomes)) {
        currentItem.expected_outcomes.push(normalizeCellText(outcomes));
      }
      currentItem.cdr_refs.push(...splitRefs(refs));
    }
  }

  return scheduleItems;
}

export function parseCdrDocument(documentPath: string): ParsedCdrDocument {
  const lessons: ParsedCdrLesson[] = [];
  const ranges = findRangesByHeadingPattern(documentPath, LESSON_HEADING_PATTERN, "cdr");

  for (const [title, documentRange, blockNodes] of ranges) {
    const rawOutcomes = blockNodes
      .filter(b => b.text_preview.toLowerCase().includes("chuẩn đầu ra") || b.text_preview.toLowerCase().includes("chuáº©n Ä‘áº§u ra"))
      .map(b => b.text_preview);

    lessons.push({
      lesson_number: extractLessonNumber(title),
      title: title,
      range: documentRange,
      blocks: blockNodes,
      raw_outcomes: rawOutcomes,
      schedule_items: extractScheduleItems(blockNodes)
    });
  }

  return {
    source_path: documentPath,
    lessons
  };
}
