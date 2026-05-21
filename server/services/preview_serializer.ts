import { DOMParser } from "@xmldom/xmldom";
import { BlockNode } from "../document_pipeline/ooxml_range_extractor";
import { GeneratedInsertion, LessonDocumentModel } from "./normalizer";
import { composeDocumentBlocks } from "./document_composer";

function extractTableRows(block: BlockNode): string[][] | null {
  if (block.kind !== "table" || !block.xml) {
    return null;
  }

  const doc = new DOMParser().parseFromString(block.xml, "text/xml");
  const trs = doc.getElementsByTagName("w:tr");
  const resultRows: string[][] = [];

  for (let r = 0; r < trs.length; r++) {
    const tr = trs[r];
    const tcs = tr.getElementsByTagName("w:tc");
    const cells: string[] = [];

    for (let c = 0; c < tcs.length; c++) {
      const tc = tcs[c];
      const tList = tc.getElementsByTagName("w:t");
      const parts: string[] = [];

      for (let t = 0; t < tList.length; t++) {
        const textNode = tList[t];
        if (textNode && textNode.textContent) {
          parts.push(textNode.textContent);
        }
      }
      cells.push(parts.join(" ").replace(/\s+/g, " ").trim());
    }

    if (cells.some((cell) => cell.length > 0)) {
      resultRows.push(cells);
    }
  }

  return resultRows.length > 0 ? resultRows : null;
}

function serializeBlock(block: BlockNode): Record<string, any> {
  const payload: Record<string, any> = {
    id: block.id,
    kind: block.kind,
    source: block.source,
    textPreview: block.text_preview,
    styleRef: block.style_ref ?? null,
    anchorRef: block.anchor_ref ?? null,
    orderIndex: block.order_index
  };

  const tableRows = extractTableRows(block);
  if (tableRows !== null) {
    payload.tableRows = tableRows;
  }

  return payload;
}

export function serializeLessonPreview(
  lesson: LessonDocumentModel,
  generatedInsertions: GeneratedInsertion[] | null = null
): Record<string, any> {
  const insertions = generatedInsertions || [];

  return {
    lessonId: lesson.lesson_id,
    lessonTitle: lesson.lesson_title,
    partOneBlocks: lesson.part_one_blocks.map((b) => serializeBlock(b)),
    partTwoBlocks: lesson.part_two_blocks.map((b) => serializeBlock(b)),
    documentBlocks: composeDocumentBlocks(lesson, insertions).map((b) => serializeBlock(b)),
    anchors: lesson.anchors.map((anchor) => ({
      id: anchor.id,
      kind: anchor.kind,
      label: anchor.label,
      block_id: anchor.block_id,
      outline_id: anchor.outline_id ?? null,
      outline_level: anchor.outline_level ?? null,
      question_count: anchor.question_count ?? null,
      evidence_block_ids: anchor.evidence_block_ids || []
    })),
    generatedBlocks: insertions.map((ins) => serializeBlock(ins.block))
  };
}
