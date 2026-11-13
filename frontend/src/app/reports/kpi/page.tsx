"use client";

/**
 * Laporan KPI gabungan: tiket + daily task.
 *
 * Kenapa halaman terpisah dari /reports: halaman /reports menjawab "bagaimana
 * kondisi antrean tiket" (open/in-progress/overdue). Halaman ini menjawab
 * pertanyaan berbeda — "siapa mengerjakan apa" — yang dipakai untuk penilaian
 * staf, dan karena itu butuh periode + unduhan per orang.
 *
 * Unduhan CSV dibuat backend (bukan di browser) supaya angka yang diunduh
 * identik dengan yang tampil di tabel; kalau dihitung ulang di frontend,
 * keduanya bisa berbeda setelah ada data baru.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import PageHeader from "@/components/page-header";
import { Sidebar } from "@/components/sidebar";
import { useAuth } from "@/lib/auth-context";
import {
  getStaffKPI,
  downloadKPIExport,
  StaffKPIPayload,
  StaffKPI,
} from "@/lib/api";
import { Download, Loader2, Users, Ticket, ClipboardList, Printer, UserRound, Lock } from "lucide-react";

const inputClass =
  "w-full rounded-md border border-border bg-card-hover px-3.5 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none transition-all duration-150 focus:border-accent";

const labelClass =
  "mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-text-muted";

function formatMinutes(v?: number | null) {
  if (!v) return "0 mnt";
  const n = Math.round(v);
  if (n < 60) return `${n} mnt`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h}j ${m}m` : `${h}j`;
}

const ROLE_LABEL: Record<string, string> = {
  staff_it: "Staf IT",
  leader: "Leader",
  admin: "Admin",
  user: "Pelapor",
};

export default function KPIReportPage() {
  const router = useRouter();
  const { user, token, isLoading } = useAuth();

  const [from, setFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [to, setTo] = useState(() => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  });

  const [data, setData] = useState<StaffKPIPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filter staf di layar. Kosong = semua staf. Ini yang dimaksud "laporan KPI
  // bisa difilter per orang": tabel di bawah menyempit ke satu staf, dan
  // tombol laporan lengkap membawa staff_id yang sama ke halaman cetak.
  const [staffFilter, setStaffFilter] = useState("");

  useEffect(() => {
    if (!isLoading && !user) router.push("/login");
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError("");
    getStaffKPI(token, from, to)
      .then((d) => setData(d))
      .catch((err) => setError(err instanceof Error ? err.message : "Gagal memuat KPI"))
      .finally(() => setLoading(false));
  }, [token, from, to]);

  const [downloading, setDownloading] = useState<string | null>(null);

  /**
   * Unduhan lewat fetch + blob karena endpoint dijaga header Authorization.
   * staffId kosong = laporan seluruh tim.
   */
  async function download(staffId?: string) {
    if (!token) return;
    setDownloading(staffId || "all");
    setError("");
    try {
      await downloadKPIExport(token, from, to, staffId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengunduh laporan");
    } finally {
      setDownloading(null);
    }
  }

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  const ov = data?.overview;
  const staff = data?.staff || [];

  // Server yang menentukan cakupan: staf IT hanya menerima barisnya sendiri
  // (can_view_all=false), leader/admin menerima semua baris. Dropdown staf
  // disembunyikan untuk staf supaya tidak ada kontrol yang seolah bisa
  // menampilkan rekan setim padahal server mengabaikannya.
  // `!== false` (bukan `=== true`) agar balasan lama tanpa field ini tetap
  // dianggap boleh melihat semua.
  const canViewAll = data?.can_view_all !== false;

  // Daftar pilihan diambil dari hasil KPI periode ini, bukan /users/staff —
  // supaya yang muncul hanya orang yang memang punya pekerjaan pada periode
  // tersebut. Kalau daftar diambil dari semua user, memilih nama yang tidak
  // punya data hanya menghasilkan tabel kosong tanpa penjelasan.
  const staffChoices = staff;

  const visibleStaff = canViewAll && staffFilter ? staff.filter((s) => s.staff_id === staffFilter) : staff;

  // staff yang sedang difilter — dipakai halaman cetak dan tombol unduh.
  const selectedStaff: StaffKPI | undefined =
    canViewAll && staffFilter ? staff.find((s) => s.staff_id === staffFilter) : undefined;

  /**
   * URL halaman cetak laporan lengkap. staff_id ikut dibawa supaya dokumen
   * yang dibuka berisi staf yang sedang dipilih, bukan seluruh tim.
   */
  function printUrl(staffId?: string) {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (staffId) p.set("staff_id", staffId);
    const q = p.toString();
    return `/reports/kpi/print${q ? `?${q}` : ""}`;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto slim-scroll">
        <PageHeader
          title="Laporan KPI"
          subtitle="Kinerja per staf — tiket dan daily task dalam satu laporan"
          actions={[
            {
              label: selectedStaff
                ? `Laporan Lengkap — ${selectedStaff.staff_name}`
                : "Laporan Lengkap (PDF)",
              href: printUrl(staffFilter || undefined),
              variant: "secondary" as const,
            },
          ]}
        />

        <div className="page-transition space-y-4 p-4 md:p-6">
          {/* Periode + unduhan */}
          <div className="rounded-md border border-border bg-card p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <label className={labelClass}>Dari tanggal</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Sampai tanggal</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
            </div>
            {/* Dropdown staf hanya untuk leader/admin. Staf IT tidak punya
                wewenang memilih orang lain — servernya pun memaksa ke dirinya
                sendiri, jadi kontrol ini hanya ditampilkan bila berguna. */}
            {canViewAll ? (
              <div>
                <label className={labelClass}>Staf</label>
                <select
                  value={staffFilter}
                  onChange={(e) => setStaffFilter(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Semua staf</option>
                  {staffChoices.map((s) => (
                    <option key={s.staff_id} value={s.staff_id}>
                      {s.staff_name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className={labelClass}>Staf</label>
                <div className="flex h-[42px] items-center gap-2 rounded-md border border-border-subtle bg-bg-secondary px-3 text-xs text-text-secondary">
                  <Lock className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                  <span className="truncate" title={user?.name}>
                    {user?.name} (Anda)
                  </span>
                </div>
              </div>
            )}
            <div className="flex items-end">
              <button
                onClick={() => download(staffFilter || undefined)}
                disabled={downloading !== null}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-accent px-4 py-2.5 text-xs font-medium text-bg-primary transition-all duration-150 hover:opacity-90 disabled:opacity-50"
              >
                {downloading !== null ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {downloading !== null ? (
                  "Menyiapkan..."
                ) : selectedStaff
                  ? `Unduh CSV — ${selectedStaff.staff_name}`
                  : canViewAll
                  ? "Unduh Semua Staf (CSV)"
                  : "Unduh KPI Saya (CSV)"}
              </button>
            </div>
            <div className="flex items-end">
              <p className="text-[11px] leading-relaxed text-text-muted">
                Unduh CSV untuk Excel, atau buka <strong>Laporan Lengkap</strong> untuk
                dokumen PDF berisi rincian tiket &amp; daily task.
              </p>
            </div>
            </div>
          </div>

          {error && <p className="rounded-md border border-red/30 bg-red/10 px-3 py-2 text-xs text-red">{error}</p>}

          {/* Kartu ringkasan */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-text-muted">
                <Ticket className="h-3.5 w-3.5" />
                <p className="text-[11px] uppercase tracking-wide">Tiket Masuk</p>
              </div>
              <p className="mt-1 font-[family-name:var(--font-display)] text-2xl text-text-primary">
                {ov?.total_tickets ?? 0}
              </p>
              <p className="mt-0.5 text-[11px] text-text-muted">{ov?.tickets_resolved ?? 0} selesai</p>
            </div>
            <div className="rounded-md border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-text-muted">
                <ClipboardList className="h-3.5 w-3.5" />
                <p className="text-[11px] uppercase tracking-wide">Daily Task</p>
              </div>
              <p className="mt-1 font-[family-name:var(--font-display)] text-2xl text-text-primary">
                {ov?.total_daily_tasks ?? 0}
              </p>
              <p className="mt-0.5 text-[11px] text-text-muted">
                respon {formatMinutes(ov?.avg_daily_response_minutes)}
              </p>
            </div>
            <div className="rounded-md border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-text-muted">
                <Users className="h-3.5 w-3.5" />
                <p className="text-[11px] uppercase tracking-wide">Total Item Kerja</p>
              </div>
              <p className="mt-1 font-[family-name:var(--font-display)] text-2xl text-text-primary">
                {ov?.total_work_items ?? 0}
              </p>
              <p className="mt-0.5 text-[11px] text-text-muted">tiket + daily task</p>
            </div>
            <div className="rounded-md border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-text-muted">
                <ClipboardList className="h-3.5 w-3.5" />
                <p className="text-[11px] uppercase tracking-wide">Rata-rata Durasi</p>
              </div>
              <p className="mt-1 font-[family-name:var(--font-display)] text-2xl text-text-primary">
                {formatMinutes(ov?.avg_ticket_resolution_minutes)}
              </p>
              <p className="mt-0.5 text-[11px] text-text-muted">penyelesaian tiket</p>
            </div>
          </div>

          {/* Sebaran daily task per unit */}
          {ov?.per_unit && ov.per_unit.length > 0 && (
            <div className="rounded-md border border-border bg-card p-4">
              <p className="mb-3 font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-text-muted">
                Daily Task per Unit
              </p>
              <div className="flex flex-wrap gap-2">
                {ov.per_unit.map((u) => (
                  <span
                    key={u.unit_name}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle bg-card-hover px-2.5 py-1 text-[11px] text-text-secondary"
                  >
                    {u.unit_name}
                    <span className="font-semibold text-accent">{u.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tabel KPI per staf */}
          <div className="overflow-hidden rounded-md border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-card-hover text-[11px] uppercase tracking-wide text-text-muted">
                  <tr>
                    <th className="px-3 py-2.5">#</th>
                    <th className="px-3 py-2.5">Nama</th>
                    <th className="px-3 py-2.5">Role</th>
                    <th className="px-3 py-2.5">Tiket Selesai</th>
                    <th className="px-3 py-2.5">Daily Task</th>
                    <th className="px-3 py-2.5">Total Item</th>
                    <th className="px-3 py-2.5">Avg. Resolusi</th>
                    <th className="px-3 py-2.5">Avg. Durasi Harian</th>
                    <th className="px-3 py-2.5">Avg. Respon Harian</th>
                    <th className="px-3 py-2.5">SLA</th>
                    <th className="px-3 py-2.5">Reopen</th>
                    <th className="px-3 py-2.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={12} className="px-3 py-10 text-center text-text-muted">
                        <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                      </td>
                    </tr>
                  )}
                  {!loading && visibleStaff.length === 0 && (
                    <tr>
                      <td colSpan={12} className="px-3 py-10 text-center text-text-muted">
                        Belum ada pekerjaan tercatat pada periode ini.
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    visibleStaff.map((s, i) => (
                      <tr key={s.staff_id} className="border-b border-border-subtle last:border-0 hover:bg-card-hover/50">
                        <td className="px-3 py-2.5 text-text-muted">{i + 1}</td>
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-text-primary">{s.staff_name}</p>
                          {s.department && <p className="text-[11px] text-text-muted">{s.department}</p>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-text-secondary">
                          {ROLE_LABEL[s.role] || s.role}
                        </td>
                        <td className="px-3 py-2.5 text-text-secondary">{s.tickets_resolved}</td>
                        <td className="px-3 py-2.5 text-text-secondary">{s.daily_tasks}</td>
                        <td className="px-3 py-2.5 font-medium text-text-primary">{s.total_work_items}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-text-secondary">
                          {formatMinutes(s.avg_resolution_minutes)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-text-secondary">
                          {formatMinutes(s.avg_daily_duration_minutes)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-text-secondary">
                          {formatMinutes(s.avg_daily_response_minutes)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          <span
                            className={
                              s.sla_compliance_rate >= 80
                                ? "text-green"
                                : s.sla_compliance_rate >= 50
                                ? "text-amber"
                                : "text-red"
                            }
                          >
                            {s.sla_compliance_rate.toFixed(0)}%
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-text-secondary">{s.reopen_count}</td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Link
                              href={printUrl(s.staff_id)}
                              title={`Laporan lengkap ${s.staff_name}`}
                              className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-accent/10 hover:text-accent"
                            >
                              <Printer className="h-3.5 w-3.5" />
                            </Link>
                            <button
                              onClick={() => download(s.staff_id)}
                              disabled={downloading !== null}
                              title={`Unduh CSV KPI ${s.staff_name}`}
                              className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-accent/10 hover:text-accent disabled:opacity-40"
                            >
                              {downloading === s.staff_id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Download className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[11px] text-text-muted">
            Tiket dihitung dari tiket yang diklaim staf lalu selesai pada periode;
            daily task dihitung dari catatan yang dibuat staf pada periode yang sama.
          </p>
        </div>
      </main>
    </div>
  );
}
