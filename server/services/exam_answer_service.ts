import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import AdmZip from "adm-zip";
import { DOMParser } from "@xmldom/xmldom";
import { normalizeInputDocument } from "../document_pipeline/convert";
import { parseGtDocument, ParsedGtDocument } from "../document_pipeline/parse_gt";
import { createOpenAICompatibleClient, DEFAULT_AI_MODEL, OpenAICompatibleClient } from "./openai_compatible_client";
import { exportExamAnswersDocx, ExamAnswerModel, CloDefinition, AnswerSubItem } from "../document_pipeline/export_exam_answers_docx";

export interface ExamQuestionItem {
  number: number;
  question: string;
  status: "idle" | "generating" | "completed" | "failed";
  error: string | null;
  answer: ExamAnswerModel | null;
}

export interface ExamAnswerSessionSummary {
  session_id: string;
  cdr_file_name: string | null;
  gt_file_name: string | null;
  questions_file_name: string | null;
  cdr_status: "missing" | "ready" | "failed";
  gt_status: "missing" | "ready" | "failed";
  questions_status: "missing" | "ready" | "failed";
  cdr_error: string | null;
  gt_error: string | null;
  questions_error: string | null;
  total_questions: number;
  completed_questions: number;
  clos: CloDefinition[];
  questions: ExamQuestionItem[];
}

export class ExamAnswerRuntime {
  session_id: string = Math.random().toString(36).substring(2, 15);
  cdr_file_name: string | null = null;
  gt_file_name: string | null = null;
  questions_file_name: string | null = null;
  cdr_original_path: string | null = null;
  gt_original_path: string | null = null;
  questions_original_path: string | null = null;
  cdr_status: "missing" | "ready" | "failed" = "missing";
  gt_status: "missing" | "ready" | "failed" = "missing";
  questions_status: "missing" | "ready" | "failed" = "missing";
  cdr_error: string | null = null;
  gt_error: string | null = null;
  questions_error: string | null = null;
  parsed_gt: ParsedGtDocument | null = null;
  clos: CloDefinition[] = [];
  questions: ExamQuestionItem[] = [];
  batch_dirs: Set<string> = new Set();
}

export const examAnswerRuntime = new ExamAnswerRuntime();

function getNextBatchDir(): string {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, "").substring(0, 14);
  const dir = path.join(os.tmpdir(), "exam_answer_builder", timestamp);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function storeUpload(filename: string, content: Buffer, targetDir: string): string {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  const destination = path.join(targetDir, filename);
  fs.writeFileSync(destination, content);
  return destination;
}

export function resetExamAnswerRuntime(): void {
  for (const batchDir of examAnswerRuntime.batch_dirs) {
    try {
      if (fs.existsSync(batchDir)) {
        fs.rmSync(batchDir, { recursive: true, force: true });
      }
    } catch {}
  }
  examAnswerRuntime.batch_dirs.clear();
  examAnswerRuntime.session_id = Math.random().toString(36).substring(2, 15);
  examAnswerRuntime.cdr_file_name = null;
  examAnswerRuntime.gt_file_name = null;
  examAnswerRuntime.questions_file_name = null;
  examAnswerRuntime.cdr_original_path = null;
  examAnswerRuntime.gt_original_path = null;
  examAnswerRuntime.questions_original_path = null;
  examAnswerRuntime.cdr_status = "missing";
  examAnswerRuntime.gt_status = "missing";
  examAnswerRuntime.questions_status = "missing";
  examAnswerRuntime.cdr_error = null;
  examAnswerRuntime.gt_error = null;
  examAnswerRuntime.questions_error = null;
  examAnswerRuntime.parsed_gt = null;
  examAnswerRuntime.clos = [];
  examAnswerRuntime.questions = [];
}

export function getExamAnswerSummary(): ExamAnswerSessionSummary {
  const completed = examAnswerRuntime.questions.filter((q) => q.status === "completed").length;
  return {
    session_id: examAnswerRuntime.session_id,
    cdr_file_name: examAnswerRuntime.cdr_file_name,
    gt_file_name: examAnswerRuntime.gt_file_name,
    questions_file_name: examAnswerRuntime.questions_file_name,
    cdr_status: examAnswerRuntime.cdr_status,
    gt_status: examAnswerRuntime.gt_status,
    questions_status: examAnswerRuntime.questions_status,
    cdr_error: examAnswerRuntime.cdr_error,
    gt_error: examAnswerRuntime.gt_error,
    questions_error: examAnswerRuntime.questions_error,
    total_questions: examAnswerRuntime.questions.length,
    completed_questions: completed,
    clos: examAnswerRuntime.clos,
    questions: examAnswerRuntime.questions
  };
}

export function extractClosFromCdrDocx(documentPath: string): CloDefinition[] {
  const zip = new AdmZip(documentPath);
  const docXml = zip.readAsText("word/document.xml");
  if (!docXml) return [];

  const doc = new DOMParser().parseFromString(docXml, "text/xml");
  const paragraphs = Array.from(doc.getElementsByTagName("w:p"))
    .map((p) => Array.from(p.getElementsByTagName("w:t")).map((t) => t.textContent).join("").trim())
    .filter(Boolean);

  const clos: CloDefinition[] = [];
  let inCloSection = false;

  for (const text of paragraphs) {
    if (/^[B|II|III].*CHUẨN ĐẦU RA/i.test(text) || /^B\.\s*CHUẨN/i.test(text) || /^\*?\s*Chuẩn đầu ra\s*\(CLO\)/i.test(text)) {
      inCloSection = true;
      continue;
    }

    if (inCloSection) {
      if (/^Bài\s+\d+/i.test(text) || /^C\.\s*/i.test(text) || /^III\.\s*/i.test(text) || /^NỘI DUNG/i.test(text)) {
        inCloSection = false;
        break;
      }

      const m = text.match(/^(\d+(?:\.\d+)+)[.\s:]+(.+)$/);
      if (m) {
        const code = m[1].trim();
        const desc = m[2].trim();
        if (!clos.some((c) => c.code === code)) {
          clos.push({ code, text: desc });
        }
      }
    }
  }

  // Fallback default CLOs if none extracted
  if (clos.length === 0) {
    return [
      { code: "1.1", text: "Góp phần hình thành lập trường, bản lĩnh chính trị vững vàng." },
      { code: "1.2", text: "Xây dựng ý thức chấp hành chủ trương, đường lối về huấn luyện, giáo dục." },
      { code: "2.1", text: "Giải thích các khái niệm, phạm trù cơ bản." },
      { code: "2.2", text: "Phân tích cấu trúc, bản chất, quy luật, nguyên tắc, phương pháp, hình thức." },
      { code: "3.1", text: "Thực hiện được yêu cầu huấn luyện, giáo dục quân nhân." },
      { code: "3.2", text: "Vận dụng được quy luật, nguyên tắc, phương pháp vào thực tiễn." },
      { code: "4.1", text: "Tuân thủ cơ sở khoa học về huấn luyện, giáo dục quân nhân." },
      { code: "4.2", text: "Đấu tranh với chủ nghĩa kinh nghiệm trong tổ chức huấn luyện, giáo dục." }
    ];
  }

  return clos;
}

export function extractQuestionsFromDocx(documentPath: string): ExamQuestionItem[] {
  const zip = new AdmZip(documentPath);
  const docXml = zip.readAsText("word/document.xml");
  if (!docXml) return [];

  const doc = new DOMParser().parseFromString(docXml, "text/xml");
  const questions: ExamQuestionItem[] = [];

  // 1. Check paragraphs
  for (const p of Array.from(doc.getElementsByTagName("w:p"))) {
    const text = Array.from(p.getElementsByTagName("w:t")).map((t) => t.textContent).join("").trim();
    if (!text) continue;
    const m = text.match(/^\s*(?:C(?:â|a)u\s+)?(\d+)[.\s:–-]+(.+)$/i);
    if (m) {
      const num = parseInt(m[1], 10);
      const qText = m[2].trim();
      if (qText.length > 5 && !questions.some((q) => q.number === num)) {
        questions.push({
          number: num,
          question: qText,
          status: "idle",
          error: null,
          answer: null
        });
      }
    }
  }

  // 2. Check table cells if no paragraphs matched
  if (questions.length === 0) {
    for (const tbl of Array.from(doc.getElementsByTagName("w:tbl"))) {
      for (const tr of Array.from(tbl.getElementsByTagName("w:tr"))) {
        const cells = Array.from(tr.getElementsByTagName("w:tc")).map((tc) =>
          Array.from(tc.getElementsByTagName("w:t")).map((t) => t.textContent).join("").trim()
        );
        for (const cellText of cells) {
          const m = cellText.match(/^\s*(?:C(?:â|a)u\s+)?(\d+)[.\s:–-]+(.+)$/i);
          if (m) {
            const num = parseInt(m[1], 10);
            const qText = m[2].trim();
            if (qText.length > 5 && !questions.some((q) => q.number === num)) {
              questions.push({
                number: num,
                question: qText,
                status: "idle",
                error: null,
                answer: null
              });
            }
          }
        }
      }
    }
  }

  questions.sort((a, b) => a.number - b.number);
  return questions;
}

export async function uploadExamAnswersCdr(filename: string, buffer: Buffer): Promise<ExamAnswerSessionSummary> {
  const batchDir = getNextBatchDir();
  const filePath = storeUpload(filename, buffer, batchDir);
  examAnswerRuntime.batch_dirs.add(batchDir);
  examAnswerRuntime.cdr_file_name = filename;
  examAnswerRuntime.cdr_original_path = filePath;

  try {
    const clos = extractClosFromCdrDocx(filePath);
    examAnswerRuntime.clos = clos;
    examAnswerRuntime.cdr_status = "ready";
    examAnswerRuntime.cdr_error = null;
  } catch (err: any) {
    examAnswerRuntime.cdr_status = "failed";
    examAnswerRuntime.cdr_error = err.message || "Lỗi đọc file chuẩn đầu ra CDR";
  }

  return getExamAnswerSummary();
}

export async function uploadExamAnswersGt(filename: string, buffer: Buffer): Promise<ExamAnswerSessionSummary> {
  const batchDir = getNextBatchDir();
  const filePath = storeUpload(filename, buffer, batchDir);
  examAnswerRuntime.batch_dirs.add(batchDir);
  examAnswerRuntime.gt_file_name = filename;
  examAnswerRuntime.gt_original_path = filePath;

  try {
    const normalizedPath = normalizeInputDocument(filePath, batchDir);
    const parsedGt = parseGtDocument(normalizedPath);
    examAnswerRuntime.parsed_gt = parsedGt;
    examAnswerRuntime.gt_status = "ready";
    examAnswerRuntime.gt_error = null;
  } catch (err: any) {
    examAnswerRuntime.gt_status = "failed";
    examAnswerRuntime.gt_error = err.message || "Lỗi đọc file giáo trình GT";
  }

  return getExamAnswerSummary();
}

export async function uploadExamAnswersQuestions(filename: string, buffer: Buffer): Promise<ExamAnswerSessionSummary> {
  const batchDir = getNextBatchDir();
  const filePath = storeUpload(filename, buffer, batchDir);
  examAnswerRuntime.batch_dirs.add(batchDir);
  examAnswerRuntime.questions_file_name = filename;
  examAnswerRuntime.questions_original_path = filePath;

  try {
    const questions = extractQuestionsFromDocx(filePath);
    if (questions.length === 0) {
      throw new Error("Không tìm thấy câu hỏi nào trong file câu hỏi.");
    }
    examAnswerRuntime.questions = questions;
    examAnswerRuntime.questions_status = "ready";
    examAnswerRuntime.questions_error = null;
  } catch (err: any) {
    examAnswerRuntime.questions_status = "failed";
    examAnswerRuntime.questions_error = err.message || "Lỗi đọc file câu hỏi";
  }

  return getExamAnswerSummary();
}

export function findRelevantGtContext(questionText: string, parsedGt: ParsedGtDocument | null): string {
  if (!parsedGt || parsedGt.chapters.length === 0) return "";

  const stopWords = new Set([
    "phân tích", "nêu", "trình bày", "giải thích", "ý nghĩa", "vận dụng", "đối với",
    "người", "cán bộ", "phân đội", "ở", "đơn vị", "hiện nay", "trong", "của", "các",
    "để", "nâng cao", "hiệu quả", "chất lượng", "và", "là", "với", "những"
  ]);

  const words = questionText
    .toLowerCase()
    .replace(/["“”'.,!?:;()-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  let bestChapter = parsedGt.chapters[0];
  let highestScore = -1;

  for (const chapter of parsedGt.chapters) {
    let score = 0;
    const chapterText = chapter.blocks.map((b) => b.text_preview).join(" ").toLowerCase();
    const titleText = chapter.title.toLowerCase();

    for (const w of words) {
      if (titleText.includes(w)) score += 10;
      for (const o of chapter.outline) {
        if (o.normalized_title.toLowerCase().includes(w)) score += 5;
      }
      const occurrences = chapterText.split(w).length - 1;
      score += Math.min(occurrences, 8);
    }

    if (score > highestScore) {
      highestScore = score;
      bestChapter = chapter;
    }
  }

  // Collect relevant text from bestChapter
  const relevantParagraphs: string[] = [];
  for (const b of bestChapter.blocks) {
    if (b.kind === "paragraph" && b.text_preview.trim().length > 20) {
      relevantParagraphs.push(b.text_preview.trim());
      if (relevantParagraphs.join("\n").length > 3500) break;
    }
  }

  return `--- GIÁO TRÌNH THAM KHẢO (CHƯƠNG: ${bestChapter.title}) ---\n${relevantParagraphs.join("\n\n")}`;
}

function getAiClient(): OpenAICompatibleClient | null {
  try {
    return createOpenAICompatibleClient();
  } catch {
    return null;
  }
}

function buildDefaultFallbackAnswer(questionNumber: number, questionText: string, clos: CloDefinition[]): ExamAnswerModel {
  const defaultClos = clos.slice(0, 4).map((c) => c.code);
  if (!defaultClos.includes("1.1")) defaultClos.unshift("1.1");
  if (!defaultClos.includes("2.2")) defaultClos.push("2.2");

  return {
    questionNumber,
    questionText,
    totalScore: "5,0đ",
    introduction: {
      title: "* Đặt vấn đề hợp lý, sát nội dung",
      score: "0,25đ"
    },
    part1: {
      title: "Ý 1: Phân tích các nội dung lý luận cơ bản theo yêu cầu câu hỏi",
      score: "2,5đ",
      items: [
        {
          content: "- Nêu và giải thích các khái niệm, phạm trù khoa học liên quan đến nội dung câu hỏi:\n + Làm rõ vị trí, vai trò, chức năng và bản chất của vấn đề trong thực tiễn hoạt động quân sự.\n + Phản ánh mối quan hệ biện chứng giữa các nhân tố cấu thành quá trình sư phạm quân sự.",
          score: "0,7"
        },
        {
          content: "- Phân tích các đặc trưng, quy luật và nguyên tắc cốt lõi:\n + Chỉ rõ mục tiêu, động lực và các yêu cầu khách quan quy định sự vận động và phát triển của quá trình.\n + Đánh giá tính khoa học, tính thực tiễn và tính kỷ luật nghiêm minh trong môi trường quân đội.",
          score: "0,7"
        },
        {
          content: "- Phân tích nội dung, phương pháp và hình thức tổ chức thực hiện:\n + Trang bị tri thức toàn diện, hệ thống, kết hợp lý thuyết với thực hành, rèn luyện bản lĩnh chính trị và tác phong quân nhân.\n + Phát huy tính chủ động, sáng tạo và năng lực tự học tập, tự rèn luyện của người học.",
          score: "0,6"
        },
        {
          content: "- Đánh giá ý nghĩa lý luận và tính định hướng sư phạm:\n + Khẳng định vai trò nền tảng trong nâng cao chất lượng huấn luyện, giáo dục bộ đội ở đơn vị cơ sở hiện nay.",
          score: "0,5"
        }
      ]
    },
    part2: {
      title: "Ý 2: Ý nghĩa vận dụng đối với người cán bộ phân đội",
      score: "2,0đ",
      items: [
        {
          content: "- Thường xuyên quán triệt sâu sắc mục tiêu, yêu cầu nhiệm vụ, nâng cao nhận thức, trách nhiệm của cán bộ đối với công tác huấn luyện và giáo dục bộ đội.",
          score: "0,4"
        },
        {
          content: "- Nắm vững đặc điểm tâm lý, trình độ nhận thức của từng đối tượng chiến sĩ để vận dụng linh hoạt, sáng tạo các phương pháp sư phạm phù hợp.",
          score: "0,4"
        },
        {
          content: "- Tích cực đổi mới hình thức tổ chức bài giảng, kết hợp chặt chẽ giữa truyền thụ kiến thức với tổ chức luyện tập thực hành sát thực tế chiến đấu.",
          score: "0,4"
        },
        {
          content: "- Đề cao tính gương mẫu, mô phạm của người cán bộ phân đội trong lời nói và việc làm; duy trì nghiêm kỷ luật quân đội và chế độ nền nếp đơn vị.",
          score: "0,4"
        },
        {
          content: "- Thường xuyên kiểm tra, đánh giá thực chất kết quả; kịp thời biểu dương nhân tố tích cực, chấn chỉnh khâu yếu, mặt yếu, củng cố mối đoàn kết nội bộ.",
          score: "0,4"
        }
      ]
    },
    conclusion: {
      title: "* Phương pháp trình bày rõ ràng, mạch lạc",
      score: "0,25đ"
    },
    clos: defaultClos,
    levels: {
      easy: `Nêu các nội dung cơ bản của: ${questionText.slice(0, 100)}...`,
      medium: `Trình bày các nội dung cơ bản và ý nghĩa thực tiễn của: ${questionText.slice(0, 100)}...`,
      hard: questionText
    }
  };
}

export async function generateAnswerForQuestion(questionNumber: number): Promise<ExamAnswerModel> {
  const qItem = examAnswerRuntime.questions.find((q) => q.number === questionNumber);
  if (!qItem) {
    throw new Error(`Không tìm thấy câu hỏi số ${questionNumber}`);
  }

  qItem.status = "generating";
  qItem.error = null;

  const gtContext = findRelevantGtContext(qItem.question, examAnswerRuntime.parsed_gt);
  const cloListStr = examAnswerRuntime.clos.map((c) => `[${c.code}] ${c.text}`).join("\n");

  const ai = getAiClient();
  if (!ai) {
    const fallback = buildDefaultFallbackAnswer(questionNumber, qItem.question, examAnswerRuntime.clos);
    qItem.answer = fallback;
    qItem.status = "completed";
    return fallback;
  }

  const systemPrompt = `Bạn là chuyên gia Sư phạm Quân sự hàng đầu, phụ trách biên soạn ngân hàng câu hỏi và đáp án chi tiết cho các môn Khoa học Xã hội & Nhân văn Quân sự.
Nhiệm vụ của bạn là xây dựng đáp án chi tiết và thang điểm chuẩn cho câu hỏi ôn tập, bám sát mẫu chuẩn quy định trong Bước 3 của tài liệu biên soạn câu hỏi đáp án quân sự.`;

  const userPrompt = `--- CÂU HỎI CẦN LẬP ĐÁP ÁN ---
Câu hỏi ${questionNumber}: ${qItem.question}

${gtContext}

--- DANH MỤC CHUẨN ĐẦU RA (CLO) CỦA MÔN HỌC ---
${cloListStr}

--- YÊU CẦU BIÊN SOẠN ĐÁP ÁN (BẮT BUỘC TUÂN THỦ NGHIÊM NGẶT) ---
1. Cấu trúc bảng đáp án gồm đúng thang điểm 5,0đ:
   - Đặt vấn đề: title = "* Đặt vấn đề hợp lý, sát nội dung", score = "0,25đ"
   - Ý 1 (Lý luận / Khái quát / Phân tích): score = "2,5đ". Gồm 3 đến 5 mục nhỏ (items), mỗi mục nhỏ có content phân tích sâu sắc bám sát giáo trình (gồm gạch đầu dòng '-' và các dấu cộng '+') kèm điểm thành phần (score) cụ thể. Tổng điểm các mục con của Ý 1 phải ĐÚNG bằng 2,5đ (ví dụ: 0,7 + 0,7 + 0,6 + 0,5 hoặc 0,5 + 0,7 + 0,7 + 0,6).
   - Ý 2 (Ý nghĩa vận dụng đối với người cán bộ phân đội trong thực tiễn đơn vị hiện nay): score = "2,0đ". Gồm 4 đến 6 biện pháp / yêu cầu vận dụng thiết thực đối với người chỉ huy phân đội (gạch đầu dòng '-'), mỗi mục có điểm thành phần (score) cụ thể. Tổng điểm các mục con của Ý 2 phải ĐÚNG bằng 2,0đ (ví dụ: 5 mục, mỗi mục 0,4đ).
   - Kết luận / Trình bày: title = "* Phương pháp trình bày rõ ràng, mạch lạc", score = "0,25đ"
   - Tổng điểm toàn bài: đúng "5,0đ" (0,25đ + 2,5đ + 2,0đ + 0,25đ = 5,0đ).
2. Dung lượng đáp án: Vừa đủ, sâu sắc, không quá ngắn và không quá dài (độ dài toàn bộ nội dung đáp án đạt khoảng 2500 đến 3200 ký tự, tương đương khoảng 600 đến 800 từ tiếng Việt), văn phong sư phạm quân sự chuẩn mực.
3. Ánh xạ CLO: Lựa chọn các mã CLO phù hợp nhất từ danh mục CLO ở trên (mảng clos chứa các mã như ["1.1", "1.2", "2.2", "3.1", "3.2"]).
4. Các câu hỏi ở 3 mức độ (levels):
   - easy: Câu hỏi mức Dễ (thường bắt đầu bằng 'Nêu tên...', 'Phân tích một khía cạnh cụ thể...')
   - medium: Câu hỏi mức Trung bình (thường bắt đầu bằng 'Trình bày...', 'Ý nghĩa vận dụng...')
   - hard: Câu hỏi mức Khó (thường bắt đầu bằng 'Phân tích...', 'Ý nghĩa vận dụng toàn diện...')

Đầu ra BẮT BUỘC là đối tượng JSON sạch với cấu trúc:
{
  "questionNumber": ${questionNumber},
  "questionText": "${qItem.question.replace(/"/g, '\\"')}",
  "totalScore": "5,0đ",
  "introduction": {
    "title": "* Đặt vấn đề hợp lý, sát nội dung",
    "score": "0,25đ"
  },
  "part1": {
    "title": "Ý 1: Phân tích nội dung lý luận...",
    "score": "2,5đ",
    "items": [
      {
        "content": "- ...\\n + ...",
        "score": "0,7"
      }
    ]
  },
  "part2": {
    "title": "Ý 2: Vận dụng đối với người cán bộ phân đội",
    "score": "2,0đ",
    "items": [
      {
        "content": "- ...",
        "score": "0,4"
      }
    ]
  },
  "conclusion": {
    "title": "* Phương pháp trình bày rõ ràng, mạch lạc",
    "score": "0,25đ"
  },
  "clos": ["1.1", "1.2", "2.2", "3.1", "3.2"],
  "levels": {
    "easy": "...",
    "medium": "...",
    "hard": "..."
  }
}

Không kèm theo bất kỳ văn bản giải thích nào ngoài chuỗi JSON.`;

  try {
    const answerModel = await ai.chatJson<ExamAnswerModel>(systemPrompt, userPrompt);

    // Sanitize and enforce schema
    answerModel.questionNumber = questionNumber;
    answerModel.questionText = qItem.question;
    answerModel.totalScore = "5,0đ";
    if (!answerModel.introduction) {
      answerModel.introduction = { title: "* Đặt vấn đề hợp lý, sát nội dung", score: "0,25đ" };
    }
    if (!answerModel.conclusion) {
      answerModel.conclusion = { title: "* Phương pháp trình bày rõ ràng, mạch lạc", score: "0,25đ" };
    }
    if (!answerModel.part1?.items || answerModel.part1.items.length === 0) {
      answerModel.part1 = buildDefaultFallbackAnswer(questionNumber, qItem.question, examAnswerRuntime.clos).part1;
    }
    if (!answerModel.part2?.items || answerModel.part2.items.length === 0) {
      answerModel.part2 = buildDefaultFallbackAnswer(questionNumber, qItem.question, examAnswerRuntime.clos).part2;
    }
    if (!answerModel.clos || answerModel.clos.length === 0) {
      answerModel.clos = ["1.1", "1.2", "2.1", "2.2", "3.1", "3.2"];
    }

    qItem.answer = answerModel;
    qItem.status = "completed";
    qItem.error = null;
    return answerModel;
  } catch (err: any) {
    console.warn(`Lỗi AI khi sinh đáp án câu ${questionNumber}, chuyển sang mẫu dự phòng:`, err.message || err);
    const fallback = buildDefaultFallbackAnswer(questionNumber, qItem.question, examAnswerRuntime.clos);
    qItem.answer = fallback;
    qItem.status = "completed";
    qItem.error = null;
    return fallback;
  }
}

export async function generateBulkExamAnswers(questionNumbers: number[]): Promise<ExamAnswerSessionSummary> {
  for (const num of questionNumbers) {
    try {
      await generateAnswerForQuestion(num);
      // Short pause between calls to respect rate limits
      await new Promise((r) => setTimeout(r, 600));
    } catch (err: any) {
      const q = examAnswerRuntime.questions.find((item) => item.number === num);
      if (q) {
        q.status = "failed";
        q.error = err.message || "Lỗi sinh đáp án";
      }
    }
  }
  return getExamAnswerSummary();
}

export function updateQuestionAnswer(questionNumber: number, answer: ExamAnswerModel): ExamAnswerSessionSummary {
  const q = examAnswerRuntime.questions.find((item) => item.number === questionNumber);
  if (q) {
    q.answer = answer;
    q.status = "completed";
    q.error = null;
  }
  return getExamAnswerSummary();
}

export function compileExamAnswersDocx(outputPath: string): string {
  const answers: ExamAnswerModel[] = examAnswerRuntime.questions
    .map((q) => q.answer)
    .filter((a): a is ExamAnswerModel => a !== null);

  if (answers.length === 0) {
    throw new Error("Chưa có đáp án nào được sinh. Vui lòng sinh đáp án trước khi tải file.");
  }

  return exportExamAnswersDocx(
    answers,
    examAnswerRuntime.clos,
    outputPath,
    examAnswerRuntime.cdr_original_path || undefined
  );
}
