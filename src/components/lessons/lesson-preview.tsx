import type { LessonPreviewModel, PreviewBlock } from "../../lib/schemas/lesson";

interface LessonPreviewProps {
  preview: LessonPreviewModel | null;
  onBack: () => void;
}

function isHeading(block: PreviewBlock) {
  if (block.kind !== "paragraph") {
    return false;
  }
  return /^(NỘI DUNG|III\.\s*KẾT THÚC|[IVXLC]+\.\s|[0-9]+\.\s|[a-z]\)\s)/i.test(block.textPreview.trim());
}

function blockClassName(block: PreviewBlock) {
  if (block.id === "generated-conclusion-title") {
    return "rounded-xl border border-sage-border bg-white px-4 py-3 text-base font-bold font-serif text-accent text-center shadow-sm mt-8";
  }
  if (block.id === "generated-conclusion-subtitle") {
    return "rounded-xl border border-sage-border/60 bg-[#FAF9F6] px-4 py-2.5 text-sm font-semibold italic text-accent";
  }
  if (block.isDiagram || block.id === "generated-diagram-block") {
    return "p-0 border-0 bg-transparent shadow-none";
  }
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

function DiagramVisualPreview({
  diagram,
  svg
}: {
  diagram?: LessonPreviewModel["diagramData"];
  svg?: string;
}) {
  if (svg) {
    return (
      <div className="rounded-2xl border border-sage-border bg-white p-4 md:p-6 shadow-sm overflow-x-auto flex justify-center">
        <div
          className="w-full max-w-4xl"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>
    );
  }

  if (!diagram || !diagram.sections || diagram.sections.length === 0) {
    return (
      <div className="p-6 text-center text-xs text-ink/50 italic bg-white rounded-2xl border border-sage-border">
        [Sơ đồ khối nội dung bài giảng]
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-sage-border bg-white p-6 md:p-8 shadow-sm overflow-x-auto space-y-6">
      {/* Root Box (Purple, rounded, white bold text) */}
      <div className="flex justify-center">
        <div className="bg-[#7462E0] text-white rounded-2xl px-6 py-3.5 max-w-sm text-center shadow-md border border-[#6351D0]">
          <div className="font-serif font-black text-sm md:text-base leading-snug">
            {diagram.title}
          </div>
        </div>
      </div>

      {/* Sections and Children Tree */}
      <div className="grid grid-cols-1 md:grid-flow-col gap-6 justify-center pt-2">
        {diagram.sections.map((sec, sIdx) => (
          <div key={sIdx} className="space-y-4 flex flex-col items-center min-w-[240px] max-w-xs">
            {/* Level 1: Section Box */}
            <div className="w-full bg-white border-2 border-slate-600 rounded-lg p-3 text-center shadow-xs">
              <span className="font-serif font-bold text-xs text-slate-800 leading-snug block">
                {sec.title}
              </span>
            </div>

            {/* Level 2: Children Leaf Boxes */}
            {sec.children && sec.children.length > 0 && (
              <div className="w-full space-y-2.5">
                {sec.children.map((child, cIdx) => (
                  <div
                    key={cIdx}
                    className="w-full bg-white border border-blue-300 rounded-xl p-2.5 text-center shadow-2xs hover:border-blue-500 transition-colors"
                  >
                    <span className="text-xs text-slate-700 leading-relaxed block font-sans">
                      {child}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
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
                  {block.isDiagram || block.id === "generated-diagram-block" ? (
                    <DiagramVisualPreview diagram={preview?.diagramData} svg={preview?.diagramSvg} />
                  ) : block.kind === "table" ? (
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
