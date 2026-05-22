import { useEffect, useState, useTransition } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Layout } from "../components/layout";
import { ExportActions } from "../components/lessons/export-actions";
import { LessonPreview } from "../components/lessons/lesson-preview";
import { exportLesson, fetchLessonPreview, retryLessonQuestions } from "../lib/api/client";
import type { LessonPreviewModel } from "../lib/schemas/lesson";

export function LessonDetailPage() {
  const navigate = useNavigate();
  const { lessonId = "" } = useParams();
  const [preview, setPreview] = useState<LessonPreviewModel | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isExporting, startExporting] = useTransition();

  function loadPreview() {
    if (!lessonId) {
      return;
    }

    fetchLessonPreview(lessonId)
      .then((response) => {
        setPreview(response.data ?? null);
      })
      .catch(() => {
        setPreview(null);
      });
  }

  useEffect(() => {
    loadPreview();
  }, [lessonId]);

  async function handleRetry() {
    if (!lessonId || isRetrying) {
      return;
    }

    setIsRetrying(true);
    setFeedbackMessage(null);
    try {
      await retryLessonQuestions(lessonId);
      loadPreview();
      setFeedbackMessage("Đã tạo lại phần câu hỏi và trả lời.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không xác định";
      setFeedbackMessage(`Thử lại thất bại: ${message}`);
    } finally {
      setIsRetrying(false);
    }
  }

  function handleExport() {
    if (!lessonId) {
      return;
    }

    startExporting(() => {
      exportLesson(lessonId)
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `${lessonId}.docx`;
          link.click();
          URL.revokeObjectURL(url);
        })
        .catch((error: Error) => {
          setFeedbackMessage(`Xuất file thất bại: ${error.message}`);
        });
    });
  }

  return (
    <Layout>
      <div className="grid gap-6 xl:grid-cols-[2.5fr,1fr]">
        <LessonPreview preview={preview} onBack={() => navigate(-1)} />
        <div className="space-y-6">
          <section className="rounded-3xl border border-sage-border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold font-serif text-accent">Tác vụ can thiệp AI</h2>
            <p className="mt-2 text-xs text-ink/70 leading-relaxed">
              Duyệt qua các phân mục tài liệu chuẩn hóa, bạn có thể kích hoạt sinh lại bộ câu hỏi & câu trả lời từ dữ liệu nguồn giáo trình bất cứ lúc nào.
            </p>
            <button
              className="mt-4 inline-flex items-center gap-2 rounded-full border border-warm/80 px-4 py-2 text-xs font-bold text-warm hover:bg-sage-light/35 transition cursor-pointer"
              disabled={isRetrying || preview === null}
              onClick={() => void handleRetry()}
              type="button"
            >
              {isRetrying ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-warm/30 border-t-warm" />
                  <span>Đang tái sinh câu hỏi...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[16px]">refresh</span>
                  <span>Tái tạo câu hỏi & trả lời</span>
                </>
              )}
            </button>
            {feedbackMessage ? (
              <p className="mt-3 text-xs font-medium text-accent bg-sage-light/45 rounded-lg px-3 py-2 border border-sage-border/60">
                {feedbackMessage}
              </p>
            ) : null}
          </section>
          <ExportActions isLoading={isExporting} onExport={handleExport} />
        </div>
      </div>
    </Layout>
  );
}
