import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DOMParser } from "@xmldom/xmldom";
import { LessonDocumentModel } from "../services/normalizer";

export interface DiagramSection {
  title: string;
  children: string[];
}

export interface DiagramData {
  title: string;
  sections: DiagramSection[];
}

function escapeXml(unsafe: string): string {
  if (!unsafe) return "";
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapSvgText(text: string, maxCharsPerLine: number = 22): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let curr: string[] = [];
  for (const w of words) {
    const testLine = curr.concat([w]).join(" ");
    if (testLine.length <= maxCharsPerLine) {
      curr.push(w);
    } else {
      if (curr.length > 0) {
        lines.push(curr.join(" "));
        curr = [w];
      } else {
        lines.push(w);
        curr = [];
      }
    }
  }
  if (curr.length > 0) lines.push(curr.join(" "));
  return lines;
}

export function generateLessonDiagramSvg(data: DiagramData): { svg: string; width: number; height: number } {
  const title = (data.title || "Bài học").replace(/\s+/g, " ").trim();
  const sections = data.sections || [];

  const leafCounts = sections.map((s) => Math.max(1, (s.children || []).length));
  const totalLeaves = leafCounts.reduce((a, b) => a + b, 0) || 1;

  const boxGapX = 20;
  const leafW = 180;
  const leafH = 95;

  const innerWidth = totalLeaves * leafW + (totalLeaves - 1) * boxGapX;
  const marginX = 30;
  const marginY = 30;

  const rootW = Math.min(320, Math.max(240, Math.floor(innerWidth * 0.4)));
  const rootH = 75;
  const secH = 65;

  const vGap1 = 45;
  const vGap2 = 45;

  const totalW = innerWidth + marginX * 2;
  const totalH = marginY * 2 + rootH + vGap1 + secH + vGap2 + leafH;

  let currLeafIdx = 0;
  const secPositions: Array<{ x: number; y: number; w: number; h: number; text: string }> = [];
  const leafPositions: Array<Array<{ x: number; y: number; w: number; h: number; text: string }>> = [];

  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const sec = sections[sIdx];
    const children = sec.children && sec.children.length > 0 ? sec.children : [sec.title];
    const secLeafBoxes: Array<{ x: number; y: number; w: number; h: number; text: string }> = [];

    for (const ch of children) {
      const lx = marginX + currLeafIdx * (leafW + boxGapX);
      const ly = marginY + rootH + vGap1 + secH + vGap2;
      secLeafBoxes.push({ x: lx, y: ly, w: leafW, h: leafH, text: ch });
      currLeafIdx++;
    }
    leafPositions.push(secLeafBoxes);

    const firstBox = secLeafBoxes[0];
    const lastBox = secLeafBoxes[secLeafBoxes.length - 1];
    const secSpanW = lastBox.x + lastBox.w - firstBox.x;
    const secW = Math.min(secSpanW - 10, Math.max(160, Math.floor(secSpanW * 0.85)));
    const secX = firstBox.x + (secSpanW - secW) / 2;
    const secY = marginY + rootH + vGap1;

    secPositions.push({ x: secX, y: secY, w: secW, h: secH, text: sec.title });
  }

  const rootX = marginX + (innerWidth - rootW) / 2;
  const rootY = marginY;
  const rootBottomCenter = { x: rootX + rootW / 2, y: rootY + rootH };

  let linesSvg = "";

  for (const sPos of secPositions) {
    const secTopCenter = { x: sPos.x + sPos.w / 2, y: sPos.y };
    linesSvg += `<line x1="${rootBottomCenter.x}" y1="${rootBottomCenter.y}" x2="${secTopCenter.x}" y2="${secTopCenter.y}" stroke="#475569" stroke-width="2" stroke-linecap="round"/>\n`;
  }

  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const sPos = secPositions[sIdx];
    const secBottomCenter = { x: sPos.x + sPos.w / 2, y: sPos.y + sPos.h };
    for (const lPos of leafPositions[sIdx]) {
      const leafTopCenter = { x: lPos.x + lPos.w / 2, y: lPos.y };
      linesSvg += `<line x1="${secBottomCenter.x}" y1="${secBottomCenter.y}" x2="${leafTopCenter.x}" y2="${leafTopCenter.y}" stroke="#475569" stroke-width="1.5" stroke-linecap="round"/>\n`;
    }
  }

  let rootTitleLines: string[] = [];
  if (title.includes(":")) {
    const colonIdx = title.indexOf(":");
    rootTitleLines.push(title.slice(0, colonIdx + 1).trim());
    const rest = title.slice(colonIdx + 1).trim();
    rootTitleLines.push(...wrapSvgText(rest, 26));
  } else {
    rootTitleLines = wrapSvgText(title, 26);
  }

  const rootLineH = 18;
  const rootTextStartY = rootY + (rootH - (rootTitleLines.length - 1) * rootLineH) / 2 + 5;
  let rootTextSvg = "";
  rootTitleLines.forEach((l, idx) => {
    rootTextSvg += `<tspan x="${rootX + rootW / 2}" y="${rootTextStartY + idx * rootLineH}">${escapeXml(l)}</tspan>`;
  });

  const rootBoxSvg = `
    <rect x="${rootX}" y="${rootY}" width="${rootW}" height="${rootH}" rx="14" ry="14" fill="#7462E0" stroke="#6351D0" stroke-width="1.5"/>
    <text font-family="'Times New Roman', serif" font-weight="bold" font-size="15" fill="#ffffff" text-anchor="middle">
      ${rootTextSvg}
    </text>
  `;

  let secBoxesSvg = "";
  for (const sPos of secPositions) {
    const sLines = wrapSvgText(sPos.text, 22);
    const sLineH = 18;
    const sTextStartY = sPos.y + (sPos.h - (sLines.length - 1) * sLineH) / 2 + 5;
    let sTextSpans = "";
    sLines.forEach((l, idx) => {
      sTextSpans += `<tspan x="${sPos.x + sPos.w / 2}" y="${sTextStartY + idx * sLineH}">${escapeXml(l)}</tspan>`;
    });

    secBoxesSvg += `
      <rect x="${sPos.x}" y="${sPos.y}" width="${sPos.w}" height="${sPos.h}" fill="#ffffff" stroke="#475569" stroke-width="2"/>
      <text font-family="'Times New Roman', serif" font-weight="bold" font-size="13.5" fill="#1e293b" text-anchor="middle">
        ${sTextSpans}
      </text>
    `;
  }

  let leafBoxesSvg = "";
  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    for (const lPos of leafPositions[sIdx]) {
      const lLines = wrapSvgText(lPos.text, 22);
      const lLineH = 16;
      const lTextStartY = lPos.y + (lPos.h - (lLines.length - 1) * lLineH) / 2 + 4;
      let lTextSpans = "";
      lLines.forEach((l, idx) => {
        lTextSpans += `<tspan x="${lPos.x + lPos.w / 2}" y="${lTextStartY + idx * lLineH}">${escapeXml(l)}</tspan>`;
      });

      leafBoxesSvg += `
        <rect x="${lPos.x}" y="${lPos.y}" width="${lPos.w}" height="${lPos.h}" rx="12" ry="12" fill="#ffffff" stroke="#93C5FD" stroke-width="1.5"/>
        <text font-family="'Times New Roman', serif" font-size="12" fill="#0f172a" text-anchor="middle">
          ${lTextSpans}
        </text>
      `;
    }
  }

  const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" width="${totalW}" height="${totalH}">
  <style>
    text { font-family: 'Times New Roman', serif; }
  </style>
  <rect width="${totalW}" height="${totalH}" fill="#ffffff"/>
  <g id="lines">${linesSvg}</g>
  <g id="leafBoxes">${leafBoxesSvg}</g>
  <g id="sectionBoxes">${secBoxesSvg}</g>
  <g id="rootBox">${rootBoxSvg}</g>
</svg>`;

  return { svg: svgContent, width: totalW, height: totalH };
}

function isRunBold(r: any): boolean {
  const b = r.getElementsByTagName("w:b")[0];
  if (!b) return false;
  const val = b.getAttribute("w:val");
  return val !== "0" && val !== "false" && val !== "off";
}

function isParagraphBold(p: any): boolean {
  const runs = Array.from(p.getElementsByTagName("w:r")) as any[];
  if (runs.length === 0) return false;
  let boldChars = 0;
  let totalChars = 0;
  for (const r of runs) {
    const tNodes = Array.from(r.getElementsByTagName("w:t")) as any[];
    const t = tNodes.map((x: any) => x.textContent || "").join("");
    totalChars += t.length;
    if (isRunBold(r)) {
      boldChars += t.length;
    }
  }
  return totalChars > 0 && boldChars / totalChars >= 0.5;
}

export function extractCdrDiagramSections(lesson: LessonDocumentModel): DiagramSection[] {
  const tableBlocks = (lesson.cdr_lesson?.blocks || []).filter((b) => b.kind === "table" && b.xml);
  if (tableBlocks.length === 0) return [];

  const sections: DiagramSection[] = [];

  for (const tblBlock of tableBlocks) {
    if (!tblBlock.xml) continue;
    const doc = new DOMParser().parseFromString(tblBlock.xml, "text/xml");
    const trs = Array.from(doc.getElementsByTagName("w:tr"));
    if (trs.length < 2) continue;

    // Find column index for "Nội dung dạy học" or "Nội dung"
    let contentColIdx = -1;
    const headerCells = Array.from(trs[0].getElementsByTagName("w:tc")).map((tc) => {
      const tNodes = Array.from(tc.getElementsByTagName("w:t")) as any[];
      return tNodes.map((t: any) => t.textContent || "").join("").replace(/\s+/g, " ").trim();
    });

    for (let c = 0; c < headerCells.length; c++) {
      if (/nội dung dạy học/i.test(headerCells[c])) {
        contentColIdx = c;
        break;
      }
    }
    if (contentColIdx === -1) {
      for (let c = 0; c < headerCells.length; c++) {
        if (/^nội dung/i.test(headerCells[c])) {
          contentColIdx = c;
          break;
        }
      }
    }
    if (contentColIdx === -1) {
      contentColIdx = 1;
    }

    let currentSection: DiagramSection | null = null;

    for (let r = 1; r < trs.length; r++) {
      const tcs = Array.from(trs[r].getElementsByTagName("w:tc"));
      if (tcs.length <= contentColIdx) continue;

      const tc = tcs[contentColIdx];
      const ps = Array.from(tc.getElementsByTagName("w:p"));

      let col0Text = "";
      if (tcs.length > 0) {
        const tNodes0 = Array.from(tcs[0].getElementsByTagName("w:t")) as any[];
        col0Text = tNodes0.map((t: any) => t.textContent || "").join("").trim();
      }

      for (let pIdx = 0; pIdx < ps.length; pIdx++) {
        const p = ps[pIdx];
        const tNodes = Array.from(p.getElementsByTagName("w:t")) as any[];
        const rawText = tNodes.map((t: any) => t.textContent || "").join("").replace(/\s+/g, " ").trim();
        if (!rawText) continue;

        const bold = isParagraphBold(p);
        const hasBullet = /^[-+*•–—]\s*/.test(rawText);

        const isLevel1 =
          (bold && !hasBullet) ||
          (!hasBullet && pIdx === 0 && !currentSection) ||
          (!hasBullet && pIdx === 0 && /^[IVXLCDM]+\b/i.test(col0Text));

        if (isLevel1) {
          const cleanTitle = rawText.replace(/^[IVXLCDM]+\s*[.:–-]\s*/i, "").trim();
          currentSection = {
            title: cleanTitle,
            children: []
          };
          sections.push(currentSection);
        } else {
          const cleanChild = rawText.replace(/^[-+*•–—]\s*/, "").trim();
          if (cleanChild) {
            if (!currentSection) {
              currentSection = {
                title: "Nội dung " + (sections.length + 1),
                children: []
              };
              sections.push(currentSection);
            }
            currentSection.children.push(cleanChild);
          }
        }
      }
    }
  }

  return sections;
}

export function cleanOutlineTitle(rawTitle: string): string {
  let s = rawTitle.replace(/\s+/g, " ").trim();
  // Strip numeric prefix like "1.1. ", "1.1.1. ", "2.3. "
  s = s.replace(/^\s*\d+(?:\s*\.\s*\d+)*\s*[.:–-]\s*/, "");
  // Strip roman numerals like "I. ", "II. "
  s = s.replace(/^\s*[IVXLCDM]+\s*[.:–-]\s*/i, "");
  // Strip sub-item letters like "a) ", "b. "
  s = s.replace(/^\s*[a-zA-Z]\s*[.)–-]\s*/, "");
  return s.trim();
}

export function buildLessonDiagramData(lesson: LessonDocumentModel): DiagramData {
  // 1. Prioritize extracting from CDR schedule table
  let sections = extractCdrDiagramSections(lesson);

  // 2. Fallback to GT outline if CDR table has no content
  if (sections.length === 0) {
  const outlines = lesson.gt_chapter.outline;
  let currentSection: DiagramSection | null = null;

  for (const node of outlines) {
    const cleanTitle = cleanOutlineTitle(node.normalized_title || node.original_title);
    if (!cleanTitle) continue;

    if (node.level === 1) {
      currentSection = {
        title: cleanTitle,
        children: []
      };
      sections.push(currentSection);
    } else if (node.level === 2) {
      if (!currentSection) {
        currentSection = {
          title: cleanTitle,
          children: []
        };
        sections.push(currentSection);
      } else {
        currentSection.children.push(cleanTitle);
      }
    }
  }

  // If no level 1 or 2 found, fallback to major outline entries
  if (sections.length === 0) {
    for (const node of outlines.slice(0, 4)) {
      const cleanTitle = cleanOutlineTitle(node.normalized_title || node.original_title);
      if (cleanTitle) {
        sections.push({ title: cleanTitle, children: [] });
      }
    }
  }
  }

  // Format lesson title: clean up extra whitespace
  const cleanTitle = (lesson.cdr_lesson?.title || lesson.lesson_title).replace(/\s+/g, " ").trim();

  return {
    title: cleanTitle,
    sections
  };
}

function getPythonExecutable(): string {
  const bundled = "C:\\Users\\Ba Gau\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe";
  if (fs.existsSync(bundled)) {
    return bundled;
  }
  return "python";
}

export function renderLessonDiagramPng(
  data: DiagramData,
  outputPath: string
): { width: number; height: number } {
  const tempJson = path.join(os.tmpdir(), `diagram_data_${Date.now()}_${Math.random().toString(36).slice(2)}.json`);
  fs.writeFileSync(tempJson, JSON.stringify(data, null, 2), "utf8");

  const pyScript = path.resolve(process.cwd(), "server/document_pipeline/diagram_generator.py");
  const pyExe = getPythonExecutable();

  try {
    const stdout = childProcess.execFileSync(pyExe, [pyScript, tempJson, outputPath], {
      encoding: "utf8",
      timeout: 15000
    });
    const match = stdout.match(/OK:([^:]+):(\d+):(\d+)/);
    if (match) {
      return { width: parseInt(match[2], 10), height: parseInt(match[3], 10) };
    }
    return { width: 1200, height: 600 };
  } catch (err) {
    console.warn("Failed to render diagram with python:", err);
    return { width: 1200, height: 600 };
  } finally {
    if (fs.existsSync(tempJson)) {
      try {
        fs.unlinkSync(tempJson);
      } catch {}
    }
  }
}

export function buildDiagramDrawingXml(
  svgRelId: string = "rIdDiagramSvg",
  pngRelId: string = "rIdDiagramPng",
  cx: number = 5760000,
  cy: number = 2880000
): string {
  return `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:pPr>
      <w:jc w:val="center"/>
      <w:spacing w:before="140" w:after="180"/>
    </w:pPr>
    <w:r>
      <w:drawing>
        <wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
          <wp:extent cx="${cx}" cy="${cy}"/>
          <wp:docPr id="998" name="SoDoKhoiBaiGiang"/>
          <wp:cNvGraphicFramePr>
            <a:graphicFrameLocks noChangeAspect="1" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>
          </wp:cNvGraphicFramePr>
          <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:nvPicPr>
                  <pic:cNvPr id="0" name="lesson_diagram.svg"/>
                  <pic:cNvPicPr/>
                </pic:nvPicPr>
                <pic:blipFill>
                  <a:blip r:embed="${pngRelId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
                    <a:extLst>
                      <a:ext uri="{96DAC542-7816-424E-8B73-764B10D380BC}">
                        <asvg:svgBlip r:embed="${svgRelId}" xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main"/>
                      </a:ext>
                    </a:extLst>
                  </a:blip>
                  <a:stretch>
                    <a:fillRect/>
                  </a:stretch>
                </pic:blipFill>
                <pic:spPr>
                  <a:xfrm>
                    <a:off x="0" y="0"/>
                    <a:ext cx="${cx}" cy="${cy}"/>
                  </a:xfrm>
                  <a:prstGeom prst="rect">
                    <a:avLst/>
                  </a:prstGeom>
                </pic:spPr>
              </pic:pic>
            </a:graphicData>
          </a:graphic>
        </wp:inline>
      </w:drawing>
    </w:r>
  </w:p>`;
}
