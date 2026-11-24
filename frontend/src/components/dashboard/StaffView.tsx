"use client";

import { useEffect, useMemo, useState } from "react";
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
import { AlertTriangle, CalendarCheck, CheckCircle2, ClipboardList, Clock, FolderKanban, Timer } from "lucide-react";
import {
  DailyTask,
  getMyPerformance,
  getMyPermissions,
  getMyTrend,
  listDailyTasks,
  listProjects,
  listTickets,
  MyPerformance,
  ProjectSummary,
  Ticket,
  TrendPoint,
} from "@/lib/api";
import { KpiCard } from "./KpiCard";
import { SectionCard } from "./SectionCard";
import { StatusBadge, statusVariantFromTicket } from "./StatusBadge";
import { formatDuration, formatTanggalIndonesia } from "./format";

const tooltipStyle = { background: "#1A1A1A", border: "1px solid #333", borderRadius: 8, fontSize: 12, color: "#F5F5F5" };

function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function sisaSla(t: Ticket) {
  if (!t.sla_deadline) return Number.POSITIVE_INFINITY;
  return new Date(t.sla_deadline).getTime() - Date.now();
}

export function StaffView({ token, userId, refreshKey }: { token: string | null; userId: string; refreshKey: number }) {
  const [work, setWork] = useState<Ticket[]>([]);
  const [perf, setPerf] = useState<MyPerformance | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [daily, setDaily] = useState<DailyTask[]>([]);
  const [projectLate, setProjectLate] = useState<ProjectSummary[]>([]);
  const [canProject, setCanProject] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getMyPermissions(token)
      .then((perms) => !cancelled && setCanProject((perms || []).some((p) => p.module_code === "project" && p.is_active && p.access_level !== "none")))
      .catch(() => !cancelled && setCanProject(false));
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    Promise.allSettled([
      listTickets(token, { assigneeId: userId }),
      getMyPerformance(token),
      getMyTrend(token, 7),
      listDailyTasks(token, { from: todayISO(), to: todayISO(), staff_id: userId }),
      canProject ? listProjects(token) : Promise.resolve([]),
    ]).then(([t, p, tr, d, pr]) => {
      if (cancelled) return;
      if (t.status === "fulfilled") {
        setWork((t.value || []).filter((x) => ["claimed", "in_progress", "assigned"].includes(x.status)).sort((a, b) => sisaSla(a) - sisaSla(b)).slice(0, 8));
      }
      if (p.status === "fulfilled") setPerf(p.value);
      if (tr.status === "fulfilled") setTrend(tr.value || []);
      if (d.status === "fulfilled") setDaily(d.value || []);
      if (pr.status === "fulfilled") setProjectLate((pr.value || []).filter((x) => (x.late_tasks || 0) > 0).slice(0, 5));
    });
    return () => { cancelled = true; };
  }, [token, userId, canProject, refreshKey]);

  const kpis = useMemo(
    () => [
      { label: "Sedang Dikerjakan", value: perf?.current_workload ?? "—", icon: <ClipboardList className="h-4 w-4" /> },
      { label: "Tiket Selesai", value: perf?.tickets_resolved ?? "—", icon: <CheckCircle2 className="h-4 w-4" /> },
      { label: "Rata-rata Waktu", value: formatDuration(perf?.avg_resolution_minutes), icon: <Timer className="h-4 w-4" /> },
      { label: "Kepatuhan SLA", value: perf?.sla_compliance_rate == null ? "—" : `${Math.round(perf.sla_compliance_rate)}%`, icon: <Clock className="h-4 w-4" /> },
    ],
    [perf]
  );

  return (
    <div className="space-y-6">
      <SectionCard title="Tugas saya hari ini" description={`${formatTanggalIndonesia(todayISO())} · urut berdasarkan sisa SLA`} action={<CalendarCheck className="h-4 w-4 text-text-muted" />}>
        <div className="grid gap-4 lg:grid-cols-3">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Tiket aktif</p>
            {work.length === 0 ? <p className="text-xs text-text-muted">Tidak ada tiket aktif.</p> : (
              <ul className="space-y-2">
                {work.map((t) => {
                  const ms = sisaSla(t);
                  const late = ms < 0;
                  const urgent = ms < 4 * 3600000 && !late;
                  return (
                    <li key={t.id}>
                      <Link href={`/tickets/${t.id}`} className="block rounded-lg border border-border/60 px-3 py-2 text-xs hover:border-accent/40">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-text-muted">{t.ticket_code || "—"}</span>
                          <span className={late ? "font-medium text-red" : urgent ? "font-medium text-amber" : "text-text-muted"}>
                            {Number.isFinite(ms) ? late ? `Lewat ${formatDuration(Math.abs(ms) / 60000)}` : `Sisa ${formatDuration(ms / 60000)}` : "Tanpa SLA"}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-text-primary">{t.title}</p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Task project jatuh tempo</p>
            {!canProject ? <p className="text-xs text-text-muted">Modul project tidak tersedia.</p> : projectLate.length === 0 ? <p className="text-xs text-text-muted">Tidak ada task terlambat.</p> : (
              <ul className="space-y-2">
                {projectLate.map((p) => (
                  <li key={p.ticket.id}>
                    <Link href={`/project/${p.ticket.id}`} className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-xs hover:border-red/40">
                      <span className="min-w-0 truncate text-text-primary"><FolderKanban className="mr-1 inline h-3 w-3 text-text-muted" />{p.ticket.title}</span>
                      <span className="shrink-0 font-medium text-red">{p.late_tasks} terlambat</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Daily task hari ini</p>
            {daily.length === 0 ? <p className="text-xs text-text-muted">Belum ada daily task.</p> : (
              <ul className="space-y-2">
                {daily.slice(0, 5).map((d) => (
                  <li key={d.id} className="rounded-lg border border-border/60 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-text-primary">{d.issue}</span>
                      <StatusBadge variant={d.end_at ? "selesai" : "berjalan"} label={d.end_at ? "Selesai" : "Berjalan"} />
                    </div>
                    <p className="mt-1 text-[11px] text-text-muted">{d.unit_name || "—"} · {d.reporter_name}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => <KpiCard key={k.label} label={k.label} value={k.value} icon={k.icon} />)}
      </div>

      <SectionCard title="Tren tiket saya" description="7 hari terakhir">
        <div className="h-56 w-full" aria-label={`Grafik tren tiket pribadi, ${trend.length} titik data`}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="myCreatedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#D5575E" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#D5575E" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#333" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#B0B0B0", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: string) => v.slice(5)} />
              <YAxis tick={{ fill: "#B0B0B0", fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(v) => formatTanggalIndonesia(String(v))} />
              <Area type="monotone" dataKey="created" name="Dibuat" stroke="#D5575E" strokeWidth={2} fill="url(#myCreatedGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>
    </div>
  );
}
