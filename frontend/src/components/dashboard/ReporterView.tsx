"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  Clock,
  HelpCircle,
  Package,
  Star,
  Ticket as TicketIcon,
  X,
} from "lucide-react";
import {
  AssetBorrowing,
  getMyCreatorStats,
  getUnratedTickets,
  listMyBorrowings,
  listTickets,
  Ticket,
  UnratedTicket,
} from "@/lib/api";
import { KpiCard } from "./KpiCard";
import { SectionCard } from "./SectionCard";
import { StatusBadge, statusVariantFromTicket } from "./StatusBadge";
import { formatTanggalIndonesia } from "./format";

const STATUS_LABEL: Record<string, string> = {
  pending_approval: "Menunggu Persetujuan",
  unassigned: "Belum Ditugaskan",
  assigned: "Menunggu Diklaim",
  claimed: "Sedang Dikerjakan",
  in_progress: "Sedang Dikerjakan",
  resolved: "Menunggu Review",
  closed: "Selesai",
  rejected: "Ditolak",
};

const HELP_KEY = "dashboard-help-dismissed";

export function ReporterView({ token, userId, refreshKey }: { token: string | null; userId: string; refreshKey: number }) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [myTickets, setMyTickets] = useState<Ticket[]>([]);
  const [unrated, setUnrated] = useState<UnratedTicket[]>([]);
  const [borrowings, setBorrowings] = useState<AssetBorrowing[]>([]);
  const [loading, setLoading] = useState(true);
  const [helpOpen, setHelpOpen] = useState(true);

  useEffect(() => {
    try {
      setHelpOpen(localStorage.getItem(HELP_KEY) !== "1");
    } catch {
      // localStorage bisa diblokir; biarkan default
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([
      getMyCreatorStats(token),
      listTickets(token, { reporterId: userId }),
      getUnratedTickets(token),
      listMyBorrowings(token, userId, 5),
    ]).then(([c, t, u, b]) => {
      if (cancelled) return;
      if (c.status === "fulfilled") setCounts(c.value || {});
      if (t.status === "fulfilled") setMyTickets((t.value || []).slice(0, 5));
      if (u.status === "fulfilled") setUnrated(u.value || []);
      if (b.status === "fulfilled") setBorrowings((b.value.data || []).filter((x) => x.status !== "returned" && x.status !== "rejected"));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [token, userId, refreshKey]);

  const kpis = useMemo(() => {
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const digerjakan = ["assigned", "claimed", "in_progress"].reduce((a, k) => a + (counts[k] || 0), 0);
    const review = ["resolved", "pending_approval"].reduce((a, k) => a + (counts[k] || 0), 0);
    const selesai = counts.closed || 0;
    return [
      { label: "Total Laporan", value: total, icon: <TicketIcon className="h-4 w-4" />, href: "/tickets" },
      { label: "Sedang Diproses", value: digerjakan, icon: <Clock className="h-4 w-4" />, href: "/tickets?status=claimed" },
      { label: "Menunggu Review", value: review, icon: <BellRing className="h-4 w-4" />, href: "/tickets?status=resolved" },
      { label: "Selesai", value: selesai, icon: <CheckCircle2 className="h-4 w-4" />, href: "/tickets?status=closed" },
    ];
  }, [counts]);

  const dismissHelp = () => {
    setHelpOpen(false);
    try { localStorage.setItem(HELP_KEY, "1"); } catch { /* ignore */ }
  };

  return (
    <div className="space-y-6">
      {unrated.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber/30 bg-amber/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <Star className="h-5 w-5 shrink-0 text-amber" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-text-primary">Perlu aksi Anda</p>
              <p className="text-xs text-text-muted">
                {unrated.length} tiket selesai belum diberi rating. {unrated[0].ticket_code} — {unrated[0].title}
              </p>
            </div>
          </div>
          <Link
            href={`/tickets/${unrated[0].id}?rate=1`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white hover:bg-accent-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Star className="h-3.5 w-3.5" /> Beri Rating
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <KpiCard key={k.label} label={k.label} value={k.value} icon={k.icon} href={k.href} loading={loading} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Tiket saya" description="5 laporan terbaru" action={<Link href="/tickets" className="text-xs text-accent">Lihat semua <ArrowRight className="inline h-3 w-3" /></Link>}>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-white/5" />)}</div>
          ) : myTickets.length === 0 ? (
            <p className="text-sm text-text-muted">Belum ada laporan.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[400px] text-left text-xs">
                <thead className="text-[11px] uppercase tracking-wide text-text-muted">
                  <tr><th className="py-2">Kode</th><th className="py-2">Judul</th><th className="py-2">Status</th><th className="py-2">Update</th></tr>
                </thead>
                <tbody>
                  {myTickets.map((t) => (
                    <tr key={t.id} className="border-t border-border/60">
                      <td className="py-2.5 font-mono text-text-muted">{t.ticket_code || "—"}</td>
                      <td className="max-w-[180px] truncate py-2.5 pr-2 text-text-primary"><Link href={`/tickets/${t.id}`} className="hover:text-accent">{t.title}</Link></td>
                      <td className="py-2.5"><StatusBadge variant={statusVariantFromTicket(t.status)} label={STATUS_LABEL[t.status] || t.status} /></td>
                      <td className="py-2.5 text-text-muted">{formatTanggalIndonesia(t.updated_at || t.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="Peminjaman aktif" description="Aset yang sedang Anda pinjam" action={<Package className="h-4 w-4 text-text-muted" />}>
            {loading ? (
              <div className="h-16 animate-pulse rounded bg-white/5" />
            ) : borrowings.length === 0 ? (
              <p className="text-sm text-text-muted">Tidak ada peminjaman aktif. <Link href="/asset/borrowings/new" className="text-accent">Pinjam aset</Link></p>
            ) : (
              <ul className="space-y-2">
                {borrowings.map((b) => {
                  const daysLeft = Math.ceil((new Date(b.return_deadline).getTime() - Date.now()) / 86400000);
                  const late = daysLeft < 0;
                  const soon = daysLeft <= 2 && !late;
                  return (
                    <li key={b.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2 text-xs">
                      <span className="min-w-0 truncate text-text-primary">{b.asset_name || b.asset_code}</span>
                      <span className={`shrink-0 font-medium ${late ? "text-red" : soon ? "text-amber" : "text-text-muted"}`}>
                        {late ? `Terlambat ${Math.abs(daysLeft)} hari` : `${daysLeft} hari lagi`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>

          {helpOpen && (
            <section className="rounded-xl border border-border bg-card p-5" aria-label="Bantuan">
              <div className="flex items-start justify-between gap-3">
                <div className="flex gap-3">
                  <HelpCircle className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
                  <div>
                    <h2 className="text-sm font-semibold text-text-primary">Butuh bantuan?</h2>
                    <p className="mt-1 text-xs leading-relaxed text-text-muted">
                      Laporkan kendala lewat <Link href="/tickets?create=1" className="text-accent">Buat Tiket</Link>. Pantau progres lewat menu Tiket, dan beri rating setelah selesai.
                    </p>
                  </div>
                </div>
                <button onClick={dismissHelp} aria-label="Tutup bantuan" className="rounded p-1 text-text-muted hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
