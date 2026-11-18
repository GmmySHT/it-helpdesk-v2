"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import PageHeader from "@/components/page-header";
import { Sidebar } from "@/components/sidebar";
import {
  Category,
  listCategories,
  updateCategoryApprovalGate,
} from "@/lib/api";

export default function AdminCategoriesPage() {
  const router = useRouter();
  const { user, token, isLoading } = useAuth();
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !user) router.push("/login");
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!token) return;
    listCategories(token)
      .then((d) => setCategories(d || []))
      .catch((err) => setError(err instanceof Error ? err.message : "Gagal memuat kategori"));
  }, [token]);

  async function toggleGate(cat: Category) {
    if (!token) return;
    setSavingId(cat.id);
    setError("");
    try {
      const updated = await updateCategoryApprovalGate(token, cat.id, !cat.requires_analysis_approval);
      setCategories((prev) => prev.map((c) => (c.id === cat.id ? updated : c)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan pengaturan");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="flex h-screen bg-transparent">
      <Sidebar />
      <main className="flex-1 overflow-y-auto px-6 py-8 slim-scroll">
        <PageHeader
          title="Pengaturan Kategori"
          subtitle="Atur default kewajiban persetujuan analisa sebelum tiket diklaim."
        />

        {error && (
          <p className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="overflow-hidden rounded-lg border border-border bg-card/80">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-card-hover/60 text-xs uppercase tracking-wide text-text-muted">
              <tr>
                <th className="px-4 py-3">Kode</th>
                <th className="px-4 py-3">Nama Kategori</th>
                <th className="px-4 py-3">Wajib Persetujuan Analisa</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr key={cat.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 font-[family-name:var(--font-display)] text-accent">
                    {cat.code || "-"}
                  </td>
                  <td className="px-4 py-3">{cat.name}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={Boolean(cat.requires_analysis_approval)}
                      aria-label={`Wajibkan persetujuan analisa untuk ${cat.name}`}
                      disabled={savingId === cat.id}
                      onClick={() => toggleGate(cat)}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-50 ${
                        cat.requires_analysis_approval ? "bg-accent" : "bg-border"
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                          cat.requires_analysis_approval ? "translate-x-5" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {categories.length === 0 && !error && (
            <p className="px-4 py-6 text-center text-sm text-text-muted">Belum ada kategori.</p>
          )}
        </div>

        <p className="mt-4 text-xs text-text-muted">
          Toggle ini adalah default untuk tiket baru di kategori tersebut. Ticketing
          individual tetap bisa dioverride lewat form Analisa di halaman tiket.
        </p>
      </main>
    </div>
  );
}
