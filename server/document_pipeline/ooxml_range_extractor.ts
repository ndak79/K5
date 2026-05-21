import AdmZip from "adm-zip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

export interface ExtractedBlock {
  index: number;
  kind: "paragraph" | "table";
  text: string;
  xml: string;
}

export interface DocumentRange {
  document_path: string;
  start_block_index: number;
  end_block_index_exclusive: number;
  start_marker_text: string;
  end_marker_text: string | null;
  source_type: "cdr" | "gt";
}

export interface BlockNode {
  id: string;
  kind: "paragraph" | "table" | "inserted_paragraph";
  source: "cdr" | "gt" | "generated";
  text_preview: string;
  xml: string | null;
  style_ref?: string | null;
  anchor_ref?: string | null;
  order_index: number;
}

function extractText(node: any): string {
  const textNodes = node.getElementsByTagName("w:t");
  const parts: string[] = [];
  for (let i = 0; i < textNodes.length; i++) {
    const textNode = textNodes[i];
    if (textNode && textNode.textContent) {
      parts.push(textNode.textContent);
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export function extractBlocks(documentPath: string): ExtractedBlock[] {
  let zip: AdmZip;
  try {
    zip = new AdmZip(documentPath);
  } catch (err: any) {
    throw new Error(`Failed to read ZIP structure from docx: ${err?.message || err}`);
  }

  const documentXmlEntry = zip.getEntry("word/document.xml");
  if (!documentXmlEntry) {
    throw new Error("Invalid .docx file: word/document.xml not found");
  }

  const xmlBytes = zip.readFile(documentXmlEntry);
  if (!xmlBytes) {
    throw new Error("Could not read word/document.xml content");
  }

  let xmlStr = xmlBytes.toString("utf-8");
  // Clean up XML: remove invalid control characters that cause DOMParser to crash
  xmlStr = xmlStr.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");

  const doc = new DOMParser().parseFromString(xmlStr, "text/xml");
  const body = doc.getElementsByTagName("w:body")[0];
  if (!body) {
    throw new Error("Could not find w:body in word/document.xml");
  }

  const extractedBlocks: ExtractedBlock[] = [];
  let blockIndex = 0;

  for (let i = 0; i < body.childNodes.length; i++) {
    const child = body.childNodes[i];
    if (child.nodeType !== 1) continue; // Skip text/comment nodes

    const tagName = child.nodeName;
    if (tagName === "w:p" || tagName === "w:tbl") {
      const kind = tagName === "w:p" ? "paragraph" : "table";
      const text = extractText(child);
      const xml = new XMLSerializer().serializeToString(child);

      extractedBlocks.push({
        index: blockIndex,
        kind,
        text,
        xml
      });
      blockIndex++;
    }
  }

  return extractedBlocks;
}

export function toBlockNodes(blocks: ExtractedBlock[], source: "cdr" | "gt"): BlockNode[] {
  return blocks.map((block) => ({
    id: `${source}-${block.index}`,
    kind: block.kind,
    source: source,
    text_preview: block.text,
    xml: block.xml,
    order_index: block.index
  }));
}

export function findRangesByHeadingPattern(
  documentPath: string,
  headingPatternStr: string,
  sourceType: "cdr" | "gt"
): [string, DocumentRange, BlockNode[]][] {
  const blocks = extractBlocks(documentPath);
  const headingRegex = new RegExp(headingPatternStr, "i");
  const matchedIndices: number[] = [];

  for (let i = 0; i < blocks.length; i++) {
    if (headingRegex.test(blocks[i].text)) {
      matchedIndices.push(blocks[i].index);
    }
  }

  const ranges: [string, DocumentRange, BlockNode[]][] = [];

  for (let currentPosition = 0; currentPosition < matchedIndices.length; currentPosition++) {
    const startIndex = matchedIndices[currentPosition];
    const endIndex =
      currentPosition + 1 < matchedIndices.length
        ? matchedIndices[currentPosition + 1]
        : blocks.length;

    const selectedBlocks = blocks.filter((b) => b.index >= startIndex && b.index < endIndex);
    if (selectedBlocks.length === 0) continue;

    const startMarkerText = selectedBlocks[0].text;
    const endBlock = blocks.find((b) => b.index === endIndex);
    const endMarkerText = endBlock ? endBlock.text : null;

    const documentRange: DocumentRange = {
      document_path: documentPath,
      start_block_index: startIndex,
      end_block_index_exclusive: endIndex,
      start_marker_text: startMarkerText,
      end_marker_text: endMarkerText,
      source_type: sourceType
    };

    ranges.push([
      startMarkerText,
      documentRange,
      toBlockNodes(selectedBlocks, sourceType)
    ]);
  }

  return ranges;
}
