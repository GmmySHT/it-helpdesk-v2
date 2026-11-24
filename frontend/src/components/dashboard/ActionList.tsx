import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface ActionItem {
  key: string;
  label: string;
  count: number;
  href: string;
}

interface ActionListProps {
  items: ActionItem[];
  loading?: boolean;
  emptyText?: string;
}

export function ActionList({
  items,
  loading,
  emptyText = "Tidak ada yang perlu ditindak",
}: ActionListProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl bg-white/5" />
        ))}
      </div>
    );
  }

  const visible = items.filter((i) => i.count > 0);
  if (visible.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-center text-sm text-text-muted">
        {emptyText}
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {visible.map((item) => (
        <li key={item.key}>
          <Link
            href={item.href}
            className="group flex items-center gap-3 rounded-xl border border-border/60 bg-white/[0.02] px-4 py-3 transition-colors hover:border-accent/30 hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span className="inline-flex min-w-[2rem] items-center justify-center rounded-lg bg-accent/15 px-2 py-1 text-sm font-semibold text-accent">
              {item.count}
            </span>
            <span className="min-w-0 flex-1 text-sm text-text-primary">{item.label}</span>
            <span className="inline-flex items-center gap-1 text-xs text-text-muted group-hover:text-accent">
              Buka <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
