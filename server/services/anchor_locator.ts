import { BlockNode, OutlineNode, ParsedGtChapter } from "../document_pipeline/parse_gt";
import { ParsedCdrLesson } from "../document_pipeline/parse_cdr";

export interface Anchor {
  id: string;
  kind: "content_duration" | "section_duration" | "method" | "question_answer";
  label: string;
  block_id: string | null;
  outline_id?: string | null;
  outline_level?: number | null;
  question_count?: number | null;
  evidence_block_ids?: string[];
}

function isHeadingBlock(block: BlockNode): boolean {
  const text = block.text_preview.trim();
  return /^([IVXLC]+\.\s|[0-9]+\.\s|[a-z]\)\s)/i.test(text);
}

function findBlockIndex(blocks: BlockNode[], blockId: string | null): number | null {
  if (!blockId) return null;
  const idx = blocks.findIndex((b) => b.id === blockId);
  return idx === -1 ? null : idx;
}

function findOutlineIndex(outlines: OutlineNode[], outlineId: string): number | null {
  const idx = outlines.findIndex((o) => o.id === outlineId);
  return idx === -1 ? null : idx;
}

export function sectionBlockSlice(
  blocks: BlockNode[],
  outlines: OutlineNode[],
  outlineNode: OutlineNode
): BlockNode[] {
  const startIndex = findBlockIndex(blocks, outlineNode.block_id);
  const outlineIndex = findOutlineIndex(outlines, outlineNode.id);
  if (startIndex === null || outlineIndex === null) {
    return [];
  }

  let endIndex = blocks.length;
  for (let i = outlineIndex + 1; i < outlines.length; i++) {
    const candidate = outlines[i];
    const candidateBlockIndex = findBlockIndex(blocks, candidate.block_id);
    if (candidateBlockIndex === null) continue;
    if (candidate.level <= outlineNode.level) {
      endIndex = candidateBlockIndex;
      break;
    }
  }

  return blocks.slice(startIndex, endIndex);
}

export function contentBlocksForOutline(
  blocks: BlockNode[],
  outlines: OutlineNode[],
  outlineNode: OutlineNode
): BlockNode[] {
  const sliced = sectionBlockSlice(blocks, outlines, outlineNode);
  return sliced.filter(
    (b) => b.kind === "paragraph" && b.text_preview.trim().length > 0 && !isHeadingBlock(b)
  );
}

function isLeafOutline(outlines: OutlineNode[], outlineNode: OutlineNode): boolean {
  const outlineIndex = findOutlineIndex(outlines, outlineNode.id);
  if (outlineIndex === null) return true;

  for (let i = outlineIndex + 1; i < outlines.length; i++) {
    const candidate = outlines[i];
    if (candidate.level <= outlineNode.level) {
      return true;
    }
    if (candidate.level > outlineNode.level) {
      return false;
    }
  }
  return true;
}

function descendantLeafOutlines(
  outlines: OutlineNode[],
  topLevelOutline: OutlineNode
): OutlineNode[] {
  const topIndex = findOutlineIndex(outlines, topLevelOutline.id);
  if (topIndex === null) return [];

  const descendants: OutlineNode[] = [];
  for (let i = topIndex + 1; i < outlines.length; i++) {
    const candidate = outlines[i];
    if (candidate.level <= topLevelOutline.level) {
      break;
    }
    if (candidate.level >= topLevelOutline.level && isLeafOutline(outlines, candidate)) {
      descendants.push(candidate);
    }
  }
  return descendants;
}

function findScheduleDurationMinutes(
  cdrLesson: ParsedCdrLesson,
  outlineNode: OutlineNode
): number {
  const matched = outlineNode.normalized_title.trim().match(/^([IVXLC]+)\./i);
  if (!matched) return 0;

  const sectionCode = matched[1].toUpperCase();
  for (const item of cdrLesson.schedule_items) {
    if (item.section_code === sectionCode && item.duration_minutes) {
      return item.duration_minutes;
    }
  }
  return 0;
}

function estimateQuestionSlotCount(
  durationMinutes: number,
  contentLength: number,
  leafCount: number
): number {
  if (contentLength <= 0 || leafCount <= 0) {
    return 0;
  }

  let slots = 1;
  if (durationMinutes >= 25) slots += 1;
  if (durationMinutes >= 40) slots += 1;
  if (durationMinutes >= 55) slots += 1;
  if (contentLength >= 900) slots += 1;

  const leafLimit = leafCount <= 0 ? 0 : 1;
  return Math.max(slots, leafLimit);
}

function allocateSlotsByLeaf(
  leafContentBlocks: Record<string, BlockNode[]>,
  totalSlots: number
): Record<string, number> {
  const weightedItems: { id: string; weight: number }[] = [];
  for (const [outlineId, blocks] of Object.entries(leafContentBlocks)) {
    if (blocks && blocks.length > 0) {
      const charCount = blocks.reduce((sum, b) => sum + b.text_preview.trim().length, 0);
      weightedItems.push({ id: outlineId, weight: Math.max(charCount, 1) });
    }
  }

  const allocation: Record<string, number> = {};
  for (const outlineId of Object.keys(leafContentBlocks)) {
    allocation[outlineId] = 0;
  }

  if (totalSlots <= 0 || weightedItems.length === 0) {
    return allocation;
  }

  // Sort DESC by weight
  weightedItems.sort((a, b) => b.weight - a.weight);

  if (totalSlots <= weightedItems.length) {
    for (let i = 0; i < totalSlots; i++) {
      allocation[weightedItems[i].id] = 1;
    }
    return allocation;
  }

  let remainingSlots = totalSlots;
  for (const item of weightedItems) {
    allocation[item.id] = 1;
    remainingSlots--;
  }

  const totalWeight = weightedItems.reduce((sum, x) => sum + x.weight, 0);
  const fractionalScores: { id: string; score: number }[] = [];

  for (const item of weightedItems) {
    const exactShare = (item.weight / totalWeight) * totalSlots;
    const additionalShare = Math.max(exactShare - 1, 0);
    const wholeAdditional = Math.floor(additionalShare);
    allocation[item.id] += wholeAdditional;
    remainingSlots -= wholeAdditional;
    fractionalScores.push({ id: item.id, score: additionalShare - wholeAdditional });
  }

  fractionalScores.sort((a, b) => b.score - a.score);
  for (const item of fractionalScores) {
    if (remainingSlots <= 0) break;
    allocation[item.id] += 1;
    remainingSlots--;
  }

  return allocation;
}

function pickQuestionBlocks(contentBlocks: BlockNode[], slotCount: number): BlockNode[] {
  if (slotCount <= 0 || contentBlocks.length === 0) {
    return [];
  }
  if (contentBlocks.length === 1) {
    return contentBlocks;
  }
  if (slotCount >= contentBlocks.length) {
    return contentBlocks;
  }

  const chosenIndexes: number[] = [];
  let lastIndex = -1;

  for (let offset = 0; offset < slotCount; offset++) {
    const position = ((offset + 1) * contentBlocks.length) / (slotCount + 1);
    let index = Math.max(0, Math.min(contentBlocks.length - 1, Math.floor(position)));

    if (index === 0 && contentBlocks.length > 1) {
      index = 1;
    }

    while (index <= lastIndex && index + 1 < contentBlocks.length) {
      index++;
    }

    chosenIndexes.push(index);
    lastIndex = index;
  }

  return chosenIndexes.map((idx) => contentBlocks[idx]);
}

export function locateAnchors(
  cdrLesson: ParsedCdrLesson,
  gtChapter: ParsedGtChapter
): Anchor[] {
  const defaultBlockId = gtChapter.blocks.length > 0 ? gtChapter.blocks[0].id : null;
  const outlines = gtChapter.outline;

  const anchors: Anchor[] = [
    {
      id: `${cdrLesson.lesson_number}-content-duration`,
      kind: "content_duration",
      label: "Chen tong thoi gian canh NOI DUNG",
      block_id: null
    }
  ];

  for (const outlineNode of outlines) {
    const blockId = outlineNode.block_id || defaultBlockId;
    if (!blockId) continue;

    if (outlineNode.level === 1) {
      anchors.push({
        id: `${outlineNode.id}-duration`,
        kind: "section_duration",
        label: `Thời gian cho ${outlineNode.normalized_title}`,
        block_id: blockId,
        outline_id: outlineNode.id,
        outline_level: outlineNode.level
      });
    }

    if (outlineNode.level === 1 || outlineNode.level === 2) {
      anchors.push({
        id: `${outlineNode.id}-method`,
        kind: "method",
        label: `Phương pháp cho ${outlineNode.normalized_title}`,
        block_id: blockId,
        outline_id: outlineNode.id,
        outline_level: outlineNode.level
      });
    }
  }

  const topLevelOutlines = outlines.filter((o) => o.level === 1);
  for (const topLevelOutline of topLevelOutlines) {
    const leafOutlines = descendantLeafOutlines(outlines, topLevelOutline);

    const leafContentBlocks: Record<string, BlockNode[]> = {};
    for (const leaf of leafOutlines) {
      leafContentBlocks[leaf.id] = contentBlocksForOutline(gtChapter.blocks, outlines, leaf);
    }

    let totalContentLength = 0;
    let leafWithContentCount = 0;
    for (const blocks of Object.values(leafContentBlocks)) {
      if (blocks && blocks.length > 0) {
        totalContentLength += blocks.reduce((sum, b) => sum + b.text_preview.trim().length, 0);
        leafWithContentCount++;
      }
    }

    const totalSlots = estimateQuestionSlotCount(
      findScheduleDurationMinutes(cdrLesson, topLevelOutline),
      totalContentLength,
      leafWithContentCount
    );

    const allocation = allocateSlotsByLeaf(leafContentBlocks, totalSlots);

    for (const leafOutline of leafOutlines) {
      const contentBlocks = leafContentBlocks[leafOutline.id] || [];
      if (contentBlocks.length === 0) continue;

      const slotBlocks = pickQuestionBlocks(contentBlocks, allocation[leafOutline.id] || 0);
      for (let slotIndex = 0; slotIndex < slotBlocks.length; slotIndex++) {
        const block = slotBlocks[slotIndex];
        anchors.push({
          id: `${leafOutline.id}-qa-${slotIndex + 1}`,
          kind: "question_answer",
          label: `Q/A cho ${leafOutline.normalized_title} vị trí ${slotIndex + 1}`,
          block_id: block.id,
          outline_id: leafOutline.id,
          outline_level: leafOutline.level,
          question_count: 1,
          evidence_block_ids: []
        });
      }
    }
  }

  return anchors;
}
