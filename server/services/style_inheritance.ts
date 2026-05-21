import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { BlockNode } from "../document_pipeline/ooxml_range_extractor";

const W_NAMESPACE = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export interface InheritedStyle {
  paragraph_properties_xml: string | null;
  run_properties_xml: string | null;
}

function stripRunEmphasisAndSize(runProperties: any): void {
  const tagsToStrip = ["w:b", "w:bCs", "w:i", "w:iCs", "w:sz", "w:szCs"];
  for (const tag of tagsToStrip) {
    const existing = runProperties.getElementsByTagName(tag)[0];
    if (existing) {
      runProperties.removeChild(existing);
    }
  }
}

export function inheritStyle(anchorBlock: BlockNode | null): InheritedStyle {
  if (!anchorBlock || !anchorBlock.xml) {
    return { paragraph_properties_xml: null, run_properties_xml: null };
  }

  const doc = new DOMParser().parseFromString(anchorBlock.xml, "text/xml");
  const pPr = doc.getElementsByTagName("w:pPr")[0];
  const rPr = doc.getElementsByTagName("w:rPr")[0];

  if (pPr) {
    const rPrInPPr = pPr.getElementsByTagName("w:rPr")[0];
    if (rPrInPPr) {
      stripRunEmphasisAndSize(rPrInPPr);
    }
  }
  if (rPr) {
    stripRunEmphasisAndSize(rPr);
  }

  const serializer = new XMLSerializer();
  return {
    paragraph_properties_xml: pPr ? serializer.serializeToString(pPr) : null,
    run_properties_xml: rPr ? serializer.serializeToString(rPr) : null
  };
}

export function buildInsertedParagraphXml(
  text: string,
  style: InheritedStyle,
  options?: {
    italic?: boolean;
    bold?: boolean;
    align?: string | null;
    page_break_before?: boolean;
  }
): string {
  const italic = options?.italic ?? true;
  const bold = options?.bold ?? false;
  const align = options?.align ?? null;
  const pageBreakBefore = options?.page_break_before ?? false;

  const doc = new DOMParser().parseFromString(
    `<w:p xmlns:w="${W_NAMESPACE}"></w:p>`,
    "text/xml"
  );
  const paragraph = doc.documentElement;

  let pPr: any;
  if (style.paragraph_properties_xml) {
    const tempDoc = new DOMParser().parseFromString(style.paragraph_properties_xml, "text/xml");
    pPr = doc.importNode(tempDoc.documentElement, true);
  } else {
    pPr = doc.createElementNS(W_NAMESPACE, "w:pPr");
  }

  if (align) {
    let jc = pPr.getElementsByTagName("w:jc")[0];
    if (!jc) {
      jc = doc.createElementNS(W_NAMESPACE, "w:jc");
      pPr.appendChild(jc);
    }
    jc.setAttributeNS(W_NAMESPACE, "w:val", align);
  }

  if (pPr.childNodes.length > 0 || pPr.attributes.length > 0 || style.paragraph_properties_xml) {
    paragraph.appendChild(pPr);
  }

  const run = doc.createElementNS(W_NAMESPACE, "w:r");
  paragraph.appendChild(run);

  let rPr: any;
  if (style.run_properties_xml) {
    const tempDoc = new DOMParser().parseFromString(style.run_properties_xml, "text/xml");
    rPr = doc.importNode(tempDoc.documentElement, true);
  } else {
    rPr = doc.createElementNS(W_NAMESPACE, "w:rPr");
  }

  stripRunEmphasisAndSize(rPr);

  if (italic) {
    const i = doc.createElementNS(W_NAMESPACE, "w:i");
    const iCs = doc.createElementNS(W_NAMESPACE, "w:iCs");
    rPr.appendChild(i);
    rPr.appendChild(iCs);
  }

  if (bold) {
    const b = doc.createElementNS(W_NAMESPACE, "w:b");
    const bCs = doc.createElementNS(W_NAMESPACE, "w:bCs");
    rPr.appendChild(b);
    rPr.appendChild(bCs);
  }

  const sz = doc.createElementNS(W_NAMESPACE, "w:sz");
  sz.setAttributeNS(W_NAMESPACE, "w:val", "28");
  const szCs = doc.createElementNS(W_NAMESPACE, "w:szCs");
  szCs.setAttributeNS(W_NAMESPACE, "w:val", "28");
  rPr.appendChild(sz);
  rPr.appendChild(szCs);

  run.appendChild(rPr);

  if (pageBreakBefore) {
    const br = doc.createElementNS(W_NAMESPACE, "w:br");
    br.setAttributeNS(W_NAMESPACE, "w:type", "page");
    run.appendChild(br);
  }

  const t = doc.createElementNS(W_NAMESPACE, "w:t");
  t.textContent = text;
  run.appendChild(t);

  return new XMLSerializer().serializeToString(paragraph);
}
