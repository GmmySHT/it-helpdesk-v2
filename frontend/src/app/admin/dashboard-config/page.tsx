'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import PageHeader from '@/components/page-header';
import { getDashboardConfig, updateDashboardConfig } from '@/lib/api';

export default function DashboardAdmin() {
  const { token, isLoading: authLoading } = useAuth();
  const [target, setTarget] = useState<string>('8500000000');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const fetchTarget = async () => {
      try {
        const data = await getDashboardConfig(token);
        setTarget(String(data.monthly_revenue_target || 8500000000));
        setError(null);
      } catch (err) {
        console.error('Fetch target error:', err);
        setError('Gagal mengambil konfigurasi');
      } finally {
        setLoading(false);
      }
    };
    setLoading(true);
    fetchTarget();
  }, [token]);

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
      console.error('Update target error:', err);
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
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeader title="Konfigurasi Dashboard" subtitle="Atur target pendapatan bulanan untuk grafik monitoring" />

      <div className="bg-white border border-[#C7EDF0] rounded-lg shadow-[0_4px_12px_rgba(13,148,136,0.10)] p-6 mt-6">
        <h2 className="text-xl font-semibold text-[#115E70] mb-4">Target Pendapatan Bulanan</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-[#115E70] mb-2">
              Target Pendapatan (Rp)
            </label>
            <input
              type="text"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full p-3 border border-[#C7EDF0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0D9488] bg-[#F4FBFC]"
              placeholder="Contoh: 8500000000"
            />
            <p className="mt-2 text-sm text-[#6B7280]">
              Target saat ini: <span className="font-medium text-[#0D9488]">{formatCurrency(target)}</span>
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={saving || authLoading}
              className="px-4 py-2 bg-[#0D9488] text-white rounded-lg hover:bg-[#5EEAD4] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? 'Menyimpan...' : 'Simpan Target'}
            </button>
            {saved && (
              <span className="text-sm text-[#059669] font-medium">Target berhasil disimpan!</span>
            )}
            {error && (
              <span className="text-sm text-red-600 font-medium">{error}</span>
            )}
          </div>
        </form>

        <div className="mt-6 p-4 bg-[#F3F4F6] rounded-lg">
          <h3 className="text-sm font-semibold text-[#374151] mb-2">Cara penggunaan:</h3>
          <ul className="text-sm text-[#4B5563] space-y-1 list-disc pl-5">
            <li>Input target pendapatan dalam rupiah (tanpa titik/koma)</li>
            <li>Klik "Simpan Target" untuk menyimpan</li>
            <li>Target otomatis muncul di grafik monitoring sebagai garis oranye putus-putus</li>
            <li>Ganti target kapan saja tanpa redeploy aplikasi</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
