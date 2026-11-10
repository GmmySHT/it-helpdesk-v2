"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/page-header";
import {
  listAssets,
  listAssetCategories,
  getMyPermissions,
  AssetCategory,
  Asset,
  AssetConditionEnum,
} from "@/lib/api";
import { Sidebar } from "@/components/sidebar";

const CONDITION_COLORS: Record<AssetConditionEnum, string> = {
  available: "bg-green-500/20 text-green-600 border-green-300",
  borrowed: "bg-yellow-500/20 text-yellow-600 border-yellow-300",
  needs_repair: "bg-orange-500/20 text-orange-600 border-orange-300",
  broken: "bg-red-500/20 text-red-600 border-red-300",
  awaiting_disposal: "bg-purple-500/20 text-purple-600 border-purple-300",
  disposed: "bg-gray-500/20 text-gray-600 border-gray-300",
};

const CONDITION_LABEL: Record<AssetConditionEnum, string> = {
  available: "Tersedia",
  borrowed: "Dipinjam",
  needs_repair: "Perlu Perbaikan",
  broken: "Rusak",
  awaiting_disposal: "Tunggu Pembuangan",
  disposed: "Dibuang",
};

export default function AssetPage() {
  const { token, user } = useAuth();
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedCondition, setSelectedCondition] = useState("");
  const [searchCode, setSearchCode] = useState("");

  const [canManageAsset, setCanManageAsset] = useState(false);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }

    const init = async () => {
      try {
        const perms = await getMyPermissions(token);
        const assetPerm = perms.find((p) => p.module_code === "asset");
        const isEditor = assetPerm?.access_level === "editor";
        setCanManageAsset(isEditor);

        const [assetsRes, categoriesRes] = await Promise.all([
          listAssets(token, selectedCategory || undefined, selectedCondition || undefined),
          listAssetCategories(token),
        ]);
        setAssets(assetsRes.data || []);
        setCategories(categoriesRes || []);
        setError("");
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [token, selectedCategory, selectedCondition, router]);

  const filteredAssets = assets.filter(
    (a) => !searchCode || a.code.toLowerCase().includes(searchCode.toLowerCase())
  );

  return (
    <div className="relative z-0 flex h-screen bg-transparent font-[family-name:var(--font-body)]">
      <Sidebar />
      <main className="relative flex-1 overflow-y-auto slim-scroll">
        <PageHeader
          title="Aset IT"
          subtitle="Kelola inventaris aset teknologi"
          actions={
            canManageAsset
              ? [{ label: "+ Tambah Aset", href: "/asset/new", variant: "primary" as const }]
              : []
          }
        />
        <div className="relative z-10 w-full px-6 py-12 sm:px-10">
          <div className="max-w-7xl mx-auto">

        {/* Filters */}
        <div className="bg-card border border-border rounded-lg p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              type="text"
              placeholder="Cari kode aset..."
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value)}
              className="px-3 py-2 bg-bg-page border border-border rounded text-text-primary placeholder-text-muted"
            />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 bg-bg-page border border-border rounded text-text-primary"
            >
              <option value="">Semua Kategori</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
            <select
              value={selectedCondition}
              onChange={(e) => setSelectedCondition(e.target.value)}
              className="px-3 py-2 bg-bg-page border border-border rounded text-text-primary"
            >
              <option value="">Semua Kondisi</option>
              {Object.entries(CONDITION_LABEL).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <button
              onClick={() => {
                setSearchCode("");
                setSelectedCategory("");
                setSelectedCondition("");
              }}
              className="px-3 py-2 bg-border text-text-secondary hover:bg-border/80 rounded"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-text-secondary">Memuat data aset...</p>
          </div>
        ) : error ? (
          <div className="bg-red-500/20 border border-red-300 text-red-600 p-4 rounded-lg">
            {error}
          </div>
        ) : filteredAssets.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-text-secondary">Tidak ada aset ditemukan</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredAssets.map((asset) => (
              <div
                key={asset.id}
                onClick={() => router.push(`/asset/${asset.id}`)}
                className="bg-card border border-border rounded-lg p-4 hover:shadow-md transition cursor-pointer"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-text-primary">
                        {asset.code}
                      </h3>
                      <span
                        className={`px-2 py-1 text-xs font-semibold rounded border ${
                          CONDITION_COLORS[asset.condition]
                        }`}
                      >
                        {CONDITION_LABEL[asset.condition]}
                      </span>
                    </div>
                    <p className="text-text-secondary mt-1">{asset.name}</p>
                    <div className="flex gap-4 mt-2 text-sm text-text-muted">
                      {asset.brand && <span>📦 {asset.brand}</span>}
                      {asset.model && <span>🏷️ {asset.model}</span>}
                      {asset.location && <span>📍 {asset.location}</span>}
                      <span>📊 Stok: {asset.stock}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-accent">{asset.stock}</p>
                    <p className="text-xs text-text-muted">unit</p>
                    {canManageAsset && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/asset/${asset.id}/edit`);
                        }}
                        className="mt-2 px-3 py-1 text-xs bg-border text-text-secondary hover:bg-border/80 rounded"
                      >
                        ✏️ Edit
                      </button>
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