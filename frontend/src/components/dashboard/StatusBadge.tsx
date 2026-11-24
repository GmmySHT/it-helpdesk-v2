type StatusVariant = "selesai" | "berjalan" | "menunggu" | "terlambat" | "netral";

const VARIANT_CLASS: Record<StatusVariant, string> = {
  selesai: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  berjalan: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  menunggu: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  terlambat: "bg-red-500/15 text-red-400 border-red-500/30",
  netral: "bg-slate-500/15 text-slate-300 border-slate-500/30",
};

const DOT_CLASS: Record<StatusVariant, string> = {
  selesai: "bg-emerald-400",
  berjalan: "bg-blue-400",
  menunggu: "bg-amber-400",
  terlambat: "bg-red-400",
  netral: "bg-slate-400",
};

interface StatusBadgeProps {
  variant: StatusVariant;
  label: string;
  className?: string;
}

export function StatusBadge({ variant, label, className = "" }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none ${VARIANT_CLASS[variant]} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[variant]}`} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export function statusVariantFromTicket(status: string): StatusVariant {
  switch (status) {
    case "closed":
    case "done":
    case "selesai":
      return "selesai";
    case "in_progress":
    case "dikerjakan":
    case "berjalan":
      return "berjalan";
    case "pending_approval":
    case "pending_review":
    case "menunggu_persetujuan":
    case "menunggu":
    case "submitted":
      return "menunggu";
    case "overdue":
    case "terlambat":
    case "rejected":
    case "ditolak":
      return "terlambat";
    default:
      return "netral";
  }
}
