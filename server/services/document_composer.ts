import { BlockNode } from "../document_pipeline/ooxml_range_extractor";
import { buildDiagramDrawingXml } from "../document_pipeline/lesson_diagram";
import { GeneratedInsertion, LessonDocumentModel } from "./normalizer";
import { buildInsertedParagraphXml, inheritStyle } from "./style_inheritance";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";


export function buildConclusionTitleBlock(
  lesson: LessonDocumentModel,
  referenceBlock: BlockNode | null,
  orderIndex: number
): BlockNode {
  const style = inheritStyle(referenceBlock);
  const titleText = "III. KẾT THÚC BÀI GIẢNG";

  return {
    id: "generated-conclusion-title",
    kind: "inserted_paragraph",
    source: "generated",
    text_preview: titleText,
    xml: buildInsertedParagraphXml(titleText, style, {
      italic: false,
      bold: true,
      align: "center",
      page_break_before: false
    }),
    order_index: orderIndex
  };
}

export function buildConclusionSubtitleBlock(
  lesson: LessonDocumentModel,
  referenceBlock: BlockNode | null,
  orderIndex: number
): BlockNode {
  const style = inheritStyle(referenceBlock);
  const subtitleText = "- Hệ thống nội dung bài giảng (Sơ đồ hoá):";

  return {
    id: "generated-conclusion-subtitle",
    kind: "inserted_paragraph",
    source: "generated",
    text_preview: subtitleText,
    xml: buildInsertedParagraphXml(subtitleText, style, {
      italic: true,
      bold: false,
      align: "both"
    }),
    order_index: orderIndex
  };
}

export function buildDiagramBlock(
  lesson: LessonDocumentModel,
  orderIndex: number,
  options?: { rId?: string; svgRelId?: string; pngRelId?: string; cx?: number; cy?: number }
): BlockNode {
  const svgRelId = options?.svgRelId || "rIdDiagramSvg";
  const pngRelId = options?.pngRelId || options?.rId || "rIdDiagramPng";
  const cx = options?.cx || 5760000;
  const cy = options?.cy || 2880000;

  return {
    id: "generated-diagram-block",
    kind: "inserted_paragraph",
    source: "generated",
    text_preview: "[Sơ đồ khối hệ thống nội dung bài giảng]",
    xml: buildDiagramDrawingXml(svgRelId, pngRelId, cx, cy),
    order_index: orderIndex
  };
}

function uppercaseTextBlock(block: BlockNode): BlockNode {
  if (!block.xml) {
    return { ...block, text_preview: block.text_preview.toLocaleUpperCase("vi-VN") };
  }

  const doc = new DOMParser().parseFromString(block.xml, "text/xml");
  const textNodes = doc.getElementsByTagName("w:t");
  for (let index = 0; index < textNodes.length; index++) {
    const textNode = textNodes[index];
    textNode.textContent = (textNode.textContent || "").toLocaleUpperCase("vi-VN");
  }

  return {
    ...block,
    text_preview: block.text_preview.toLocaleUpperCase("vi-VN"),
    xml: new XMLSerializer().serializeToString(doc.documentElement)
  };
}

function uppercaseLessonTitle(blocks: BlockNode[]): BlockNode[] {
  const titleIndex = blocks.findIndex(
    (block) => block.kind === "paragraph" && block.text_preview.trim().length > 0
  );
  if (titleIndex === -1) return blocks;

  return blocks.map((block, index) => (index === titleIndex ? uppercaseTextBlock(block) : block));
}

function buildContentTitleWithMinutesXml(
  minutesText: string,
  style: ReturnType<typeof inheritStyle>
): string {
  const doc = new DOMParser().parseFromString(
    '<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"></w:p>',
    "text/xml"
  );
  const paragraph = doc.documentElement;

  let pPr: any;
  if (style.paragraph_properties_xml) {
    const tempDoc = new DOMParser().parseFromString(style.paragraph_properties_xml, "text/xml");
    pPr = doc.importNode(tempDoc.documentElement, true);
  } else {
    pPr = doc.createElementNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "w:pPr");
  }

  const pb = doc.createElementNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "w:pageBreakBefore");
  pPr.appendChild(pb);

  let jc = pPr.getElementsByTagName("w:jc")[0];
  if (!jc) {
    jc = doc.createElementNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "w:jc");
    pPr.appendChild(jc);
  }
  jc.setAttributeNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "w:val", "center");
  paragraph.appendChild(pPr);

  const r1 = doc.createElementNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "w:r");
  let rPr1: any;
  if (style.run_properties_xml) {
    const tempDoc = new DOMParser().parseFromString(style.run_properties_xml, "text/xml");
    rPr1 = doc.importNode(tempDoc.documentElement, true);
  } else {
    rPr1 = doc.createElementNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "w:rPr");
  }
  const b = doc.createElementNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "w:b");
  const bCs = doc.createElementNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "w:bCs");
  rPr1.appendChild(b);
  rPr1.appendChild(bCs);
  r1.appendChild(rPr1);

  const t1 = doc.createElementNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "w:t");
  t1.textContent = "NỘI DUNG";
  r1.appendChild(t1);
  paragraph.appendChild(r1);

  const r2 = doc.createElementNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "w:r");
  const t2 = doc.createElementNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "w:t");
  t2.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
  t2.textContent = " ";
  r2.appendChild(t2);
  paragraph.appendChild(r2);

  const r3 = doc.createElementNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "w:r");
  let rPr3: any;
  if (style.run_properties_xml) {
    const tempDoc = new DOMParser().parseFromString(style.run_properties_xml, "text/xml");
    rPr3 = doc.importNode(tempDoc.documentElement, true);
  } else {
    rPr3 = doc.createElementNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "w:rPr");
  }
  const i = doc.createElementNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "w:i");
  const iCs = doc.createElementNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "w:iCs");
  rPr3.appendChild(i);
  rPr3.appendChild(iCs);
  r3.appendChild(rPr3);

  const t3 = doc.createElementNS("http://schemas.openxmlformats.org/wordprocessingml/2006/main", "w:t");
  t3.textContent = minutesText;
  r3.appendChild(t3);
  paragraph.appendChild(r3);

  return new XMLSerializer().serializeToString(doc.documentElement);
}

export function buildContentTitleBlock(
  lesson: LessonDocumentModel,
  referenceBlock: BlockNode | null,
  orderIndex: number
): BlockNode {
  const style = inheritStyle(referenceBlock);
  const totalMinutes = lesson.cdr_lesson?.schedule_items?.reduce(
    (sum, item) => sum + (item.duration_minutes || 0),
    0
  ) || 0;
  const titleText = totalMinutes > 0 ? `NỘI DUNG (${totalMinutes} phút)` : "NỘI DUNG";
  let xml: string;
  if (totalMinutes > 0) {
    xml = buildContentTitleWithMinutesXml(`(${totalMinutes} phút)`, style);
  } else {
    xml = buildInsertedParagraphXml(titleText, style, {
      italic: false,
      bold: true,
      align: "center",
      page_break_before: true
    });
  }

  return {
    id: "generated-content-title",
    kind: "inserted_paragraph",
    source: "generated",
    text_preview: titleText,
    xml,
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
  insertions: GeneratedInsertion[],
  options?: {
    diagramOptions?: { rId?: string; cx?: number; cy?: number };
    includeConclusion?: boolean;
  }
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

  const partOneBlocks = uppercaseLessonTitle(
    trimBoundaryBlanks(lesson.part_one_blocks, { trimEnd: true })
  );
  const partTwoBlocks = trimBoundaryBlanks(lesson.part_two_blocks, { trimStart: true, trimEnd: true });

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

  // --- PHẦN III: KẾT THÚC BÀI GIẢNG ---
  if (options?.includeConclusion !== false) {
    const conclusionTitle = buildConclusionTitleBlock(lesson, referenceBlock, result.length);
    const conclusionSubtitle = buildConclusionSubtitleBlock(lesson, referenceBlock, result.length + 1);
    const diagramBlock = buildDiagramBlock(lesson, result.length + 2, options?.diagramOptions);

    result.push(conclusionTitle);
    result.push(conclusionSubtitle);
    result.push(diagramBlock);
  }

  return result;
}
