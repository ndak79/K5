import AdmZip from "adm-zip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

const W_NAMESPACE = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const REQUIRED_FONT = "Times New Roman";

function setNamespacedAttribute(element: any, namespace: string, qualifiedName: string, value: string): void {
  element.setAttributeNS(namespace, qualifiedName, value);
}

function getDirectChild(parent: any, nodeName: string): any | null {
  for (const child of Array.from(parent.childNodes || []) as any[]) {
    if (child.nodeType === 1 && child.nodeName === nodeName) {
      return child;
    }
  }
  return null;
}

function getOrCreateDirectChild(parent: any, nodeName: string): any {
  const existing = getDirectChild(parent, nodeName);
  if (existing) {
    return existing;
  }

  const child = parent.ownerDocument.createElementNS(W_NAMESPACE, nodeName);
  if (nodeName === "w:rFonts") {
    const style = getDirectChild(parent, "w:rStyle");
    if (style?.nextSibling) {
      parent.insertBefore(child, style.nextSibling);
    } else if (style) {
      parent.appendChild(child);
    } else if (parent.firstChild) {
      parent.insertBefore(child, parent.firstChild);
    } else {
      parent.appendChild(child);
    }
  } else if (parent.firstChild) {
    parent.insertBefore(child, parent.firstChild);
  } else {
    parent.appendChild(child);
  }
  return child;
}

function normalizeFontElement(fonts: any): void {
  for (const attribute of ["ascii", "hAnsi", "eastAsia", "cs"]) {
    setNamespacedAttribute(fonts, W_NAMESPACE, `w:${attribute}`, REQUIRED_FONT);
  }
  for (const attribute of ["asciiTheme", "hAnsiTheme", "eastAsiaTheme", "csTheme"]) {
    if (fonts.hasAttribute(`w:${attribute}`)) {
      fonts.removeAttribute(`w:${attribute}`);
    }
  }
}

function ensureRunPropertiesFont(runProperties: any): void {
  const fonts = getOrCreateDirectChild(runProperties, "w:rFonts");
  normalizeFontElement(fonts);
}

function ensureRunFonts(document: any): void {
  for (const runProperties of Array.from(document.getElementsByTagName("w:rPr")) as any[]) {
    ensureRunPropertiesFont(runProperties);
  }

  for (const run of Array.from(document.getElementsByTagName("w:r")) as any[]) {
    const runProperties = getOrCreateDirectChild(run, "w:rPr");
    ensureRunPropertiesFont(runProperties);
  }
}

function ensureStyleDefaults(document: any): void {
  if (document.documentElement?.nodeName !== "w:styles") {
    return;
  }

  const defaults = getOrCreateDirectChild(document.documentElement, "w:docDefaults");
  const runPropertiesDefault = getOrCreateDirectChild(defaults, "w:rPrDefault");
  const runProperties = getOrCreateDirectChild(runPropertiesDefault, "w:rPr");
  ensureRunPropertiesFont(runProperties);
}

function normalizeWordFontAssignments(document: any): boolean {
  let changed = false;

  for (const fonts of Array.from(document.getElementsByTagName("w:rFonts")) as any[]) {
    normalizeFontElement(fonts);
    changed = true;
  }

  ensureRunFonts(document);
  ensureStyleDefaults(document);
  changed = true;

  for (const font of Array.from(document.getElementsByTagName("w:font")) as any[]) {
    setNamespacedAttribute(font, W_NAMESPACE, "w:name", REQUIRED_FONT);
    for (const altName of Array.from(font.getElementsByTagName("w:altName")) as any[]) {
      setNamespacedAttribute(altName, W_NAMESPACE, "w:val", REQUIRED_FONT);
    }
    changed = true;
  }

  return changed;
}

function normalizeThemeFonts(document: any): boolean {
  let changed = false;
  for (const element of Array.from(document.getElementsByTagName("*")) as any[]) {
    for (let index = 0; index < element.attributes.length; index++) {
      const attribute = element.attributes.item(index);
      if (attribute?.name === "typeface") {
        element.setAttribute("typeface", REQUIRED_FONT);
        changed = true;
      }
    }
  }
  return changed;
}

export function normalizeDocxPackageFonts(zip: AdmZip): void {
  for (const entry of zip.getEntries()) {
    if (!entry.entryName.startsWith("word/") || !entry.entryName.endsWith(".xml")) {
      continue;
    }

    const xml = zip.readAsText(entry);
    if (!xml.includes("<")) continue;

    const document = new DOMParser().parseFromString(xml, "text/xml");
    const isTheme = entry.entryName.includes("/theme/");
    const changed = isTheme
      ? normalizeThemeFonts(document)
      : normalizeWordFontAssignments(document);

    if (changed) {
      zip.updateFile(entry.entryName, Buffer.from(new XMLSerializer().serializeToString(document), "utf8"));
    }
  }
}

export { REQUIRED_FONT };
