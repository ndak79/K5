import AdmZip from "adm-zip";
import * as fs from "node:fs";
import * as path from "node:path";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { normalizeDocxPackageFonts } from "./docx_font_normalizer";

const W_NAMESPACE = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R_NAMESPACE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_RELATIONSHIPS_NAMESPACE = "http://schemas.openxmlformats.org/package/2006/relationships";
const CONTENT_TYPES_NAMESPACE = "http://schemas.openxmlformats.org/package/2006/content-types";

export interface DocxBlockInput {
  xml: string;
  sourcePath: string;
}

export interface ExtraPackageMedia {
  partPath: string;
  bytes: Buffer;
  relId: string;
  contentType?: string;
}

interface SourceMaps {
  styleIds: Map<string, string>;
  abstractNumIds: Map<string, string>;
  numIds: Map<string, string>;
  relationshipIds: Map<string, string>;
}

function parseXml(xml: string): any {
  return new DOMParser().parseFromString(xml, "text/xml");
}

function serializeXml(node: any): string {
  return new XMLSerializer().serializeToString(node);
}

function attribute(node: any, localName: string): string | null {
  return node?.getAttribute(`w:${localName}`) || node?.getAttribute(localName) || null;
}

function setAttribute(node: any, localName: string, value: string): void {
  node.setAttributeNS(W_NAMESPACE, `w:${localName}`, value);
}

function maxNumericId(nodes: any[], attributeName: string): number {
  return nodes.reduce((max, node) => {
    const value = Number.parseInt(attribute(node, attributeName) || "0", 10);
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);
}

function getEntryText(zip: AdmZip, entryName: string): string | null {
  const entry = zip.getEntry(entryName);
  return entry ? zip.readAsText(entry) : null;
}

function getEntryBuffer(zip: AdmZip, entryName: string): Buffer | null {
  const entry = zip.getEntry(entryName);
  return entry ? zip.readFile(entry) : null;
}

function getElementChildren(node: any, name: string): any[] {
  return Array.from(node?.childNodes || []).filter((child: any) => child.nodeType === 1 && child.nodeName === name);
}

function findFirst(node: any, name: string): any | null {
  const matches = node?.getElementsByTagName(name) || [];
  return matches.length > 0 ? matches[0] : null;
}

function uniqueId(existing: Set<string>, prefix: string, sourceId: string): string {
  let candidate = `${prefix}${sourceId}`;
  let counter = 2;
  while (existing.has(candidate)) {
    candidate = `${prefix}${sourceId}_${counter++}`;
  }
  existing.add(candidate);
  return candidate;
}

function mergeStyles(baseZip: AdmZip, sourceZip: AdmZip): Map<string, string> {
  const map = new Map<string, string>();
  const baseXml = getEntryText(baseZip, "word/styles.xml");
  const sourceXml = getEntryText(sourceZip, "word/styles.xml");
  if (!baseXml || !sourceXml) return map;

  const baseDoc = parseXml(baseXml);
  const sourceDoc = parseXml(sourceXml);
  const baseRoot = baseDoc.documentElement;
  const sourceStyles = getElementChildren(sourceDoc.documentElement, "w:style");
  const existingIds = new Set<string>(
    getElementChildren(baseRoot, "w:style")
      .map((style) => attribute(style, "styleId"))
      .filter((id): id is string => !!id)
  );

  for (const sourceStyle of sourceStyles) {
    const sourceId = attribute(sourceStyle, "styleId");
    if (!sourceId) continue;
    const baseStyle = getElementChildren(baseRoot, "w:style").find((style) => attribute(style, "styleId") === sourceId);
    if (baseStyle && serializeXml(baseStyle) === serializeXml(sourceStyle)) {
      map.set(sourceId, sourceId);
      continue;
    }
    const targetId = baseStyle ? uniqueId(existingIds, "ImportedStyle_", sourceId) : sourceId;
    map.set(sourceId, targetId);
  }

  for (const sourceStyle of sourceStyles) {
    const sourceId = attribute(sourceStyle, "styleId");
    if (!sourceId) continue;
    const targetId = map.get(sourceId) || sourceId;
    if (targetId === sourceId && getElementChildren(baseRoot, "w:style").some((style) => attribute(style, "styleId") === sourceId)) {
      continue;
    }
    const imported = baseDoc.importNode(sourceStyle, true);
    setAttribute(imported, "styleId", targetId);
    for (const refName of ["basedOn", "next", "link"]) {
      const ref = findFirst(imported, `w:${refName}`);
      const refId = attribute(ref, "val");
      if (ref && refId && map.has(refId)) setAttribute(ref, "val", map.get(refId)!);
    }
    baseRoot.appendChild(imported);
  }

  baseZip.updateFile("word/styles.xml", Buffer.from(serializeXml(baseDoc), "utf8"));
  return map;
}

function mergeNumbering(baseZip: AdmZip, sourceZip: AdmZip): Pick<SourceMaps, "abstractNumIds" | "numIds"> {
  const abstractNumIds = new Map<string, string>();
  const numIds = new Map<string, string>();
  const baseXml = getEntryText(baseZip, "word/numbering.xml");
  const sourceXml = getEntryText(sourceZip, "word/numbering.xml");
  if (!sourceXml) return { abstractNumIds, numIds };
  if (!baseXml) {
    const sourceDoc = parseXml(sourceXml);
    for (const node of getElementChildren(sourceDoc.documentElement, "w:abstractNum")) {
      const id = attribute(node, "abstractNumId");
      if (id) abstractNumIds.set(id, id);
    }
    for (const node of getElementChildren(sourceDoc.documentElement, "w:num")) {
      const id = attribute(node, "numId");
      if (id) numIds.set(id, id);
    }
    baseZip.addFile("word/numbering.xml", Buffer.from(sourceXml, "utf8"));
    return { abstractNumIds, numIds };
  }

  const baseDoc = parseXml(baseXml);
  const sourceDoc = parseXml(sourceXml);
  const baseRoot = baseDoc.documentElement;
  const baseAbstract = getElementChildren(baseRoot, "w:abstractNum");
  const baseNums = getElementChildren(baseRoot, "w:num");
  let nextAbstractId = maxNumericId(baseAbstract, "abstractNumId") + 1;
  let nextNumId = maxNumericId(baseNums, "numId") + 1;

  for (const sourceAbstract of getElementChildren(sourceDoc.documentElement, "w:abstractNum")) {
    const sourceId = attribute(sourceAbstract, "abstractNumId");
    if (!sourceId) continue;
    const targetId = String(nextAbstractId++);
    abstractNumIds.set(sourceId, targetId);
    const imported = baseDoc.importNode(sourceAbstract, true);
    setAttribute(imported, "abstractNumId", targetId);
    baseRoot.appendChild(imported);
  }

  for (const sourceNum of getElementChildren(sourceDoc.documentElement, "w:num")) {
    const sourceId = attribute(sourceNum, "numId");
    if (!sourceId) continue;
    const targetId = String(nextNumId++);
    numIds.set(sourceId, targetId);
    const imported = baseDoc.importNode(sourceNum, true);
    setAttribute(imported, "numId", targetId);
    const abstractRef = findFirst(imported, "w:abstractNumId");
    const abstractId = attribute(abstractRef, "val");
    if (abstractRef && abstractId && abstractNumIds.has(abstractId)) {
      setAttribute(abstractRef, "val", abstractNumIds.get(abstractId)!);
    }
    baseRoot.appendChild(imported);
  }

  baseZip.updateFile("word/numbering.xml", Buffer.from(serializeXml(baseDoc), "utf8"));
  return { abstractNumIds, numIds };
}

function rewriteBlockReferences(xml: string, maps: SourceMaps): string {
  const doc = parseXml(`<root xmlns:w="${W_NAMESPACE}" xmlns:r="${R_NAMESPACE}">${xml}</root>`);
  for (const element of Array.from(doc.getElementsByTagName("w:pStyle"))) {
    const id = attribute(element, "val");
    if (id && maps.styleIds.has(id)) setAttribute(element, "val", maps.styleIds.get(id)!);
  }
  for (const element of Array.from(doc.getElementsByTagName("w:rStyle"))) {
    const id = attribute(element, "val");
    if (id && maps.styleIds.has(id)) setAttribute(element, "val", maps.styleIds.get(id)!);
  }
  for (const element of Array.from(doc.getElementsByTagName("w:tblStyle"))) {
    const id = attribute(element, "val");
    if (id && maps.styleIds.has(id)) setAttribute(element, "val", maps.styleIds.get(id)!);
  }
  for (const element of Array.from(doc.getElementsByTagName("w:numId"))) {
    const id = attribute(element, "val");
    if (id && maps.numIds.has(id)) setAttribute(element, "val", maps.numIds.get(id)!);
  }
  return Array.from(doc.documentElement.childNodes)
    .filter((child: any) => child.nodeType === 1)
    .map((child: any) => serializeXml(child))
    .join("");
}

function getReferencedRelationshipIds(xml: string): string[] {
  const doc = parseXml(`<root xmlns:w="${W_NAMESPACE}" xmlns:r="${R_NAMESPACE}">${xml}</root>`);
  const result: string[] = [];
  for (const element of Array.from(doc.getElementsByTagName("*")) as any[]) {
    for (let index = 0; index < element.attributes.length; index++) {
      const attr = element.attributes.item(index);
      if (attr && (attr.name === "r:id" || attr.name === "r:embed" || attr.name === "r:link")) {
        result.push(attr.value);
      }
    }
  }
  return [...new Set(result)];
}

function resolveTarget(baseDir: string, target: string): string {
  return path.posix.normalize(path.posix.join(baseDir, target.replace(/\\/g, "/"))).replace(/^\.\//, "");
}

function copySourceRelationshipParts(baseZip: AdmZip, sourceZip: AdmZip, blockXml: string, maps: SourceMaps): void {
  const sourceRelsXml = getEntryText(sourceZip, "word/_rels/document.xml.rels");
  const baseRelsXml = getEntryText(baseZip, "word/_rels/document.xml.rels");
  if (!sourceRelsXml || !baseRelsXml) return;

  const sourceDoc = parseXml(sourceRelsXml);
  const baseDoc = parseXml(baseRelsXml);
  const baseRoot = baseDoc.documentElement;
  const existingIds = new Set<string>(Array.from(baseRoot.getElementsByTagName("Relationship")).map((rel: any) => rel.getAttribute("Id")));
  let nextId = 1;
  const referencedIds = getReferencedRelationshipIds(blockXml);

  for (const sourceId of referencedIds) {
    const sourceRel = Array.from(sourceDoc.getElementsByTagName("Relationship")).find((rel: any) => rel.getAttribute("Id") === sourceId) as any;
    if (!sourceRel) continue;
    let targetId = `rId${nextId++}`;
    while (existingIds.has(targetId)) targetId = `rId${nextId++}`;
    existingIds.add(targetId);
    maps.relationshipIds.set(sourceId, targetId);

    const imported = baseDoc.importNode(sourceRel, true);
    imported.setAttribute("Id", targetId);
    const targetMode = imported.getAttribute("TargetMode");
    const target = imported.getAttribute("Target");
    if (!targetMode && target) {
      const sourcePart = resolveTarget("word", target);
      const sourceBytes = getEntryBuffer(sourceZip, sourcePart);
      if (sourceBytes) {
        let targetPart = sourcePart;
        if (getEntryBuffer(baseZip, targetPart)) {
          const extension = path.posix.extname(targetPart);
          const stem = targetPart.slice(0, targetPart.length - extension.length);
          targetPart = `${stem}-imported-${nextId}${extension}`;
        }
        baseZip.addFile(targetPart, sourceBytes);
        imported.setAttribute("Target", targetPart.replace(/^word\//, ""));
      }
    }
    baseRoot.appendChild(imported);
  }

  baseZip.updateFile("word/_rels/document.xml.rels", Buffer.from(serializeXml(baseDoc), "utf8"));
}

function rewriteRelationshipReferences(xml: string, relationshipIds: Map<string, string>): string {
  if (relationshipIds.size === 0) return xml;
  return xml.replace(/\br:(id|embed|link)="([^"]+)"/g, (_match, kind, id) => `r:${kind}="${relationshipIds.get(id) || id}"`);
}

function replaceDocumentBody(baseZip: AdmZip, blockInputs: DocxBlockInput[], mapsBySource: Map<string, SourceMaps>): void {
  const documentXml = getEntryText(baseZip, "word/document.xml");
  if (!documentXml) throw new Error("Base DOCX package does not contain word/document.xml.");
  const document = parseXml(documentXml);
  const body = findFirst(document, "w:body");
  if (!body) throw new Error("Base DOCX document does not contain w:body.");
  const sectionProperties = getElementChildren(body, "w:sectPr").at(-1) || null;

  while (body.firstChild) body.removeChild(body.firstChild);
  for (const input of blockInputs) {
    const sourceMaps = mapsBySource.get(input.sourcePath);
    const rewritten = sourceMaps ? rewriteRelationshipReferences(rewriteBlockReferences(input.xml, sourceMaps), sourceMaps.relationshipIds) : input.xml;
    const fragment = parseXml(`<root xmlns:w="${W_NAMESPACE}" xmlns:r="${R_NAMESPACE}">${rewritten}</root>`);
    for (const child of Array.from(fragment.documentElement.childNodes) as any[]) {
      if (child.nodeType === 1) body.appendChild(document.importNode(child, true));
    }
  }
  if (sectionProperties) body.appendChild(document.importNode(sectionProperties, true));
  baseZip.updateFile("word/document.xml", Buffer.from(serializeXml(document), "utf8"));
}

export function mergeDocxPackages(
  basePath: string,
  importedPath: string,
  blockInputs: DocxBlockInput[],
  outputPath: string,
  extraMedia?: ExtraPackageMedia[]
): string {
  const baseZip = new AdmZip(basePath);
  const importedZip = new AdmZip(importedPath);
  const sourceMaps: SourceMaps = {
    styleIds: mergeStyles(baseZip, importedZip),
    ...mergeNumbering(baseZip, importedZip),
    relationshipIds: new Map<string, string>()
  };

  const importedBlocks = blockInputs.filter((input) => path.resolve(input.sourcePath) === path.resolve(importedPath));
  for (const input of importedBlocks) {
    copySourceRelationshipParts(baseZip, importedZip, input.xml, sourceMaps);
  }

  if (extraMedia && extraMedia.length > 0) {
    const relsXml = getEntryText(baseZip, "word/_rels/document.xml.rels");
    if (relsXml) {
      const relsDoc = parseXml(relsXml);
      const relsRoot = relsDoc.documentElement;
      for (const item of extraMedia) {
        baseZip.addFile(item.partPath, item.bytes);
        const rel = relsDoc.createElementNS(PACKAGE_RELATIONSHIPS_NAMESPACE, "Relationship");
        rel.setAttribute("Id", item.relId);
        rel.setAttribute("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image");
        const relTarget = item.partPath.startsWith("word/") ? item.partPath.slice(5) : item.partPath;
        rel.setAttribute("Target", relTarget);
        relsRoot.appendChild(rel);
      }
      baseZip.updateFile("word/_rels/document.xml.rels", Buffer.from(serializeXml(relsDoc), "utf8"));
    }

    let ctXml = getEntryText(baseZip, "[Content_Types].xml");
    if (ctXml && !ctXml.includes('Extension="png"')) {
      const ctDoc = parseXml(ctXml);
      const newCt = ctDoc.createElementNS(CONTENT_TYPES_NAMESPACE, "Default");
      newCt.setAttribute("Extension", "png");
      newCt.setAttribute("ContentType", "image/png");
      ctDoc.documentElement.appendChild(newCt);
      baseZip.updateFile("[Content_Types].xml", Buffer.from(serializeXml(ctDoc), "utf8"));
    }
  }

  const mapsBySource = new Map<string, SourceMaps>();
  if (importedBlocks.length > 0) mapsBySource.set(importedPath, sourceMaps);
  replaceDocumentBody(baseZip, blockInputs, mapsBySource);
  normalizeDocxPackageFonts(baseZip);

  const parentDir = path.dirname(outputPath);
  if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true });
  baseZip.writeZip(outputPath);
  return outputPath;
}
