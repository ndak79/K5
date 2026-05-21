import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import AdmZip from "adm-zip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { GoogleGenAI, Type } from "@google/genai";
import { SessionRuntime } from "./upload_session_service";
import { normalizeInputDocument } from "../document_pipeline/convert";
import { parseCdrDocument } from "../document_pipeline/parse_cdr";
import { parseGtDocument, BlockNode } from "../document_pipeline/parse_gt";
import { mapLessonsToChapters } from "./lesson_mapper";

export const bloomRuntime = new SessionRuntime();

export function getBloomRuntimeSummary(): any {
  const lessonsList = Object.values(bloomRuntime.lessons).sort((a, b) => a.lesson_number - b.lesson_number);
  return {
    session_id: bloomRuntime.session_id,
    cdr_file_name: bloomRuntime.cdr_file_name,
    gt_file_name: bloomRuntime.gt_file_name,
    cdr_status: bloomRuntime.cdr_status,
    gt_status: bloomRuntime.gt_status,
    cdr_error: bloomRuntime.cdr_error,
    gt_error: bloomRuntime.gt_error,
    processing: bloomRuntime.processing,
    can_extract: !!(bloomRuntime.parsed_cdr && bloomRuntime.parsed_gt && !bloomRuntime.processing),
    lessons: lessonsList
  };
}

function getNextBatchDir(): string {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, "").substring(0, 14);
  const dir = path.join(os.tmpdir(), "bloom_builder", timestamp);
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

function cleanupRuntimeFiles(): void {
  for (const batchDir of bloomRuntime.batch_dirs) {
    try {
      if (fs.existsSync(batchDir)) {
        fs.rmSync(batchDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.warn("Failed to clean up bloom batch dir", batchDir, err);
    }
  }
  bloomRuntime.batch_dirs.clear();
}

export function resetBloomRuntime(): void {
  cleanupRuntimeFiles();
  bloomRuntime.session_id = Math.random().toString(36).substring(2, 15);
  bloomRuntime.version += 1;
  bloomRuntime.gt_version += 1;
  bloomRuntime.cdr_file_name = null;
  bloomRuntime.gt_file_name = null;
  bloomRuntime.cdr_original_path = null;
  bloomRuntime.cdr_normalized_path = null;
  bloomRuntime.gt_original_path = null;
  bloomRuntime.gt_normalized_path = null;
  bloomRuntime.parsed_cdr = null;
  bloomRuntime.parsed_gt = null;
  bloomRuntime.cdr_status = "missing";
  bloomRuntime.gt_status = "missing";
  bloomRuntime.cdr_error = null;
  bloomRuntime.gt_error = null;
  bloomRuntime.processing = false;
  bloomRuntime.cancelled = false;
  bloomRuntime.lessons = {};
  bloomRuntime.lesson_documents = {};
  bloomRuntime.insertions = {};
  bloomRuntime.lesson_to_chapter = {};
}

function resetGtRelatedState(): void {
  if (bloomRuntime.gt_original_path) {
    const parentDir = path.dirname(bloomRuntime.gt_original_path);
    if (bloomRuntime.batch_dirs.has(parentDir)) {
      try {
        if (fs.existsSync(parentDir)) {
          fs.rmSync(parentDir, { recursive: true, force: true });
        }
      } catch (err) {
        console.warn("Failed reset-gt clean for bloom", parentDir, err);
      }
      bloomRuntime.batch_dirs.delete(parentDir);
    }
  }

  bloomRuntime.gt_version += 1;
  bloomRuntime.gt_file_name = null;
  bloomRuntime.gt_original_path = null;
  bloomRuntime.gt_normalized_path = null;
  bloomRuntime.parsed_gt = null;
  bloomRuntime.gt_status = "missing";
  bloomRuntime.gt_error = null;
  bloomRuntime.processing = false;
  bloomRuntime.cancelled = false;
  bloomRuntime.lesson_documents = {};
  bloomRuntime.insertions = {};
  bloomRuntime.lesson_to_chapter = {};

  for (const lesson of Object.values(bloomRuntime.lessons)) {
    lesson.chapter_number = null;
    lesson.chapter_title = null;
    lesson.preview_ready = false;
    lesson.error = null;
    lesson.status = "uploaded";
  }
}

export async function uploadBloomCdrDocument(filename: string, fileBuffer: Buffer): Promise<any> {
  resetBloomRuntime();
  const version = bloomRuntime.version;
  const batchDir = getNextBatchDir();
  const cdrOriginalPath = storeUpload(filename, fileBuffer, batchDir);
  bloomRuntime.batch_dirs.add(batchDir);

  bloomRuntime.cdr_file_name = filename;
  bloomRuntime.cdr_original_path = cdrOriginalPath;
  bloomRuntime.cdr_status = "preparing";

  try {
    const cdrNormalizedPath = normalizeInputDocument(cdrOriginalPath, batchDir);
    const parsedCdr = parseCdrDocument(cdrNormalizedPath);

    bloomRuntime.cdr_normalized_path = cdrNormalizedPath;
    bloomRuntime.parsed_cdr = parsedCdr;
    bloomRuntime.cdr_status = "ready";
    bloomRuntime.cdr_error = null;

    bloomRuntime.lessons = {};
    for (const lesson of parsedCdr.lessons) {
      const id = `lesson-${lesson.lesson_number}`;
      bloomRuntime.lessons[id] = {
        id,
        lesson_number: lesson.lesson_number,
        title: lesson.title,
        status: "uploaded",
        preview_ready: false
      };
    }
  } catch (err: any) {
    bloomRuntime.cdr_status = "failed";
    bloomRuntime.cdr_error = err.message || "Xử lý file CDR thất bại.";
    bloomRuntime.lessons = {};
  }

  return getBloomRuntimeSummary();
}

export async function uploadBloomGtDocument(filename: string, fileBuffer: Buffer): Promise<any> {
  if (bloomRuntime.cdr_status === "missing") {
    throw new Error("Cần upload file CDR trước khi upload giáo trình.");
  }
  if (bloomRuntime.cdr_status === "failed") {
    throw new Error("File CDR xử lý thất bại. Cần upload lại CDR trước khi upload giáo trình.");
  }

  resetGtRelatedState();
  const gtVersion = bloomRuntime.gt_version;
  const batchDir = getNextBatchDir();
  const gtOriginalPath = storeUpload(filename, fileBuffer, batchDir);
  bloomRuntime.batch_dirs.add(batchDir);

  bloomRuntime.gt_file_name = filename;
  bloomRuntime.gt_original_path = gtOriginalPath;
  bloomRuntime.gt_status = "preparing";

  for (const lesson of Object.values(bloomRuntime.lessons)) {
    lesson.status = "preparing_gt";
  }

  try {
    const gtNormalizedPath = normalizeInputDocument(gtOriginalPath, batchDir);
    const parsedGt = parseGtDocument(gtNormalizedPath);

    let parsedCdr = bloomRuntime.parsed_cdr;
    if (!parsedCdr) {
      throw new Error("File CDR chưa sẵn sàng.");
    }

    const mapping = mapLessonsToChapters(parsedCdr, parsedGt);

    bloomRuntime.gt_normalized_path = gtNormalizedPath;
    bloomRuntime.parsed_gt = parsedGt;
    bloomRuntime.gt_status = "ready";
    bloomRuntime.gt_error = null;

    for (const [id, lesson] of Object.entries(bloomRuntime.lessons)) {
      const chapterNumber = mapping[lesson.lesson_number];
      if (chapterNumber === undefined) {
        lesson.status = "failed";
        lesson.error = "Không map được chương tương ứng";
        continue;
      }

      const chapter = parsedGt.chapters.find((c) => c.chapter_number === chapterNumber);
      if (!chapter) {
        lesson.status = "failed";
        lesson.error = `Không tìm thấy chương ${chapterNumber}`;
        continue;
      }

      bloomRuntime.lesson_to_chapter[id] = chapterNumber;
      lesson.chapter_number = chapter.chapter_number;
      lesson.chapter_title = chapter.title;
      lesson.status = "ready";
      lesson.error = null;
    }
  } catch (err: any) {
    bloomRuntime.gt_status = "failed";
    bloomRuntime.gt_error = err.message || "Xử lý file giáo trình thất bại.";
    for (const lesson of Object.values(bloomRuntime.lessons)) {
      lesson.status = "failed";
      lesson.error = err.message || "Xử lý file giáo trình thất bại.";
    }
  }

  return getBloomRuntimeSummary();
}

function getAllowedVerbsForKey(key: string): string[] {
  const match = key.match(/(\d+)\.(\d+)/);
  if (match) {
    const major = parseInt(match[1], 10);
    const minor = parseInt(match[2], 10);
    if (major === 1) {
      return minor % 2 !== 0 
        ? ["Hiểu được", "Trình bày được", "Giải thích được"] 
        : ["Phân tích được"];
    } else if (major === 2) {
      return minor % 2 !== 0 
        ? ["Thực hiện được", "Hình thành được"] 
        : ["Vận dụng được"];
    } else if (major === 3) {
      return minor % 2 !== 0 
        ? ["Tuân thủ", "Chủ động", "Tích cực"] 
        : ["Đấu tranh", "Thực hiện"];
    }
  }
  
  if (key.startsWith("1")) {
    return ["Hiểu được", "Trình bày được", "Giải thích được"];
  } else if (key.startsWith("2")) {
    return ["Thực hiện được", "Hình thành được", "Vận dụng được"];
  } else if (key.startsWith("3")) {
    return ["Tuân thủ", "Chủ động", "Tích cực", "Đấu tranh", "Thực hiện"];
  }
  return ["Hiểu được", "Trình bày được", "Giải thích được", "Phân tích được"];
}

export function enforceVerbStructure(key: string, text: string): string {
  const allowed = getAllowedVerbsForKey(key);
  const cleanText = text.trim().replace(/^[-+•*]\s*/, "").trim();
  
  for (const verb of allowed) {
    const regex = new RegExp(`^\\s*${verb}\\s*`, "i");
    if (regex.test(cleanText)) {
      return cleanText.replace(regex, verb + " ");
    }
  }
  
  const commonVerbsRegex = /^(biết được|hiểu rõ|hiểu được|trình bày được|giải thích được|phân tích được|thực hiện được|hình thành được|vận dụng được|tuân thủ|chủ động|tích cực|đấu tranh|thực hiện|nắm vững|áp dụng|so sánh|đánh giá|thiết kế|xây dựng)\s+/i;
  const remains = cleanText.replace(commonVerbsRegex, "").trim();
  
  const defaultVerb = allowed[0];
  const lowerRemains = remains.charAt(0).toLowerCase() + remains.slice(1);
  return `${defaultVerb} ${lowerRemains}`;
}

export interface BloomSuggestionItem {
  subitemKey: string;     // e.g. "1.1"
  originalText: string;
  category: "knowledge" | "skills" | "autonomy";
  blockId: string;
  suggestions: string[];  // exactly 3 suggestions
  selectedSuggestion: string | null;
}

export interface BloomState {
  verbs: string[];
  lesson_suggestions: Record<string, BloomSuggestionItem[]>; // lessonId -> list of subitem suggestions
  selected_outcomes: Record<string, string[]>; // lessonId -> selected list of full outcomes
  course_suggestions: BloomSuggestionItem[];
  selected_course_outcomes: string[];
  status: "idle" | "generating" | "synthesizing" | "ready" | "failed";
  error: string | null;
}

// In-memory persistent state for Bloom Optimization
const bloomState: BloomState = {
  verbs: ["phân tích", "áp dụng", "đánh giá", "thiết kế", "giải thích", "so sánh", "lập kế hoạch", "đề xuất"],
  lesson_suggestions: {},
  selected_outcomes: {},
  course_suggestions: [],
  selected_course_outcomes: [],
  status: "idle",
  error: null
};

function getAi(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}

export function getBloomState(): BloomState {
  return bloomState;
}

export function updateBloomVerbs(verbs: string[]): BloomState {
  bloomState.verbs = verbs.map(v => v.trim()).filter(Boolean);
  return bloomState;
}

export interface CdrSubitem {
  key: string;       // e.g. "1.1", "1.2"
  label: string;     // e.g. "1.1."
  originalText: string;
  category: "knowledge" | "skills" | "autonomy";
  blockId: string;
}

/**
 * Extracts structured Cdr items from cdrLesson blocks
 */
export function extractStructuredCdr(blocks: BlockNode[]): CdrSubitem[] {
  const items: CdrSubitem[] = [];
  let activeCategory: "knowledge" | "skills" | "autonomy" | null = null;
  let counter = 1;

  for (const block of blocks) {
    if (block.kind !== "paragraph") continue;
    const text = block.text_preview.trim();
    if (!text) continue;

    // Detect category header
    if (/ki\u1ebfn\s*th\u1ee9c|kien\s*thuc/i.test(text)) {
      activeCategory = "knowledge";
      counter = 1;
      continue;
    } else if (/k\u1ef9\s*n\u0103ng|ky\s*nang|k\u0129\s*n\u0103ng/i.test(text)) {
      activeCategory = "skills";
      counter = 1;
      continue;
    } else if (/t\u1ef1\s*ch\u1ee7|tu\s*chu|tr\u00e1ch\s*nhi\u1ec7m|trach\s*nhiem/i.test(text)) {
      activeCategory = "autonomy";
      counter = 1;
      continue;
    }

    if (activeCategory) {
      // Regexp for matching sub-items like 1.1., 2.1., etc.
      const match = text.match(/^\s*((\d+(?:\.\d+)+)\s*[.\-]?\s*)(.+)$/);
      if (match) {
        items.push({
          key: match[2],
          label: match[1],
          originalText: match[3],
          category: activeCategory,
          blockId: block.id
        });
      } else {
        // Fallback: if it's text under an active category and doesn't look like another major heading
        const isHeader = text.toLowerCase().includes("chuẩn đầu ra") || 
                         text.toLowerCase().includes("mục tiêu") || 
                         /^[I|V|X]+\./.test(text) || 
                         text.length < 5;
        if (!isHeader && text.length > 5) {
          const listMatch = text.match(/^\s*([+\-*•]\s*)(.+)$/);
          const cleanText = listMatch ? listMatch[2] : text;
          const prefixIndex = activeCategory === "knowledge" ? 1 : activeCategory === "skills" ? 2 : 3;
          const keySymbol = `${prefixIndex}.${counter}`;
          items.push({
            key: keySymbol,
            label: listMatch ? listMatch[1] : `${keySymbol}. `,
            originalText: cleanText,
            category: activeCategory,
            blockId: block.id
          });
          counter++;
        }
      }
    }
  }
  return items;
}

export function rebuildSelectedOutcomes(lessonId: string): void {
  const items = bloomState.lesson_suggestions[lessonId] || [];
  bloomState.selected_outcomes[lessonId] = items
    .map(it => {
      if (!it.selectedSuggestion) return "";
      return `${it.subitemKey}. ${it.selectedSuggestion}`;
    })
    .filter(Boolean);
}

export function rebuildSelectedCourseOutcomes(): void {
  const items = bloomState.course_suggestions || [];
  bloomState.selected_course_outcomes = items
    .map(it => {
      if (!it.selectedSuggestion) return "";
      return `${it.subitemKey}. ${it.selectedSuggestion}`;
    })
    .filter(Boolean);
}

export function updateSelectedOutcomes(lessonId: string, outcomes: string[]): BloomState {
  bloomState.selected_outcomes[lessonId] = outcomes;
  return bloomState;
}

export function updateSelectedCourseOutcomes(outcomes: string[]): BloomState {
  bloomState.selected_course_outcomes = outcomes;
  return bloomState;
}

// Clear all optimized predictions
export function resetBloomState(): BloomState {
  bloomState.lesson_suggestions = {};
  bloomState.selected_outcomes = {};
  bloomState.course_suggestions = [];
  bloomState.selected_course_outcomes = [];
  bloomState.status = "idle";
  bloomState.error = null;
  return bloomState;
}

// Suggest Outcomes for a lesson using Textbook (Giáo trình) content
export async function suggestLessonOutcomes(lessonId: string, runtime: any): Promise<BloomSuggestionItem[]> {
  const ai = getAi();
  if (!ai) {
    throw new Error("Không tìm thấy GEMINI_API_KEY trong cấu hình hệ thống.");
  }

  const lessonsMap = runtime.lessons || {};
  const lessonSummary = lessonsMap[lessonId];
  if (!lessonSummary) {
    throw new Error(`Không tìm thấy thông tin bài học ${lessonId} trong phiên làm việc.`);
  }

  const lessonNumber = lessonSummary.lesson_number;
  const chapterNumber = runtime.lesson_to_chapter?.[lessonId];
  if (chapterNumber === undefined) {
    throw new Error(`Bài học ${lessonSummary.title} chưa được map với chương nào trong giáo trình.`);
  }

  const parsedGt = runtime.parsed_gt;
  const parsedCdr = runtime.parsed_cdr;
  if (!parsedGt || !parsedCdr) {
    throw new Error("Vui lòng tải lên cả file CDR tài liệu gốc và file Giáo trình.");
  }

  const gtChapter = parsedGt.chapters.find((c: any) => c.chapter_number === chapterNumber);
  const cdrLesson = parsedCdr.lessons.find((l: any) => l.lesson_number === lessonNumber);
  if (!gtChapter) {
    throw new Error(`Không tìm thấy chương ${chapterNumber} tương ứng trong Giáo trình.`);
  }

  // Retrieve Textbook chapter content for context
  const fullTextContent = gtChapter.blocks
    .map((b: any) => b.text_preview)
    .filter(Boolean)
    .join("\n")
    .substring(0, 7500); // safety limit

  // Extract structured subitems from the lesson range in the docx of CDR
  const subitems = extractStructuredCdr(cdrLesson ? cdrLesson.blocks : []);
  if (subitems.length === 0) {
    throw new Error("Không thể trích xuất được chuẩn đầu ra nào từ bài học này. Hãy kiểm tra định dạng file CDR.");
  }

  const prompt = `--- BÀI HỌC ---
Tiêu đề: ${lessonSummary.title}
Nội dung chương giáo trình gốc:
${fullTextContent}

--- CHUẨN ĐẦU RA GỐC CẦN TỐI ƯU HÓA ---
${subitems.map(item => `[${item.category.toUpperCase()}] ${item.key}. ${item.originalText}`).join("\n")}

--- ĐỘNG TỪ CHUẨN BLOOM CHO PHÉP CHO TỪNG NHÓM ---
1. Nhóm Kiến thức (knowledge): "Hiểu được", "trình bày được", "giải thích được", "phân tích được"
2. Nhóm Kỹ năng (skills): "Thực hiện được", "hình thành được", "vận dụng được"
3. Nhóm Mức tự chủ và trách nhiệm (autonomy): "Tuân thủ", "chủ động", "đấu tranh", "tích cực", "thực hiện"

Nhiệm vụ:
Với MỖI chuẩn đầu ra gốc ở trên, hãy đề xuất đúng CHÍNH XÁC 3 phương án gợi ý chuẩn đầu ra thay thế viết lại theo phân loại nhóm, đáp ứng yêu cầu:
1. Bắt đầu bằng một trong các động từ chuẩn Bloom được cho trong nhóm tương ứng ở trên. Không sử dụng động từ khác ngoài nhóm quy định cho nhóm đó.
2. Được viết lại sâu sắc hơn bám sát nội dung, kiến thức học tập cụ thể trong chương giáo trình được cung cấp.
3. Độ dài vừa phải, văn phong khoa học quân sự chuyên nghiệp, chuẩn xác.

Hãy trả về kết quả dưới dạng mảng JSON các đối tượng. Mỗi đối tượng có cấu trúc:
{
  "subitemKey": "Ký tự key gốc ví dụ 1.1",
  "suggestions": [
    "Phương án 1 bắt đầu bằng động từ chuẩn nhóm",
    "Phương án 2 bắt đầu bằng động từ chuẩn nhóm",
    "Phương án 3 bắt đầu bằng động từ chuẩn nhóm"
  ]
}

Không viết bất kỳ lời giải thích nào ngoài chuỗi JSON sạch.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              subitemKey: { type: Type.STRING },
              suggestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Danh sách 3 đề xuất chuẩn đầu ra viết lại bằng động từ thuộc phân nhóm"
              }
            },
            required: ["subitemKey", "suggestions"]
          },
          description: "Mảng lưu các đề xuất viết lại CDR theo Bloom cho từng mục"
        }
      }
    });

    const text = response.text || "[]";
    const parsedPayload: any[] = JSON.parse(text);

    const suggestionsMap = new Map<string, string[]>();
    parsedPayload.forEach((s: any) => {
      suggestionsMap.set(s.subitemKey, s.suggestions);
    });

    const lessonItems: BloomSuggestionItem[] = subitems.map((sub) => {
      let sugs = suggestionsMap.get(sub.key);
      if (!sugs || sugs.length < 3) {
        // Fallback verbs prefix in case model failed
        const prefixes = getAllowedVerbsForKey(sub.key);
        sugs = prefixes.map(p => `${p} ${sub.originalText.replace(/^(biết được|hiểu được|thực hiện được|hình thành được|tuân thủ|chủ động|đấu tranh|tích cực|thực hiện)\s+/i, "")}`);
      }
      const processedSugs = sugs.slice(0, 3).map(s => enforceVerbStructure(sub.key, s));
      return {
        subitemKey: sub.key,
        originalText: sub.originalText,
        category: sub.category,
        blockId: sub.blockId,
        suggestions: processedSugs,
        selectedSuggestion: processedSugs[0] || sub.originalText
      };
    });

    bloomState.lesson_suggestions[lessonId] = lessonItems;
    rebuildSelectedOutcomes(lessonId);

    return lessonItems;
  } catch (err: any) {
    console.error("Error generating lesson suggestions", err);
    throw new Error(`Lỗi sinh gợi ý thông minh từ Gemini: ${err.message || err}`);
  }
}

// Synthesize Course Outcomes
export async function suggestCourseOutcomes(runtime: any): Promise<BloomSuggestionItem[]> {
  const ai = getAi();
  if (!ai) {
    throw new Error("Không tìm thấy GEMINI_API_KEY trong cấu hình hệ thống.");
  }

  const parsedCdr = runtime.parsed_cdr;
  if (!parsedCdr) {
    throw new Error("Không có file CDR gốc để phân tích học hỏi cấu trúc mẫu.");
  }

  // Build the list of selected lesson outcomes to synthesize from
  const lines: string[] = [];
  Object.keys(bloomState.selected_outcomes).forEach((lessonId) => {
    const title = runtime.lessons?.[lessonId]?.title || lessonId;
    const outcomes = bloomState.selected_outcomes[lessonId] || [];
    if (outcomes.length > 0) {
      lines.push(`- ${title}:`);
      outcomes.forEach((o) => lines.push(`  + ${o}`));
    }
  });

  if (lines.length === 0) {
    throw new Error("Chưa có chuẩn đầu ra bài học nào được lựa chọn. Vui lòng chọn chuẩn đầu ra các bài học trước.");
  }

  const prompt = `--- DANH SÁCH CHUẨN ĐẦU RA CÁC BÀI HỌC (ĐÃ TỐI ƯU HÓA BLOOM) ---
${lines.join("\n")}

Biết rằng đây là tập hợp chuẩn đầu ra đã tối ưu hóa của tất cả các bài học trong học phần môn học này.
Nhiệm vụ: Hãy tổng hợp và nâng tầm nâng cao khái quát các chuẩn đầu ra bài giảng trên thành một bộ khung Chuẩn đầu ra môn học của toàn học phần (Course Learning Outcomes).
Yêu cầu cấu trúc xuất ra cực kỳ nghiêm ngặt:
1. Phân bổ thành đúng 3 nhóm lớn: Kiến thức (category = "knowledge"), Kỹ năng (category = "skills"), Mức tự chủ và trách nhiệm (category = "autonomy").
2. Mỗi nhóm phải có đúng KHÁC NHAU 2 tiểu mục mã số (Ví dụ: nhóm kiến thức có key 1.1 và 1.2, nhóm kỹ năng có key 2.1 và 2.2, nhóm tự chủ có key 3.1 và 3.2). Tổng cộng là 6 tiểu mục.
3. Với MỖI tiểu mục, hãy đề xuất đúng CHÍNH XÁC 3 phương án gợi ý viết lại bám sát mức độ Bloom tương ứng và nội dung giảng dạy của học phần:
   - Tiểu mục 1.1 (Kiến thức): Gợi ý bắt đầu bằng một trong các động từ: "Hiểu được", "trình bày được", "giải thích được"
   - Tiểu mục 1.2 (Kiến thức): Gợi ý bắt đầu bằng: "Phân tích được"
   - Tiểu mục 2.1 (Kỹ năng): Gợi ý bắt đầu bằng một trong các động từ: "Thực hiện được", "hình thành được"
   - Tiểu mục 2.2 (Kỹ năng): Gợi ý bắt đầu bằng: "Vận dụng được"
   - Tiểu mục 3.1 (Mức tự chủ, trách nhiệm): Gợi ý bắt đầu bằng: "Tuân thủ", "chủ động", "tích cực"
   - Tiểu mục 3.2 (Mức tự chủ, trách nhiệm): Gợi ý bắt đầu bằng: "Đấu tranh", "thực hiện"

Đầu ra của bạn phải là một mảng gồm đúng 6 đối tượng JSON với cấu trúc:
[
  {
    "subitemKey": "Mã số ví dụ 1.1",
    "category": "knowledge | skills | autonomy",
    "suggestions": [
      "Phương án 1 bắt đầu bằng động từ chuẩn",
      "Phương án 2 bắt đầu bằng động từ chuẩn",
      "Phương án 3 bắt đầu bằng động từ chuẩn"
    ]
  }
]

Không viết bất kỳ lời giải thích nào khác ngoài chuỗi JSON sạch.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              subitemKey: { type: Type.STRING },
              category: { type: Type.STRING },
              suggestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Danh sách 3 đề xuất chuẩn đầu ra của môn học viết lại bằng động từ thuộc phân nhóm quy định"
              }
            },
            required: ["subitemKey", "category", "suggestions"]
          },
          description: "Mảng lưu các đề xuất viết lại CDR môn học tổng hợp"
        }
      }
    });

    const text = response.text || "[]";
    const parsedPayload: any[] = JSON.parse(text);

    // Filter or backfill to ensure exactly 6 items (1.1, 1.2, 2.1, 2.2, 3.1, 3.2)
    const requiredKeys = [
      { key: "1.1", category: "knowledge" as const, name: "Kiến thức lý thuyết và thực tiễn cốt lõi" },
      { key: "1.2", category: "knowledge" as const, name: "Phân tích cơ chế và hệ thống lý luận" },
      { key: "2.1", category: "skills" as const, name: "Kỹ năng thực hành chuyên môn và kỹ thuật" },
      { key: "2.2", category: "skills" as const, name: "Vận dụng tổng hợp vào thực tế chiến đấu công tác" },
      { key: "3.1", category: "autonomy" as const, name: "Thái độ học tập, chủ động chấp hành kỷ luật" },
      { key: "3.2", category: "autonomy" as const, name: "Ý thức đấu tranh và thực hiện nghĩa vụ quân nhân" }
    ];

    const suggestionsMap = new Map<string, string[]>();
    parsedPayload.forEach((s: any) => {
      suggestionsMap.set(s.subitemKey, s.suggestions);
    });

    const courseItems: BloomSuggestionItem[] = requiredKeys.map((item) => {
      let sugs = suggestionsMap.get(item.key);
      if (!sugs || sugs.length < 3) {
        const prefixes = getAllowedVerbsForKey(item.key);
        sugs = prefixes.map(p => `${p} các nội dung của học phần có liên quan đến ${item.name.toLowerCase()}`);
      }
      const processedSugs = sugs.slice(0, 3).map(s => enforceVerbStructure(item.key, s));
      return {
        subitemKey: item.key,
        originalText: item.name,
        category: item.category,
        blockId: "course-summary",
        suggestions: processedSugs,
        selectedSuggestion: processedSugs[0]
      };
    });

    bloomState.course_suggestions = courseItems;
    rebuildSelectedCourseOutcomes();

    return courseItems;
  } catch (err: any) {
    console.error("Error synthesizing course outcomes", err);
    throw new Error(`Lỗi sinh chuẩn đầu ra môn học từ Gemini: ${err.message || err}`);
  }
}

// Re-compile docx using replacement inside the original docx ZIP
export function compileOptimizedDocx(runtime: any, outputPath: string): string {
  if (!runtime.cdr_original_path || !fs.existsSync(runtime.cdr_original_path)) {
    throw new Error("Không tìm thấy đường dẫn file CDR gốc để sao chép.");
  }

  const zip = new AdmZip(runtime.cdr_original_path);
  const documentXmlEntry = zip.getEntry("word/document.xml");
  if (!documentXmlEntry) {
    throw new Error("Cấu trúc file DOCX không hợp lệ: Không tìm thấy word/document.xml.");
  }

  const xmlBytes = zip.readFile(documentXmlEntry);
  if (!xmlBytes) {
    throw new Error("Không thể đọc được nội dung word/document.xml.");
  }

  const xmlStr = xmlBytes.toString("utf-8").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
  const doc = new DOMParser().parseFromString(xmlStr, "text/xml");
  const body = doc.getElementsByTagName("w:body")[0];
  if (!body) {
    throw new Error("Không tìm thấy thẻ w:body trong document.xml.");
  }

  const childNodes = Array.from(body.childNodes);
  const blockNodes: any[] = [];
  
  // Filter for structural blocks (paragraphs w:p and tables w:tbl)
  childNodes.forEach((node: any) => {
    if (node.nodeType === 1 && (node.nodeName === "w:p" || node.nodeName === "w:tbl")) {
      const textNodes = node.getElementsByTagName("w:t");
      const parts: string[] = [];
      for (let i = 0; i < textNodes.length; i++) {
        if (textNodes[i] && textNodes[i].textContent) {
          parts.push(textNodes[i].textContent);
        }
      }
      blockNodes.push({
        node,
        name: node.nodeName,
        text: parts.join(" ").replace(/\s+/g, " ").trim()
      });
    }
  });

  const parsedCdr = runtime.parsed_cdr;
  if (!parsedCdr) {
    throw new Error("Chưa có phiên làm việc với chuẩn đầu ra CDR gốc hợp lệ.");
  }

  // --- REPLACE COURSE-LEVEL LEARNING OUTCOMES ---
  if (bloomState.course_suggestions && bloomState.course_suggestions.length > 0) {
    let firstLessonIdx = blockNodes.length;
    if (parsedCdr.lessons.length > 0) {
      firstLessonIdx = parsedCdr.lessons[0].range.start_block_index;
    }

    // Scan for course-level categories before the first lesson has begun
    let courseKnowledgeIdx = -1;
    let courseSkillsIdx = -1;
    let courseAutonomyIdx = -1;

    for (let i = 0; i < firstLessonIdx; i++) {
      const text = blockNodes[i].text.toLowerCase();
      if (courseKnowledgeIdx === -1 && /ki\u1ebfn\s*th\u1ee9c|kien\s*thuc/i.test(text) && /^(1\b|v\u1ec1 |tr\u00ean |v\u1ec1\s*ki\u1ebfn|ki\u1ebfn\s*th\u1ee9c)/i.test(text.replace(/^[-\s.]+/g, ""))) {
        courseKnowledgeIdx = i;
      } else if (courseSkillsIdx === -1 && /k\u1ef9\s*n\u0103ng|ky\s*nang|k\u0129\s*n\u0103ng/i.test(text) && /^(2\b|v\u1ec1 |v\u1ec1\s*k\u1ef3|v\u1ec1\s*k\u1ef9|k\u1ef9\s*n\u0103ng)/i.test(text.replace(/^[-\s.]+/g, ""))) {
        courseSkillsIdx = i;
      } else if (courseAutonomyIdx === -1 && /(t\u1ef1\s*ch\u1ee7|tu\s*chu|tr\u00e1ch\s*nhi\u1ec7m|trach\s*nhiem)/i.test(text) && /^(3\b|v\u1ec1 |m\u1ee9c |t\u1ef1\s*ch\u1ee7)/i.test(text.replace(/^[-\s.]+/g, ""))) {
        courseAutonomyIdx = i;
      }
    }

    // Fallback: search anywhere before firstLessonIdx if not matching strict prefixes
    for (let i = 0; i < firstLessonIdx; i++) {
      const text = blockNodes[i].text.toLowerCase();
      if (courseKnowledgeIdx === -1 && /ki\u1ebfn\s*th\u1ee9c/i.test(text)) {
        courseKnowledgeIdx = i;
      } else if (courseSkillsIdx === -1 && (/k\u1ef9\s*n\u0103ng/i.test(text) || /k\u0129\s*n\u0103ng/i.test(text))) {
        courseSkillsIdx = i;
      } else if (courseAutonomyIdx === -1 && (/t\u1ef1\s*ch\u1ee7/i.test(text) || /tr\u00e1ch\s*nhi\u1ec7m/i.test(text))) {
        courseAutonomyIdx = i;
      }
    }

    const indices = [courseKnowledgeIdx, courseSkillsIdx, courseAutonomyIdx].filter(x => x !== -1);

    const getCategoryBoundary = (idx: number) => {
      let boundary = firstLessonIdx;
      indices.forEach(otherIdx => {
        if (otherIdx > idx && otherIdx < boundary) {
          boundary = otherIdx;
        }
      });
      for (let i = idx + 1; i < boundary; i++) {
        const text = blockNodes[i].text.trim();
        if (/^[IVXLCDM]+\b/i.test(text) || /^ch\u01b0\u01a1ng\s+\d+/i.test(text.toLowerCase())) {
          boundary = i;
          break;
        }
      }
      return boundary;
    };

    const replaceCategory = (headingIdx: number, categoryKey: "knowledge" | "skills" | "autonomy") => {
      if (headingIdx === -1) return;
      const boundaryIdx = getCategoryBoundary(headingIdx);
      const targetNode = blockNodes[headingIdx].node;
      const docOwner = targetNode.ownerDocument;

      const obsoleteIndices = [];
      for (let i = headingIdx + 1; i < boundaryIdx; i++) {
        const blk = blockNodes[i];
        if (blk.name === "w:tbl") break;
        obsoleteIndices.push(i);
      }

      obsoleteIndices.reverse().forEach(idx => {
        const obsNode = blockNodes[idx].node;
        if (obsNode && obsNode.parentNode) {
          obsNode.parentNode.removeChild(obsNode);
        }
      });

      let insertRef = targetNode.nextSibling;
      const catItems = bloomState.course_suggestions.filter(it => it.category === categoryKey);

      catItems.forEach(item => {
        if (!item.selectedSuggestion) return;
        const textContent = `${item.subitemKey}. ${item.selectedSuggestion}`;
        const itemXml = `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:pPr>
            <w:ind w:left="360"/>
            <w:rPr>
              <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>
            </w:rPr>
          </w:pPr>
          <w:r>
            <w:rPr>
              <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>
            </w:rPr>
            <w:t>${textContent}</w:t>
          </w:r>
        </w:p>`;
        const itemNode = new DOMParser().parseFromString(itemXml, "text/xml").documentElement;
        const importedNode = docOwner.importNode(itemNode, true);
        body.insertBefore(importedNode, insertRef);
      });
    };

    replaceCategory(courseKnowledgeIdx, "knowledge");
    replaceCategory(courseSkillsIdx, "skills");
    replaceCategory(courseAutonomyIdx, "autonomy");
  }

  // For each lesson in parsed CDR, find its index range in child list
  parsedCdr.lessons.forEach((lesson: any) => {
    const lessonId = `lesson-${lesson.lesson_number}`;
    const lessonItems = bloomState.lesson_suggestions[lessonId] || [];
    if (lessonItems.length === 0) return; // skip if no updates

    const startIdx = lesson.range.start_block_index;
    const endIdx = lesson.range.end_block_index_exclusive;

    // We scan this block index range in blockNodes
    // Find the paragraph node that is identified with outcomes
    let outcomesHeadingIndexInBlock = -1;
    for (let i = startIdx; i < Math.min(endIdx, blockNodes.length); i++) {
      const textLower = blockNodes[i].text.toLowerCase();
      if (textLower.includes("chuẩn đầu ra") || textLower.includes("chuáº©n Ä‘áº§u ra") || textLower.includes("mục tiêu")) {
        outcomesHeadingIndexInBlock = i;
        break;
      }
    }

    if (outcomesHeadingIndexInBlock !== -1) {
      const targetNode = blockNodes[outcomesHeadingIndexInBlock].node;
      const docOwner = targetNode.ownerDocument;
      
      // We'll replace the text of target node to say "I. Chuẩn đầu ra"
      const tNodes = targetNode.getElementsByTagName("w:t");
      if (tNodes.length > 0) {
        tNodes[0].textContent = "I. Chuẩn đầu ra";
        for (let j = 1; j < tNodes.length; j++) {
          tNodes[j].textContent = ""; // clear extra spans
        }
      }

      // Collect nodes to remove first: any paragraph between targetNode and the next table
      // We do this inside the lesson block range
      for (let i = outcomesHeadingIndexInBlock + 1; i < Math.min(endIdx, blockNodes.length); i++) {
        const blk = blockNodes[i];
        if (blk.name === "w:tbl") {
          // stop at tables
          break;
        }
        // Remove the paragraph from DOM
        const obsoleteNode = blk.node;
        if (obsoleteNode && obsoleteNode.parentNode) {
          obsoleteNode.parentNode.removeChild(obsoleteNode);
        }
      }

      // Next, we create new paragraph elements for each category and its selected items
      let insertRef = targetNode.nextSibling;
      
      const categories: { name: string; key: "knowledge" | "skills" | "autonomy" }[] = [
        { name: "1. Kiến thức", key: "knowledge" },
        { name: "2. Kỹ năng", key: "skills" },
        { name: "3. Mức tự chủ và trách nhiệm", key: "autonomy" }
      ];

      categories.forEach((cat) => {
        const catItems = lessonItems.filter((it) => it.category === cat.key && it.selectedSuggestion);
        if (catItems.length === 0) return; // skip if no selections for this category

        // Create Category Header paragraph
        const catXml = `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
          <w:pPr>
            <w:rPr>
              <w:b/>
              <w:color w:val="000000"/>
              <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>
            </w:rPr>
          </w:pPr>
          <w:r>
            <w:rPr>
              <w:b/>
              <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>
            </w:rPr>
            <w:t>${cat.name}</w:t>
          </w:r>
        </w:p>`;
        const catNode = new DOMParser().parseFromString(catXml, "text/xml").documentElement;
        const importedCatNode = docOwner.importNode(catNode, true);
        body.insertBefore(importedCatNode, insertRef);

        // Create items under this Category
        catItems.forEach((item) => {
          const itemXml = `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
            <w:pPr>
              <w:ind w:left="360"/>
            </w:pPr>
            <w:r>
              <w:rPr>
                <w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/>
              </w:rPr>
              <w:t>${item.subitemKey}. ${item.selectedSuggestion}</w:t>
            </w:r>
          </w:p>`;
          const itemNode = new DOMParser().parseFromString(itemXml, "text/xml").documentElement;
          const importedItemNode = docOwner.importNode(itemNode, true);
          body.insertBefore(importedItemNode, insertRef);
        });
      });
    }
  });

  // Re-serialize modified DOM to XML string
  const docXmlString = new XMLSerializer().serializeToString(doc);
  zip.addFile("word/document.xml", Buffer.from(docXmlString, "utf-8"));

  const parentDir = path.dirname(outputPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  zip.writeZip(outputPath);
  return outputPath;
}
