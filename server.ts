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
  cancelExtractionJob
} from "./server/services/upload_session_service";
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
    app.get("*all", (req: Request, res: Response) => {
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
