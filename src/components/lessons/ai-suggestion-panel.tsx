import type { AnchorPreview } from "../../lib/schemas/lesson";

interface AiSuggestionPanelProps {
  anchors: AnchorPreview[];
  isLoading: boolean;
  onGenerate: () => void;
}

export function AiSuggestionPanel({
  anchors,
  isLoading,
  onGenerate
}: AiSuggestionPanelProps) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Neo chèn AI</h2>
        <button
          className="rounded-full border border-amber-400 px-3 py-2 text-xs font-medium uppercase tracking-[0.2em] text-amber-700"
          onClick={onGenerate}
          type="button"
        >
          {isLoading ? "Đang sinh..." : "Sinh AI"}
        </button>
      </div>
      <div className="mt-4 space-y-2">
        {anchors.map((anchor) => (
          <div
            key={anchor.id}
            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            <div className="font-medium">{anchor.label}</div>
            <div className="text-xs uppercase tracking-[0.16em] text-amber-700">
              {anchor.kind}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
