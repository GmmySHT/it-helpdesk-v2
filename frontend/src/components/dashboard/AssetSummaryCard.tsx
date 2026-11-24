"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Boxes, Clock, Package, Wrench } from "lucide-react";
import { AssetBorrowing, getBorrowedCount, listAssets, listBorrowings, listOverdueBorrowings } from "@/lib/api";
import { SectionCard } from "./SectionCard";

export function AssetSummaryCard({ token, refreshKey }: { token: string | null; refreshKey: number }) {
  const [stats, setStats] = useState({ total: 0, available: 0, borrowed: 0, needsRepair: 0, broken: 0 });
  const [pending, setPending] = useState(0);
  const [overdue, setOverdue] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([
      listAssets(token, undefined, undefined, 1, 0),
      listAssets(token, undefined, "available", 1, 0),
      getBorrowedCount(token),
      listAssets(token, undefined, "needs_repair", 1, 0),
      listAssets(token, undefined, "broken", 1, 0),
      listBorrowings(token, "pending_approval", undefined, 5, 0),
      listOverdueBorrowings(token),
    ]).then(([all, avail, borrowed, repair, broken, pend, over]) => {
      if (cancelled) return;
      if (all.status === "fulfilled") setStats((s) => ({ ...s, total: all.value.total || 0 }));
      if (avail.status === "fulfilled") setStats((s) => ({ ...s, available: avail.value.total || 0 }));
      if (borrowed.status === "fulfilled") setStats((s) => ({ ...s, borrowed: borrowed.value.count || 0 }));
      if (repair.status === "fulfilled") setStats((s) => ({ ...s, needsRepair: repair.value.total || 0 }));
      if (broken.status === "fulfilled") setStats((s) => ({ ...s, broken: broken.value.total || 0 }));
      if (pend.status === "fulfilled") setPending(pend.value.total || 0);
      if (over.status === "fulfilled") setOverdue((over.value || []).length);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [token, refreshKey]);

  return (
    <SectionCard title="Aset IT" description="Ringkasan inventaris" action={<Link href="/asset" className="text-xs text-accent hover:opacity-70">Kelola <span aria-hidden="true">→</span></Link>}>
      {loading ? (
        <div className="h-20 animate-pulse rounded bg-white/5" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: "Total", value: stats.total, icon: <Boxes className="h-4 w-4" /> },
              { label: "Tersedia", value: stats.available, icon: <Package className="h-4 w-4" /> },
              { label: "Dipinjam", value: stats.borrowed, icon: <Clock className="h-4 w-4" /> },
              { label: "Perlu Perbaikan", value: stats.needsRepair, icon: <Wrench className="h-4 w-4" /> },
              { label: "Rusak", value: stats.broken, icon: <Wrench className="h-4 w-4" /> },
            ].map((x) => (
              <div key={x.label} className="rounded-lg bg-page p-3 text-center">
                <div className="flex justify-center text-text-muted">{x.icon}</div>
                <p className="mt-1 text-xl font-semibold text-text-primary">{x.value}</p>
                <p className="text-[11px] uppercase tracking-wide text-text-muted">{x.label}</p>
              </div>
            ))}
          </div>
          {(pending > 0 || overdue > 0) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {pending > 0 && (
                <Link href="/asset/borrowings?status=pending_approval" className="flex items-center gap-1.5 rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-[11px] text-amber">
                  <Clock className="h-3 w-3" /> {pending} menunggu persetujuan
                </Link>
              )}
              {overdue > 0 && (
                <Link href="/asset/borrowings?status=overdue" className="flex items-center gap-1.5 rounded-md border border-red/30 bg-red/10 px-3 py-2 text-[11px] text-red">
                  <Clock className="h-3 w-3" /> {overdue} peminjaman terlambat
                </Link>
              )}
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}
