import { useState } from "react";
import { Link } from "react-router-dom";

import type { LessonSummary } from "../../lib/schemas/lesson";

interface LessonListProps {
  lessons: LessonSummary[];
  canExtract: boolean;
  isExtracting: boolean;
  onExtract: () => void;
  onCancel: () => void;
}

function StatusIcon({ status }: { status: LessonSummary["status"] }) {
  if (status === "completed") {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#E5E1D5]/80 text-accent text-sm font-bold">
        ✓
      </span>
    );
  }

  if (status === "processing" || status === "preparing_gt") {
    return (
      <span className="flex h-6 w-6 items-center justify-center">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-sage-border border-t-accent" />
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-sm font-bold text-rose-700">
        !
      </span>
    );
  }

  return <span className="h-6 w-6 rounded-full border border-sage-border bg-sage-light/35" />;
}

function buildStatusLabel(lesson: LessonSummary) {
  if (lesson.status === "preparing_gt") {
    return "Đang xử lý tài liệu giáo trình...";
  }
  if (lesson.status === "processing") {
    return "Đang thực hiện trích xuất nội dung bài học...";
  }
  if (lesson.status === "completed") {
    return "Xử lý thành công - Học liệu sẵn sàng";
  }
  if (lesson.status === "failed") {
    return lesson.error ?? "Trích xuất thất bại hoặc có lỗi xảy ra";
  }
  if (lesson.chapter_number) {
    return `Đã xác thực và liên kết với Chương ${lesson.chapter_number}`;
  }
  return "Đã nhận diện cấu trúc bài học";
}

export function LessonList({ lessons, canExtract, isExtracting, onExtract, onCancel }: LessonListProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <section className="rounded-3xl border border-sage-border bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold font-serif text-accent">Danh sách bài giảng nhận diện</h2>
          <span className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/50 font-mono mt-0.5 block">{lessons.length} bài giảng</span>
        </div>
        <button
          className={`self-start rounded-full px-5 py-2.5 text-sm font-semibold text-white transition sm:self-auto shadow-sm flex items-center gap-2 cursor-pointer ${
            isExtracting
              ? "bg-accent hover:bg-rose-600"
              : "bg-accent hover:bg-sage-dark disabled:cursor-not-allowed disabled:opacity-50"
          }`}
          disabled={!isExtracting && !canExtract}
          onClick={isExtracting ? onCancel : onExtract}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          type="button"
        >
          {isExtracting ? (
            isHovered ? (
              <>
                <span className="material-symbols-outlined text-[18px]">cancel</span>
                <span>Hủy trích xuất</span>
              </>
            ) : (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                <span>Đang trích xuất...</span>
              </>
            )
          ) : (
            <>
              <span className="material-symbols-outlined text-[18px]">transform</span>
              <span>Trích xuất & chuẩn hóa dữ liệu</span>
            </>
          )}
        </button>
      </div>
      <div className="mt-6 space-y-3">
        {lessons.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-sage-border p-6 text-sm text-center text-ink/65 bg-sage-light/10">
            Chưa có bài nào được nạp. Hãy tải lên tệp CDR để hệ thống tự động nhận diện danh sách bài giảng.
          </div>
        ) : (
          lessons.map((lesson) => {
            const isPreviewAvailable = lesson.preview_ready || lesson.status === "completed";
            const content = (
              <div className="flex items-start gap-4">
                <StatusIcon status={lesson.status} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-ink group-hover:text-accent transition-colors">{lesson.title}</div>
                      <div className="mt-1 text-xs text-ink/65 font-medium">{buildStatusLabel(lesson)}</div>
                    </div>
                    {isPreviewAvailable ? (
                      <span className="shrink-0 rounded-full bg-accent/10 px-3 py-1 text-xs font-semibold text-accent border border-accent/20">
                        Xem preview
                      </span>
                    ) : null}
                  </div>
                  {lesson.chapter_title ? (
                    <div className="mt-2 text-[11px] font-mono uppercase tracking-wider text-accent/85 bg-sage-light/35 border border-sage-border/60 rounded-md px-2 py-1 inline-block">
                      Chương {lesson.chapter_number}: {lesson.chapter_title}
                    </div>
                  ) : null}
                </div>
              </div>
            );

            if (!isPreviewAvailable) {
              return (
                <div key={lesson.id} className="rounded-2xl border border-sage-border bg-sage-light/20 p-4 opacity-80">
                  {content}
                </div>
              );
            }

            return (
              <Link
                key={lesson.id}
                className="group block rounded-2xl border border-sage-border p-4 transition-all hover:border-accent hover:bg-sage-light/30 hover:translate-x-1 duration-200"
                to={`/lessons/${lesson.id}`}
              >
                {content}
              </Link>
            );
          })
        )}
      </div>
    </section>
  );
}
