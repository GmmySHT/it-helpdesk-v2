"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/page-header";
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Legend,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useAuth } from "@/lib/auth-context";
import { Sidebar } from "@/components/sidebar";
import { Lock } from "lucide-react";
import {
  getKPIReport,
  getMyPermissions,
  getReportTrend,
  getPriorityBreakdown,
  getCategoryBreakdown,
  getReportStaffPerformance,
  listTickets,
  listCategories,
  KPIReport,
  TrendPoint,
  CategoryCount,
  StaffPerformance,
  AssetBorrowingStats,
  Ticket,
  Category,
  getAssetBorrowingStats,
} from "@/lib/api";

const KPI_CARDS: {
  key: keyof KPIReport;
  label: string;
  icon: string;
  format: (v: number) => string;
  accent?: (v: number) => "good" | "warning" | undefined;
}[] = [
  { key: "total_tickets", label: "Total Tiket", icon: "🎫", format: (v) => String(v) },
  { key: "open", label: "Open", icon: "🔴", format: (v) => String(v) },
  { key: "in_progress", label: "In Progress", icon: "🟡", format: (v) => String(v) },
  { key: "resolved", label: "Resolved", icon: "🟢", format: (v) => String(v) },
  {
    key: "overdue",
    label: "Overdue",
    icon: "⏰",
    format: (v) => String(v),
    accent: (v) => (v > 0 ? "warning" : "good"),
  },
  {
    key: "critical",
    label: "Critical",
    icon: "⚡",
    format: (v) => String(v),
    accent: (v) => (v > 0 ? "warning" : "good"),
  },
  {
    key: "avg_response_minutes",
    label: "Avg Response Time",
    icon: "⏱",
    format: (v) => `${Math.round(v)} mnt`,
  },
  {
    key: "avg_resolution_minutes",
    label: "Avg Resolution Time",
    icon: "⏱",
    format: (v) => `${Math.round(v)} mnt`,
  },
];

const STATUS_LABEL: Record<string, string> = {
  pending_approval: "Menunggu Persetujuan",
  unassigned: "Belum Ditugaskan",
  assigned: "Menunggu Diklaim",
  claimed: "Sedang Dikerjakan",
  resolved: "Menunggu Review",
  closed: "Selesai",
};

const PRIORITY_LABEL: Record<string, string> = {
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
  urgent: "Mendesak",
};

const PRIORITY_COLOR: Record<string, string> = {
  low: "#7C8AA3",
  medium: "#60A5FA",
  high: "#F5A623",
  urgent: "#EF4444",
};

const CATEGORY_PALETTE = ["#2DD4BF", "#A78BFA", "#F5A623", "#60A5FA", "#EF4444", "#5EEAD4"];

const chartTooltipStyle = {
  background: "#0F1729",
  border: "1px solid #1E293B",
  borderRadius: 6,
  fontSize: 12,
  color: "#E2E8F0",
};

export default function ReportsPage() {
  const { user, token, isLoading } = useAuth();
  const router = useRouter();

  const [myAccessLevel, setMyAccessLevel] = useState<string | null>(null);
  const [report, setReport] = useState<KPIReport | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [priorityBreakdown, setPriorityBreakdown] = useState<Record<string, number>>({});
  const [categoryBreakdown, setCategoryBreakdown] = useState<CategoryCount[]>([]);
  const [staffPerformance, setStaffPerformance] = useState<StaffPerformance[]>([]);
  const [assetStats, setAssetStats] = useState<AssetBorrowingStats | null>(null);
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!token) return;
    getMyPermissions(token)
      .then((perms) => {
        const perm = (perms || []).find((p) => p.module_code === "reports");
        setMyAccessLevel(perm?.access_level || "none");
      })
      .catch(() => setMyAccessLevel("none"));
  }, [token]);

  useEffect(() => {
    if (myAccessLevel === "none") router.push("/dashboard");
  }, [myAccessLevel, router]);

  async function loadAll() {
    if (!token) return;
    setError("");
    try {
      const [kpi, trendData, prioData, catData, staffPerfData, tickets, cats, assetData] = await Promise.all([
        getKPIReport(token, fromDate || undefined, toDate || undefined),
        getReportTrend(token, fromDate || undefined, toDate || undefined),
        getPriorityBreakdown(token, fromDate || undefined, toDate || undefined),
        getCategoryBreakdown(token, fromDate || undefined, toDate || undefined),
        getReportStaffPerformance(token, fromDate || undefined, toDate || undefined),
        listTickets(token),
        listCategories(token),
        getAssetBorrowingStats(token, fromDate || undefined, toDate || undefined),
      ]);
      setReport(kpi);
      setTrend(trendData || []);
      setPriorityBreakdown(prioData || {});
      setCategoryBreakdown(catData || []);
      setStaffPerformance(staffPerfData || []);
      setAllTickets(tickets || []);
      setCategories(cats || []);
      setAssetStats(assetData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat laporan");
    }
  }

  useEffect(() => {
    if (token && myAccessLevel && myAccessLevel !== "none") loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, myAccessLevel]);

  function handleApplyFilter(e: React.FormEvent) {
    e.preventDefault();
    loadAll();
  }

  function periodLabel() {
    if (!fromDate && !toDate) return "Semua Periode";
    return `${fromDate || "awal"} s/d ${toDate || "sekarang"}`;
  }

  // Tiket yang ditampilkan di tabel disaring sesuai rentang tanggal yang
  // sama dengan filter laporan — dilakukan di frontend supaya tidak perlu
  // endpoint /tickets versi khusus laporan.
  //
  // Untuk staf IT, tabel ini juga disaring ke tiket yang DIA pegang. Tanpa
  // itu kartu ringkasan (yang sudah dibatasi server ke tiketnya) akan
  // bertentangan dengan tabel detail yang berisi tiket seluruh tim — angka
  // "Tiket Masuk 2" di atas tabel berisi 4 baris.
  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const filteredTickets = allTickets.filter((t) => {
    if (user?.role === "staff_it" && t.claimed_by !== user.id) return false;
    if (!fromDate && !toDate) return true;
    const created = new Date(t.created_at);
    if (fromDate && created < new Date(fromDate)) return false;
    if (toDate && created > new Date(toDate + "T23:59:59")) return false;
    return true;
  });

  const priorityPieData = Object.entries(priorityBreakdown)
    .filter(([, count]) => count > 0)
    .map(([priority, count]) => ({
      name: PRIORITY_LABEL[priority] || priority,
      value: count,
      color: PRIORITY_COLOR[priority] || "#7C8AA3",
    }));

  const categoryPieData = categoryBreakdown.map((c, i) => ({
    name: c.category_name,
    value: c.count,
    color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
  }));

  // Narasi otomatis — beberapa kalimat ringkasan dihitung dari data yang
  // sudah dimuat, memberi "penjelasan" seperti laporan formal, bukan
  // cuma angka mentah.
  function buildNarrative(): string[] {
    if (!report) return [];
    const lines: string[] = [];

    const resolveRate =
      report.total_tickets > 0
        ? Math.round((report.resolved / report.total_tickets) * 100)
        : 0;
    lines.push(
      `Pada periode ${periodLabel()}, tercatat ${report.total_tickets} tiket masuk, dengan ${resolveRate}% (${report.resolved} tiket) sudah diselesaikan.`
    );

    if (categoryPieData.length > 0) {
      const top = categoryPieData[0];
      const topPercent = report.total_tickets > 0
        ? Math.round((top.value / report.total_tickets) * 100)
        : 0;
      lines.push(
        `Kategori dengan tiket terbanyak adalah "${top.name}" (${top.value} tiket, ${topPercent}% dari total).`
      );
    }

    lines.push(
      `Rata-rata waktu respons ${Math.round(report.avg_response_minutes)} menit sejak tiket dibuat, dan rata-rata waktu penyelesaian ${Math.round(report.avg_resolution_minutes)} menit sejak diklaim staf.`
    );

    if (report.overdue > 0) {
      lines.push(
        `⚠ Terdapat ${report.overdue} tiket yang sudah melewati batas waktu SLA dan masih belum selesai — perlu perhatian segera.`
      );
    } else {
      lines.push(`✓ Tidak ada tiket yang melewati batas waktu SLA pada periode ini.`);
    }

    if (report.critical > 0) {
      lines.push(
        `Ada ${report.critical} tiket berprioritas mendesak yang masih berjalan saat ini.`
      );
    }

    if (staffPerformance.length > 0) {
      const top = [...staffPerformance].sort((a, b) => b.tickets_resolved - a.tickets_resolved)[0];
      lines.push(
        `Staf dengan tiket selesai terbanyak pada periode ini adalah ${top.staff_name} (${top.tickets_resolved} tiket, kepatuhan SLA ${Math.round(top.sla_compliance_rate)}%).`
      );
    }

    return lines;
  }

  async function handleExportExcel() {
    if (!report) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const summarySheet = XLSX.utils.json_to_sheet(
        KPI_CARDS.map((c) => ({ Metrik: c.label, Nilai: c.format(report[c.key]) }))
      );
      const ticketSheet = XLSX.utils.json_to_sheet(
        filteredTickets.map((t) => ({
          Judul: t.title,
          Kategori: categoryMap[t.category_id] || "-",
          Prioritas: PRIORITY_LABEL[t.priority] || t.priority,
          Status: STATUS_LABEL[t.status] || t.status,
          Dibuat: new Date(t.created_at).toLocaleString("id-ID"),
          "Diklaim Oleh": t.claimed_by_name || "-",
          "Diselesaikan": t.last_resolved_at
            ? new Date(t.last_resolved_at).toLocaleString("id-ID")
            : "-",
        }))
      );
      const staffSheet = XLSX.utils.json_to_sheet(
        staffPerformance.map((p) => ({
          Staf: p.staff_name,
          "Tiket Selesai": p.tickets_resolved,
          "Rata-rata Waktu (menit)": Math.round(p.avg_resolution_minutes),
          "Kepatuhan SLA (%)": Math.round(p.sla_compliance_rate),
        }))
      );
      const assetSheet = XLSX.utils.json_to_sheet(
        assetStats
          ? [
              { Metrik: "Total Peminjaman", Nilai: assetStats.total_borrowings },
              { Metrik: "Sedang Dipinjam", Nilai: assetStats.active_borrowings },
              { Metrik: "Peminjaman Overdue", Nilai: assetStats.overdue_borrowings },
              { Metrik: "Sudah Dikembalikan", Nilai: assetStats.returned_borrowings },
              { Metrik: "Ditangani Staff IT", Nilai: assetStats.handled_by_staff },
              { Metrik: "Rata-rata Hari Pengembalian", Nilai: Number(assetStats.avg_return_days.toFixed(1)) },
            ]
          : []
      );
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Ringkasan KPI");
      XLSX.utils.book_append_sheet(workbook, staffSheet, "Performa Staf");
      if (assetStats) {
        XLSX.utils.book_append_sheet(workbook, assetSheet, "Statistik Aset");
      }
      XLSX.utils.book_append_sheet(workbook, ticketSheet, "Detail Tiket");
      XLSX.writeFile(workbook, `laporan-kpi-${fromDate || "semua"}-${toDate || "sekarang"}.xlsx`);
    } catch {
      setError("Gagal membuat file Excel");
    } finally {
      setExporting(false);
    }
  }

  async function handleExportPDF() {
    if (!report) return;
    setExporting(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;

      const doc = new jsPDF();
      doc.setFontSize(14);
      doc.text("Laporan KPI - Ticketing IT", 14, 16);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`Periode: ${periodLabel()}`, 14, 23);
      doc.text(`Dibuat: ${new Date().toLocaleString("id-ID")}`, 14, 28);

      autoTable(doc, {
        startY: 34,
        head: [["Metrik", "Nilai"]],
        body: KPI_CARDS.map((c) => [c.label, c.format(report[c.key])]),
        headStyles: { fillColor: [45, 212, 191] },
      });

      const narrative = buildNarrative();
      let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;
      doc.setFontSize(11);
      doc.setTextColor(20);
      doc.text("Ringkasan Analisis", 14, y);
      y += 6;
      doc.setFontSize(9);
      doc.setTextColor(80);
      narrative.forEach((line) => {
        const split = doc.splitTextToSize(line, 180);
        doc.text(split, 14, y);
        y += split.length * 5 + 2;
      });

      // Tabel performa staf — dimasukkan SEBELUM tabel tiket supaya
      // laporan formal ini punya bagian khusus soal kinerja tim.
      autoTable(doc, {
        startY: y + 5,
        head: [["Staf", "Tiket Selesai", "Rata-rata Waktu", "Kepatuhan SLA"]],
        body: staffPerformance.map((p) => [
          p.staff_name,
          String(p.tickets_resolved),
          `${Math.round(p.avg_resolution_minutes)} mnt`,
          `${Math.round(p.sla_compliance_rate)}%`,
        ]),
        headStyles: { fillColor: [45, 212, 191] },
        styles: { fontSize: 8 },
      });

      const afterStaffTableY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

      if (assetStats) {
        autoTable(doc, {
          startY: afterStaffTableY,
          head: [["Metrik Peminjaman Aset", "Jumlah"]],
          body: [
            ["Total Peminjaman", String(assetStats.total_borrowings)],
            ["Sedang Dipinjam", String(assetStats.active_borrowings)],
            ["Peminjaman Overdue", String(assetStats.overdue_borrowings)],
            ["Sudah Dikembalikan", String(assetStats.returned_borrowings)],
            ["Ditangani Staff IT", String(assetStats.handled_by_staff)],
            ["Rata-rata Hari Pengembalian", `${assetStats.avg_return_days.toFixed(1)} hari`],
          ],
          headStyles: { fillColor: [45, 212, 191] },
          styles: { fontSize: 8 },
        });
      }

      const afterAssetTableY = assetStats
        ? (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
        : afterStaffTableY;

      autoTable(doc, {
        startY: afterAssetTableY,
        head: [["Judul Tiket", "Kategori", "Prioritas", "Status", "Dibuat"]],
        body: filteredTickets
          .slice(0, 50)
          .map((t) => [
            t.title,
            categoryMap[t.category_id] || "-",
            PRIORITY_LABEL[t.priority] || t.priority,
            STATUS_LABEL[t.status] || t.status,
            new Date(t.created_at).toLocaleDateString("id-ID"),
          ]),
        headStyles: { fillColor: [45, 212, 191] },
        styles: { fontSize: 8 },
      });

      doc.save(`laporan-kpi-${fromDate || "semua"}-${toDate || "sekarang"}.pdf`);
    } catch {
      setError("Gagal membuat file PDF");
    } finally {
      setExporting(false);
    }
  }

  if (isLoading || !user || myAccessLevel === null || myAccessLevel === "none") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-transparent">
        <p className="text-sm text-text-muted">Memuat...</p>
      </main>
    );
  }

  return (
    <div className="relative z-0 flex h-screen bg-transparent font-[family-name:var(--font-body)]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto slim-scroll">
        <PageHeader
          title="Laporan & KPI"
          subtitle="Ringkasan kinerja tim IT support"
          actions={[
            // Laporan KPI per orang adalah halaman terpisah: halaman ini
            // menjawab kondisi antrean tiket, halaman KPI menjawab siapa
            // mengerjakan apa (tiket + daily task) dan bisa diunduh.
            { label: "📊 KPI per Staf", href: "/reports/kpi", variant: "primary" as const },
            { label: "Export Excel", onClick: handleExportExcel, variant: "secondary" as const },
            { label: "Export PDF", onClick: handleExportPDF, variant: "secondary" as const },
          ]}
        />
        <div className="w-full px-6 py-12 sm:px-10">
          {error && (
            <div className="mb-6 rounded-md border border-red/30 bg-red/10 px-4 py-2.5 text-sm text-red">
              {error}
            </div>
          )}

          <form
            onSubmit={handleApplyFilter}
            className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4"
          >
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wide text-text-muted">
                Dari Tanggal
              </label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="rounded-md border border-border bg-card-hover px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] uppercase tracking-wide text-text-muted">
                Sampai Tanggal
              </label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="rounded-md border border-border bg-card-hover px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
              />
            </div>
            <button
              type="submit"
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-card hover:bg-accent/80"
            >
              Terapkan
            </button>
            {(fromDate || toDate) && (
              <button
                type="button"
                onClick={() => {
                  setFromDate("");
                  setToDate("");
                  setTimeout(loadAll, 0);
                }}
                className="rounded-md border border-border px-4 py-2 text-sm text-text-muted hover:text-text-primary"
              >
                Reset
              </button>
            )}
            <span className="ml-auto text-xs text-text-muted/60">{periodLabel()}</span>
          </form>

          {/* Narasi otomatis */}
          {report && (
            <div className="mb-6 rounded-lg border border-accent/30 bg-gradient-to-br from-card to-card p-5">
              <p className="mb-2 font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-accent">
                📋 Ringkasan Analisis
              </p>
              <ul className="space-y-1.5">
                {buildNarrative().map((line, i) => (
                  <li key={i} className="text-sm leading-relaxed text-text-secondary">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 8 kartu KPI */}
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {KPI_CARDS.map((c) => {
              const value = report ? report[c.key] : 0;
              const accent = report && c.accent ? c.accent(value) : undefined;
              const valueColor =
                accent === "warning"
                  ? "text-amber"
                  : accent === "good"
                    ? "text-accent"
                    : "text-text-primary";
              return (
                <div key={c.key} className="rounded-lg border border-border bg-card p-4">
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <span className="text-sm">{c.icon}</span>
                    <p className="font-[family-name:var(--font-display)] text-[10px] uppercase tracking-wide text-text-muted">
                      {c.label}
                    </p>
                  </div>
                  <p className={`font-[family-name:var(--font-display)] text-2xl font-semibold ${valueColor}`}>
                    {report ? c.format(value) : "—"}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Grafik tren */}
          <div className="mb-6 rounded-lg border border-border bg-card p-6">
            <p className="mb-4 font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-text-muted">
              Tren Tiket Dibuat vs Diselesaikan
            </p>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#7C8AA3", fontSize: 10 }} axisLine={{ stroke: "#1E293B" }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fill: "#7C8AA3", fontSize: 11 }} axisLine={{ stroke: "#1E293B" }} tickLine={false} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#7C8AA3" }} />
                <Line type="monotone" dataKey="created" name="Dibuat" stroke="#A78BFA" strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="resolved" name="Diselesaikan" stroke="#2DD4BF" strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Dua donut chart berdampingan */}
          <div className="mb-6 grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg border border-border bg-card p-6">
              <p className="mb-4 font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-text-muted">
                Distribusi Prioritas
              </p>
              {priorityPieData.length === 0 ? (
                <p className="text-center text-xs text-text-muted">Belum ada data.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={priorityPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                      {priorityPieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#7C8AA3" }} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-lg border border-border bg-card p-6">
              <p className="mb-4 font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-text-muted">
                Distribusi Kategori
              </p>
              {categoryPieData.length === 0 ? (
                <p className="text-center text-xs text-text-muted">Belum ada data.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={categoryPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                      {categoryPieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#7C8AA3" }} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Laporan Peminjaman Aset — statistik transaksi aset*/}
          <div className="mb-6 rounded-lg border border-border bg-card p-6">
            <p className="mb-4 font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-text-muted">
              📦 Laporan Peminjaman Aset
            </p>
            {!assetStats ? (
              <p className="text-center text-xs text-text-muted">Memuat data aset...</p>
            ) : (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
                <div className="rounded-lg bg-black/30 p-4">
                  <p className="text-xs text-text-muted">Total Peminjaman</p>
                  <p className="mt-2 text-lg font-semibold text-text-primary">{assetStats.total_borrowings}</p>
                </div>
                <div className="rounded-lg bg-black/30 p-4">
                  <p className="text-xs text-text-muted">Sedang Dipinjam</p>
                  <p className="mt-2 text-lg font-semibold text-accent">{assetStats.active_borrowings}</p>
                </div>
                <div className="rounded-lg bg-black/30 p-4">
                  <p className="text-xs text-text-muted">Overdue</p>
                  <p className="mt-2 text-lg font-semibold text-red">{assetStats.overdue_borrowings}</p>
                </div>
                <div className="rounded-lg bg-black/30 p-4">
                  <p className="text-xs text-text-muted">Sudah Dikembalikan</p>
                  <p className="mt-2 text-lg font-semibold text-green-400">{assetStats.returned_borrowings}</p>
                </div>
                <div className="rounded-lg bg-black/30 p-4">
                  <p className="text-xs text-text-muted">Ditangani Staff IT</p>
                  <p className="mt-2 text-lg font-semibold text-text-primary">{assetStats.handled_by_staff}</p>
                </div>
                <div className="rounded-lg bg-black/30 p-4">
                  <p className="text-xs text-text-muted">Rata-rata Hari Return</p>
                  <p className="mt-2 text-lg font-semibold text-text-primary">{assetStats.avg_return_days.toFixed(1)}</p>
                </div>
              </div>
            )}
          </div>

          {/* Performa Staf — kinerja tiap staf yang mengerjakan tiket,
              ikut rentang tanggal yang sama dengan filter laporan.
              Untuk staff_it, backend hanya mengirim barisnya sendiri, jadi
              judulnya diganti "Performa Saya" dan diberi penanda kunci
              supaya jelas angkanya bukan angka tim. */}
          <div className="mb-6 rounded-lg border border-border bg-card p-6">
            <p className="mb-4 flex items-center gap-1.5 font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-text-muted">
              {user?.role === "staff_it" ? (
                <>
                  <Lock className="h-3 w-3" />
                  Performa Saya
                </>
              ) : (
                <>Performa Staf ({staffPerformance.length})</>
              )}
            </p>
            {staffPerformance.length === 0 ? (
              <p className="text-center text-xs text-text-muted">
                Belum ada tiket yang diselesaikan pada periode ini.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-border text-text-muted">
                      <th className="pb-2 pr-4">Staf</th>
                      <th className="pb-2 pr-4">Tiket Selesai</th>
                      <th className="pb-2 pr-4">Rata-rata Waktu</th>
                      <th className="pb-2 pr-4">Kepatuhan SLA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffPerformance.map((p) => (
                      <tr key={p.staff_id} className="border-b border-border-subtle">
                        <td className="py-2.5 pr-4 text-text-primary">{p.staff_name}</td>
                        <td className="py-2.5 pr-4 text-text-secondary">{p.tickets_resolved}</td>
                        <td className="py-2.5 pr-4 text-text-secondary">
                          {Math.round(p.avg_resolution_minutes)} mnt
                        </td>
                        <td
                          className={`py-2.5 pr-4 ${
                            p.sla_compliance_rate < 80 ? "text-amber" : "text-accent"
                          }`}
                        >
                          {Math.round(p.sla_compliance_rate)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Tabel detail tiket */}
          <div className="mb-6 rounded-lg border border-border bg-card p-6">
            <p className="mb-4 font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-text-muted">
              Detail Tiket ({filteredTickets.length})
            </p>
            {filteredTickets.length === 0 ? (
              <p className="text-center text-xs text-text-muted">Tidak ada tiket pada periode ini.</p>
            ) : (
              <div className="max-h-96 overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b border-border text-text-muted">
                      <th className="pb-2 pr-4">Judul</th>
                      <th className="pb-2 pr-4">Kategori</th>
                      <th className="pb-2 pr-4">Prioritas</th>
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2 pr-4">Dibuat</th>
                      <th className="pb-2 pr-4">Diklaim Oleh</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTickets.map((t) => (
                      <tr key={t.id} className="border-b border-border-subtle">
                        <td className="max-w-[220px] truncate py-2.5 pr-4 text-text-primary">{t.title}</td>
                        <td className="py-2.5 pr-4 text-text-secondary">{categoryMap[t.category_id] || "-"}</td>
                        <td className="py-2.5 pr-4 text-text-secondary">{PRIORITY_LABEL[t.priority] || t.priority}</td>
                        <td className="py-2.5 pr-4 text-text-secondary">{STATUS_LABEL[t.status] || t.status}</td>
                        <td className="py-2.5 pr-4 text-text-muted">
                          {new Date(t.created_at).toLocaleDateString("id-ID")}
                        </td>
                        <td className="py-2.5 pr-4 text-text-muted">{t.claimed_by_name || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
