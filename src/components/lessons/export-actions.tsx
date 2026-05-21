interface ExportActionsProps {
  isLoading: boolean;
  onExport: () => void;
}

export function ExportActions({ isLoading, onExport }: ExportActionsProps) {
  return (
    <section className="rounded-3xl border border-sage-border bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold font-serif text-accent">Tải tài liệu Word (.docx)</h2>
      <p className="mt-2 text-xs text-ink/70 leading-relaxed">
        Phục hồi và đóng gói tài liệu Word hoàn chuẩn từ kết cấu bài giảng gốc tích hợp các điểm neo và giải thuật câu hỏi sinh từ AI.
      </p>
      <button
        className="mt-4 rounded-full bg-accent hover:bg-sage-dark px-5 py-2.5 text-xs font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-sm"
        disabled={isLoading}
        onClick={onExport}
        type="button"
      >
        {isLoading ? (
          <>
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            <span>Đang xuất bản...</span>
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-[16px]">download</span>
            <span>Xuất file ấn bản .docx</span>
          </>
        )}
      </button>
    </section>
  );
}
