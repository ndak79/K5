import assert from "node:assert/strict";
import test from "node:test";
import { buildInsertedParagraphXml, inheritStyle } from "../server/services/style_inheritance";
import type { BlockNode } from "../server/document_pipeline/ooxml_range_extractor";

const referenceBlock: BlockNode = {
  id: "reference",
  kind: "paragraph",
  source: "gt",
  text_preview: "2.2. Heading",
  order_index: 0,
  xml: `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:pPr><w:pStyle w:val="Heading2"/><w:numPr><w:ilvl w:val="1"/><w:numId w:val="7"/></w:numPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="26"/><w:b/></w:rPr><w:t>2.2. Heading</w:t></w:r></w:p>`
};

test("preserves inherited font and numbering properties for inserted paragraphs", () => {
  const style = inheritStyle(referenceBlock);
  const xml = buildInsertedParagraphXml("Generated text", style);

  assert.match(xml, /w:rFonts[^>]*w:ascii="Times New Roman"/);
  assert.match(xml, /w:sz[^>]*w:val="26"/);
  assert.match(xml, /w:pStyle[^>]*w:val="Heading2"/);
  assert.match(xml, /w:numId[^>]*w:val="7"/);
});
