interface ProviderStatusBadgeProps {
  label: string;
  status: "ready" | "offline";
}

export function ProviderStatusBadge({
  label,
  status
}: ProviderStatusBadgeProps) {
  const isReady = status === "ready";

  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border ${
        isReady
          ? "bg-accent/10 border-accent/20 text-accent"
          : "bg-rose-50 border-rose-200 text-rose-700"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isReady ? "bg-accent" : "bg-rose-500"}`}></span>
      {label}: {isReady ? "Sẵn sàng" : "Ngoại tuyến"}
    </span>
  );
}
