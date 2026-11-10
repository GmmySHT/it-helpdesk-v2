"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter, useParams } from "next/navigation";
import {
  getAsset,
  updateAsset,
  listAssetCategories,
  Asset,
  AssetCategory,
  AssetConditionEnum,
} from "@/lib/api";
import { Sidebar } from "@/components/sidebar";

export default function EditAssetPage() {
  const { token, user, isLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const assetId = params.id as string;

  const [asset, setAsset] = useState<(Asset & { available_stock?: number }) | null>(null);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    category_id: "",
    code: "",
    name: "",
    brand: "",
    model: "",
    serial_number: "",
    condition: "available" as AssetConditionEnum,
    stock: 1,
    location: "",
    notes: "",
  });

  useEffect(() => {
    if (isLoading) return; // tunggu sesi dipulihkan dari localStorage

    if (!token) {
      router.push("/login");
      return;
    }

    const canManage = user?.role === "leader" || user?.role === "admin";
    if (!canManage) {
      router.push("/asset");
      return;
    }

    const load = async () => {
      try {
        setPageLoading(true);
        const [assetRes, cats] = await Promise.all([
          getAsset(token, assetId),
          listAssetCategories(token),
        ]);
        setAsset(assetRes);
        setCategories(cats || []);
        setForm({
          category_id: assetRes.category_id,
          code: assetRes.code,
          name: assetRes.name,
          brand: assetRes.brand || "",
          model: assetRes.model || "",
          serial_number: assetRes.serial_number || "",
          condition: assetRes.condition,
          stock: assetRes.stock,
          location: assetRes.location || "",
          notes: assetRes.notes || "",
        });
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setPageLoading(false);
      }
    };

    load();
  }, [token, user, isLoading, assetId, router]);

  // Stok tidak boleh lebih kecil dari jumlah yang sedang diajukan/dipinjam.
  // available_stock = stok total - yang sedang diajukan/disetujui/dipinjam;
  // nilai kosong dibaca 0 (bukan stok total).
  const inUse = asset ? Math.max(asset.stock - (asset.available_stock ?? 0), 0) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (Number.isNaN(form.stock) || form.stock < inUse) {
      setError(`Stok tidak boleh kurang dari ${inUse} unit yang sedang diajukan/dipinjam`);
      return;
    }

    try {
      setSaving(true);
      setError("");
      await updateAsset(token, assetId, form);
      router.push(`/asset/${assetId}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full px-3 py-2 bg-bg-page border border-border rounded text-text-primary";
  const labelClass = "block text-text-secondary text-sm mb-1 font-semibold";

  return (
    <div className="relative z-0 flex h-screen bg-transparent font-[family-name:var(--font-body)]">
      <Sidebar />
      <main className="relative flex-1 overflow-y-auto slim-scroll">
        <div className="sticky-back px-6 sm:px-10">
          <button
            onClick={() => router.back()}
            className="px-3 py-2 bg-border text-text-secondary hover:bg-border/80 rounded inline-flex items-center gap-2"
          >
            ← Kembali
          </button>
        </div>

        <div className="relative z-10 w-full px-6 py-8 sm:px-10">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-4 mb-6">
              <div>
                <h1 className="text-3xl font-bold text-text-primary">✏️ Edit Aset</h1>
                <p className="text-text-secondary mt-1">
                  {asset ? `${asset.code} — ${asset.name}` : "Ubah data aset IT"}
                </p>
              </div>
            </div>

            {error && (
              <div className="bg-red-500/20 border border-red-300 text-red-600 p-4 rounded-lg mb-6">
                {error}
              </div>
            )}

            {pageLoading ? (
              <p className="text-text-secondary">Memuat data aset...</p>
            ) : !asset ? null : (
              <form
                onSubmit={handleSubmit}
                className="bg-card border border-border rounded-lg p-6"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Category */}
                  <div>
                    <label className={labelClass}>Kategori *</label>
                    <select
                      value={form.category_id}
                      onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                      className={inputClass}
                      required
                    >
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Code */}
                  <div>
                    <label className={labelClass}>Kode Aset *</label>
                    <input
                      type="text"
                      placeholder="AST-2026-001"
                      value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value })}
                      className={inputClass}
                      required
                    />
                  </div>

                  {/* Name */}
                  <div className="md:col-span-2">
                    <label className={labelClass}>Nama Aset *</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className={inputClass}
                      required
                    />
                  </div>

                  {/* Brand */}
                  <div>
                    <label className={labelClass}>Merek</label>
                    <input
                      type="text"
                      value={form.brand}
                      onChange={(e) => setForm({ ...form, brand: e.target.value })}
                      className={inputClass}
                    />
                  </div>

                  {/* Model */}
                  <div>
                    <label className={labelClass}>Model</label>
                    <input
                      type="text"
                      value={form.model}
                      onChange={(e) => setForm({ ...form, model: e.target.value })}
                      className={inputClass}
                    />
                  </div>

                  {/* Serial */}
                  <div>
                    <label className={labelClass}>Serial Number</label>
                    <input
                      type="text"
                      value={form.serial_number}
                      onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
                      className={inputClass}
                    />
                  </div>

                  {/* Location */}
                  <div>
                    <label className={labelClass}>Lokasi</label>
                    <input
                      type="text"
                      value={form.location}
                      onChange={(e) => setForm({ ...form, location: e.target.value })}
                      className={inputClass}
                    />
                  </div>

                  {/* Condition */}
                  <div>
                    <label className={labelClass}>Kondisi *</label>
                    <select
                      value={form.condition}
                      onChange={(e) =>
                        setForm({ ...form, condition: e.target.value as AssetConditionEnum })
                      }
                      className={inputClass}
                      required
                    >
                      <option value="available">🟢 Tersedia</option>
                      <option value="borrowed">🟡 Dipinjam</option>
                      <option value="needs_repair">🟠 Perlu Perbaikan</option>
                      <option value="broken">🔴 Rusak</option>
                      <option value="awaiting_disposal">♻️ Tunggu Pembuangan</option>
                      <option value="disposed">⚫ Sudah Dibuang</option>
                    </select>
                  </div>

                  {/* Stock */}
                  <div>
                    <label className={labelClass}>Stok *</label>
                    <input
                      type="number"
                      min={inUse}
                      value={Number.isNaN(form.stock) ? "" : form.stock}
                      onChange={(e) =>
                        setForm({ ...form, stock: parseInt(e.target.value) })
                      }
                      className={inputClass}
                      required
                    />
                    {inUse > 0 && (
                      <p className="text-xs text-text-muted mt-1">
                        Minimal {inUse} unit karena sedang diajukan/dipinjam.
                      </p>
                    )}
                  </div>

                  {/* Notes */}
                  <div className="md:col-span-2">
                    <label className={labelClass}>Catatan</label>
                    <textarea
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      className={inputClass}
                      rows={3}
                    />
                  </div>
                </div>

                <div className="flex gap-2 mt-6">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-6 py-3 bg-accent text-white font-semibold rounded-lg hover:opacity-90 transition disabled:opacity-50"
                  >
                    {saving ? "Menyimpan..." : "💾 Simpan Perubahan"}
                  </button>
                  <button
                    type="button"
                    onClick={() => router.back()}
                    className="px-6 py-3 bg-border text-text-secondary rounded-lg hover:bg-border/80"
                  >
                    Batal
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
