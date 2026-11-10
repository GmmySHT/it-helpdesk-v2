"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/page-header";
import {
  BarChart,
  Bar,
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
import { Package, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useNotificationsContext } from "@/lib/notifications-context";
import { Sidebar } from "@/components/sidebar";
import {
  getStatsSummary,
  StatsSummary,
  getMyPerformance,
  MyPerformance,
  getStaffPerformance,
  StaffPerformance,
  getMyCreatorStats,
  getTrend,
  TrendPoint,
  getMyStatusBreakdown,
  getMyTrend,
  getMyPriorityBreakdown,
  getAtRiskTickets,
  AtRiskTicket,
  listMyBorrowings,
  AssetBorrowing,
  listAssets,
  listBorrowings,
  listOverdueBorrowings,
  getBorrowedCount,
} from "@/lib/api";

const MODULES = [
  {
    key: "ticketing",
    name: "Ticketing",
    description: "Kelola tiket dari dibuat sampai ditutup.",
    href: "/tickets",
    unlocked: true,
  },
  {
    key: "asset",
    name: "Aset IT",
    description: "Inventaris perangkat & pelacakan aset IT.",
    href: "/asset",
    unlocked: true,
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

const STATUS_ORDER = [
  "pending_approval",
  "unassigned",
  "assigned",
  "claimed",
  "resolved",
  "closed",
];

const STATUS_COLOR: Record<string, string> = {
  pending_approval: "#A78BFA",
  unassigned: "#7C8AA3",
  assigned: "#F5A623",
  claimed: "#F5A623",
  resolved: "#60A5FA",
  closed: "#2DD4BF",
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

const chartTooltipStyle = {
  background: "#0F1729",
  border: "1px solid #1E293B",
  borderRadius: 6,
  fontSize: 12,
  color: "#E2E8F0",
};

export default function DashboardPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) router.push("/login");
  }, [isLoading, user, router]);

  if (isLoading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-transparent">
        <p className="text-sm text-text-muted">Memuat...</p>
      </main>
    );
  }

  return (
    <div className="relative z-0 flex h-screen bg-transparent font-[family-name:var(--font-body)]">
      <Sidebar />
      <main className="relative flex-1 overflow-y-auto slim-scroll">
        <PageHeader
          title="Dashboard"
          greeting="Halo"
          userName={user.name.split(" ")[0]}
          actions={[
            ...(user.role === "staff_it" || user.role === "leader" || user.role === "admin"
              ? [{ label: "+ Pinjam Aset", href: "/asset/borrowings/new", variant: "primary" as const }]
              : []),
            { label: "+ Buat Tiket", href: "/tickets?create=1", variant: "primary" as const },
          ]}
        />
        <div className="relative z-10 w-full px-6 py-12 sm:px-10">

          {(user.role === "leader" || user.role === "admin") && <LeaderView />}
          {user.role === "staff_it" && <StaffView />}
          {user.role === "user" && <ReporterView />}

          {/* Ringkasan Aset IT untuk tim IT (staff_it/leader/admin) */}
          {(user.role === "staff_it" || user.role === "leader" || user.role === "admin") && (
            <div className="mt-8">
              <AssetInfoSection />
            </div>
          )}

          <div className="mt-10">
            <MyBorrowingsSection />
          </div>

          <p className="mb-3 text-xs uppercase tracking-wide text-text-muted">
            Modul Tersedia
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((mod) =>
              mod.unlocked ? (
                <Link
                  key={mod.key}
                  href={mod.href}
                  className="group rounded-lg border border-border bg-card p-5 transition-all duration-150 hover:border-accent/60 hover:shadow-md"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                    <span className="font-[family-name:var(--font-display)] text-[10px] uppercase tracking-wide text-accent">
                      Aktif
                    </span>
                  </div>
                  <h2 className="mb-1 font-[family-name:var(--font-display)] text-sm font-semibold text-text-primary">
                    {mod.name}
                  </h2>
                  <p className="text-xs leading-relaxed text-text-muted">
                    {mod.description}
                  </p>
                </Link>
              ) : (
                <div
                  key={mod.key}
                  className="rounded-lg border border-border/60 bg-card/30 p-5 opacity-60"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="h-1.5 w-1.5 rounded-full bg-text-muted" />
                    <span className="font-[family-name:var(--font-display)] text-[10px] uppercase tracking-wide text-text-muted/60">
                      Segera Hadir
                    </span>
                  </div>
                  <h2 className="mb-1 font-[family-name:var(--font-display)] text-sm font-semibold text-text-muted">
                    {mod.name}
                  </h2>
                  <p className="text-xs leading-relaxed text-text-muted/60">
                    {mod.description}
                  </p>
                </div>
              )
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// ============ LEADER / ADMIN: KPI + distribusi status + tren 7 hari + leaderboard ============
function LeaderView() {
  const { token } = useAuth();
  const { lastMessageAt } = useNotificationsContext();
  const [stats, setStats] = useState<StatsSummary | null>(null);
  const [staffPerf, setStaffPerf] = useState<StaffPerformance[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [atRisk, setAtRisk] = useState<AtRiskTicket[]>([]);
  const [error, setError] = useState("");
  const [progressWidth, setProgressWidth] = useState(0);

  function loadData() {
    if (!token) return;
    getStatsSummary(token).then(setStats).catch((err) => setError(err.message));
    getStaffPerformance(token).then((d) => setStaffPerf(d || [])).catch(() => {});
    getTrend(token, 7).then((d) => setTrend(d || [])).catch(() => {});
    getAtRiskTickets(token).then((d) => setAtRisk(d || [])).catch(() => {});
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Auto-refresh setiap kali ada notifikasi baru masuk — supaya angka di
  // dashboard leader selalu terkini tanpa perlu refresh manual berkali-kali.
  useEffect(() => {
    if (!token || lastMessageAt === 0) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessageAt]);

  const chartData = STATUS_ORDER.map((status) => ({
    status,
    label: STATUS_LABEL[status],
    count: stats?.by_status[status] || 0,
  }));

  const slaComplianceRate =
    stats && stats.total_resolved_or_closed > 0
      ? Math.round((stats.within_sla_count / stats.total_resolved_or_closed) * 100)
      : null;

  // Progres penyelesaian perusahaan: persentase tiket yang sudah closed
  // dari total keseluruhan — animasinya sama seperti dashboard pelapor.
  const closedCount = stats?.by_status["closed"] || 0;
  const completionPercent =
    stats && stats.total_tickets > 0
      ? Math.round((closedCount / stats.total_tickets) * 100)
      : 0;

  useEffect(() => {
    const timeout = setTimeout(() => setProgressWidth(completionPercent), 200);
    return () => clearTimeout(timeout);
  }, [completionPercent]);

  return (
    <>
      {error && (
        <div className="mb-6 rounded-md border border-red/30 bg-red/10 px-4 py-2.5 text-sm text-red">
          {error}
        </div>
      )}

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Total Tiket" value={stats ? String(stats.total_tickets) : "—"} />
        <StatCard
          label="Kepatuhan SLA"
          value={slaComplianceRate !== null ? `${slaComplianceRate}%` : "—"}
          accent={slaComplianceRate !== null && slaComplianceRate < 80 ? "warning" : "good"}
        />
        <StatCard
          label="Rata-rata Resolusi"
          value={stats ? `${Math.round(stats.avg_resolution_minutes)} mnt` : "—"}
        />
        <StatCard
          label="Total Reopen"
          value={stats ? String(stats.total_reopens) : "—"}
          accent={stats && stats.total_reopens > 0 ? "warning" : "good"}
        />
        <StatCard
          label="Rating Kepuasan"
          value={
            stats && stats.total_ratings > 0
              ? `${stats.avg_rating_score.toFixed(1)} / 5`
              : "Belum ada"
          }
          accent={
            stats && stats.total_ratings > 0 && stats.avg_rating_score < 3.5
              ? "warning"
              : "good"
          }
        />
      </div>

      {/* Progress bar penyelesaian keseluruhan — versi perusahaan dari
          progress bar yang sudah ada di dashboard pelapor. */}
      <div className="mb-8 rounded-lg border border-border bg-card p-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-text-muted">
            Progres Penyelesaian Keseluruhan
          </p>
          <span className="font-[family-name:var(--font-display)] text-sm font-semibold text-accent">
            {completionPercent}%
          </span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-card-hover">
          <div
            className="progress-liquid relative h-full overflow-hidden rounded-full bg-gradient-to-r from-accent to-accent-dark transition-all duration-1000 ease-out"
            style={{ width: `${progressWidth}%` }}
          />
        </div>
      </div>

      {/* Widget tiket berisiko — mendekati atau sudah lewat deadline,
          supaya leader bisa langsung intervensi tanpa menunggu notifikasi. */}
      {atRisk.length > 0 && (
        <div className="mb-8 rounded-lg border border-amber/30 bg-amber/5 p-6">
          <p className="mb-4 font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-amber">
            ⚠ Tiket Berisiko (Mendekati/Lewat Deadline)
          </p>
          <div className="space-y-2">
            {atRisk.map((t) => (
              <Link
                key={t.id}
                href={`/tickets/${t.id}`}
                className="flex items-center justify-between rounded-md border border-border bg-card-hover px-4 py-2.5 text-sm transition-colors hover:border-amber/40"
              >
                <span className="truncate text-text-primary">{t.title}</span>
                <span
                  className={`shrink-0 font-[family-name:var(--font-display)] text-[10px] uppercase tracking-wide ${
                    t.is_overdue ? "text-red" : "text-amber"
                  }`}
                >
                  {t.is_overdue ? "Overdue" : "Mendekati"} ·{" "}
                  {t.sla_deadline &&
                    new Date(t.sla_deadline).toLocaleDateString("id-ID", {
                      day: "2-digit",
                      month: "short",
                    })}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="mb-4 font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-text-muted">
            Distribusi Status Tiket
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "#7C8AA3", fontSize: 10 }}
                axisLine={{ stroke: "#1E293B" }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: "#7C8AA3", fontSize: 11 }}
                axisLine={{ stroke: "#1E293B" }}
                tickLine={false}
              />
              <Tooltip contentStyle={chartTooltipStyle} cursor={{ fill: "#1E293B", opacity: 0.4 }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell key={entry.status} fill={STATUS_COLOR[entry.status]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <p className="mb-4 font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-text-muted">
            Tren 7 Hari Terakhir
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: "#7C8AA3", fontSize: 10 }}
                axisLine={{ stroke: "#1E293B" }}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: "#7C8AA3", fontSize: 11 }}
                axisLine={{ stroke: "#1E293B" }}
                tickLine={false}
              />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#7C8AA3" }} />
              <Line
                type="monotone"
                dataKey="created"
                name="Dibuat"
                stroke="#A78BFA"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
              <Line
                type="monotone"
                dataKey="resolved"
                name="Diselesaikan"
                stroke="#2DD4BF"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mb-8 rounded-lg border border-border bg-card p-6">
        <p className="mb-4 font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-text-muted">
          Performa per Staf
        </p>
        {staffPerf.length === 0 ? (
          <p className="text-center text-xs text-text-muted">Belum ada data.</p>
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
                {staffPerf.map((p) => (
                  <tr key={p.staff_id} className="border-b border-border-subtle">
                    <td className="py-2.5 pr-4 text-text-primary">{p.staff_name}</td>
                    <td className="py-2.5 pr-4 text-text-primary">{p.tickets_resolved}</td>
                    <td className="py-2.5 pr-4 text-text-primary">
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
    </>
  );
}

// ============ STAFF: performa personal + pie chart beban kerja ============
function StaffView() {
  const { user, token } = useAuth();
  const { lastMessageAt } = useNotificationsContext();
  const [perf, setPerf] = useState<MyPerformance | null>(null);
  const [breakdown, setBreakdown] = useState<Record<string, number> | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [priorityBreakdown, setPriorityBreakdown] = useState<Record<string, number>>({});
  const [teamStats, setTeamStats] = useState<StatsSummary | null>(null);
  const [staffPerf, setStaffPerf] = useState<StaffPerformance[]>([]);
  const [error, setError] = useState("");
  const [progressWidth, setProgressWidth] = useState(0);

  function loadData() {
    if (!token) return;
    getMyPerformance(token).then(setPerf).catch((err) => setError(err.message));
    getMyStatusBreakdown(token).then(setBreakdown).catch(() => {});
    getMyTrend(token, 7).then((d) => setTrend(d || [])).catch(() => {});
    getMyPriorityBreakdown(token).then((d) => setPriorityBreakdown(d || {})).catch(() => {});
    getStatsSummary(token).then(setTeamStats).catch(() => {});
    getStaffPerformance(token).then((d) => setStaffPerf(d || [])).catch(() => {});
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token || lastMessageAt === 0) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessageAt]);

  // Progres penyelesaian PRIBADI: dari semua tiket yang pernah/sedang
  // dipegang staf ini (selesai + yang masih dikerjakan), berapa persen
  // yang sudah kelar — beri gambaran progres kerja personalnya.
  const totalHandled = perf ? perf.tickets_resolved + perf.current_workload : 0;
  const completionPercent =
    totalHandled > 0 && perf ? Math.round((perf.tickets_resolved / totalHandled) * 100) : 0;

  useEffect(() => {
    const timeout = setTimeout(() => setProgressWidth(completionPercent), 200);
    return () => clearTimeout(timeout);
  }, [completionPercent]);

  const pieData = breakdown
    ? Object.entries(breakdown)
        .filter(([, count]) => count > 0)
        .map(([status, count]) => ({
          name: STATUS_LABEL[status] || status,
          value: count,
          color: STATUS_COLOR[status] || "#7C8AA3",
        }))
    : [];

  const priorityPieData = Object.entries(priorityBreakdown)
    .filter(([, count]) => count > 0)
    .map(([priority, count]) => ({
      name: PRIORITY_LABEL[priority] || priority,
      value: count,
      color: PRIORITY_COLOR[priority] || "#7C8AA3",
    }));

  // Perbandingan kecepatan kerja terhadap rata-rata TIM — memberi konteks
  // apakah waktu kerja personal lebih cepat/lambat dari umumnya, bukan
  // cuma angka mentah yang berdiri sendiri.
  const teamAvg = teamStats?.avg_resolution_minutes ?? null;
  const myAvg = perf?.avg_resolution_minutes ?? null;
  const vsTeamPercent =
    teamAvg && myAvg && teamAvg > 0 ? Math.round(((teamAvg - myAvg) / teamAvg) * 100) : null;

  // Ranking di antara staf lain berdasarkan jumlah tiket selesai — dicari
  // dari data leaderboard yang sama seperti dashboard leader.
  const sortedByResolved = [...staffPerf].sort((a, b) => b.tickets_resolved - a.tickets_resolved);
  const myRankIndex = sortedByResolved.findIndex((p) => p.staff_id === user?.id);
  const myRank = myRankIndex >= 0 ? myRankIndex + 1 : null;

  return (
    <>
      {error && (
        <div className="mb-6 rounded-md border border-red/30 bg-red/10 px-4 py-2.5 text-sm text-red">
          {error}
        </div>
      )}
      <p className="mb-3 text-xs uppercase tracking-wide text-text-muted">Performa Saya</p>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Sedang Dikerjakan" value={perf ? String(perf.current_workload) : "—"} />
        <StatCard label="Tiket Selesai" value={perf ? String(perf.tickets_resolved) : "—"} />
        <StatCard
          label="Rata-rata Waktuku"
          value={perf ? `${Math.round(perf.avg_resolution_minutes)} mnt` : "—"}
        />
        <StatCard
          label="Kepatuhan SLA-ku"
          value={perf ? `${Math.round(perf.sla_compliance_rate)}%` : "—"}
          accent={perf && perf.sla_compliance_rate < 80 ? "warning" : "good"}
        />
      </div>

      {/* Dua kartu insight tambahan: perbandingan vs tim, dan ranking */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="mb-1.5 font-[family-name:var(--font-display)] text-[10px] uppercase tracking-wide text-text-muted">
            Dibanding Rata-rata Tim
          </p>
          {vsTeamPercent === null ? (
            <p className="font-[family-name:var(--font-display)] text-lg text-text-muted/60">—</p>
          ) : (
            <p
              className={`font-[family-name:var(--font-display)] text-lg font-semibold ${
                vsTeamPercent >= 0 ? "text-accent" : "text-amber"
              }`}
            >
              {vsTeamPercent >= 0 ? "▲" : "▼"} {Math.abs(vsTeamPercent)}%{" "}
              <span className="text-xs font-normal text-text-muted">
                {vsTeamPercent >= 0 ? "lebih cepat" : "lebih lambat"}
              </span>
            </p>
          )}
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="mb-1.5 font-[family-name:var(--font-display)] text-[10px] uppercase tracking-wide text-text-muted">
            Peringkat Tim (Tiket Selesai)
          </p>
          <p className="font-[family-name:var(--font-display)] text-lg font-semibold text-text-primary">
            {myRank ? `#${myRank}` : "—"}{" "}
            <span className="text-xs font-normal text-text-muted">
              dari {sortedByResolved.length} staf
            </span>
          </p>
        </div>
      </div>

      {/* Progress bar dengan efek liquid shimmer */}
      <div className="mb-8 rounded-lg border border-border bg-card p-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-text-muted">
            Progres Penyelesaian Saya
          </p>
          <span className="font-[family-name:var(--font-display)] text-sm font-semibold text-accent">
            {completionPercent}%
          </span>
        </div>
        <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-card-hover">
          <div
            className="progress-liquid relative h-full overflow-hidden rounded-full bg-gradient-to-r from-accent to-accent-dark transition-all duration-1000 ease-out"
            style={{ width: `${progressWidth}%` }}
          />
        </div>
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="mb-4 font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-text-muted">
            Tren 7 Hari: Diklaim vs Diselesaikan
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#7C8AA3", fontSize: 10 }} axisLine={{ stroke: "#1E293B" }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fill: "#7C8AA3", fontSize: 11 }} axisLine={{ stroke: "#1E293B" }} tickLine={false} />
              <Tooltip contentStyle={chartTooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#7C8AA3" }} />
              <Line type="monotone" dataKey="created" name="Diklaim" stroke="#A78BFA" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="resolved" name="Diselesaikan" stroke="#2DD4BF" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-lg border border-border bg-card p-6">
          <p className="mb-4 font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-text-muted">
            Prioritas Tiket yang Kutangani
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
      </div>

      <div className="mb-8 rounded-lg border border-border bg-card p-6">
        <p className="mb-4 font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-text-muted">
          Sebaran Tiket yang Pernah Kupegang
        </p>
        {pieData.length === 0 ? (
          <p className="text-center text-xs text-text-muted">Belum ada tiket yang diklaim.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={2}
              >
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={chartTooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#7C8AA3" }} iconType="circle" />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </>
  );
}


const REPORTER_TIPS = [
  "Sertakan screenshot atau foto di deskripsi supaya staf lebih cepat memahami masalahnya.",
  "Semakin jelas judul tiket, semakin cepat staf yang tepat bisa menemukannya.",
  "Kamu bisa memberi rating setelah tiket ditutup — masukanmu membantu tim terus membaik.",
  "Pilih prioritas sesuai urgensi sebenarnya, supaya tiket yang benar-benar mendesak tidak tertunda.",
  "Cek notifikasi lonceng secara berkala untuk update terbaru soal laporanmu.",
];

// ============ USER/PELAPOR: donut chart + tips berputar + progress animasi ============
function ReporterView() {
  const { token, user } = useAuth();
  const { lastMessageAt } = useNotificationsContext();
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [assetCounts, setAssetCounts] = useState({ total: 0, available: 0, borrowed: 0, needsRepair: 0 });
  const [myActiveBorrowings, setMyActiveBorrowings] = useState<AssetBorrowing[]>([]);
  const [error, setError] = useState("");
  const [tipIndex, setTipIndex] = useState(0);
  const [progressWidth, setProgressWidth] = useState(0);

  function loadData() {
    if (!token) return;
    getMyCreatorStats(token).then(setCounts).catch((err) => setError(err.message));
    // Load asset summary untuk pelapor (bisa lihat total aset tersedia)
    listAssets(token, undefined, undefined, 1, 0)
      .then((res) => setAssetCounts((prev) => ({ ...prev, total: res.total })))
      .catch(() => {});
    listAssets(token, undefined, "available", 1, 0)
      .then((res) => setAssetCounts((prev) => ({ ...prev, available: res.total })))
      .catch(() => {});
    // Load peminjaman aktif user (borrowed + approved status)
    if (user?.id) {
      listMyBorrowings(token, user.id, 10)
        .then((res) => {
          const active = (res.data || []).filter(
            (b) => b.status === "borrowed" || b.status === "approved"
          );
          setMyActiveBorrowings(active);
        })
        .catch(() => {});
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (!token || lastMessageAt === 0) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessageAt]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTipIndex((i) => (i + 1) % REPORTER_TIPS.length);
    }, 6000);
    return () => clearInterval(interval);
  }, []);

  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
  const closedCount = counts?.["closed"] || 0;
  const targetPercent = total > 0 ? Math.round((closedCount / total) * 100) : 0;

  useEffect(() => {
    const timeout = setTimeout(() => setProgressWidth(targetPercent), 200);
    return () => clearTimeout(timeout);
  }, [targetPercent]);

  const pieData = counts
    ? Object.entries(counts)
        .filter(([, count]) => count > 0)
        .map(([status, count]) => ({
          name: STATUS_LABEL[status] || status,
          value: count,
          color: STATUS_COLOR[status] || "#7C8AA3",
        }))
    : [];

  return (
    <>
      {error && (
        <div className="mb-6 rounded-md border border-red/30 bg-red/10 px-4 py-2.5 text-sm text-red">
          {error}
        </div>
      )}

      {/* BARISAN STAT CARD: Tiket + Aset */}
      <p className="mb-3 text-xs uppercase tracking-wide text-text-muted">
        Tiket yang Saya Laporkan
      </p>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Total Laporan" value={String(total)} />
        <StatCard
          label="Sedang Diproses"
          value={String(
            (counts?.["pending_approval"] || 0) +
              (counts?.["unassigned"] || 0) +
              (counts?.["assigned"] || 0) +
              (counts?.["claimed"] || 0)
          )}
        />
        <StatCard label="Menunggu Review" value={String(counts?.["resolved"] || 0)} />
        <StatCard label="Selesai" value={String(closedCount)} accent="good" />
        {/* Card Pinjam Aset IT untuk pelapor */}
        <Link href="/asset/borrowings/new" className="group">
          <div className="relative h-full overflow-hidden rounded-lg border border-#FFD700 bg-gradient-to-br from-accent/20 to-accent/5 p-4 transition-all duration-200 hover:border-accent/60 hover:bg-accent/25 hover:shadow-[0_0_20px_rgba(182,42,45,0.2)]">
            {/* Dekorasi Background */}
            <div className="absolute -right-2 -top-2 opacity-10 transition-transform duration-500 group-hover:scale-110">
              <Package size={80} className="text-teal" />
            </div>
            
            {/* <p className="relative z-10 mb-1.5 font-[family-name:var(--font-display)] text-[10px] uppercase tracking-wide text-amber/80">
              Pinjam Aset IT
            </p> */}
            <div className="relative z-10 flex items-center gap-2">
              <div className="rounded-full bg-accent p-1 text-white shadow-lg transition-transform duration-300 group-hover:rotate-90">
                <Plus size={16} strokeWidth={3} />
              </div>
              <p className="font-[family-name:var(--font-display)] text-2xl font-semibold">
                PINJAM ASET IT
              </p>
            </div>
          </div>
        </Link>
      </div>

      {/* PROGRES PENYELESAIAN */}
      <div className="mb-6 rounded-lg border border-border bg-card p-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-text-muted">
            Progres Penyelesaian
          </p>
          <span className="font-[family-name:var(--font-display)] text-sm font-semibold text-accent">
            {targetPercent}%
          </span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-card-hover">
          <div
            className="progress-liquid relative h-full overflow-hidden rounded-full bg-gradient-to-r from-accent to-accent-dark transition-all duration-1000 ease-out"
            style={{ width: `${progressWidth}%` }}
          />
        </div>
      </div>

      {/* INFO ASET IT */}
      <div className="mb-6 rounded-lg border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-text-muted">
            📦 Info Aset IT
          </p>
          <span className="text-xs text-text-muted">
            {assetCounts.available} tersedia dari {assetCounts.total} total
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-md bg-page p-3 text-center">
            <p className="text-lg font-semibold text-text-primary">{assetCounts.total}</p>
            <p className="text-[10px] uppercase tracking-wide text-text-muted">Total Aset</p>
          </div>
          <div className="rounded-md bg-page p-3 text-center">
            <p className="text-lg font-semibold text-accent">{assetCounts.available}</p>
            <p className="text-[10px] uppercase tracking-wide text-text-muted">Tersedia</p>
          </div>
          <div className="rounded-md bg-page p-3 text-center">
            <p className="text-lg font-semibold text-amber">{assetCounts.total - assetCounts.available}</p>
            <p className="text-[10px] uppercase tracking-wide text-text-muted">Dipinjam</p>
          </div>
          <Link href="/asset/borrowings" className="flex items-center justify-center rounded-md bg-accent/10 p-3 text-center transition-colors hover:bg-accent/20">
            <p className="text-sm font-semibold text-accent">Riwayat Saya →</p>
          </Link>
        </div>

        {/* Aset yang sedang dipinjam */}
        {myActiveBorrowings.length > 0 && (
          <div className="mt-4 border-t border-border pt-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
              Aset yang Sedang Dipinjam
            </p>
            <div className="space-y-2">
              {myActiveBorrowings.map((b) => (
                <div
                  key={b.id}
                  className="flex items-start justify-between rounded-md bg-page p-3"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-text-primary">
                      {b.asset_code} - {b.asset_name}
                    </p>
                    <p className="text-xs text-text-muted">
                      Qty: {b.quantity} | Kembali: {b.return_deadline}
                    </p>
                  </div>
                  <span
                    className={`whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${
                      b.status === "borrowed"
                        ? "bg-blue-500/20 text-blue-400"
                        : "bg-green-500/20 text-green-400"
                    }`}
                  >
                    {b.status === "borrowed" ? "Dipinjam" : "Disetujui"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* DONUT CHART + TIPS */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-6">
          <p className="mb-4 font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-text-muted">
            Status Laporanku
          </p>
          {pieData.length === 0 ? (
            <p className="text-center text-xs text-text-muted">
              Belum ada tiket yang dilaporkan.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11, color: "#7C8AA3" }} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="flex flex-col justify-center rounded-lg border border-accent/20 bg-gradient-to-br from-card to-card p-6">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/10 text-xs">
              💡
            </span>
            <p className="font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-accent">
              Tips
            </p>
          </div>
          <p
            key={tipIndex}
            className="animate-[fade-in_0.5s_ease-out] text-sm leading-relaxed text-text-primary"
          >
            {REPORTER_TIPS[tipIndex]}
          </p>
          <div className="mt-4 flex gap-1.5">
            {REPORTER_TIPS.map((_, i) => (
              <span
                key={i}
                className={`h-1 rounded-full transition-all ${
                  i === tipIndex ? "w-4 bg-accent" : "w-1 bg-border"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "good" | "warning";
}) {
  const valueColor =
    accent === "warning"
      ? "text-amber"
      : accent === "good"
        ? "text-accent"
        : "text-text-primary";

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="mb-1.5 font-[family-name:var(--font-display)] text-[10px] uppercase tracking-wide text-text-muted">
        {label}
      </p>
      <p
        className={`font-[family-name:var(--font-display)] text-2xl font-semibold ${valueColor}`}
      >
        {value}
      </p>
    </div>
  );
}

// ============ RIWAYAT PEMINJAMAN USER ============
function MyBorrowingsSection() {
  const { token, user } = useAuth();
  const router = useRouter();
  const [borrowings, setBorrowings] = useState<AssetBorrowing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || !user?.id) return;
    const fetch = async () => {
      try {
        setLoading(true);
        const res = await listMyBorrowings(token, user.id, 5);
        setBorrowings(res.data || []);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [token, user?.id]);

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending_approval: "bg-yellow-500/20 text-yellow-600 border-yellow-300",
      approved: "bg-blue-500/20 text-blue-600 border-blue-300",
      borrowed: "bg-green-500/20 text-green-600 border-green-300",
      returned: "bg-gray-500/20 text-gray-600 border-gray-300",
      overdue: "bg-red-500/20 text-red-600 border-red-300",
      rejected: "bg-red-500/20 text-red-600 border-red-300",
    };
    const labels: Record<string, string> = {
      pending_approval: "Menunggu Persetujuan",
      approved: "Disetujui",
      borrowed: "Dipinjam",
      returned: "Dikembalikan",
      overdue: "⚠️ Terlambat",
      rejected: "Ditolak",
    };
    return (
      <span className={`inline-block rounded-full border px-3 py-1 text-xs font-medium ${styles[status] || styles.pending_approval}`}>
        {labels[status] || status}
      </span>
    );
  };

  if (!token) return null;

  return (
    <div className="rounded-xl bg-page p-6">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">Riwayat Peminjaman Saya</h2>
        <Link
          href="/asset/borrowings"
          className="text-xs font-medium text-accent hover:text-accent/80"
        >
          Lihat Semua →
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-500/15 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
        </div>
      ) : borrowings.length === 0 ? (
        <div className="card-secondary rounded-lg p-6 text-center">
          <p className="text-sm text-text-secondary">Belum ada riwayat peminjaman.</p>
          <Link
            href="/asset/borrowings/new"
            className="mt-3 inline-block text-sm font-medium text-accent hover:text-accent/80"
          >
            Mulai Pinjam Aset →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {borrowings.map((b) => (
            <div
              key={b.id}
              className="card-primary group flex flex-col justify-between overflow-hidden rounded-xl p-5 shadow-sm transition-all duration-300 hover:shadow-md hover:shadow-accent/5"
            >
              <div className="flex-1">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <h3 className="line-clamp-1 font-semibold text-text-primary group-hover:text-accent">
                    {b.asset_name || "Aset Tanpa Nama"}
                  </h3>
                  {getStatusBadge(b.status)}
                </div>

                <div className="space-y-1.5 text-xs text-text-secondary">
                  <p className="flex items-center gap-2">
                    <span className="opacity-60">ID:</span>
                    <span className="font-mono text-text-secondary">{b.asset_code}</span>
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="opacity-60">Jumlah:</span>
                    <span className="font-medium text-text-secondary">{b.quantity} Unit</span>
                  </p>
                </div>

                <div className="mt-4 flex items-center gap-2 rounded-lg bg-black/10 p-2.5 text-[10px] text-text-secondary dark:bg-black/30">
                  <div className="flex flex-1 flex-col">
                    <span className="text-[9px] uppercase tracking-wider opacity-50">Pinjam</span>
                    <span className="font-medium text-text-primary">
                      {new Date(b.borrow_date).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  <div className="h-4 w-[1px] bg-white/10 dark:bg-white/10" />
                  <div className="flex flex-1 flex-col text-right">
                    <span className="text-[9px] uppercase tracking-wider opacity-50">Kembali</span>
                    <span
                      className={`font-medium ${
                        new Date(b.return_deadline) < new Date() && b.status !== "returned"
                          ? "text-red-400"
                          : "text-text-primary"
                      }`}
                    >
                      {new Date(b.return_deadline).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>
              </div>

              {b.status === "borrowed" && (
                <button
                  onClick={() => {/* Trigger Return Modal */}}
                  className="mt-4 w-full rounded-lg bg-accent/10 py-2 text-[11px] font-semibold text-accent transition-colors hover:bg-accent hover:text-white"
                >
                  Kembalikan Sekarang
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ INFO ASET IT (staff_it / leader / admin) ============
// Ringkasan inventaris aset + peminjaman yang perlu perhatian, ditampilkan
// di dashboard supaya tim IT punya gambaran kondisi aset tanpa buka modul.
function AssetInfoSection() {
  const { token } = useAuth();
  const [stats, setStats] = useState({
    total: 0,
    available: 0,
    borrowed: 0,
    needsRepair: 0,
    broken: 0,
  });
  const [pendingBorrowings, setPendingBorrowings] = useState<AssetBorrowing[]>([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const fetch = async () => {
      try {
        setLoading(true);
        const [all, available, borrowed, needsRepair, broken] = await Promise.all([
          listAssets(token, undefined, undefined, 1, 0).catch(() => ({ total: 0 })),
          listAssets(token, undefined, "available", 1, 0).catch(() => ({ total: 0 })),
          getBorrowedCount(token).catch(() => ({ count: 0 })),
          listAssets(token, undefined, "needs_repair", 1, 0).catch(() => ({ total: 0 })),
          listAssets(token, undefined, "broken", 1, 0).catch(() => ({ total: 0 })),
        ]);
        if (cancelled) return;
        setStats({
          total: all.total || 0,
          available: available.total || 0,
          borrowed: borrowed.count || 0,
          needsRepair: needsRepair.total || 0,
          broken: broken.total || 0,
        });

        const pending = await listBorrowings(token, "pending_approval", undefined, 5, 0).catch(
          () => ({ data: [], total: 0 })
        );
        if (cancelled) return;
        setPendingBorrowings(pending.data || []);

        const overdue = await listOverdueBorrowings(token).catch(() => []);
        if (cancelled) return;
        setOverdueCount((overdue || []).length);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetch();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!token) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold text-text-primary">
          📦 Ringkasan Aset IT
        </h2>
        <Link
          href="/asset"
          className="text-xs font-medium text-accent hover:text-accent/80"
        >
          Kelola Aset →
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="rounded-md bg-page p-3 text-center">
              <p className="text-xl font-semibold text-text-primary">{stats.total}</p>
              <p className="text-[10px] uppercase tracking-wide text-text-muted">Total Aset</p>
            </div>
            <div className="rounded-md bg-page p-3 text-center">
              <p className="text-xl font-semibold text-accent">{stats.available}</p>
              <p className="text-[10px] uppercase tracking-wide text-text-muted">Tersedia</p>
            </div>
            <div className="rounded-md bg-page p-3 text-center">
              <p className="text-xl font-semibold text-amber">{stats.borrowed}</p>
              <p className="text-[10px] uppercase tracking-wide text-text-muted">Dipinjam</p>
            </div>
            <div className="rounded-md bg-page p-3 text-center">
              <p className="text-xl font-semibold text-amber">{stats.needsRepair}</p>
              <p className="text-[10px] uppercase tracking-wide text-text-muted">Perlu Perbaikan</p>
            </div>
            <div className="rounded-md bg-page p-3 text-center">
              <p className="text-xl font-semibold text-red">{stats.broken}</p>
              <p className="text-[10px] uppercase tracking-wide text-text-muted">Rusak</p>
            </div>
          </div>

          {(overdueCount > 0 || pendingBorrowings.length > 0) && (
            <div className="mb-4 flex flex-wrap gap-3">
              {pendingBorrowings.length > 0 && (
                <Link
                  href="/asset/borrowings?status=pending_approval"
                  className="flex items-center gap-2 rounded-md border border-amber/30 bg-amber/10 px-3 py-2 text-xs text-amber transition-colors hover:bg-amber/20"
                >
                  ⏳ {pendingBorrowings.length} peminjaman menunggu persetujuan
                </Link>
              )}
              {overdueCount > 0 && (
                <Link
                  href="/asset/borrowings"
                  className="flex items-center gap-2 rounded-md border border-red/30 bg-red/10 px-3 py-2 text-xs text-red transition-colors hover:bg-red/20"
                >
                  ⚠ {overdueCount} peminjaman terlambat
                </Link>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Link
              href="/asset"
              className="rounded-md bg-card-hover px-3 py-1.5 text-xs text-text-primary transition-colors hover:bg-border"
            >
              Data Aset
            </Link>
            <Link
              href="/asset/borrowings/new"
              className="rounded-md bg-card-hover px-3 py-1.5 text-xs text-text-primary transition-colors hover:bg-border"
            >
              Pinjam Aset
            </Link>
            <Link
              href="/asset/borrowings"
              className="rounded-md bg-card-hover px-3 py-1.5 text-xs text-text-primary transition-colors hover:bg-border"
            >
              Riwayat Peminjaman
            </Link>
            <Link
              href="/asset/borrowings?status=pending_approval"
              className="rounded-md bg-card-hover px-3 py-1.5 text-xs text-text-primary transition-colors hover:bg-border"
            >
              Approve Peminjaman
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
