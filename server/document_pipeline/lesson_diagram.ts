import * as childProcess from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { LessonDocumentModel } from "../services/normalizer";

export interface DiagramSection {
  title: string;
  children: string[];
}

export interface DiagramData {
  title: string;
  sections: DiagramSection[];
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
  const outlines = lesson.gt_chapter.outline;
  const sections: DiagramSection[] = [];
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

  // Format lesson title: clean up extra whitespace
  const cleanTitle = lesson.lesson_title.replace(/\s+/g, " ").trim();

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
