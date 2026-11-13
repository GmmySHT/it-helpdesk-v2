"use client";

/**
 * Dokumen cetak Laporan KPI Staf.
 *
 * Kenapa halaman ini terpisah dari /reports/kpi: halaman itu dashboard
 * (kartu, filter, tombol unduh). Yang dicetak untuk penilaian staf harus
 * berbentuk laporan resmi — kop, identitas staf, ringkasan angka, lalu
 * RINCIAN pekerjaan (nomor tiket + judul, dan setiap daily task beserta
 * solusinya). Karena itu dokumen ini memuat data dari endpoint
 * /reports/kpi/detail, bukan menata ulang tampilan dashboard.
 *
 * Parameter URL: ?from=YYYY-MM-DD&to=YYYY-MM-DD&staff_id=<uuid>
 * Tanpa staff_id = laporan seluruh staf (satu bagian per orang).
 *
 * Halaman ini sengaja tanpa Sidebar dan memakai toolbar ber-class "no-print"
 * supaya hasil cetak bersih.
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Lock } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import {
  getStaffKPIDetail,
  StaffKPIDetailPayload,
  StaffKPIDetail,
  KPITicketRow,
  KPIDailyRow,
} from "@/lib/api";

const INSTITUTION_NAME =
  process.env.NEXT_PUBLIC_INSTITUTION_NAME || "Rumah Sakit — Unit IT / SIMRS";

const ROLE_LABEL: Record<string, string> = {
  staff_it: "Staf IT",
  leader: "Leader",
  admin: "Admin",
  user: "Pelapor",
};

const PRIORITY_LABEL: Record<string, string> = {
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
  urgent: "Mendesak",
};

function formatDate(iso?: string) {
  if (!iso) return "-";
  // task_date datang sebagai "YYYY-MM-DD" — jangan diubah lewat new Date()
  // karena akan bergeser satu hari pada zona waktu negatif.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  }
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatTime(iso?: string) {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMinutes(v?: number | null) {
  if (v === null || v === undefined) return "-";
  const n = Math.round(v);
  if (n < 60) return `${n} mnt`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h}j ${m}m` : `${h}j`;
}

function KpiPrintInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, token, isLoading } = useAuth();

  // Periode default = bulan berjalan. Tanpa ini, membuka halaman cetak
  // langsung (tanpa ?from=&to=) menghasilkan "Semua periode", dan kop
  // laporan tidak menyebut rentang waktu sama sekali — tidak layak cetak.
  const defaultRange = (() => {
    const d = new Date();
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const iso = (x: Date) =>
      new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    return { from: iso(first), to: iso(d) };
  })();

  const [from, setFrom] = useState(params.get("from") || defaultRange.from);
  const [to, setTo] = useState(params.get("to") || defaultRange.to);
  const [staffId, setStaffId] = useState(params.get("staff_id") || "");

  const [data, setData] = useState<StaffKPIDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Daftar staf diambil dari laporan ringkas periode yang sama — hanya staf
  // yang punya pekerjaan di periode itu yang perlu muncul di dropdown.
  const [staffOptions, setStaffOptions] = useState<StaffKPIDetail[]>([]);

  useEffect(() => {
    if (!isLoading && !user) router.push("/login");
  }, [isLoading, user, router]);

  // Daftar pilihan staf harus tetap lengkap meskipun laporan sedang difilter
  // ke satu orang. Kalau diambil dari respons yang sudah difilter, dropdown
  // hanya berisi satu nama dan pengguna tidak bisa pindah staf tanpa kembali
  // ke halaman dashboard.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    getStaffKPIDetail(token, from || undefined, to || undefined)
      .then((d) => {
        if (!cancelled) setStaffOptions(d.details);
      })
      .catch(() => {
        /* daftar pilihan gagal dimuat — dropdown cukup berisi "Semua staf" */
      });
    return () => {
      cancelled = true;
    };
  }, [token, from, to]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    getStaffKPIDetail(token, from || undefined, to || undefined, staffId || undefined)
      .then((d) => {
        if (cancelled) return;
        setData(d);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Gagal memuat laporan");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, from, to, staffId]);

  if (isLoading || (!data && loading)) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-sm text-neutral-600">{error || "Memuat laporan..."}</p>
      </main>
    );
  }

  const details = data?.details || [];
  // Cakupan dari server: staf IT hanya boleh melihat dirinya sendiri, jadi
  // pemilih staf tidak ditampilkan. `!== false` menjaga kompatibilitas balasan
  // lama yang belum punya field ini.
  const canViewAll = data?.can_view_all !== false;

  return (
    <div className="min-h-screen bg-white text-black print:bg-white">
      {/* Toolbar — tidak ikut tercetak */}
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-end gap-3 border-b border-neutral-200 bg-neutral-50 px-6 py-3">
        {canViewAll ? (
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-neutral-500">
              Staf
            </label>
            <select
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="min-w-[220px] rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">Semua staf</option>
              {staffOptions.map((d) => (
                <option key={d.staff.staff_id} value={d.staff.staff_id}>
                  {d.staff.staff_name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-neutral-500">
              Staf
            </label>
            <div className="flex items-center gap-1.5 rounded-md border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm text-neutral-700">
              <Lock className="h-3.5 w-3.5 text-neutral-500" />
              {user?.name} (Anda)
            </div>
          </div>
        )}
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-neutral-500">
            Dari
          </label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-neutral-500">
            Sampai
          </label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
          />
        </div>
        <button
          onClick={() => window.print()}
          className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
        >
          Cetak / Simpan PDF
        </button>
        <Link
          href={`/reports/kpi${from || to || staffId ? "?" + new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}), ...(staffId ? { staff_id: staffId } : {}) }).toString() : ""}`}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
        >
          ← Kembali
        </Link>
        {error && <span className="text-xs text-red-700">{error}</span>}
      </div>

      <main className="mx-auto max-w-[210mm] px-8 py-10 print:px-0 print:py-0">
        {details.length === 0 && (
          <p className="text-sm text-neutral-600">
            Tidak ada pekerjaan tercatat pada periode ini.
          </p>
        )}

        {details.map((d, idx) => (
          <StaffSection
            key={d.staff.staff_id}
            detail={d}
            period={{ from, to }}
            pageBreak={idx > 0}
          />
        ))}
      </main>
    </div>
  );
}

function StaffSection({
  detail,
  period,
  pageBreak,
}: {
  detail: StaffKPIDetail;
  period: { from: string; to: string };
  pageBreak: boolean;
}) {
  const s = detail.staff;
  const tickets = detail.tickets || [];
  const dailies = detail.daily_tasks || [];

  const periode =
    period.from && period.to
      ? `${formatDate(period.from)} s.d. ${formatDate(period.to)}`
      : period.from
      ? `Sejak ${formatDate(period.from)}`
      : period.to
      ? `Sampai ${formatDate(period.to)}`
      : "Semua periode";

  return (
    <section className={pageBreak ? "print:break-before-page mb-10" : "mb-10"}>
      {/* Kop dokumen */}
      <div className="mb-5 border-b-2 border-black pb-3 text-center">
        <h1 className="text-base font-bold uppercase tracking-wide">
          Laporan Kinerja (KPI) Staf IT
        </h1>
        <p className="mt-1 text-sm">{INSTITUTION_NAME}</p>
      </div>

      {/* Identitas staf + periode */}
      <table className="mb-5 w-full border-collapse text-sm">
        <tbody>
          <tr>
            <td className="w-[26%] border border-neutral-300 px-3 py-1.5 font-semibold">
              Nama Staf
            </td>
            <td className="border border-neutral-300 px-3 py-1.5">{s.staff_name}</td>
            <td className="w-[20%] border border-neutral-300 px-3 py-1.5 font-semibold">
              Periode
            </td>
            <td className="border border-neutral-300 px-3 py-1.5">{periode}</td>
          </tr>
          <tr>
            <td className="border border-neutral-300 px-3 py-1.5 font-semibold">Jabatan</td>
            <td className="border border-neutral-300 px-3 py-1.5">
              {ROLE_LABEL[s.role] || s.role}
            </td>
            <td className="border border-neutral-300 px-3 py-1.5 font-semibold">Departemen</td>
            <td className="border border-neutral-300 px-3 py-1.5">{s.department || "-"}</td>
          </tr>
        </tbody>
      </table>

      {/* Ringkasan angka */}
      <h2 className="mb-1.5 text-sm font-bold uppercase tracking-wide">Ringkasan Kinerja</h2>
      <table className="mb-5 w-full border-collapse text-sm">
        <tbody>
          <tr>
            <td className="w-[40%] border border-neutral-300 px-3 py-1.5">Tiket diselesaikan</td>
            <td className="border border-neutral-300 px-3 py-1.5 font-semibold">
              {s.tickets_resolved} tiket
            </td>
            <td className="w-[28%] border border-neutral-300 px-3 py-1.5">
              Rata-rata penyelesaian tiket
            </td>
            <td className="border border-neutral-300 px-3 py-1.5 font-semibold">
              {formatMinutes(s.avg_resolution_minutes)}
            </td>
          </tr>
          <tr>
            <td className="border border-neutral-300 px-3 py-1.5">Daily task diselesaikan</td>
            <td className="border border-neutral-300 px-3 py-1.5 font-semibold">
              {s.daily_tasks} pekerjaan
            </td>
            <td className="border border-neutral-300 px-3 py-1.5">Rata-rata durasi harian</td>
            <td className="border border-neutral-300 px-3 py-1.5 font-semibold">
              {formatMinutes(s.avg_daily_duration_minutes)}
            </td>
          </tr>
          <tr>
            <td className="border border-neutral-300 px-3 py-1.5">Total item pekerjaan</td>
            <td className="border border-neutral-300 px-3 py-1.5 font-semibold">
              {s.total_work_items} item
            </td>
            <td className="border border-neutral-300 px-3 py-1.5">Rata-rata respon harian</td>
            <td className="border border-neutral-300 px-3 py-1.5 font-semibold">
              {formatMinutes(s.avg_daily_response_minutes)}
            </td>
          </tr>
          <tr>
            <td className="border border-neutral-300 px-3 py-1.5">Kepatuhan SLA</td>
            <td className="border border-neutral-300 px-3 py-1.5 font-semibold">
              {s.sla_compliance_rate.toFixed(0)}%
            </td>
            <td className="border border-neutral-300 px-3 py-1.5">Tiket reopen</td>
            <td className="border border-neutral-300 px-3 py-1.5 font-semibold">
              {s.reopen_count} kali
            </td>
          </tr>
        </tbody>
      </table>

      {/* Rincian tiket */}
      <h2 className="mb-1.5 text-sm font-bold uppercase tracking-wide">
        A. Rincian Tiket ({tickets.length})
      </h2>
      {tickets.length === 0 ? (
        <p className="mb-5 border border-neutral-300 px-3 py-2 text-sm text-neutral-600">
          Tidak ada tiket pada periode ini.
        </p>
      ) : (
        <table className="mb-5 w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-neutral-100">
              <th className="border border-neutral-300 px-2 py-1.5 text-left">No</th>
              <th className="border border-neutral-300 px-2 py-1.5 text-left">Kode</th>
              <th className="border border-neutral-300 px-2 py-1.5 text-left">Judul Pekerjaan</th>
              <th className="border border-neutral-300 px-2 py-1.5 text-left">Kategori</th>
              <th className="border border-neutral-300 px-2 py-1.5 text-left">Prioritas</th>
              <th className="border border-neutral-300 px-2 py-1.5 text-left">Selesai</th>
              <th className="border border-neutral-300 px-2 py-1.5 text-right">Durasi</th>
              <th className="border border-neutral-300 px-2 py-1.5 text-center">SLA</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((t: KPITicketRow, i: number) => (
              <tr key={`${t.ticket_code}-${i}`}>
                <td className="border border-neutral-300 px-2 py-1.5">{i + 1}</td>
                <td className="border border-neutral-300 px-2 py-1.5 font-[family-name:var(--font-display)]">
                  {t.ticket_code}
                </td>
                <td className="border border-neutral-300 px-2 py-1.5">{t.title}</td>
                <td className="border border-neutral-300 px-2 py-1.5">{t.category_name}</td>
                <td className="border border-neutral-300 px-2 py-1.5">
                  {PRIORITY_LABEL[t.priority] || t.priority}
                </td>
                <td className="border border-neutral-300 px-2 py-1.5">
                  {formatDate(t.resolved_at)}
                </td>
                <td className="border border-neutral-300 px-2 py-1.5 text-right">
                  {formatMinutes(t.minutes)}
                </td>
                <td className="border border-neutral-300 px-2 py-1.5 text-center">
                  {t.sla_compliant ? "Ya" : "Tidak"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Rincian daily task */}
      <h2 className="mb-1.5 text-sm font-bold uppercase tracking-wide">
        B. Rincian Daily Task ({dailies.length})
      </h2>
      {dailies.length === 0 ? (
        <p className="mb-5 border border-neutral-300 px-3 py-2 text-sm text-neutral-600">
          Tidak ada daily task pada periode ini.
        </p>
      ) : (
        <table className="mb-5 w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-neutral-100">
              <th className="border border-neutral-300 px-2 py-1.5 text-left">No</th>
              <th className="border border-neutral-300 px-2 py-1.5 text-left">Tanggal</th>
              <th className="border border-neutral-300 px-2 py-1.5 text-left">Pelapor / Unit</th>
              <th className="border border-neutral-300 px-2 py-1.5 text-left">Kendala</th>
              <th className="border border-neutral-300 px-2 py-1.5 text-left">Solusi</th>
              <th className="border border-neutral-300 px-2 py-1.5 text-center">Jam</th>
              <th className="border border-neutral-300 px-2 py-1.5 text-right">Respon</th>
              <th className="border border-neutral-300 px-2 py-1.5 text-right">Durasi</th>
            </tr>
          </thead>
          <tbody>
            {dailies.map((d: KPIDailyRow, i: number) => (
              <tr key={`${d.task_date}-${i}`}>
                <td className="border border-neutral-300 px-2 py-1.5">{i + 1}</td>
                <td className="border border-neutral-300 px-2 py-1.5">
                  {formatDate(d.task_date)}
                </td>
                <td className="border border-neutral-300 px-2 py-1.5">
                  {d.reporter_name}
                  {d.unit_name ? (
                    <span className="block text-[10px] text-neutral-600">{d.unit_name}</span>
                  ) : null}
                </td>
                <td className="border border-neutral-300 px-2 py-1.5">
                  {d.issue}
                  {d.detail ? (
                    <span className="block text-[10px] text-neutral-600">{d.detail}</span>
                  ) : null}
                </td>
                <td className="border border-neutral-300 px-2 py-1.5">{d.solution || "-"}</td>
                <td className="border border-neutral-300 px-2 py-1.5 text-center whitespace-nowrap">
                  {formatTime(d.complain_at)}–{formatTime(d.end_at)}
                </td>
                <td className="border border-neutral-300 px-2 py-1.5 text-right">
                  {formatMinutes(d.response_minutes)}
                </td>
                <td className="border border-neutral-300 px-2 py-1.5 text-right">
                  {formatMinutes(d.duration_minutes)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Tanda tangan */}
      <div className="mt-8 grid grid-cols-2 gap-10 text-center text-sm">
        <div>
          <p className="mb-16">Staf yang dinilai</p>
          <p className="border-t border-black pt-1 font-semibold">{s.staff_name}</p>
        </div>
        <div>
          <p className="mb-16">Mengetahui, Koordinator IT</p>
          <p className="border-t border-black pt-1 font-semibold">
            (...........................)
          </p>
        </div>
      </div>

      <p className="mt-8 border-t border-neutral-300 pt-2 text-[10px] text-neutral-500">
        Dokumen ini dicetak dari sistem pada {new Date().toLocaleString("id-ID")}. Angka
        ringkasan dihitung dari tiket yang diklaim staf dan daily task yang dicatatnya pada
        periode tersebut.
      </p>
    </section>
  );
}

export default function KpiPrintPage() {
  // useSearchParams butuh Suspense boundary saat halaman di-prerender.
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-white">
          <p className="text-sm text-neutral-600">Memuat laporan...</p>
        </main>
      }
    >
      <KpiPrintInner />
    </Suspense>
  );
}
