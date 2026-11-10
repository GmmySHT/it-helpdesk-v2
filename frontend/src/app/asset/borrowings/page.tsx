"use client";

import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/page-header";
import {
  listBorrowings,
  approveBorrowing,
  rejectBorrowing,
  handoverBorrowing,
  returnBorrowing,
  listOverdueBorrowings,
  AssetBorrowing,
  ReturnConditionEnum,
} from "@/lib/api";
import { Sidebar } from "@/components/sidebar";

const STATUS_COLORS: Record<string, string> = {
  pending_approval: "bg-amber/20 text-amber border-amber/30",
  approved: "bg-green/20 text-green border-green/30",
  borrowed: "bg-blue-500/20 text-blue-500 border-blue-500/30",
  returned: "bg-gray-500/20 text-text-secondary border-border",
  overdue: "bg-red/20 text-red border-red/30",
  rejected: "bg-red/20 text-red border-red/30",
};

const STATUS_LABEL: Record<string, string> = {
  pending_approval: "Menunggu Persetujuan",
  approved: "Disetujui",
  borrowed: "Dipinjam",
  returned: "Dikembalikan",
  overdue: "⚠️ Terlambat",
  rejected: "Ditolak",
};

function BorrowingsContent() {
  const { token, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get("status") || "";

  const [borrowings, setBorrowings] = useState<AssetBorrowing[]>([]);
  const [overdues, setOverdues] = useState<AssetBorrowing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState(initialStatus);
  const [returnModal, setReturnModal] = useState<AssetBorrowing | null>(null);
  const [returnCondition, setReturnCondition] = useState<ReturnConditionEnum>("good");
  const [returnNotes, setReturnNotes] = useState("");

  // canManage: staff_it/leader/admin boleh lihat SEMUA peminjaman + approve.
  // Pelapor (user) hanya melihat riwayat miliknya sendiri.
  const canManage =
    user?.role === "staff_it" || user?.role === "leader" || user?.role === "admin";

  useEffect(() => {
    // Ikuti perubahan query ?status= (mis. dari sidebar "Approve Peminjaman")
    setFilter(searchParams.get("status") || "");
  }, [searchParams]);

  const refetch = async (statusFilter: string) => {
    if (!token) return;
    const [borrowingsRes, overduesRes] = await Promise.all([
      listBorrowings(token, statusFilter || undefined, canManage ? undefined : user?.id, 100),
      canManage ? listOverdueBorrowings(token) : Promise.resolve([]),
    ]);
    setBorrowings(borrowingsRes.data || []);
    setOverdues(overduesRes || []);
  };

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }

    let cancelled = false;
    const fetchData = async () => {
      try {
        setLoading(true);
        const [borrowingsRes, overduesRes] = await Promise.all([
          listBorrowings(token, filter || undefined, canManage ? undefined : user?.id, 100),
          canManage ? listOverdueBorrowings(token) : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setBorrowings(borrowingsRes.data || []);
        setOverdues(overduesRes || []);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [token, filter, user, canManage, router]);

  const handleApprove = async (id: string) => {
    if (!token) return;
    try {
      await approveBorrowing(token, id);
      await refetch(filter);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const [handoverId, setHandoverId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AssetBorrowing | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // ... (fetch data logic)

  const handleReject = async () => {
    if (!token || !rejectTarget) return;
    setIsProcessing(true);
    try {
      await rejectBorrowing(token, rejectTarget.id);
      setRejectTarget(null);
      refetch(filter);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleHandover = async (id: string) => {
    if (!token) return;
    setIsProcessing(true);
    try {
      await handoverBorrowing(token, id);
      setHandoverId(null);
      refetch(filter);
    } catch (err) {
      setError("Gagal konfirmasi serah terima: " + (err as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !returnModal) return;
    try {
      await returnBorrowing(token, returnModal.id, returnCondition, returnNotes);
      setReturnModal(null);
      setReturnCondition("good");
      setReturnNotes("");
      await refetch(filter);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="relative z-0 flex h-screen bg-transparent font-[family-name:var(--font-body)]">
      <Sidebar />
      <main className="relative flex-1 overflow-y-auto slim-scroll">
        <PageHeader
          title={canManage ? "Peminjaman Aset" : "Riwayat Peminjaman Saya"}
          subtitle={canManage ? "Kelola permintaan & pengembalian aset" : "Daftar aset IT yang pernah Anda pinjam"}
          actions={[
            { label: "+ Pinjam Aset", href: "/asset/borrowings/new", variant: "primary" as const },
            ...(canManage ? [{ label: "← Daftar Aset", href: "/asset", variant: "secondary" as const }] : []),
          ]}
        />
        <div className="relative z-10 w-full px-6 py-12 sm:px-10">
          <div className="mx-auto max-w-6xl">

            {/* Overdue Alert */}
            {canManage && overdues.length > 0 && (
              <div className="mb-6 rounded-lg border border-red/30 bg-red/10 p-4 text-red">
                <p className="font-semibold">⚠️ {overdues.length} peminjaman terlambat!</p>
              </div>
            )}

            {error && (
              <div className="mb-6 rounded-lg border border-red/30 bg-red/10 p-4 text-red">
                {error}
              </div>
            )}

            {/* Filter — halaman ini menggabungkan riwayat & persetujuan
                dalam satu tempat; tab "Perlu Persetujuan" menonjolkan
                permintaan yang menunggu tindakan tim IT. */}
            <div className="mb-6 rounded-lg border border-border bg-card p-4">
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "", label: "Semua" },
                  { key: "pending_approval", label: "Perlu Persetujuan" },
                  { key: "borrowed", label: "Dipinjam" },
                  { key: "returned", label: "Selesai" },
                ].map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`rounded-lg px-3 py-2 font-semibold transition ${
                      filter === f.key
                        ? "bg-accent text-white"
                        : "bg-card-hover text-text-secondary hover:bg-border"
                    }`}
                  >
                    {f.label}
                    {f.key === "pending_approval" &&
                      canManage &&
                      borrowings.filter((b) => b.status === "pending_approval").length > 0 &&
                      filter !== "pending_approval" && (
                        <span className="ml-2 rounded-full bg-amber/30 px-1.5 text-xs text-amber">
                          {borrowings.filter((b) => b.status === "pending_approval").length}
                        </span>
                      )}
                  </button>
                ))}
              </div>
            </div>

            {/* List */}
            {loading ? (
              <div className="py-12 text-center">
                <p className="text-text-secondary">Memuat data...</p>
              </div>
            ) : borrowings.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-text-secondary">Tidak ada peminjaman ditemukan</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {borrowings.map((b) => {
                  const isOverdue =
                    b.status === "borrowed" &&
                    new Date(b.return_deadline) < new Date() &&
                    !b.actual_return_date;
                  const statusKey = isOverdue ? "overdue" : b.status;
                  return (
                    <div
                      key={b.id}
                      className="rounded-lg border border-border bg-card p-4 transition hover:shadow-md"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold text-text-primary">
                              {b.asset_code} - {b.asset_name}
                            </h3>
                            <span
                              className={`rounded border px-2 py-1 text-xs font-semibold ${STATUS_COLORS[statusKey]}`}
                            >
                              {STATUS_LABEL[statusKey]}
                            </span>
                          </div>
                          <p className="mt-1 text-text-secondary">{b.borrower_name}</p>
                          <p className="mt-1 text-sm text-text-muted">{b.purpose}</p>
                          <div className="mt-2 flex flex-wrap gap-4 text-sm text-text-muted">
                            <span>📦 Jumlah: {b.quantity}</span>
                            <span>📅 Pinjam:    {new Date(b.borrow_date).toLocaleString('id-ID', {
                                year: 'numeric', month: 'numeric', day: 'numeric',
                                hour: '2-digit', minute: '2-digit'
                              })}</span>
                            <span>⏰ Kembali: {new Date(b.return_deadline).toLocaleString('id-ID')}</span>
                            {b.actual_return_date && (
                              <span>✅ Dikembalikan: {new Date(b.actual_return_date).toLocaleString('id-ID')}</span>
                            )}
                          </div>
                        </div>
                        <div className="ml-4 flex flex-col gap-2">
                          {canManage && b.status === "pending_approval" && (
                            <>
                              <button
                                onClick={() => handleApprove(b.id)}
                                className="rounded bg-green-500 px-3 py-1 text-sm font-semibold text-white hover:opacity-90"
                              >
                                ✓ Setujui
                              </button>
                              <button
                                onClick={() => setRejectTarget(b)}
                                className="rounded bg-red-500 px-3 py-1 text-sm font-semibold text-white hover:opacity-90"
                              >
                                ✕ Tolak
                              </button>
                            </>
                          )}
                          {canManage && b.status === "approved" && (
                            <button
                              onClick={() => setHandoverId(b.id)}
                              className="rounded bg-blue-500 px-3 py-1 text-sm font-semibold text-white hover:opacity-90"
                            >
                              📦 Konfirmasi Serah Terima
                            </button>
                          )}
                          {(b.status === "borrowed" || isOverdue) &&
                            (canManage || b.borrower_id === user?.id) && (
                              <button
                                onClick={() => setReturnModal(b)}
                                className="rounded bg-blue-500 px-3 py-1 text-sm font-semibold text-white hover:opacity-90"
                              >
                                🔄 Kembalikan
                              </button>
                            )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Konfirmasi Serah Terima Modal */}
            {rejectTarget && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
                <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-xl">
                  <h3 className="mb-2 text-lg font-bold text-text-primary">
                    Tolak Peminjaman
                  </h3>
                  <p className="mb-4 text-sm text-text-secondary">
                    Yakin tolak peminjaman {rejectTarget.asset_name} oleh {rejectTarget.borrower_name}?
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setRejectTarget(null)}
                      className="flex-1 rounded-lg border border-border py-2 text-sm font-medium hover:bg-card-hover"
                    >
                      Batal
                    </button>
                    <button
                      onClick={handleReject}
                      disabled={isProcessing}
                      className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-50"
                    >
                      {isProcessing ? "Memproses..." : "Tolak"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Konfirmasi Serah Terima Modal */}
            {handoverId && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
                <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-xl">
                  <h3 className="mb-2 text-lg font-bold text-text-primary">
                    Konfirmasi Serah Terima
                  </h3>
                  <p className="mb-6 text-sm text-text-secondary">
                    Pastikan barang sudah diserahkan secara fisik ke peminjam.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setHandoverId(null)}
                      className="flex-1 rounded-lg border border-border py-2 text-sm font-medium hover:bg-card-hover"
                    >
                      Batal
                    </button>
                    <button
                      onClick={() => handleHandover(handoverId)}
                      disabled={isProcessing}
                      className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50"
                    >
                      {isProcessing ? "Memproses..." : "Konfirmasi"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Return Modal */}
            {returnModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                <form
                  onSubmit={handleReturn}
                  className="w-full max-w-md rounded-lg border border-border bg-card p-6"
                >
                  <h3 className="mb-4 text-lg font-semibold text-text-primary">
                    Konfirmasi Pengembalian
                  </h3>
                  <p className="mb-4 text-text-secondary">
                    {returnModal.asset_code} - {returnModal.asset_name}
                  </p>
                  <div className="mb-4">
                    <label className="mb-1 block text-sm text-text-secondary">Kondisi</label>
                    <select
                      value={returnCondition}
                      onChange={(e) => setReturnCondition(e.target.value as ReturnConditionEnum)}
                      className="w-full rounded border border-border bg-bg-page px-3 py-2 text-text-primary"
                    >
                      <option value="good">Baik</option>
                      <option value="damaged">Rusak</option>
                      <option value="lost">Hilang</option>
                    </select>
                  </div>
                  <div className="mb-4">
                    <label className="mb-1 block text-sm text-text-secondary">Catatan</label>
                    <textarea
                      value={returnNotes}
                      onChange={(e) => setReturnNotes(e.target.value)}
                      className="w-full rounded border border-border bg-bg-page px-3 py-2 text-text-primary"
                      rows={3}
                      placeholder="Catatan opsional..."
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="rounded-lg bg-accent px-4 py-2 font-semibold text-white hover:opacity-90"
                    >
                      Konfirmasi
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReturnModal(null);
                        setReturnCondition("good");
                        setReturnNotes("");
                      }}
                      className="rounded-lg bg-card-hover px-4 py-2 text-text-secondary"
                    >
                      Batal
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function BorrowingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-transparent">
          <p className="text-text-secondary">Memuat...</p>
        </div>
      }
    >
      <BorrowingsContent />
    </Suspense>
  );
}
