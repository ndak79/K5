import express, { Request, Response, NextFunction } from "express";
import path from "path";
import multer from "multer";
import * as os from "os";
import * as fs from "fs";
import { createServer as createViteServer } from "vite";
import {
  getSessionSummary,
  uploadCdrDocument,
  uploadGtDocument,
  startExtractionJob,
  regenerateQuestionAnswers,
  getLessonDocument,
  getLessonInsertions,
  exportLessonDocumentToFile,
  cancelExtractionJob,
  getRuntimeInstance
} from "./server/services/upload_session_service";
import {
  getBloomState,
  updateBloomVerbs,
  updateSelectedOutcomes,
  updateSelectedCourseOutcomes,
  resetBloomState,
  suggestLessonOutcomes,
  suggestBulkLessonOutcomes,
  suggestCourseOutcomes,
  compileOptimizedDocx,
  uploadBloomCdrDocument,
  uploadBloomGtDocument,
  bloomRuntime,
  getBloomRuntimeSummary,
  resetBloomRuntime,
  rebuildSelectedOutcomes,
  rebuildSelectedCourseOutcomes
} from "./server/services/bloom_service";
import { serializeLessonPreview } from "./server/services/preview_serializer";

const app = express();
const PORT = 3000;
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());

// API: System Checks
app.get("/api/system/health", (req: Request, res: Response) => {
  res.json({
    success: true,
    data: { status: "ok" }
  });
});

app.get("/api/system/cliproxy/health", (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      status: "ok",
      models: [
        "gemini-3.5-flash",
        "gemini-3.1-pro-preview"
      ]
    }
  });
});

app.post("/api/system/cliproxy/login", (req: Request, res: Response) => {
  const provider = req.query.provider || "gemini";
  res.json({
    launched: false,
    provider: String(provider),
    message: "Natively integrated with AI Studio Build"
  });
});

// API: Session state
app.get("/api/session", (req: Request, res: Response) => {
  res.json({ session: getSessionSummary() });
});

// API: Upload CDR file
app.post("/api/upload/cdr", upload.single("cdr_file"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Yêu cầu file đính kèm cdr_file" });
      return;
    }
    const summary = await uploadCdrDocument(req.file.originalname, req.file.buffer);
    res.json({ session: summary });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Xử lý file CDR thất bại" });
  }
});

// API: Upload GT file
app.post("/api/upload/gt", upload.single("gt_file"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Yêu cầu file đính kèm gt_file" });
      return;
    }
    const summary = await uploadGtDocument(req.file.originalname, req.file.buffer);
    res.json({ session: summary });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Xử lý file giáo trình thất bại" });
  }
});

// API: Start Extraction processing
app.post("/api/extract", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = await startExtractionJob();
    res.json({ session: summary });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Trích xuất tài liệu thất bại" });
  }
});

// API: Cancel Extraction processing
app.post("/api/extract/cancel", (req: Request, res: Response) => {
  try {
    const summary = cancelExtractionJob();
    res.json({ session: summary });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Hủy trích xuất thất bại" });
  }
});

// API: Retry question-answer generation
app.post("/api/lessons/:id/retry", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id;
    const summary = await regenerateQuestionAnswers(id);
    res.json({ success: true, data: summary });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || "Tái sinh câu hỏi thất bại" });
  }
});

// API: View Lesson Preview
app.get("/api/lessons/:id/preview", (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const doc = getLessonDocument(id);
    const insertions = getLessonInsertions(id);
    res.json({
      success: true,
      data: serializeLessonPreview(doc, insertions)
    });
  } catch (err: any) {
    res.status(404).json({ success: false, error: err.message || "Lesson preview is not ready" });
  }
});

// API: Download/Export Lesson docx output
app.post("/api/lessons/:id/export", (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const tempFile = path.join(os.tmpdir(), `lesson_${id}_${Date.now()}.docx`);
    exportLessonDocumentToFile(id, tempFile);

    res.download(tempFile, `Bai_giang_sau_enrichment_${id}.docx`, (err) => {
      try {
        if (path.resolve(tempFile).startsWith(os.tmpdir())) {
          path.resolve(tempFile) && fs.existsSync(tempFile) && fs.unlinkSync(tempFile);
        }
      } catch (cancelErr) {
        console.warn("Minor clean up failed", cancelErr);
      }
    });
  } catch (err: any) {
    res.status(404).json({ error: err.message || "Failed to export lesson file" });
  }
});

// --- BLOOM OPTIMIZATION API ENDPOINTS ---

// GET current bloom session summary
app.get("/api/bloom/session", (req: Request, res: Response) => {
  res.json({ success: true, session: getBloomRuntimeSummary() });
});

// POST upload CDR file for bloom
app.post("/api/bloom/upload/cdr", upload.single("cdr_file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "Yêu cầu file đính kèm cdr_file" });
    }
    const summary = await uploadBloomCdrDocument(req.file.originalname, req.file.buffer);
    res.json({ success: true, session: summary });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || "Xử lý file CDR thất bại" });
  }
});

// POST upload GT file for bloom
app.post("/api/bloom/upload/gt", upload.single("gt_file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "Yêu cầu file đính kèm gt_file" });
    }
    const summary = await uploadBloomGtDocument(req.file.originalname, req.file.buffer);
    res.json({ success: true, session: summary });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || "Xử lý file giáo trình thất bại" });
  }
});

// GET current bloom state
app.get("/api/bloom/state", (req: Request, res: Response) => {
  res.json({ success: true, data: getBloomState() });
});

// POST update standard bloom verbs
app.post("/api/bloom/verbs", (req: Request, res: Response) => {
  const { verbs } = req.body;
  if (!Array.isArray(verbs)) {
    return res.status(400).json({ success: false, error: "Verbs must be an array of strings." });
  }
  const state = updateBloomVerbs(verbs);
  res.json({ success: true, data: state });
});

// POST suggest outcomes for specific lesson
app.post("/api/bloom/lessons/:lessonId/suggest", async (req: Request, res: Response) => {
  try {
    const { lessonId } = req.params;
    const runtime = bloomRuntime;
    const suggestions = await suggestLessonOutcomes(lessonId, runtime);
    res.json({ success: true, suggestions, state: getBloomState() });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || "Lỗi sinh gợi ý chuẩn đầu ra bài giảng." });
  }
});

// POST bulk suggest outcomes for multiple lessons (safely grouped in 5-lesson chunks)
app.post("/api/bloom/lessons/suggest-bulk", async (req: Request, res: Response) => {
  try {
    const { lessonIds } = req.body;
    if (!Array.isArray(lessonIds)) {
      return res.status(400).json({ success: false, error: "lessonIds must be an array of strings." });
    }
    const runtime = bloomRuntime;
    const bulkSuggestions = await suggestBulkLessonOutcomes(lessonIds, runtime);
    res.json({ success: true, suggestions: bulkSuggestions, state: getBloomState() });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || "Lỗi sinh gợi ý chuẩn đầu ra hàng loạt." });
  }
});

// POST select outcomes for lesson
app.post("/api/bloom/lessons/:lessonId/select", (req: Request, res: Response) => {
  const { lessonId } = req.params;
  const { outcomes } = req.body;
  if (!Array.isArray(outcomes)) {
    return res.status(400).json({ success: false, error: "Outcomes must be an array of strings." });
  }
  const state = updateSelectedOutcomes(lessonId, outcomes);
  res.json({ success: true, data: state });
});

// POST select single subitem suggestion for lesson
app.post("/api/bloom/lessons/:lessonId/select-subitem", (req: Request, res: Response) => {
  const { lessonId } = req.params;
  const { subitemKey, selectedText } = req.body;
  const state = getBloomState();
  const items = state.lesson_suggestions[lessonId] || [];
  const item = items.find(it => it.subitemKey === subitemKey);
  if (item) {
    item.selectedSuggestion = selectedText;
    rebuildSelectedOutcomes(lessonId);
  }
  res.json({ success: true, data: getBloomState() });
});

// POST suggest overall course outcomes (CLOs)
app.post("/api/bloom/course/suggest", async (req: Request, res: Response) => {
  try {
    const runtime = bloomRuntime;
    const suggestions = await suggestCourseOutcomes(runtime);
    res.json({ success: true, suggestions, state: getBloomState() });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message || "Lỗi tổng hợp chuẩn đầu ra môn học." });
  }
});

// POST select overall course outcomes (CLOs)
app.post("/api/bloom/course/select", (req: Request, res: Response) => {
  const { outcomes } = req.body;
  if (!Array.isArray(outcomes)) {
    return res.status(400).json({ success: false, error: "Outcomes must be an array of strings." });
  }
  const state = updateSelectedCourseOutcomes(outcomes);
  res.json({ success: true, data: state });
});

// POST select single subitem suggestion for course general outcome
app.post("/api/bloom/course/select-subitem", (req: Request, res: Response) => {
  const { subitemKey, selectedText } = req.body;
  const state = getBloomState();
  const items = state.course_suggestions || [];
  const item = items.find(it => it.subitemKey === subitemKey);
  if (item) {
    item.selectedSuggestion = selectedText;
    rebuildSelectedCourseOutcomes();
  }
  res.json({ success: true, data: getBloomState() });
});

// POST reset bloom session state
app.post("/api/bloom/reset", (req: Request, res: Response) => {
  const state = resetBloomState();
  resetBloomRuntime();
  res.json({ success: true, data: state });
});

// POST compile and export updated CDR document (.docx)
app.post("/api/bloom/export", (req: Request, res: Response) => {
  try {
    const runtime = bloomRuntime;
    const tempFile = path.join(os.tmpdir(), `bloom_optimized_cdr_${Date.now()}.docx`);
    compileOptimizedDocx(runtime, tempFile);

    res.download(tempFile, `CDR_Toi_Uu_Hoa_Bloom.docx`, (err) => {
      try {
        if (path.resolve(tempFile).startsWith(os.tmpdir())) {
          path.resolve(tempFile) && fs.existsSync(tempFile) && fs.unlinkSync(tempFile);
        }
      } catch (cancelErr) {
        console.warn("Bloom clean up minor failure:", cancelErr);
      }
    });
  } catch (err: any) {
    res.status(450).json({ error: err.message || "Xử lý tạo tài liệu tối ưu thất bại." });
  }
});

// Vite Middleware & Static Serving Setup
async function launchServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running natively on port ${PORT}`);
  });
}

launchServer().catch((err) => {
  console.error("Error launching server:", err);
});
