"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  ClipboardCheck,
  FolderKanban,
  Package,
  Star,
  Ticket as TicketIcon,
  Timer,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  ActionItem,
  getDashboardActionItems,
  getMyPermissions,
  getStaffPerformance,
  getStatsSummary,
  getTrend,
  PeriodStats,
  StatsSummary,
  StaffPerformance,
  TrendPoint,
} from "@/lib/api";
import { ActionList } from "./ActionList";
import { KpiCard } from "./KpiCard";
import { SectionCard } from "./SectionCard";
import { StatusBadge } from "./StatusBadge";
import { formatDuration, formatTanggalIndonesia } from "./format";
import { ProjectInsightCard } from "./ProjectInsightCard";
import { AssetSummaryCard } from "./AssetSummaryCard";

type Days = 7 | 30 | 90;

const STATUS_META: Record<string, { label: string; variant: "selesai" | "berjalan" | "menunggu" | "terlambat" | "netral"; color: string; href: string }> = {
  pending_approval: { label: "Menunggu Persetujuan", variant: "menunggu", color: "#A78BFA", href: "/tickets?status=pending_approval" },
  unassigned: { label: "Belum Ditugaskan", variant: "netral", color: "#64748B", href: "/tickets?status=unassigned" },
  assigned: { label: "Menunggu Diklaim", variant: "menunggu", color: "#F5A623", href: "/tickets?status=assigned" },
  claimed: { label: "Sedang Dikerjakan", variant: "berjalan", color: "#3B82F6", href: "/tickets?status=claimed" },
  resolved: { label: "Menunggu Review", variant: "berjalan", color: "#60A5FA", href: "/tickets?status=resolved" },
  closed: { label: "Selesai", variant: "selesai", color: "#10B981", href: "/tickets?status=closed" },
};

const chartTooltipStyle = {
  background: "#1A1A1A",
  border: "1px solid #333",
  borderRadius: 8,
  fontSize: 12,
  color: "#F5F5F5",
};

function delta(current: number | null | undefined, previous: number | null | undefined) {
  if (current == null || previous == null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** Hitung SLA compliance dari angka lama (rumus tidak diubah). */
function legacySla(s: StatsSummary | null) {
  if (!s || s.total_resolved_or_closed === 0) return null;
  return (s.within_sla_count / s.total_resolved_or_closed) * 100;
}

export function LeaderView({ token, refreshKey }: { token: string | null; refreshKey: number }) {
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [summaryPeriod, setSummaryPeriod] = useState<StatsSummary | null>(null);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [staff, setStaff] = useState<StaffPerformance[]>([]);
  const [days, setDays] = useState<Days>(7);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([
      getStatsSummary(token),
      getStatsSummary(token, days),
      getDashboardActionItems(token),
      getTrend(token, days),
      getStaffPerformance(token),
    ]).then(([legacyRes, periodRes, actionRes, trendRes, staffRes]) => {
      if (cancelled) return;
      if (legacyRes.status === "fulfilled") setSummary(legacyRes.value);
      if (periodRes.status === "fulfilled") setSummaryPeriod(periodRes.value);
      if (actionRes.status === "fulfilled") setActions(actionRes.value.items || []);
      if (trendRes.status === "fulfilled") setTrend(trendRes.value || []);
      if (staffRes.status === "fulfilled") setStaff(staffRes.value || []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [token, days, refreshKey]);

  const current: PeriodStats | null = summaryPeriod?.period ?? null;
  const previous: PeriodStats | null = summaryPeriod?.previous ?? null;

  const kpis = useMemo(
    () => [
      {
        label: "Total Tiket",
        value: summary?.total_tickets ?? "—",
        icon: <TicketIcon className="h-4 w-4" />,
        href: "/tickets",
        delta: delta(current?.total_tickets, previous?.total_tickets),
      },
      {
        label: "Kepatuhan SLA",
        value: legacySla(summary) == null ? "—" : `${Math.round(legacySla(summary)!)}%`,
        icon: <ClipboardCheck className="h-4 w-4" />,
        href: "/tickets?at_risk=1",
        delta: delta(current?.sla_compliance, previous?.sla_compliance),
      },
      {
        label: "Rata-rata Resolusi",
        value: formatDuration(summary?.avg_resolution_minutes),
        icon: <Timer className="h-4 w-4" />,
        href: "/reports/kpi",
        delta: delta(current?.avg_resolution_minutes, previous?.avg_resolution_minutes),
        better: "lower_is_better" as const,
      },
      {
        label: "Rating Kepuasan",
        value: summary?.avg_rating_score == null ? "—" : summary.avg_rating_score.toFixed(1),
        icon: <Star className="h-4 w-4" />,
        href: "/reports/kpi",
        delta: delta(current?.avg_rating, previous?.avg_rating),
      },
    ],
    [summary, current, previous]
  );

  const statusEntries = Object.entries(STATUS_META).map(([key, meta]) => ({
    key,
    ...meta,
    count: summary?.by_status?.[key] ?? 0,
  }));
  const statusTotal = statusEntries.reduce((a, b) => a + b.count, 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <KpiCard
            key={k.label}
            label={k.label}
            value={k.value}
            icon={k.icon}
            href={k.href}
            loading={loading}
            delta={k.delta == null ? undefined : { value: k.delta, better: k.better, suffix: "%", precision: 1 }}
          />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Perlu Tindakan"
          description="Item yang menunggu keputusan Anda"
          action={<AlertTriangle className="h-4 w-4 text-amber" aria-hidden="true" />}
        >
          <ActionList items={actions} loading={loading} />
        </SectionCard>

        <SectionCard
          title="Tren Tiket"
          description="Dibuat vs diselesaikan"
          action={
            <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label="Rentang tren">
              {([7, 30, 90] as Days[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(d)}
                  aria-pressed={days === d}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    days === d ? "bg-accent text-white" : "text-text-muted hover:text-text-primary"
                  }`}
                >
                  {d}h
                </button>
              ))}
            </div>
          }
        >
          <div
            className="h-56 w-full"
            aria-label={`Grafik tren tiket ${days} hari terakhir: ${trend.length} titik data`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="createdGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#D5575E" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#D5575E" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="resolvedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#B62A2D" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#B62A2D" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#333" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#B0B0B0", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: string) => v.slice(5)}
                  interval={Math.max(0, Math.floor(trend.length / 6) - 1)}
                />
                <YAxis tick={{ fill: "#B0B0B0", fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={chartTooltipStyle} labelFormatter={(v) => formatTanggalIndonesia(String(v))} />
                <Area type="monotone" dataKey="created" name="Dibuat" stroke="#D5575E" strokeWidth={2} fill="url(#createdGrad)" />
                <Area type="monotone" dataKey="resolved" name="Diselesaikan" stroke="#E6A8A8" strokeWidth={2} fill="url(#resolvedGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex items-center gap-4 text-[11px] text-text-muted">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#D5575E]" /> Dibuat</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#E6A8A8]" /> Diselesaikan</span>
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Status Tiket" description="Klik status untuk membuka daftar">
          {loading ? (
            <div className="h-20 animate-pulse rounded bg-white/5" />
          ) : statusTotal === 0 ? (
            <p className="text-sm text-text-muted">Belum ada tiket.</p>
          ) : (
            <>
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/5" role="img" aria-label="Distribusi status tiket">
                {statusEntries.filter((s) => s.count > 0).map((s) => (
                  <div key={s.key} style={{ width: `${(s.count / statusTotal) * 100}%`, background: s.color }} title={`${s.label}: ${s.count}`} />
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {statusEntries.map((s) => (
                  <Link
                    key={s.key}
                    href={s.href}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-xs transition-colors hover:border-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <StatusBadge variant={s.variant} label={s.label} />
                    <span className="font-semibold text-text-primary">{s.count}</span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </SectionCard>

        <ProjectInsightCard token={token} refreshKey={refreshKey} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Performa Staf" description="Kepatuhan SLA per staf">
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-8 animate-pulse rounded bg-white/5" />)}</div>
          ) : staff.length === 0 ? (
            <p className="text-sm text-text-muted">Belum ada data performa.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[440px] text-left text-xs">
                <thead className="text-[11px] uppercase tracking-wide text-text-muted">
                  <tr><th className="py-2">Staf</th><th className="py-2">Selesai</th><th className="py-2">Rata-rata</th><th className="py-2">SLA</th></tr>
                </thead>
                <tbody>
                  {staff.map((s) => {
                    const low = s.sla_compliance_rate < 80;
                    return (
                      <tr key={s.staff_id} className="border-t border-border/60">
                        <td className="py-2.5 pr-2 text-text-primary">{s.staff_name}</td>
                        <td className="py-2.5 text-text-primary">{s.tickets_resolved}</td>
                        <td className="py-2.5 text-text-primary">{formatDuration(s.avg_resolution_minutes)}</td>
                        <td className={`py-2.5 font-medium ${low ? "text-amber" : "text-text-primary"}`}>
                          {s.sla_compliance_rate == null ? "—" : `${Math.round(s.sla_compliance_rate)}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <AssetSummaryCard token={token} refreshKey={refreshKey} />
      </div>
    </div>
  );
}
