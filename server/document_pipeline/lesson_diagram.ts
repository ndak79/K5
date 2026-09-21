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
  rId: string = "rIdDiagramEnding",
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
                  <pic:cNvPr id="0" name="lesson_diagram.png"/>
                  <pic:cNvPicPr/>
                </pic:nvPicPr>
                <pic:blipFill>
                  <a:blip r:embed="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
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
