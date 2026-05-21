import type { LessonPreviewModel, PreviewBlock } from "../../lib/schemas/lesson";

interface LessonPreviewProps {
  preview: LessonPreviewModel | null;
  onBack: () => void;
}

function isHeading(block: PreviewBlock) {
  if (block.kind !== "paragraph") {
    return false;
  }
  return /^(NỘI DUNG|[IVXLC]+\.\s|[0-9]+\.\s|[a-z]\)\s)/i.test(block.textPreview.trim());
}

function blockClassName(block: PreviewBlock) {
  if (block.source === "generated") {
    return "rounded-xl border border-warm/40 bg-warm/5 px-4 py-3 text-sm italic text-ink/90 relative overflow-hidden before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-warm";
  }
  if (block.kind === "table") {
    return "overflow-hidden rounded-xl border border-sage-border bg-white shadow-sm";
  }
  if (isHeading(block)) {
    return "rounded-xl border border-sage-border bg-white px-4 py-3 text-base font-bold font-serif text-accent shadow-sm";
  }
  return "rounded-xl border border-sage-border bg-white px-4 py-3 text-sm leading-7 text-ink/85 shadow-sm";
}

function TablePreview({ block }: { block: PreviewBlock }) {
  const rows = block.tableRows ?? [];
  if (rows.length === 0) {
    return null;
  }

  const header = rows[0];
  const body = rows.slice(1);

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-[#FAF9F6] border-b border-sage-border">
          <tr>
            {header.map((cell, index) => (
              <th
                key={`${block.id}-header-${index}`}
                className="border border-sage-border px-3 py-2.5 text-left font-bold text-accent"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-sage-border bg-white">
          {body.map((row, rowIndex) => (
            <tr key={`${block.id}-row-${rowIndex}`} className="align-top hover:bg-sage-light/10 transition-colors">
              {row.map((cell, cellIndex) => (
                <td
                  key={`${block.id}-cell-${rowIndex}-${cellIndex}`}
                  className="whitespace-pre-wrap border border-sage-border px-3 py-2.5 text-ink/80 text-xs"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LessonPreview({ preview, onBack }: LessonPreviewProps) {
  const visibleBlocks =
    preview?.documentBlocks.filter(
      (block) => block.kind === "table" || block.textPreview.trim().length > 0
    ) ?? [];

  return (
    <section className="rounded-3xl border border-sage-border bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-sage-border/50 pb-4">
        <div>
          <button
            className="rounded-full border border-sage-border bg-white px-3.5 py-1.5 text-xs font-semibold text-ink/70 transition hover:border-accent hover:text-accent flex items-center gap-1 cursor-pointer"
            onClick={onBack}
            type="button"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            <span>Quay lại</span>
          </button>
          <h2 className="mt-4 text-xl font-bold font-serif text-accent leading-snug">
            {preview?.lessonTitle ?? "Nội dung bài học chuẩn hóa"}
          </h2>
        </div>
      </div>

      {!preview ? (
        <div className="mt-6 rounded-2xl border border-dashed border-sage-border p-8 text-center bg-sage-light/10">
          <span className="material-symbols-outlined text-4xl text-sage-border mb-2 animate-pulse">hourglass_empty</span>
          <p className="text-sm text-ink/65 font-medium">Bản xem trước dữ liệu chuẩn hóa của bài học chưa được khởi tạo thành công.</p>
        </div>
      ) : (
        <div className="mt-6 max-h-[80vh] overflow-hidden rounded-2xl border border-sage-border bg-sage-light/20">
          <div className="max-h-[80vh] overflow-y-auto p-4 md:p-5">
            <div className="mx-auto max-w-4xl space-y-4">
              {visibleBlocks.map((block) => (
                <div key={block.id} className={blockClassName(block)}>
                  {block.kind === "table" ? (
                    <TablePreview block={block} />
                  ) : (
                    <div className="whitespace-pre-wrap leading-relaxed">{block.textPreview}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
