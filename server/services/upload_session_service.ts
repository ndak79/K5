import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { normalizeInputDocument } from "../document_pipeline/convert";
import { parseCdrDocument, ParsedCdrDocument, ParsedCdrLesson } from "../document_pipeline/parse_cdr";
import { parseGtDocument, ParsedGtDocument, ParsedGtChapter } from "../document_pipeline/parse_gt";
import { mapLessonsToChapters } from "./lesson_mapper";
import { buildLessonDocumentModel, LessonDocumentModel, GeneratedInsertion } from "./normalizer";
import { enrichLessonDocument } from "./enrichment_service";
import { exportLessonDocument } from "../document_pipeline/export_docx";

export interface LessonJobSummary {
  id: string;
  lesson_number: number;
  title: string;
  status: "uploaded" | "preparing_gt" | "ready" | "processing" | "completed" | "failed";
  preview_ready: boolean;
  chapter_number?: number | null;
  chapter_title?: string | null;
  error?: string | null;
}

export interface UploadSessionSummary {
  session_id: string;
  cdr_file_name: string | null;
  gt_file_name: string | null;
  cdr_status: "missing" | "preparing" | "ready" | "failed";
  gt_status: "missing" | "preparing" | "ready" | "failed";
  cdr_error: string | null;
  gt_error: string | null;
  processing: boolean;
  can_extract: boolean;
  lessons: LessonJobSummary[];
}

export class SessionRuntime {
  session_id: string = Math.random().toString(36).substring(2, 15);
  version: number = 0;
  gt_version: number = 0;
  cdr_file_name: string | null = null;
  gt_file_name: string | null = null;
  cdr_original_path: string | null = null;
  cdr_normalized_path: string | null = null;
  gt_original_path: string | null = null;
  gt_normalized_path: string | null = null;
  parsed_cdr: ParsedCdrDocument | null = null;
  parsed_gt: ParsedGtDocument | null = null;
  cdr_status: "missing" | "preparing" | "ready" | "failed" = "missing";
  gt_status: "missing" | "preparing" | "ready" | "failed" = "missing";
  cdr_error: string | null = null;
  gt_error: string | null = null;
  processing: boolean = false;
  cancelled: boolean = false;
  lessons: Record<string, LessonJobSummary> = {};
  lesson_documents: Record<string, LessonDocumentModel> = {};
  insertions: Record<string, GeneratedInsertion[]> = {};
  lesson_to_chapter: Record<string, number> = {};
  batch_dirs: Set<string> = new Set();
}

const RUNTIME = new SessionRuntime();

function getLessonId(lessonNumber: number): string {
  return `lesson-${lessonNumber}`;
}

function getNextBatchDir(): string {
  const timestamp = new Date().toISOString().replace(/[-:T]/g, "").substring(0, 14);
  const dir = path.join(os.tmpdir(), "lesson_builder", timestamp);
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
  for (const batchDir of RUNTIME.batch_dirs) {
    try {
      if (fs.existsSync(batchDir)) {
        fs.rmSync(batchDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.warn("Failed to clean up", batchDir, err);
    }
  }
  RUNTIME.batch_dirs.clear();
}

function resetAll(): void {
  cleanupRuntimeFiles();
  RUNTIME.session_id = Math.random().toString(36).substring(2, 15);
  RUNTIME.version += 1;
  RUNTIME.gt_version += 1;
  RUNTIME.cdr_file_name = null;
  RUNTIME.gt_file_name = null;
  RUNTIME.cdr_original_path = null;
  RUNTIME.cdr_normalized_path = null;
  RUNTIME.gt_original_path = null;
  RUNTIME.gt_normalized_path = null;
  RUNTIME.parsed_cdr = null;
  RUNTIME.parsed_gt = null;
  RUNTIME.cdr_status = "missing";
  RUNTIME.gt_status = "missing";
  RUNTIME.cdr_error = null;
  RUNTIME.gt_error = null;
  RUNTIME.processing = false;
  RUNTIME.cancelled = false;
  RUNTIME.lessons = {};
  RUNTIME.lesson_documents = {};
  RUNTIME.insertions = {};
  RUNTIME.lesson_to_chapter = {};
}

function resetGtRelatedState(): void {
  if (RUNTIME.gt_original_path) {
    const parentDir = path.dirname(RUNTIME.gt_original_path);
    if (RUNTIME.batch_dirs.has(parentDir)) {
      try {
        if (fs.existsSync(parentDir)) {
          fs.rmSync(parentDir, { recursive: true, force: true });
        }
      } catch (err) {
        console.warn("Failed reset-gt clean", parentDir, err);
      }
      RUNTIME.batch_dirs.delete(parentDir);
    }
  }

  RUNTIME.gt_version += 1;
  RUNTIME.gt_file_name = null;
  RUNTIME.gt_original_path = null;
  RUNTIME.gt_normalized_path = null;
  RUNTIME.parsed_gt = null;
  RUNTIME.gt_status = "missing";
  RUNTIME.gt_error = null;
  RUNTIME.processing = false;
  RUNTIME.cancelled = false;
  RUNTIME.lesson_documents = {};
  RUNTIME.insertions = {};
  RUNTIME.lesson_to_chapter = {};

  for (const lesson of Object.values(RUNTIME.lessons)) {
    lesson.chapter_number = null;
    lesson.chapter_title = null;
    lesson.preview_ready = false;
    lesson.error = null;
    lesson.status = "uploaded";
  }
}

function toSummary(): UploadSessionSummary {
  const lessonsList = Object.values(RUNTIME.lessons).sort((a, b) => a.lesson_number - b.lesson_number);
  return {
    session_id: RUNTIME.session_id,
    cdr_file_name: RUNTIME.cdr_file_name,
    gt_file_name: RUNTIME.gt_file_name,
    cdr_status: RUNTIME.cdr_status,
    gt_status: RUNTIME.gt_status,
    cdr_error: RUNTIME.cdr_error,
    gt_error: RUNTIME.gt_error,
    processing: RUNTIME.processing,
    can_extract: !!(RUNTIME.parsed_cdr && RUNTIME.parsed_gt && !RUNTIME.processing),
    lessons: lessonsList
  };
}

export function getSessionSummary(): UploadSessionSummary {
  return toSummary();
}

export function getRuntimeInstance(): SessionRuntime {
  return RUNTIME;
}

export async function uploadCdrDocument(filename: string, fileBuffer: Buffer): Promise<UploadSessionSummary> {
  resetAll();
  const version = RUNTIME.version;
  const batchDir = getNextBatchDir();
  const cdrOriginalPath = storeUpload(filename, fileBuffer, batchDir);
  RUNTIME.batch_dirs.add(batchDir);

  RUNTIME.cdr_file_name = filename;
  RUNTIME.cdr_original_path = cdrOriginalPath;
  RUNTIME.cdr_status = "preparing";

  // Defer run in background
  setTimeout(async () => {
    try {
      const cdrNormalizedPath = normalizeInputDocument(cdrOriginalPath, batchDir);
      const parsedCdr = parseCdrDocument(cdrNormalizedPath);

      if (version !== RUNTIME.version) return;

      RUNTIME.cdr_normalized_path = cdrNormalizedPath;
      RUNTIME.parsed_cdr = parsedCdr;
      RUNTIME.cdr_status = "ready";
      RUNTIME.cdr_error = null;

      RUNTIME.lessons = {};
      for (const lesson of parsedCdr.lessons) {
        const id = getLessonId(lesson.lesson_number);
        RUNTIME.lessons[id] = {
          id,
          lesson_number: lesson.lesson_number,
          title: lesson.title,
          status: "uploaded",
          preview_ready: false
        };
      }
    } catch (err: any) {
      if (version !== RUNTIME.version) return;
      RUNTIME.cdr_status = "failed";
      RUNTIME.cdr_error = err.message || "Xử lý file CDR thất bại.";
      RUNTIME.lessons = {};
    }
  }, 10);

  return toSummary();
}

export async function uploadGtDocument(filename: string, fileBuffer: Buffer): Promise<UploadSessionSummary> {
  if (RUNTIME.cdr_status === "missing") {
    throw new Error("Cần upload file CDR trước khi upload giáo trình.");
  }
  if (RUNTIME.cdr_status === "failed") {
    throw new Error("File CDR xử lý thất bại. Cần upload lại CDR trước khi upload giáo trình.");
  }

  resetGtRelatedState();
  const gtVersion = RUNTIME.gt_version;
  const batchDir = getNextBatchDir();
  const gtOriginalPath = storeUpload(filename, fileBuffer, batchDir);
  RUNTIME.batch_dirs.add(batchDir);

  RUNTIME.gt_file_name = filename;
  RUNTIME.gt_original_path = gtOriginalPath;
  RUNTIME.gt_status = "preparing";

  for (const lesson of Object.values(RUNTIME.lessons)) {
    lesson.status = "preparing_gt";
  }

  // Defer run in background
  setTimeout(async () => {
    try {
      const gtNormalizedPath = normalizeInputDocument(gtOriginalPath, batchDir);
      const parsedGt = parseGtDocument(gtNormalizedPath);

      // Wait for CDR if needed with timeout
      let parsedCdr = RUNTIME.parsed_cdr;
      const start = Date.now();
      while (!parsedCdr && RUNTIME.cdr_status === "preparing" && Date.now() - start < 180000) {
        await new Promise((r) => setTimeout(r, 250));
        parsedCdr = RUNTIME.parsed_cdr;
      }

      if (gtVersion !== RUNTIME.gt_version) return;

      if (RUNTIME.cdr_status === "failed") {
        throw new Error("File CDR xử lý thất bại. Cần upload lại CDR trước khi dùng giáo trình.");
      }
      if (!parsedCdr) {
        throw new Error("Hết thời gian chờ file CDR xử lý xong.");
      }

      const mapping = mapLessonsToChapters(parsedCdr, parsedGt);

      RUNTIME.gt_normalized_path = gtNormalizedPath;
      RUNTIME.parsed_gt = parsedGt;
      RUNTIME.gt_status = "ready";
      RUNTIME.gt_error = null;

      for (const [id, lesson] of Object.entries(RUNTIME.lessons)) {
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

        RUNTIME.lesson_to_chapter[id] = chapterNumber;
        lesson.chapter_number = chapter.chapter_number;
        lesson.chapter_title = chapter.title;
        lesson.status = "ready";
        lesson.error = null;
      }
    } catch (err: any) {
      if (gtVersion !== RUNTIME.gt_version) return;
      RUNTIME.gt_status = "failed";
      RUNTIME.gt_error = err.message || "Xử lý file giáo trình thất bại.";
      for (const lesson of Object.values(RUNTIME.lessons)) {
        lesson.status = "failed";
        lesson.error = err.message || "Xử lý file giáo trình thất bại.";
      }
    }
  }, 10);

  return toSummary();
}

export async function startExtractionJob(): Promise<UploadSessionSummary> {
  if (!RUNTIME.parsed_cdr || !RUNTIME.parsed_gt) {
    throw new Error("Need both CDR and GT before extraction");
  }
  if (RUNTIME.processing) {
    return toSummary();
  }

  const gtVersion = RUNTIME.gt_version;
  RUNTIME.processing = true;
  RUNTIME.cancelled = false;
  RUNTIME.lesson_documents = {};
  RUNTIME.insertions = {};

  for (const lesson of Object.values(RUNTIME.lessons)) {
    if (lesson.status !== "failed") {
      lesson.status = "processing";
      lesson.preview_ready = false;
      lesson.error = null;
    }
  }

  setTimeout(async () => {
    try {
      const activeLessonIds = Object.keys(RUNTIME.lessons).filter(
        (id) => RUNTIME.lessons[id].status !== "failed"
      );

      // Perform sequential or limited parallel extractions
      for (const id of activeLessonIds) {
        if (gtVersion !== RUNTIME.gt_version) return;
        if (RUNTIME.cancelled) {
          break;
        }
        const lessonSummary = RUNTIME.lessons[id];
        lessonSummary.status = "processing";

        try {
          const lessonNumber = lessonSummary.lesson_number;
          const chapterNumber = RUNTIME.lesson_to_chapter[id];
          const cdrLesson = RUNTIME.parsed_cdr!.lessons.find((l) => l.lesson_number === lessonNumber)!;
          const gtChapter = RUNTIME.parsed_gt!.chapters.find((c) => c.chapter_number === chapterNumber)!;

          const lessonDocument = buildLessonDocumentModel(id, cdrLesson, gtChapter);
          const enrichmentResult = await enrichLessonDocument(lessonDocument);

          if (gtVersion !== RUNTIME.gt_version) return;

          RUNTIME.lesson_documents[id] = lessonDocument;
          RUNTIME.insertions[id] = enrichmentResult.insertions;

          lessonSummary.status = "completed";
          lessonSummary.preview_ready = true;
          lessonSummary.error = null;
        } catch (err: any) {
          if (gtVersion !== RUNTIME.gt_version) return;
          lessonSummary.status = "failed";
          lessonSummary.error = err.message || "Generator enrichment error";
          lessonSummary.preview_ready = false;
        }
      }
    } finally {
      if (gtVersion === RUNTIME.gt_version) {
        RUNTIME.processing = false;
      }
    }
  }, 10);

  return toSummary();
}

export async function regenerateQuestionAnswers(lessonId: string): Promise<UploadSessionSummary> {
  const lessonSummary = RUNTIME.lessons[lessonId];
  const lessonDocument = RUNTIME.lesson_documents[lessonId];
  if (!lessonSummary || !lessonDocument) {
    throw new Error("Lesson is not ready");
  }

  lessonSummary.status = "processing";
  const existingInsertions = RUNTIME.insertions[lessonId] || [];

  try {
    const regenerated = await enrichLessonDocument(lessonDocument, new Set(["question_answer"]));
    const qaAnchorIds = new Set(
      lessonDocument.anchors.filter((a) => a.kind === "question_answer").map((a) => a.id)
    );

    const preserved = existingInsertions.filter((ins) => !qaAnchorIds.has(ins.anchor_id));
    RUNTIME.insertions[lessonId] = [...preserved, ...regenerated.insertions];

    lessonSummary.status = "completed";
    lessonSummary.preview_ready = true;
    lessonSummary.error = null;
  } catch (err: any) {
    lessonSummary.status = "failed";
    lessonSummary.error = err.message || "Regenerate Q/A error";
  }

  return toSummary();
}

export function getLessonDocument(lessonId: string): LessonDocumentModel {
  const doc = RUNTIME.lesson_documents[lessonId];
  if (!doc) {
    throw new Error("Lesson preview is not ready");
  }
  return doc;
}

export function getLessonInsertions(lessonId: string): GeneratedInsertion[] {
  return RUNTIME.insertions[lessonId] || [];
}

export function exportLessonDocumentToFile(lessonId: string, outputPath: string): string {
  const doc = getLessonDocument(lessonId);
  const insertions = getLessonInsertions(lessonId);
  return exportLessonDocument(doc, insertions, outputPath);
}

export function cancelExtractionJob(): UploadSessionSummary {
  if (RUNTIME.processing) {
    RUNTIME.cancelled = true;
    RUNTIME.processing = false;
    for (const key of Object.keys(RUNTIME.lessons)) {
      const lesson = RUNTIME.lessons[key];
      if (lesson.status === "processing" || lesson.status === "preparing_gt") {
        lesson.status = "ready";
        lesson.error = "Bị hủy bởi người dùng";
      }
    }
  }
  return toSummary();
}
