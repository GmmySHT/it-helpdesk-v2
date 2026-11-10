"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { getMonitoring, DashboardPayload, PeriodSel } from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from "recharts";
import {
  Pill, TrendingUp, Package, AlertTriangle, ArrowLeft, RefreshCw,
  ChevronLeft, ChevronRight, Calendar,
} from "lucide-react";
import Link from "next/link";

const C = {
  bg: "#0B1120", card: "#111827", border: "#1F2937",
  tosca: "#00A693", green: "#10B981", amber: "#F59E0B",
  red: "#EF4444", blue: "#3B82F6", purple: "#8B5CF6",
  text: "#F8FAFC", muted: "#94A3B8",
};
const PIE_COLORS = [C.tosca, C.blue, C.purple, C.amber, C.green, C.red, "#EC4899", "#6366F1"];

export default function PharmacyPage() {
  const { token } = useAuth();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const now = new Date();
  const [sel, setSel] = useState<PeriodSel>({
    period: "month", year: now.getFullYear(), month: now.getMonth() + 1,
  });

  const label = () => {
    if (sel.period === "year") return `Tahun ${sel.year}`;
    if (sel.period === "day") {
      return `${sel.year}-${String(sel.month).padStart(2, "0")}-${String(sel.day ?? 1).padStart(2, "0")}`;
    }
    const m = ["", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    return `${m[sel.month ?? 1]} ${sel.year}`;
  };

  const prev = () => {
    const s = { ...sel };
    if (s.period === "year") { s.year--; setSel(s); }
    else if (s.period === "month") {
      s.month = (s.month ?? 1) - 1; if (s.month < 1) { s.month = 12; s.year--; } setSel(s);
    } else {
      const d = new Date(s.year, (s.month ?? 1) - 1, s.day ?? 1);
      d.setDate(d.getDate() - 1);
      s.year = d.getFullYear(); s.month = d.getMonth() + 1; s.day = d.getDate();
      setSel(s);
    }
  };
  const next = () => {
    const s = { ...sel };
    if (s.period === "year") { s.year++; setSel(s); }
    else if (s.period === "month") {
      s.month = (s.month ?? 1) + 1; if (s.month > 12) { s.month = 1; s.year++; } setSel(s);
    } else {
      const d = new Date(s.year, (s.month ?? 1) - 1, s.day ?? 1);
      d.setDate(d.getDate() + 1);
      s.year = d.getFullYear(); s.month = d.getMonth() + 1; s.day = d.getDate();
      setSel(s);
    }
  };

  const fetchData = useCallback(async () => {
    if (!token) return;
    setLoading(true); setErr("");
    try {
      const d = await getMonitoring(token, {
        period: sel.period, year: sel.year, month: sel.month, day: sel.day,
      });
      setData(d);
    } catch (e: any) { setErr(e.message); }
    setLoading(false);
  }, [token, sel]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fmt = (n: number) => new Intl.NumberFormat("id-ID").format(Math.round(n));
  const rp = (n: number) => `Rp ${fmt(n)}`;
  const pct = (a: number, b: number) => b === 0 ? "0%" : `${((a / b) * 100).toFixed(1)}%`;

  const summary = data?.pharmacy_summary;
  const sales = data?.pharmacy_sales ?? [];
  const stock = data?.drug_stock ?? [];
  const rooms = data?.pharmacy_rooms ?? [];

  // Kategori pie data
  const kategoriMap: Record<string, number> = {};
  sales.forEach((s) => { kategoriMap[s.kategori] = (kategoriMap[s.kategori] || 0) + s.revenue; });
  const kategoriPie = Object.entries(kategoriMap).map(([name, value]) => ({ name, value }));

  // Stok rendah / kadaluarsa
  const stokRendah = stock.filter((s) => s.stok_tersedia <= 50).sort((a, b) => a.stok_tersedia - b.stok_tersedia);
  const hampirExpired = stock.filter((s) => {
    const d = new Date(s.kadaluarsa_terdekat);
    const diff = (d.getTime() - Date.now()) / 86400000;
    return diff <= 90 && diff > 0;
  });

  const StatCard = ({ icon: Icon, label, value, sub, color }: any) => (
    <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4 flex items-center gap-4">
      <div className="p-3 rounded-lg" style={{ background: `${color}18` }}>
        <Icon size={22} style={{ color }} />
      </div>
      <div>
        <p className="text-xs text-[#94A3B8]">{label}</p>
        <p className="text-lg font-bold text-[#F8FAFC]">{value}</p>
        {sub && <p className="text-xs text-[#94A3B8]">{sub}</p>}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0B1120] p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Link href="/monitoring" className="p-2 rounded-lg bg-[#111827] border border-[#1F2937] hover:border-[#00A693]/50 transition">
            <ArrowLeft size={18} className="text-[#94A3B8]" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-[#F8FAFC] flex items-center gap-2">
              <Pill size={22} className="text-[#00A693]" /> Monitoring Farmasi
            </h1>
            <p className="text-xs text-[#94A3B8]">Penjualan obat, stok, dan retur periode {label()}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Period selector */}
          <div className="flex items-center gap-1 bg-[#111827] border border-[#1F2937] rounded-lg overflow-hidden">
            {(["day", "month", "year"] as const).map((p) => (
              <button key={p} onClick={() => setSel((s) => ({ ...s, period: p }))}
                className={`px-3 py-2 text-xs font-medium transition ${sel.period === p ? "bg-[#00A693]/20 text-[#00A693]" : "text-[#94A3B8] hover:text-[#F8FAFC]"}`}>
                {p === "day" ? "Hari" : p === "month" ? "Bulan" : "Tahun"}
              </button>
            ))}
          </div>
          <button onClick={prev} className="p-2 rounded-lg bg-[#111827] border border-[#1F2937] hover:border-[#00A693]/50 transition">
            <ChevronLeft size={16} className="text-[#94A3B8]" />
          </button>
          <span className="px-3 py-2 text-sm font-medium text-[#F8FAFC] bg-[#111827] border border-[#1F2937] rounded-lg min-w-[140px] text-center flex items-center justify-center gap-1">
            <Calendar size={14} /> {label()}
          </span>
          <button onClick={next} className="p-2 rounded-lg bg-[#111827] border border-[#1F2937] hover:border-[#00A693]/50 transition">
            <ChevronRight size={16} className="text-[#94A3B8]" />
          </button>
          <button onClick={fetchData} className="p-2 rounded-lg bg-[#111827] border border-[#1F2937] hover:border-[#00A693]/50 transition" title="Refresh">
            <RefreshCw size={16} className={`text-[#94A3B8] ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {err && <div className="bg-red-900/30 border border-red-800 text-red-300 px-4 py-3 rounded-lg text-sm">{err}</div>}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Pill} label="Total Qty Obat" value={summary ? fmt(summary.total_qty) : "—"} color={C.tosca} />
        <StatCard icon={TrendingUp} label="Revenue Penjualan" value={summary ? rp(summary.total_revenue) : "—"} sub={summary ? `HPP: ${rp(summary.total_hpp)}` : undefined} color={C.green} />
        <StatCard icon={Package} label="Kunjungan Farmasi" value={summary ? fmt(summary.total_kunjungan ?? 0) : "—"} color={C.blue} />
        <StatCard icon={AlertTriangle} label="Retur" value={summary ? `${summary.jumlah_retur ?? 0}x` : "—"} sub={summary ? `Rp ${fmt(summary.total_retur)}` : undefined} color={C.amber} />
      </div>

      {/* Charts Row 1: Top Obat + Kategori Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top 10 Obat Terlaris */}
        <div className="lg:col-span-2 bg-[#111827] border border-[#1F2937] rounded-xl p-4">
          <h2 className="text-sm font-semibold text-[#F8FAFC] mb-3">Top 10 Obat Terlaris (Qty)</h2>
          {sales.length === 0 ? <p className="text-xs text-[#94A3B8]">Tidak ada data</p> : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={sales.slice(0, 10)} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                <XAxis type="number" tick={{ fill: C.muted, fontSize: 11 }} />
                <YAxis dataKey="obat_nama" type="category" width={150} tick={{ fill: C.muted, fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: C.text }}
                  formatter={(v: any, n: any) => n === "qty_terjual" ? [fmt(v), "Qty"] : [rp(v), "Revenue"]}
                />
                <Bar dataKey="qty_terjual" fill={C.tosca} radius={[0, 4, 4, 0]} name="qty_terjual" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Kategori Pie */}
        <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
          <h2 className="text-sm font-semibold text-[#F8FAFC] mb-3">Revenue per Kategori</h2>
          {kategoriPie.length === 0 ? <p className="text-xs text-[#94A3B8]">Tidak ada data</p> : (
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie data={kategoriPie} cx="50%" cy="45%" outerRadius={90} dataKey="value" nameKey="name"
                  label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                  labelLine={{ stroke: C.muted }}
                  stroke="none"
                >
                  {kategoriPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v: any) => rp(v)} contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Charts Row 2: Penjualan per Ruangan + Stok Table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Penjualan per Ruangan */}
        <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
          <h2 className="text-sm font-semibold text-[#F8FAFC] mb-3">Penjualan per Ruangan</h2>
          {rooms.length === 0 ? <p className="text-xs text-[#94A3B8]">Tidak ada data</p> : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={rooms} margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
                <XAxis dataKey="ruangan_nama" tick={{ fill: C.muted, fontSize: 11 }} angle={-20} textAnchor="end" height={60} />
                <YAxis yAxisId="left" tick={{ fill: C.muted, fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: C.muted, fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any, n: any) => n === "revenue" ? [rp(v), "Revenue"] : [fmt(v), "Qty Obat"]}
                />
                <Bar yAxisId="left" dataKey="revenue" fill={C.tosca} radius={[4, 4, 0, 0]} name="revenue" />
                <Bar yAxisId="right" dataKey="qty_obat" fill={C.blue} radius={[4, 4, 0, 0]} name="qty_obat" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Stok Obat Table */}
        <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
          <h2 className="text-sm font-semibold text-[#F8FAFC] mb-3">
            Stok Obat
            <span className="text-[#94A3B8] font-normal ml-2">({stock.length} item)</span>
          </h2>
          <div className="overflow-auto max-h-[320px] scrollbar-thin">
            <table className="w-full text-xs text-left">
              <thead className="text-[#94A3B8] border-b border-[#1F2937] sticky top-0 bg-[#111827]">
                <tr>
                  <th className="py-2 px-2">Nama Obat</th>
                  <th className="py-2 px-2 text-right">Stok</th>
                  <th className="py-2 px-2 text-right">Kadaluarsa</th>
                  <th className="py-2 px-2 text-right">Expired</th>
                </tr>
              </thead>
              <tbody>
                {stock.slice(0, 50).map((s, i) => {
                  const isLow = s.stok_tersedia <= 50;
                  const hasExpired = s.stok_kadaluarsa > 0;
                  return (
                    <tr key={i} className="border-b border-[#1F2937]/50 hover:bg-[#1F2937]/30">
                      <td className="py-2 px-2 text-[#F8FAFC]">
                        {s.obat_nama}
                        <span className="ml-1 text-[10px] text-[#94A3B8]">{s.kategori}</span>
                      </td>
                      <td className={`py-2 px-2 text-right font-mono ${isLow ? "text-[#EF4444]" : "text-[#10B981]"}`}>
                        {fmt(s.stok_tersedia)}
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-[#94A3B8]">{s.kadaluarsa_terdekat}</td>
                      <td className={`py-2 px-2 text-right font-mono ${hasExpired ? "text-[#F59E0B]" : "text-[#94A3B8]"}`}>
                        {hasExpired ? fmt(s.stok_kadaluarsa) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Alerts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Stok Rendah */}
        <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
          <h2 className="text-sm font-semibold text-[#F59E0B] flex items-center gap-2 mb-3">
            <AlertTriangle size={16} /> Stok Rendah (≤50)
          </h2>
          {stokRendah.length === 0 ? <p className="text-xs text-[#94A3B8]">Semua stok aman ✓</p> : (
            <ul className="space-y-2 max-h-[200px] overflow-auto">
              {stokRendah.map((s, i) => (
                <li key={i} className="flex items-center justify-between px-3 py-2 bg-[#0B1120] rounded-lg border border-[#1F2937]">
                  <span className="text-xs text-[#F8FAFC]">{s.obat_nama}</span>
                  <span className="text-xs font-mono text-[#EF4444]">{fmt(s.stok_tersedia)} unit</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Hampir Kadaluarsa */}
        <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
          <h2 className="text-sm font-semibold text-[#EF4444] flex items-center gap-2 mb-3">
            <Package size={16} /> Hampir Kadaluarsa (≤90 hari)
          </h2>
          {hampirExpired.length === 0 ? <p className="text-xs text-[#94A3B8]">Tidak ada obat mendekati kadaluarsa ✓</p> : (
            <ul className="space-y-2 max-h-[200px] overflow-auto">
              {hampirExpired.map((s, i) => (
                <li key={i} className="flex items-center justify-between px-3 py-2 bg-[#0B1120] rounded-lg border border-[#1F2937]">
                  <span className="text-xs text-[#F8FAFC]">{s.obat_nama}</span>
                  <span className="text-xs font-mono text-[#F59E0B]">{s.kadaluarsa_terdekat}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Margin Analysis */}
      {summary && summary.total_revenue > 0 && (
        <div className="bg-[#111827] border border-[#1F2937] rounded-xl p-4">
          <h2 className="text-sm font-semibold text-[#F8FAFC] mb-3">Analisis Margin</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-[#94A3B8]">Total Revenue</p>
              <p className="text-lg font-bold text-[#00A693]">{rp(summary.total_revenue)}</p>
            </div>
            <div>
              <p className="text-xs text-[#94A3B8]">Total HPP</p>
              <p className="text-lg font-bold text-[#94A3B8]">{rp(summary.total_hpp)}</p>
            </div>
            <div>
              <p className="text-xs text-[#94A3B8]">Laba Kotor</p>
              <p className="text-lg font-bold text-[#10B981]">{rp(summary.total_revenue - summary.total_hpp)}</p>
            </div>
            <div>
              <p className="text-xs text-[#94A3B8]">Margin</p>
              <p className="text-lg font-bold text-[#00A693]">
                {pct(summary.total_revenue - summary.total_hpp, summary.total_revenue)}
              </p>
            </div>
          </div>
          <div className="mt-3 w-full bg-[#1F2937] rounded-full h-3 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: pct(summary.total_revenue - summary.total_hpp, summary.total_revenue),
                background: `linear-gradient(90deg, ${C.tosca}, ${C.green})`,
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-[#94A3B8] mt-1">
            <span>HPP: {pct(summary.total_hpp, summary.total_revenue)}</span>
            <span>Laba: {pct(summary.total_revenue - summary.total_hpp, summary.total_revenue)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
