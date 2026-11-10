"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import {
  createAsset,
  listAssetCategories,
  AssetCategory,
  AssetConditionEnum,
} from "@/lib/api";
import { Sidebar } from "@/components/sidebar";

export default function NewAssetPage() {
  const { token, user } = useAuth();
  const router = useRouter();

  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [loading, setLoading] = useState(false);
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
    if (!token) {
      router.push("/login");
      return;
    }

    const isAdmin = user?.role === "leader" || user?.role === "admin";
    if (!isAdmin) {
      router.push("/asset");
      return;
    }

    const fetch = async () => {
      try {
        const cats = await listAssetCategories(token);
        setCategories(cats || []);
        if (cats.length > 0) {
          setForm((prev) => ({ ...prev, category_id: cats[0].id }));
        }
      } catch (err) {
        setError((err as Error).message);
      }
    };

    fetch();
  }, [token, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    try {
      setLoading(true);
      setError("");
      await createAsset(token, form);
      router.push("/asset");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

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
            <h1 className="text-3xl font-bold text-text-primary">➕ Tambah Aset Baru</h1>
            <p className="text-text-secondary mt-1">Daftarkan aset IT ke inventaris</p>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/20 border border-red-300 text-red-600 p-4 rounded-lg mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-lg p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Category */}
            <div>
              <label className="block text-text-secondary text-sm mb-1 font-semibold">
                Kategori *
              </label>
              <select
                value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                className="w-full px-3 py-2 bg-bg-page border border-border rounded text-text-primary"
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
              <label className="block text-text-secondary text-sm mb-1 font-semibold">
                Kode Aset *
              </label>
              <input
                type="text"
                placeholder="AST-2026-001"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                className="w-full px-3 py-2 bg-bg-page border border-border rounded text-text-primary"
                required
              />
              <p className="text-xs text-text-muted mt-1">Format: AST-YYYY-XXX</p>
            </div>

            {/* Name */}
            <div className="md:col-span-2">
              <label className="block text-text-secondary text-sm mb-1 font-semibold">
                Nama Aset *
              </label>
              <input
                type="text"
                placeholder="Logitech MX Master 3S"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 bg-bg-page border border-border rounded text-text-primary"
                required
              />
            </div>

            {/* Brand */}
            <div>
              <label className="block text-text-secondary text-sm mb-1 font-semibold">
                Merek
              </label>
              <input
                type="text"
                placeholder="Logitech"
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                className="w-full px-3 py-2 bg-bg-page border border-border rounded text-text-primary"
              />
            </div>

            {/* Model */}
            <div>
              <label className="block text-text-secondary text-sm mb-1 font-semibold">
                Model
              </label>
              <input
                type="text"
                placeholder="MX Master 3S"
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                className="w-full px-3 py-2 bg-bg-page border border-border rounded text-text-primary"
              />
            </div>

            {/* Serial */}
            <div>
              <label className="block text-text-secondary text-sm mb-1 font-semibold">
                Serial Number
              </label>
              <input
                type="text"
                placeholder="SN123456789"
                value={form.serial_number}
                onChange={(e) => setForm({ ...form, serial_number: e.target.value })}
                className="w-full px-3 py-2 bg-bg-page border border-border rounded text-text-primary"
              />
            </div>

            {/* Location */}
            <div>
              <label className="block text-text-secondary text-sm mb-1 font-semibold">
                Lokasi
              </label>
              <input
                type="text"
                placeholder="Ruang Server Lantai 3"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full px-3 py-2 bg-bg-page border border-border rounded text-text-primary"
              />
            </div>

            {/* Condition */}
            <div>
              <label className="block text-text-secondary text-sm mb-1 font-semibold">
                Kondisi *
              </label>
              <select
                value={form.condition}
                onChange={(e) => setForm({ ...form, condition: e.target.value as AssetConditionEnum })}
                className="w-full px-3 py-2 bg-bg-page border border-border rounded text-text-primary"
                required
              >
                <option value="available">🟢 Tersedia</option>
                <option value="borrowed">🟡 Dipinjam</option>
                <option value="needs_repair">🟠 Perlu Perbaikan</option>
                <option value="broken">🔴 Rusak</option>
                <option value="awaiting_disposal">♻️ Tunggu Pembuangan</option>
              </select>
            </div>

            {/* Stock */}
            <div>
              <label className="block text-text-secondary text-sm mb-1 font-semibold">
                Stok *
              </label>
              <input
                type="number"
                min="0"
                value={form.stock}
                onChange={(e) => setForm({ ...form, stock: parseInt(e.target.value) })}
                className="w-full px-3 py-2 bg-bg-page border border-border rounded text-text-primary"
                required
              />
            </div>

            {/* Notes */}
            <div className="md:col-span-2">
              <label className="block text-text-secondary text-sm mb-1 font-semibold">
                Catatan
              </label>
              <textarea
                placeholder="Catatan tambahan tentang aset ini..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="w-full px-3 py-2 bg-bg-page border border-border rounded text-text-primary"
                rows={3}
              />
            </div>
          </div>

          <div className="flex gap-2 mt-6">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-accent text-white font-semibold rounded-lg hover:opacity-90 transition disabled:opacity-50"
            >
              {loading ? "Menyimpan..." : "💾 Simpan Aset"}
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
          </div>
        </div>
      </main>
    </div>
  );
}
