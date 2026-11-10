'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/page-header';
import { Sidebar } from '@/components/sidebar';
import { getDashboardConfig, updateDashboardConfig } from '@/lib/api';

export default function DashboardAdmin() {
  const { token, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [target, setTarget] = useState<string>('8500000000');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!token) { router.push('/login'); return; }
    const fetchTarget = async () => {
      try {
        const data = await getDashboardConfig(token);
        setTarget(String(data.monthly_revenue_target || 8500000000));
        setError(null);
      } catch (err) {
        setError('Gagal mengambil konfigurasi');
      } finally {
        setLoading(false);
      }
    };
    setLoading(true);
    fetchTarget();
  }, [token, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const val = parseInt(target.replace(/\D/g, '')) || 0;
      if (val <= 0) throw new Error('Target harus lebih dari 0');
      await updateDashboardConfig(token, val);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan target');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (val: string) => {
    const num = parseInt(val.replace(/\D/g, '')) || 0;
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num);
  };

  return (
    <div className="relative z-0 flex h-screen bg-transparent font-[family-name:var(--font-body)]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto slim-scroll">
        <PageHeader
          title="Konfigurasi Dashboard"
          subtitle="Atur target pendapatan bulanan untuk grafik monitoring"
        />
        <div className="relative z-10 w-full px-6 py-8 sm:px-10">
          <div className="max-w-2xl mx-auto space-y-6">

            {/* Card utama */}
            <div className="bg-card border border-border rounded-xl shadow-sm p-6">
              <h2 className="text-base font-semibold text-text-primary mb-5">Target Pendapatan Bulanan</h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-text-muted mb-1.5">
                    Target Pendapatan (Rp)
                  </label>
                  <input
                    type="text"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    disabled={loading}
                    className="w-full rounded-md border border-border bg-card-hover px-3.5 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none focus:border-accent disabled:opacity-50"
                    placeholder="Contoh: 8500000000"
                  />
                  <p className="mt-2 text-sm text-text-muted">
                    Target saat ini:{' '}
                    <span className="font-semibold text-accent">{formatCurrency(target)}</span>
                  </p>
                </div>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={saving || authLoading || loading}
                    className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {saving ? (
                      <>
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                        Menyimpan...
                      </>
                    ) : 'Simpan Target'}
                  </button>
                  {saved && (
                    <span className="text-sm text-green-600 font-medium">✓ Target berhasil disimpan!</span>
                  )}
                  {error && (
                    <span className="text-sm text-red-500 font-medium">{error}</span>
                  )}
                </div>
              </form>
            </div>

            {/* Card panduan */}
            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="text-sm font-semibold text-text-primary mb-3">Cara penggunaan</h3>
              <ul className="space-y-2 text-sm text-text-secondary">
                <li className="flex gap-2">
                  <span className="text-accent mt-0.5">•</span>
                  Input target pendapatan dalam rupiah tanpa titik atau koma
                </li>
                <li className="flex gap-2">
                  <span className="text-accent mt-0.5">•</span>
                  Klik <strong>Simpan Target</strong> untuk menyimpan ke database
                </li>
                <li className="flex gap-2">
                  <span className="text-accent mt-0.5">•</span>
                  Target muncul sebagai garis oranye putus-putus di grafik <strong>Tahunan</strong> pada halaman Monitoring
                </li>
                <li className="flex gap-2">
                  <span className="text-accent mt-0.5">•</span>
                  Perubahan berlaku langsung tanpa perlu redeploy aplikasi
                </li>
              </ul>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
