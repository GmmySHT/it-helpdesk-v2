"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { listDisposals, getMyPermissions, AssetDisposal } from "@/lib/api";
import { Sidebar } from "@/components/sidebar";
import PageHeader from "@/components/page-header";

const METHOD_COLORS = {
  recycle: "bg-green-500/20 text-green-600 border-green-300",
  donate: "bg-blue-500/20 text-blue-600 border-blue-300",
  destroy: "bg-red-500/20 text-red-600 border-red-300",
  sell: "bg-yellow-500/20 text-yellow-600 border-yellow-300",
};

const METHOD_LABEL = {
  recycle: "♻️ Didaur Ulang",
  donate: "🎁 Didonasikan",
  destroy: "💥 Dimusnahkan",
  sell: "💰 Dijual",
};

export default function DisposalsPage() {
  const { token, user } = useAuth();
  const router = useRouter();

  const [disposals, setDisposals] = useState<AssetDisposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }

    const init = async () => {
      try {
        const perms = await getMyPermissions(token);
        const assetPerm = perms.find((p) => p.module_code === "asset");
        if (assetPerm?.access_level !== "editor") {
          router.push("/asset");
          return;
        }

        const res = await listDisposals(token, 100);
        setDisposals(res.data || []);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [token, router]);

  return (
    <div className="relative z-0 flex h-screen bg-transparent font-[family-name:var(--font-body)]">
      <Sidebar />
      <main className="relative flex-1 overflow-y-auto slim-scroll">
        <PageHeader
          title="Pemusnahan Aset"
          subtitle="Riwayat aset yang telah dibuang"
          actions={[{ label: "← Daftar Aset", href: "/asset", variant: "secondary" as const }]}
        />
        <div className="relative z-10 w-full px-6 py-8 sm:px-10">
          <div className="max-w-6xl mx-auto">

        {error && (
          <div className="bg-red-500/20 border border-red-300 text-red-600 p-4 rounded-lg mb-6">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <p className="text-text-secondary">Memuat data...</p>
          </div>
        ) : disposals.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-text-secondary">Belum ada riwayat pemusnahan aset</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {disposals.map((d) => (
              <div
                key={d.id}
                className="bg-card border border-border rounded-lg p-4 hover:shadow-md transition"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-text-primary">
                        {d.asset_code} - {d.asset_name}
                      </h3>
                      <span
                        className={`px-2 py-1 text-xs font-semibold rounded border ${
                          METHOD_COLORS[d.disposal_method]
                        }`}
                      >
                        {METHOD_LABEL[d.disposal_method]}
                      </span>
                    </div>
                    <p className="text-text-secondary mt-1">Alasan: {d.reason}</p>
                    <div className="flex gap-4 mt-2 text-sm text-text-muted">
                      <span>👤 Oleh: {d.disposer_name}</span>
                      <span>📅 Tanggal: {d.disposed_at}</span>
                      {d.certificate_number && (
                        <span>📜 Sertifikat: {d.certificate_number}</span>
                      )}
                    </div>
                    {d.notes && (
                      <p className="text-sm text-text-muted mt-2 italic">Catatan: {d.notes}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
          </div>
        </div>
      </main>
    </div>
  );
}
