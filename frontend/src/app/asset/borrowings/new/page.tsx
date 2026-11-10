"use client";

import { useState, useEffect, FormEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import PageHeader from "@/components/page-header";
import { listAssets, borrowAsset, Asset } from "@/lib/api";
import { Calendar, ArrowLeft, Package } from "lucide-react";
import { format } from "date-fns";
import { id } from "date-fns/locale";

// listAssets mengirim available_stock = stok total dikurangi yang sedang
// diajukan/disetujui/dipinjam. Nilai yang kosong HARUS dibaca 0 — jangan
// jatuh balik ke stok total, karena itu membuat aset yang sudah habis
// dipinjam terlihat masih tersedia (dan baru ditolak saat diajukan).
type BorrowableAsset = Asset & { available_stock?: number };
const availableOf = (a: BorrowableAsset) => a.available_stock ?? 0;

export default function NewBorrowingPage() {
  const { token, user } = useAuth();
  const router = useRouter();

  const [assets, setAssets] = useState<BorrowableAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string>("");
  const [borrowDate, setBorrowDate] = useState<string>(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [dueDate, setDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return format(d, "yyyy-MM-dd'T'HH:mm");
  });
  const [quantity, setQuantity] = useState<number>(1);
  const [borrowerName, setBorrowerName] = useState<string>(user?.name ?? "");
  const [borrowerEmail, setBorrowerEmail] = useState<string>(user?.email ?? "");
  const [purpose, setPurpose] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string>("");
  const [submitError, setSubmitError] = useState<string>("");

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    fetchAssets();
  }, [token]);

  // silent = muat ulang tanpa menampilkan spinner (dipakai setelah submit gagal,
  // supaya isian form tidak hilang dan stok di layar kembali akurat).
  const fetchAssets = async (silent = false) => {
    if (!token) return;
    try {
      if (!silent) setLoading(true);
      setLoadError("");
      const res = await listAssets(token, undefined, "available", 200, 0);
      setAssets((res.data || []) as BorrowableAsset[]);
    } catch (err) {
      setLoadError((err as Error).message);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Aset yang masih punya sisa stok vs yang sudah habis dipinjam.
  const borrowable = assets.filter((a) => availableOf(a) > 0);
  const fullyBorrowed = assets.filter((a) => availableOf(a) <= 0);
  const selectedAsset = borrowable.find((a) => a.id === selectedAssetId);
  const maxQuantity = selectedAsset ? availableOf(selectedAsset) : 1;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (!selectedAsset) {
      setSubmitError("Pilih aset yang masih tersedia terlebih dahulu.");
      return;
    }
    if (quantity > maxQuantity) {
      setSubmitError(`Jumlah melebihi stok tersedia (${maxQuantity} unit).`);
      return;
    }
    try {
      setSubmitting(true);
      setSubmitError("");
      await borrowAsset(
        token,
        selectedAsset.id,
        {
          borrow_date: new Date(borrowDate).toISOString(),
          return_deadline: new Date(dueDate).toISOString(),
          quantity,
          purpose,
          notes,
          borrower_name: borrowerName,
          borrower_email: borrowerEmail,
        }
      );
      router.push("/asset/borrowings?success=1");
    } catch (err) {
      setSubmitError((err as Error).message);
      setSubmitting(false);
      // Stok bisa berubah (dipinjam orang lain) — segarkan daftar aset.
      await fetchAssets(true);
    }
  };

  if (!token) return null;

  return (
    <div className="relative z-0 flex h-screen bg-transparent">
      <Sidebar />
      <main className="relative flex-1 overflow-y-auto slim-scroll">
        <PageHeader
          title="Pinjam Aset"
          subtitle="Ajukan peminjaman aset IT"
          actions={[{ label: "← Kembali", href: "/asset/borrowings", variant: "secondary" as const }]}
        />
        <div className="relative z-10 w-full px-6 py-8">

          {loadError && (
            <div role="alert" className="mb-6 rounded-lg bg-red-500/15 p-4 text-red-400">
              <p className="font-medium">Gagal memuat formulir</p>
              <p className="text-sm">{loadError}</p>
            </div>
          )}

          {submitError && (
            <div role="alert" className="mb-6 rounded-lg bg-red-500/15 p-4 text-red-400">
              <p className="font-medium">Peminjaman belum bisa diajukan</p>
              <p className="text-sm">{submitError}</p>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
            </div>
          ) : borrowable.length === 0 ? (
            <div className="rounded-xl bg-page p-8 text-center">
              <Package className="mx-auto mb-4 h-12 w-12 text-gray-500" />
              <h2 className="mb-2 text-xl font-semibold text-white">Tidak ada aset yang bisa dipinjam</h2>
              <p className="text-text-secondary">
                {assets.length === 0
                  ? "Belum ada aset berkondisi tersedia."
                  : "Semua aset sedang dipinjam atau menunggu persetujuan peminjaman lain. Coba lagi nanti."}
              </p>
              {fullyBorrowed.length > 0 && (
                <ul className="mt-4 space-y-1 text-sm text-text-secondary">
                  {fullyBorrowed.map((a) => (
                    <li key={a.id}>
                      {a.code} – {a.name} <span className="text-amber-400">(sedang dipinjam semua)</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-page p-6 shadow-lg">
              <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                {/* Kolom kiri: Pilih Aset */}
                <div>
                  <h2 className="mb-4 text-lg font-semibold text-white">Pilih Aset</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-text">
                        Aset yang tersedia *
                      </label>
                      <select
                        value={selectedAssetId}
                        onChange={(e) => {
                          setSelectedAssetId(e.target.value);
                          setQuantity(1);
                          setSubmitError("");
                        }}
                        className="w-full rounded-lg border border-border bg-page px-4 py-3 text-text shadow-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                        required
                      >
                        <option value="">-- Pilih aset --</option>
                        {borrowable.map((asset) => (
                          <option key={asset.id} value={asset.id}>
                            {asset.code} – {asset.name} (Tersedia: {availableOf(asset)} unit)
                          </option>
                        ))}
                        {fullyBorrowed.map((asset) => (
                          <option key={asset.id} value={asset.id} disabled>
                            {asset.code} – {asset.name} (Sedang dipinjam semua)
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedAsset && (
                      <div className="rounded-lg bg-black/40 p-4">
                        <h3 className="mb-2 text-sm font-semibold text-white">Detail aset:</h3>
                        <div className="space-y-2 text-sm text-text-secondary">
                          <p>
                            <span className="font-medium text-text">Kategori:</span>{" "}
                            {selectedAsset.category_name}
                          </p>
                          <p>
                            <span className="font-medium text-text">Kondisi:</span>{" "}
                            {selectedAsset.condition === "available" ? "Tersedia" : selectedAsset.condition}
                          </p>
                          <p>
                            <span className="font-medium text-text">Lokasi:</span>{" "}
                            {selectedAsset.location || "-"}
                          </p>
                          <p>
                            <span className="font-medium text-text">Stok tersedia:</span>{" "}
                            <span className="font-bold text-green-400">
                              {availableOf(selectedAsset)} unit
                            </span>
                            {selectedAsset.stock > availableOf(selectedAsset) && (
                              <span className="ml-2 text-xs text-amber-400">
                                ({selectedAsset.stock - availableOf(selectedAsset)} dari {selectedAsset.stock} unit sedang dipinjam / menunggu persetujuan)
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="mb-1 block text-sm font-medium text-text">
                        Jumlah *
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={maxQuantity}
                        value={quantity}
                        onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                        className="w-full rounded-lg border border-border bg-page px-4 py-3 text-text shadow-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                        required
                      />
                      <p className="mt-1 text-xs text-text-secondary">
                        Maksimal: {maxQuantity} unit
                      </p>
                    </div>
                  </div>
                </div>

                {/* Kolom kanan: Data Peminjam & Tanggal */}
                <div>
                  <h2 className="mb-4 text-lg font-semibold text-white">Data Peminjam</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-text">
                        Nama Peminjam *
                      </label>
                      <input
                        type="text"
                        value={borrowerName}
                        onChange={(e) => setBorrowerName(e.target.value)}
                        className="w-full rounded-lg border border-border bg-page px-4 py-3 text-text shadow-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                        required
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-text">
                        Email Peminjam *
                      </label>
                      <input
                        type="email"
                        value={borrowerEmail}
                        onChange={(e) => setBorrowerEmail(e.target.value)}
                        className="w-full rounded-lg border border-border bg-page px-4 py-3 text-text shadow-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1 flex items-center gap-2 text-sm font-medium text-text">
                          <Calendar className="h-4 w-4" />
                          Tanggal & Waktu Pinjam *
                        </label>
                        <input
                          type="datetime-local"
                          value={borrowDate}
                          onChange={(e) => setBorrowDate(e.target.value)}
                          className="w-full rounded-lg border border-border bg-page px-4 py-3 text-text shadow-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                          required
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-text">
                          Tanggal & Waktu Jatuh Tempo *
                        </label>
                        <input
                          type="datetime-local"
                          value={dueDate}
                          onChange={(e) => setDueDate(e.target.value)}
                          className="w-full rounded-lg border border-border bg-page px-4 py-3 text-text shadow-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-text">
                        Tujuan Peminjaman *
                      </label>
                      <textarea
                        value={purpose}
                        onChange={(e) => setPurpose(e.target.value)}
                        rows={2}
                        className="w-full rounded-lg border border-border bg-page px-4 py-3 text-text shadow-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                        placeholder="Contoh: Meeting klien, demo produk, rapat internal"
                        required
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-text">
                        Catatan Tambahan
                      </label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={2}
                        className="w-full rounded-lg border border-border bg-page px-4 py-3 text-text shadow-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                        placeholder="Keterangan khusus (opsional)"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-4 pt-6 border-t border-border">
                <button
                  type="button"
                  onClick={() => router.back()}
                  className="rounded-lg bg-page px-6 py-3 font-medium text-text hover:bg-page/80"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting || !selectedAsset}
                  className="rounded-lg bg-accent px-6 py-3 font-medium text-white hover:bg-accent/90 disabled:opacity-50"
                >
                  {submitting ? "Mengirim..." : "Ajukan Peminjaman"}
                </button>
              </div>
            </form>
            </div>
          )}

          <p className="mt-6 text-xs text-text-secondary">
            * Peminjaman memerlukan persetujuan dari admin/leader. Anda akan mendapat notifikasi setelah disetujui.
          </p>
        </div>
      </main>
    </div>
  );
}