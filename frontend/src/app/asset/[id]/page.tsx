"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter, useParams } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import PageHeader from "@/components/page-header";
import {
  getAsset,
  deleteAsset,
  getMyPermissions,
  Asset,
  borrowAsset,
  listBorrowings,
  AssetBorrowing,
  AssetConditionEnum,
} from "@/lib/api";

const CONDITION_COLORS: Record<AssetConditionEnum, string> = {
  available: "🟢",
  borrowed: "🟡",
  needs_repair: "🟠",
  broken: "🔴",
  awaiting_disposal: "♻️",
  disposed: "⚫",
};

export default function AssetDetailPage() {
  const { token, user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const assetId = params.id as string;

  const [asset, setAsset] = useState<Asset | null>(null);
  const [borrowings, setBorrowings] = useState<AssetBorrowing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [canManage, setCanManage] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [showBorrowForm, setShowBorrowForm] = useState(false);
  const [borrowForm, setBorrowForm] = useState({
    quantity: 1,
    borrow_date: new Date().toISOString().split("T")[0],
    return_deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0],
    purpose: "",
  });
  const [borrowing, setBorrowing] = useState(false);

  useEffect(() => {
    if (!token || !assetId) return;

    const fetch = async () => {
      try {
        setLoading(true);
        const [perms, assetRes, borrowingsRes] = await Promise.all([
          getMyPermissions(token),
          getAsset(token, assetId),
          listBorrowings(token, undefined, undefined, 100),
        ]);
        const assetPerm = perms.find((p) => p.module_code === "asset");
        setCanManage(assetPerm?.access_level === "editor");
        setAsset(assetRes);
        setBorrowings(borrowingsRes.data?.filter((b) => b.asset_id === assetId) || []);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    fetch();
  }, [token, assetId]);

  const handleBorrow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!asset || !token) return;

    try {
      setBorrowing(true);
      await borrowAsset(token, asset.id, borrowForm);
      setShowBorrowForm(false);
      setBorrowForm({
        quantity: 1,
        borrow_date: new Date().toISOString().split("T")[0],
        return_deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0],
        purpose: "",
      });
      // Reload
      const updated = await getAsset(token, assetId);
      const updatedBorrowings = await listBorrowings(token, undefined, undefined, 100);
      setAsset(updated);
      setBorrowings(updatedBorrowings.data?.filter((b) => b.asset_id === assetId) || []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBorrowing(false);
    }
  };

  const handleDelete = async () => {
    if (!asset || !token) return;

    try {
      setDeleting(true);
      setError("");
      await deleteAsset(token, asset.id);
      router.push("/asset");
    } catch (err) {
      setError((err as Error).message);
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="relative z-0 flex h-screen bg-transparent font-[family-name:var(--font-body)]">
        <Sidebar />
        <main className="relative flex-1 overflow-y-auto">
          <div className="relative z-10 w-full px-6 py-8 sm:px-10">
            <p className="text-text-secondary">Memuat detail aset...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="relative z-0 flex h-screen bg-transparent font-[family-name:var(--font-body)]">
        <Sidebar />
        <main className="relative flex-1 overflow-y-auto">
          <div className="relative z-10 w-full px-6 py-8 sm:px-10">
            <div className="bg-red-500/20 border border-red-300 text-red-600 p-4 rounded-lg">
              Aset tidak ditemukan
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="relative z-0 flex h-screen bg-transparent font-[family-name:var(--font-body)]">
      <Sidebar />
      <main className="relative flex-1 overflow-y-auto slim-scroll">
        <PageHeader
          title={asset.code}
          subtitle={asset.name}
          actions={[
            ...(canManage ? [
              { label: "✏️ Edit", href: `/asset/${asset.id}/edit`, variant: "primary" as const },
              { label: "🗑️ Hapus", onClick: () => setShowDeleteConfirm(true), variant: "danger" as const },
            ] : []),
            { label: "← Kembali", href: "/asset", variant: "secondary" as const },
          ]}
        />
        <div className="relative z-10 w-full px-6 py-8 sm:px-10">
          <div className="max-w-4xl mx-auto">

        {showDeleteConfirm && (
          <div className="bg-red-500/10 border border-red-300 rounded-lg p-4 mb-6">
            <p className="text-text-primary font-semibold">
              Hapus aset {asset.code} — {asset.name}?
            </p>
            <p className="text-text-secondary text-sm mt-1">
              Tindakan ini tidak bisa dibatalkan. Aset yang sudah punya riwayat peminjaman
              atau pembuangan tidak bisa dihapus.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:opacity-90 transition disabled:opacity-50"
              >
                {deleting ? "Menghapus..." : "Ya, Hapus"}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 bg-border text-text-secondary rounded-lg"
              >
                Batal
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-500/20 border border-red-300 text-red-600 p-4 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Asset Info */}
        <div className="bg-card border border-border rounded-lg p-6 mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-text-muted text-sm">Kategori</p>
              <p className="text-text-primary font-semibold mt-1">{asset.category_name}</p>
            </div>
            <div>
              <p className="text-text-muted text-sm">Kondisi</p>
              <p className="text-text-primary font-semibold mt-1">
                {CONDITION_COLORS[asset.condition]} {asset.condition.replace(/_/g, " ")}
              </p>
            </div>
            <div>
              <p className="text-text-muted text-sm">Stok</p>
              <p className="text-2xl font-bold text-accent mt-1">{asset.stock}</p>
            </div>
            <div>
              <p className="text-text-muted text-sm">Lokasi</p>
              <p className="text-text-primary font-semibold mt-1">{asset.location || "-"}</p>
            </div>
            {asset.brand && (
              <div>
                <p className="text-text-muted text-sm">Merek</p>
                <p className="text-text-primary font-semibold mt-1">{asset.brand}</p>
              </div>
            )}
            {asset.model && (
              <div>
                <p className="text-text-muted text-sm">Model</p>
                <p className="text-text-primary font-semibold mt-1">{asset.model}</p>
              </div>
            )}
            {asset.serial_number && (
              <div>
                <p className="text-text-muted text-sm">Serial</p>
                <p className="text-text-primary font-semibold mt-1">{asset.serial_number}</p>
              </div>
            )}
          </div>
          {asset.notes && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-text-muted text-sm">Catatan</p>
              <p className="text-text-primary mt-1">{asset.notes}</p>
            </div>
          )}
        </div>

        {/* Borrow Button */}
        {asset.stock > 0 && asset.condition === "available" && (
          <button
            onClick={() => setShowBorrowForm(!showBorrowForm)}
            className="px-4 py-2 bg-accent text-white font-semibold rounded-lg hover:opacity-90 transition mb-6"
          >
            📤 Pinjam Aset
          </button>
        )}

        {/* Borrow Form */}
        {showBorrowForm && (
          <form
            onSubmit={handleBorrow}
            className="bg-card border border-accent/30 rounded-lg p-6 mb-6"
          >
            <h3 className="text-lg font-semibold text-text-primary mb-4">Formulir Peminjaman</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-text-secondary text-sm mb-1">Jumlah</label>
                <input
                  type="number"
                  min="1"
                  max={asset.stock}
                  value={borrowForm.quantity}
                  onChange={(e) =>
                    setBorrowForm({ ...borrowForm, quantity: parseInt(e.target.value) })
                  }
                  className="w-full px-3 py-2 bg-bg-page border border-border rounded text-text-primary"
                />
              </div>
              <div>
                <label className="block text-text-secondary text-sm mb-1">Tanggal Pinjam</label>
                <input
                  type="date"
                  value={borrowForm.borrow_date}
                  onChange={(e) =>
                    setBorrowForm({ ...borrowForm, borrow_date: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-bg-page border border-border rounded text-text-primary"
                />
              </div>
              <div>
                <label className="block text-text-secondary text-sm mb-1">
                  Target Pengembalian
                </label>
                <input
                  type="date"
                  value={borrowForm.return_deadline}
                  onChange={(e) =>
                    setBorrowForm({ ...borrowForm, return_deadline: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-bg-page border border-border rounded text-text-primary"
                />
              </div>
              <div>
                <label className="block text-text-secondary text-sm mb-1">Keperluan</label>
                <input
                  type="text"
                  placeholder="Jelaskan keperluan peminjaman"
                  value={borrowForm.purpose}
                  onChange={(e) => setBorrowForm({ ...borrowForm, purpose: e.target.value })}
                  className="w-full px-3 py-2 bg-bg-page border border-border rounded text-text-primary"
                  required
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={borrowing}
                className="px-4 py-2 bg-accent text-white font-semibold rounded-lg hover:opacity-90 transition disabled:opacity-50"
              >
                {borrowing ? "Mengirim..." : "Kirim Permintaan"}
              </button>
              <button
                type="button"
                onClick={() => setShowBorrowForm(false)}
                className="px-4 py-2 bg-border text-text-secondary rounded-lg"
              >
                Batal
              </button>
            </div>
          </form>
        )}

        {/* Borrowing History */}
        {borrowings.length > 0 && (
          <div className="bg-card border border-border rounded-lg p-6">
            <h3 className="text-lg font-semibold text-text-primary mb-4">
              📋 Riwayat Peminjaman
            </h3>
            <div className="space-y-3">
              {borrowings.map((b) => (
                <div key={b.id} className="border border-border rounded p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-text-primary">{b.borrower_name}</p>
                      <p className="text-sm text-text-secondary mt-1">{b.purpose}</p>
                      <div className="flex gap-2 mt-2 text-xs text-text-muted">
                        <span>Jml: {b.quantity}</span>
                        <span>•</span>
                        <span>Pinjam: {b.borrow_date}</span>
                        <span>•</span>
                        <span>Kembali: {b.return_deadline}</span>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-1 text-xs font-semibold rounded ${
                        b.status === "approved"
                          ? "bg-green-500/20 text-green-600"
                          : b.status === "pending_approval"
                            ? "bg-yellow-500/20 text-yellow-600"
                            : b.status === "returned"
                              ? "bg-blue-500/20 text-blue-600"
                              : "bg-red-500/20 text-red-600"
                      }`}
                    >
                      {b.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
          </div>
        </div>
      </main>
    </div>
  );
}
