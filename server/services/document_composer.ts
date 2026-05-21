import { BlockNode } from "../document_pipeline/ooxml_range_extractor";
import { GeneratedInsertion, LessonDocumentModel } from "./normalizer";
import { buildInsertedParagraphXml, inheritStyle } from "./style_inheritance";

function buildContentTitleText(lesson: LessonDocumentModel): string {
  const totalMinutes = lesson.cdr_lesson.schedule_items.reduce(
    (sum, item) => sum + (item.duration_minutes || 0),
    0
  );
  if (totalMinutes > 0) {
    return `NỘI DUNG (${totalMinutes} phút)`;
  }
  return "NỘI DUNG";
}

export function buildContentTitleBlock(
  lesson: LessonDocumentModel,
  referenceBlock: BlockNode | null,
  orderIndex: number
): BlockNode {
  const style = inheritStyle(referenceBlock);
  const titleText = buildContentTitleText(lesson);

  return {
    id: "generated-content-title",
    kind: "inserted_paragraph",
    source: "generated",
    text_preview: titleText,
    xml: buildInsertedParagraphXml(titleText, style, {
      italic: false,
      bold: true,
      align: "center",
      page_break_before: true
    }),
    order_index: orderIndex
  };
}

function isBlankParagraph(block: BlockNode): boolean {
  return block.kind === "paragraph" && !block.text_preview.trim();
}

function trimBoundaryBlanks(
  blocks: BlockNode[],
  options?: { trimStart?: boolean; trimEnd?: boolean }
): BlockNode[] {
  let startIndex = 0;
  let endIndex = blocks.length;

  if (options?.trimStart) {
    while (startIndex < endIndex && isBlankParagraph(blocks[startIndex])) {
      startIndex++;
    }
  }

  if (options?.trimEnd) {
    while (endIndex > startIndex && isBlankParagraph(blocks[endIndex - 1])) {
      endIndex--;
    }
  }

  return blocks.slice(startIndex, endIndex);
}

export function composeDocumentBlocks(
  lesson: LessonDocumentModel,
  insertions: GeneratedInsertion[]
): BlockNode[] {
  const groupedInsertions: Record<string, GeneratedInsertion[]> = {};
  const rootInsertions: GeneratedInsertion[] = [];

  for (const insertion of insertions) {
    if (insertion.block_id) {
      if (!groupedInsertions[insertion.block_id]) {
        groupedInsertions[insertion.block_id] = [];
      }
      groupedInsertions[insertion.block_id].push(insertion);
    } else {
      rootInsertions.push(insertion);
    }
  }

  const partOneBlocks = trimBoundaryBlanks(lesson.part_one_blocks, { trimEnd: true });
  const partTwoBlocks = trimBoundaryBlanks(lesson.part_two_blocks, { trimStart: true });

  const result: BlockNode[] = [...partOneBlocks];
  const referenceBlock = partTwoBlocks.length > 0 ? partTwoBlocks[0] : null;

  result.push(
    buildContentTitleBlock(
      lesson,
      referenceBlock,
      partOneBlocks.length + partTwoBlocks.length + insertions.length
    )
  );

  for (const insertion of rootInsertions) {
    result.push(insertion.block);
  }

  for (const block of partTwoBlocks) {
    result.push(block);
    const blockInsertions = groupedInsertions[block.id] || [];
    for (const img of blockInsertions) {
      result.push(img.block);
    }
  }

  return result;
}
