import * as fs from "node:fs";
import * as path from "node:path";
import AdmZip from "adm-zip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { normalizeDocxPackageFonts } from "./docx_font_normalizer";

export interface AnswerSubItem {
  content: string;
  score: string;
}

export interface ExamAnswerModel {
  questionNumber: number;
  questionText: string;
  totalScore: string;
  introduction: {
    title: string;
    score: string;
  };
  part1: {
    title: string;
    score: string;
    items: AnswerSubItem[];
  };
  part2: {
    title: string;
    score: string;
    items: AnswerSubItem[];
  };
  conclusion: {
    title: string;
    score: string;
  };
  clos?: string[];
  levels?: {
    easy: string;
    medium: string;
    hard: string;
  };
}

export interface CloDefinition {
  code: string;
  text: string;
}

export interface ExportExamAnswersOptions {
  mode?: "all" | "questions" | "answers";
  title?: string;
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

function buildParagraphXml(text: string, options?: { bold?: boolean; italic?: boolean; align?: string; spacingBefore?: number; spacingAfter?: number; size?: number }): string {
  const align = options?.align || "both";
  const bold = options?.bold ? "<w:b/><w:bCs/>" : "";
  const italic = options?.italic ? "<w:i/><w:iCs/>" : "";
  const sizeVal = options?.size || 28;
  const spacingBefore = options?.spacingBefore ?? 60;
  const spacingAfter = options?.spacingAfter ?? 60;

  return `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:pPr>
      <w:jc w:val="${align}"/>
      <w:spacing w:before="${spacingBefore}" w:after="${spacingAfter}" w:line="240" w:lineRule="auto"/>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
        ${bold}
        ${italic}
        <w:sz w:val="${sizeVal}"/>
        <w:szCs w:val="${sizeVal}"/>
      </w:rPr>
    </w:pPr>
    <w:r>
      <w:rPr>
        <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/>
        ${bold}
        ${italic}
        <w:sz w:val="${sizeVal}"/>
        <w:szCs w:val="${sizeVal}"/>
      </w:rPr>
      <w:t xml:space="preserve">${escapeXml(text)}</w:t>
    </w:r>
  </w:p>`;
}

function buildQuestionTableXml(answer: ExamAnswerModel): string {
  let rowsXml = "";

  // Row 0: Question header
  rowsXml += `<w:tr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:tc>
      <w:tcPr><w:tcW w:w="9090" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
      ${buildParagraphXml(`Câu hỏi ${answer.questionNumber}: ${answer.questionText}`, { bold: true, align: "both" })}
    </w:tc>
    <w:tc>
      <w:tcPr><w:tcW w:w="862" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
      ${buildParagraphXml(answer.totalScore || "5,0đ", { bold: true, align: "center" })}
    </w:tc>
  </w:tr>`;

  // Row 1: Introduction (Đặt vấn đề)
  rowsXml += `<w:tr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:tc>
      <w:tcPr><w:tcW w:w="9090" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
      ${buildParagraphXml(answer.introduction?.title || "* Đặt vấn đề hợp lý, sát nội dung", { bold: true, align: "both" })}
    </w:tc>
    <w:tc>
      <w:tcPr><w:tcW w:w="862" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
      ${buildParagraphXml(answer.introduction?.score || "0,25đ", { bold: true, align: "center" })}
    </w:tc>
  </w:tr>`;

  // Row 2: Part 1 Title (Ý 1)
  rowsXml += `<w:tr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:tc>
      <w:tcPr><w:tcW w:w="9090" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
      ${buildParagraphXml(answer.part1?.title || "Ý 1: Phân tích nội dung", { bold: true, align: "both" })}
    </w:tc>
    <w:tc>
      <w:tcPr><w:tcW w:w="862" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
      ${buildParagraphXml(answer.part1?.score || "2,5đ", { bold: true, align: "center" })}
    </w:tc>
  </w:tr>`;

  // Part 1 Items
  if (answer.part1?.items && answer.part1.items.length > 0) {
    for (const item of answer.part1.items) {
      const lines = item.content.split("\n").map(l => l.trim()).filter(Boolean);
      let contentCellXml = "";
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const isSubBullet = line.startsWith("+") || line.startsWith("*");
        contentCellXml += buildParagraphXml(line, {
          bold: false,
          italic: false,
          align: "both",
          spacingBefore: i === 0 ? 60 : 30,
          spacingAfter: 30
        });
      }
      if (!contentCellXml) {
        contentCellXml = buildParagraphXml("- (Đang cập nhật nội dung)", { align: "both" });
      }
      rowsXml += `<w:tr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:tc>
          <w:tcPr><w:tcW w:w="9090" w:type="dxa"/></w:tcPr>
          ${contentCellXml}
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="862" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
          ${buildParagraphXml(item.score || "", { align: "center" })}
        </w:tc>
      </w:tr>`;
    }
  }

  // Part 2 Title (Ý 2)
  rowsXml += `<w:tr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:tc>
      <w:tcPr><w:tcW w:w="9090" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
      ${buildParagraphXml(answer.part2?.title || "Ý 2: Vận dụng đối với người cán bộ phân đội", { bold: true, align: "both" })}
    </w:tc>
    <w:tc>
      <w:tcPr><w:tcW w:w="862" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
      ${buildParagraphXml(answer.part2?.score || "2,0đ", { bold: true, align: "center" })}
    </w:tc>
  </w:tr>`;

  // Part 2 Items
  if (answer.part2?.items && answer.part2.items.length > 0) {
    for (const item of answer.part2.items) {
      const lines = item.content.split("\n").map(l => l.trim()).filter(Boolean);
      let contentCellXml = "";
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        contentCellXml += buildParagraphXml(line, {
          bold: false,
          italic: false,
          align: "both",
          spacingBefore: i === 0 ? 60 : 30,
          spacingAfter: 30
        });
      }
      if (!contentCellXml) {
        contentCellXml = buildParagraphXml("- (Đang cập nhật nội dung)", { align: "both" });
      }
      rowsXml += `<w:tr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
        <w:tc>
          <w:tcPr><w:tcW w:w="9090" w:type="dxa"/></w:tcPr>
          ${contentCellXml}
        </w:tc>
        <w:tc>
          <w:tcPr><w:tcW w:w="862" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
          ${buildParagraphXml(item.score || "", { align: "center" })}
        </w:tc>
      </w:tr>`;
    }
  }

  // Conclusion (Phương pháp trình bày)
  rowsXml += `<w:tr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:tc>
      <w:tcPr><w:tcW w:w="9090" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
      ${buildParagraphXml(answer.conclusion?.title || "* Phương pháp trình bày rõ ràng, mạch lạc", { bold: true, align: "both" })}
    </w:tc>
    <w:tc>
      <w:tcPr><w:tcW w:w="862" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>
      ${buildParagraphXml(answer.conclusion?.score || "0,25đ", { bold: true, align: "center" })}
    </w:tc>
  </w:tr>`;

  return `<w:tbl xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:tblPr>
      <w:tblW w:w="9952" w:type="dxa"/>
      <w:tblInd w:w="-5" w:type="dxa"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      </w:tblBorders>
    </w:tblPr>
    <w:tblGrid>
      <w:gridCol w:w="9090"/>
      <w:gridCol w:w="862"/>
    </w:tblGrid>
    ${rowsXml}
  </w:tbl>`;
}

function buildCloMatrixTableXml(answers: ExamAnswerModel[], clos: CloDefinition[]): string {
  if (clos.length === 0 || answers.length === 0) return "";

  const cloCols = clos.map(c => c.code);
  const totalCols = 1 + cloCols.length;
  const qColWidth = 1500;
  const cloColWidth = Math.floor((9952 - qColWidth) / cloCols.length);

  let gridCols = `<w:gridCol w:w="${qColWidth}"/>`;
  for (let i = 0; i < cloCols.length; i++) {
    gridCols += `<w:gridCol w:w="${cloColWidth}"/>`;
  }

  // Header row
  let headerCells = `<w:tc><w:tcPr><w:tcW w:w="${qColWidth}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${buildParagraphXml("CLO", { bold: true, align: "center", size: 24 })}</w:tc>`;
  for (const c of cloCols) {
    headerCells += `<w:tc><w:tcPr><w:tcW w:w="${cloColWidth}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${buildParagraphXml(c, { bold: true, align: "center", size: 24 })}</w:tc>`;
  }
  let rowsXml = `<w:tr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${headerCells}</w:tr>`;

  // Data rows
  for (const ans of answers) {
    const activeClos = new Set(ans.clos || []);
    let rowCells = `<w:tc><w:tcPr><w:tcW w:w="${qColWidth}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${buildParagraphXml(`Câu ${ans.questionNumber}`, { bold: true, align: "center", size: 24 })}</w:tc>`;
    for (const c of cloCols) {
      const isMatched = activeClos.has(c);
      rowCells += `<w:tc><w:tcPr><w:tcW w:w="${cloColWidth}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr>${buildParagraphXml(isMatched ? "X" : "", { bold: true, align: "center", size: 24 })}</w:tc>`;
    }
    rowsXml += `<w:tr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${rowCells}</w:tr>`;
  }

  return `<w:tbl xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:tblPr>
      <w:tblW w:w="9952" w:type="dxa"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>
      </w:tblBorders>
    </w:tblPr>
    <w:tblGrid>${gridCols}</w:tblGrid>
    ${rowsXml}
  </w:tbl>`;
}

export function exportExamAnswersDocx(
  answers: ExamAnswerModel[],
  clos: CloDefinition[],
  outputPath: string,
  basePackagePath?: string,
  options?: ExportExamAnswersOptions
): string {
  const mode = options?.mode || "all";
  let baseZip: AdmZip;
  const defaultBaseCandidates = [
    basePackagePath,
    "File demo Bien soan CH,DA.docx",
    "tests/fixtures/CDR mon TLHQS.docx",
    "CDR.docx"
  ].filter(Boolean) as string[];

  let loaded = false;
  for (const candidate of defaultBaseCandidates) {
    if (fs.existsSync(candidate)) {
      try {
        baseZip = new AdmZip(candidate);
        loaded = true;
        break;
      } catch {}
    }
  }

  if (!loaded) {
    throw new Error("Không tìm thấy tệp DOCX mẫu cơ sở để xuất tài liệu.");
  }

  const docXml = baseZip!.readAsText("word/document.xml");
  if (!docXml) {
    throw new Error("Tệp mẫu DOCX không chứa word/document.xml");
  }

  const dom = new DOMParser().parseFromString(docXml, "text/xml");
  const body = dom.getElementsByTagName("w:body")[0];
  if (!body) {
    throw new Error("Tệp mẫu DOCX không chứa thẻ w:body");
  }

  // Preserve section properties (sectPr)
  const sectPr = body.getElementsByTagName("w:sectPr")[0];
  const savedSectPr = sectPr ? dom.importNode(sectPr, true) : null;

  // Clear old body children
  while (body.firstChild) {
    body.removeChild(body.firstChild);
  }

  // 1. Header Title
  let docTitle = "NGÂN HÀNG CÂU HỎI VÀ ĐÁP ÁN MÔN HỌC";
  if (mode === "questions") {
    docTitle = "NGÂN HÀNG CÂU HỎI MÔN HỌC";
  } else if (mode === "answers") {
    docTitle = "NGÂN HÀNG ĐÁP ÁN VÀ MA TRẬN MÔN HỌC";
  }
  const titleP1 = buildParagraphXml("BỘ MÔN TÂM LÝ - GIÁO DỤC HỌC QUÂN SỰ", { bold: true, align: "center", size: 26, spacingAfter: 80 });
  const titleP2 = buildParagraphXml(docTitle, { bold: true, align: "center", size: 30, spacingAfter: 160 });

  const appendXmlFragment = (xmlStr: string) => {
    const fragmentDoc = new DOMParser().parseFromString(`<root xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${xmlStr}</root>`, "text/xml");
    for (const child of Array.from(fragmentDoc.documentElement.childNodes) as any[]) {
      if (child.nodeType === 1) {
        body.appendChild(dom.importNode(child, true));
      }
    }
  };

  appendXmlFragment(titleP1);
  appendXmlFragment(titleP2);

  // 1 & 2: Phần I (Câu hỏi, đáp án) & Phần II (Ma trận CLO) - for "all" or "answers"
  if (mode === "all" || mode === "answers") {
    const section1H = buildParagraphXml("* Câu hỏi, đáp án", { bold: true, align: "both", size: 28, spacingBefore: 120, spacingAfter: 120 });
    appendXmlFragment(section1H);

    for (let i = 0; i < answers.length; i++) {
      const ans = answers[i];
      const tblXml = buildQuestionTableXml(ans);
      appendXmlFragment(tblXml);
      appendXmlFragment(`<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:pPr><w:spacing w:before="160" w:after="160"/></w:pPr></w:p>`);
    }

    if (clos.length > 0 && answers.length > 0) {
      const matrixHeader = buildParagraphXml("* Ma trận biểu thị sự phù hợp giữa ngân hàng câu hỏi-đáp án và chuẩn đầu ra (CLO)", {
        bold: true,
        align: "both",
        size: 28,
        spacingBefore: 240,
        spacingAfter: 140
      });
      appendXmlFragment(matrixHeader);
      const matrixTableXml = buildCloMatrixTableXml(answers, clos);
      if (matrixTableXml) {
        appendXmlFragment(matrixTableXml);
        appendXmlFragment(`<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:pPr><w:spacing w:before="160" w:after="160"/></w:pPr></w:p>`);
      }
    }
  }

  // 3: Questions by 3 Levels - for "all" or "questions"
  if (mode === "all" || mode === "questions") {
    const hasLevels = answers.some(a => a.levels && (a.levels.easy || a.levels.medium || a.levels.hard));
    if (hasLevels) {
      const levelsHeader = buildParagraphXml("* Các câu hỏi ở 3 mức độ (Dễ, Trung bình, Khó)", {
        bold: true,
        align: "both",
        size: 28,
        spacingBefore: mode === "questions" ? 80 : 240,
        spacingAfter: 140
      });
      appendXmlFragment(levelsHeader);

      for (const ans of answers) {
        if (!ans.levels) continue;
        appendXmlFragment(buildParagraphXml(`Câu ${ans.questionNumber}:`, { bold: true, size: 28, spacingBefore: 100, spacingAfter: 40 }));
        if (ans.levels.easy) {
          appendXmlFragment(buildParagraphXml(`1. Dễ: ${ans.levels.easy}`, { size: 26, spacingBefore: 20, spacingAfter: 20 }));
        }
        if (ans.levels.medium) {
          appendXmlFragment(buildParagraphXml(`2. Trung bình: ${ans.levels.medium}`, { size: 26, spacingBefore: 20, spacingAfter: 20 }));
        }
        if (ans.levels.hard) {
          appendXmlFragment(buildParagraphXml(`3. Khó: ${ans.levels.hard}`, { size: 26, spacingBefore: 20, spacingAfter: 40 }));
        }
      }
    }
  }

  // Re-attach sectPr
  if (savedSectPr) {
    body.appendChild(savedSectPr);
  }

  // Re-serialize modified DOM to XML string
  const docXmlString = new XMLSerializer().serializeToString(dom);
  if (baseZip!.getEntry("word/document.xml")) {
    baseZip!.updateFile("word/document.xml", Buffer.from(docXmlString, "utf8"));
  } else {
    baseZip!.addFile("word/document.xml", Buffer.from(docXmlString, "utf8"));
  }

  // Normalize fonts to Times New Roman Unicode
  normalizeDocxPackageFonts(baseZip!);

  const parentDir = path.dirname(outputPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  baseZip!.writeZip(outputPath);
  return outputPath;
}
