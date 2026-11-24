import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";

interface KpiDelta {
  value: number | null | undefined;
  /** "lower_is_better" untuk waktu resolusi; default "higher_is_better" */
  better?: "higher_is_better" | "lower_is_better";
  suffix?: string;
  /** Jumlah angka di belakang koma (default 1). */
  precision?: number;
}

interface KpiCardProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  delta?: KpiDelta;
  href?: string;
  loading?: boolean;
}

function DeltaView({ delta }: { delta: KpiDelta }) {
  const { value, better = "higher_is_better", suffix = "", precision = 1 } = delta;
  if (value == null || !Number.isFinite(value)) {
    return <span className="text-[11px] text-text-muted">—</span>;
  }
  const good = better === "lower_is_better" ? value < 0 : value > 0;
  const bad = better === "lower_is_better" ? value > 0 : value < 0;
  const neutral = value === 0;
  const Icon = neutral ? Minus : value > 0 ? ArrowUp : ArrowDown;
  const color = neutral
    ? "text-text-muted"
    : good
      ? "text-emerald-400"
      : bad
        ? "text-red-400"
        : "text-text-muted";
  const abs = Math.abs(value);
  const text = `${value > 0 ? "+" : value < 0 ? "-" : ""}${abs.toFixed(precision)}${suffix}`;
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${color}`}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      <span>{text}</span>
      <span className="text-text-muted font-normal">vs periode lalu</span>
    </span>
  );
}

export function KpiCard({ label, value, icon, delta, href, loading }: KpiCardProps) {
  const body = (
    <div className="rounded-2xl border border-border bg-card/80 p-4 backdrop-blur-sm transition-colors hover:border-accent/30">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-text-muted">{label}</p>
          <div className="mt-1 text-2xl font-semibold tracking-tight text-text-primary">
            {loading ? <div className="h-8 w-20 animate-pulse rounded bg-white/10" /> : value}
          </div>
        </div>
        {icon ? (
          <div className="rounded-xl border border-border/60 bg-white/5 p-2 text-text-muted">
            {icon}
          </div>
        ) : null}
      </div>
      <div className="mt-3 min-h-[18px]">
        {loading ? (
          <div className="h-3 w-28 animate-pulse rounded bg-white/10" />
        ) : delta ? (
          <DeltaView delta={delta} />
        ) : null}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-2xl">
        {body}
      </Link>
    );
  }
  return body;
}
