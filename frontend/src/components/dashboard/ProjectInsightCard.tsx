"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, FolderKanban, AlertTriangle } from "lucide-react";
import { getMyPermissions, getProjectDashboard, listProjects, ProjectDashboard, ProjectSummary } from "@/lib/api";
import { SectionCard } from "./SectionCard";

export function ProjectInsightCard({ token, refreshKey }: { token: string | null; refreshKey: number }) {
  const [dash, setDash] = useState<ProjectDashboard | null>(null);
  const [late, setLate] = useState<ProjectSummary[]>([]);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getMyPermissions(token)
      .then((perms) => {
        if (cancelled) return;
        setAllowed((perms || []).some((p) => p.module_code === "project" && p.is_active && p.access_level !== "none"));
      })
      .catch(() => !cancelled && setAllowed(false));
    return () => { cancelled = true; };
  }, [token]);

  useEffect(() => {
    if (!token || !allowed) return;
    let cancelled = false;
    Promise.allSettled([getProjectDashboard(token), listProjects(token)]).then(([d, p]) => {
      if (cancelled) return;
      if (d.status === "fulfilled") setDash(d.value || null);
      if (p.status === "fulfilled") setLate((p.value || []).filter((x) => (x.late_tasks || 0) > 0).slice(0, 4));
    });
    return () => { cancelled = true; };
  }, [token, allowed, refreshKey]);

  if (!allowed) return null;

  const done = dash?.done_tasks || 0;
  const total = dash?.total_tasks || 0;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <SectionCard
      title="Project"
      description="Pekerjaan project terpisah dari tiket biasa"
      action={<Link href="/project" className="inline-flex items-center gap-1 text-xs text-accent hover:opacity-70">Lihat semua <ArrowUpRight className="h-3 w-3" /></Link>}
    >
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total Project", value: dash?.total },
          { label: "Menunggu", value: dash?.menunggu },
          { label: "Berjalan", value: dash?.berjalan },
          { label: "Tugas Selesai", value: dash ? `${done}/${total}` : undefined },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-border bg-card-hover px-3 py-2.5">
            <p className="text-[11px] uppercase tracking-wide text-text-muted">{item.label}</p>
            <p className="mt-1 text-lg font-semibold text-text-primary">{item.value ?? "—"}</p>
          </div>
        ))}
      </div>

      <div className="mb-2 flex items-center justify-between text-[11px] text-text-muted">
        <span>Progres tugas project</span>
        <span className="font-semibold text-accent">{percent}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-card-hover" role="img" aria-label={`Progres tugas project ${percent}%`}>
        <div className="progress-liquid h-full rounded-full bg-gradient-to-r from-accent to-accent-dark transition-all duration-1000" style={{ width: `${percent}%` }} />
      </div>

      {late.length > 0 && (
        <div className="mt-4 rounded-lg border border-red/25 bg-red/5 p-3">
          <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-red">
            <AlertTriangle className="h-3.5 w-3.5" /> Tugas project terlambat
          </p>
          <div className="space-y-1.5">
            {late.map((p) => (
              <Link key={p.ticket.id} href={`/project/${p.ticket.id}`} className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2 text-xs hover:border-red/40">
                <span className="truncate text-text-primary"><span className="mr-2 font-mono text-text-muted">{p.ticket.ticket_code}</span>{p.ticket.title}</span>
                <span className="shrink-0 font-semibold text-red">{p.late_tasks} terlambat</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <p className="sr-only"><FolderKanban aria-hidden="true" /> Ringkasan project</p>
    </SectionCard>
  );
}
