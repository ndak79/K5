import { useState } from "react";

import type { UploadSessionSummary } from "../../lib/schemas/lesson";

interface UploadWizardProps {
  session: UploadSessionSummary;
  onUploadCdr: (file: File) => Promise<void>;
  onUploadGt: (file: File) => Promise<void>;
  isUploadingCdr: boolean;
  isUploadingGt: boolean;
  feedbackMessage: string | null;
}

export function UploadWizard({
  session,
  onUploadCdr,
  onUploadGt,
  isUploadingCdr,
  isUploadingGt,
  feedbackMessage
}: UploadWizardProps) {
  const [cdrFileName, setCdrFileName] = useState<string | null>(null);
  const [gtFileName, setGtFileName] = useState<string | null>(null);
  const canUploadGt = session.cdr_status === "preparing" || session.cdr_status === "ready";
  const isGtDisabled =
    isUploadingCdr ||
    isUploadingGt ||
    session.cdr_status === "missing" ||
    session.cdr_status === "failed";

  function getDocumentStatusLabel(status: UploadSessionSummary["cdr_status"]) {
    if (status === "preparing") {
      return "đang xử lý";
    }
    if (status === "ready") {
      return "sẵn sàng";
    }
    if (status === "failed") {
      return "thất bại";
    }
    return "chưa có";
  }

  async function handleFileChange(kind: "cdr" | "gt", file: File | null) {
    if (!file) {
      return;
    }

    if (kind === "cdr") {
      setCdrFileName(file.name);
      await onUploadCdr(file);
      return;
    }

    if (!canUploadGt) {
      return;
    }

    setGtFileName(file.name);
    await onUploadGt(file);
  }

  function getGtHelperText() {
    if (session.cdr_status === "preparing" && session.gt_status !== "preparing") {
      return "Có thể upload ngay, hệ thống sẽ chờ CDR xử lý xong để map";
    }
    if (session.cdr_status === "failed") {
      return session.cdr_error ?? "CDR lỗi, cần upload lại trước";
    }
    if (session.cdr_status === "missing") {
      return "Upload CDR trước";
    }
    if (session.gt_status === "preparing" && session.cdr_status === "preparing") {
      return "Đã nhận giáo trình, đang chờ CDR để map";
    }
    if (isUploadingGt || session.gt_status === "preparing") {
      return "Đang xử lý nền giáo trình...";
    }
    return "Map Chương n với Bài n";
  }

  return (
    <section className="rounded-3xl border border-sage-border bg-white p-6 shadow-sm">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-accent">Đầu vào tài liệu</p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label className="flex min-h-40 cursor-pointer flex-col justify-between rounded-2xl border border-dashed border-sage-border bg-sage-light/30 hover:bg-sage-light/50 transition-colors p-4">
          <span className="text-sm font-semibold text-ink/80">CDR (.doc/.docx)</span>
          <span className="text-xs text-ink/60 font-mono">
            {session.cdr_file_name ?? cdrFileName ?? "Chọn file CDR"}
          </span>
          <input
            className="sr-only"
            type="file"
            accept=".doc,.docx"
            onChange={(event) =>
              void handleFileChange("cdr", event.currentTarget.files?.[0] ?? null)
            }
          />
          <span className="text-xs font-medium text-accent">
            {isUploadingCdr ? "Đang trích xuất danh sách bài..." : "Upload và parse ngay"}
          </span>
        </label>

        <label
          className={`flex min-h-40 flex-col justify-between rounded-2xl border border-dashed p-4 transition-colors ${
            isGtDisabled
              ? "cursor-not-allowed border-sage-border bg-sage-light/10 text-ink/40"
              : "cursor-pointer border-sage-border bg-sage-light/30 hover:bg-sage-light/50"
          }`}
        >
          <span className="text-sm font-semibold text-ink/80">Giáo trình (.doc/.docx)</span>
          <span className="text-xs text-ink/60 font-mono">
            {session.gt_file_name ?? gtFileName ?? "Chọn file giáo trình"}
          </span>
          <input
            className="sr-only"
            type="file"
            accept=".doc,.docx"
            disabled={isGtDisabled}
            onChange={(event) =>
              void handleFileChange("gt", event.currentTarget.files?.[0] ?? null)
            }
          />
          <span className={`text-xs font-medium ${isGtDisabled ? "text-ink/40" : "text-warm"}`}>
            {getGtHelperText()}
          </span>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-xs">
        <span className="rounded-full bg-sage-light/60 border border-sage-border px-3 py-1 text-ink/75">
          CDR: {session.cdr_file_name ? "đã upload" : "chưa có"}
        </span>
        <span className="rounded-full bg-sage-light/60 border border-sage-border px-3 py-1 text-ink/75">
          CDR: {getDocumentStatusLabel(session.cdr_status)}
        </span>
        <span className="rounded-full bg-sage-light/60 border border-sage-border px-3 py-1 text-ink/75">
          GT: {getDocumentStatusLabel(session.gt_status)}
        </span>
        <span className="rounded-full bg-sage-light/60 border border-sage-border px-3 py-1 text-ink/75">
          Trạng thái: {session.processing ? "đang xử lý" : "sẵn sàng"}
        </span>
      </div>

      {session.cdr_status === "failed" && session.cdr_error ? (
        <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {session.cdr_error}
        </p>
      ) : null}

      {feedbackMessage ? (
        <p className="mt-4 text-xs font-medium bg-sage-light/50 border border-sage-border rounded-xl px-4 py-2.5 text-accent flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px]">info</span>
          {feedbackMessage}
        </p>
      ) : null}
    </section>
  );
}
