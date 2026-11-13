"use client";

/**
 * Halaman Daily Task.
 *
 * Kenapa halaman ini terpisah dari Tiket: permintaan harian lewat WhatsApp
 * (case kecil: reset password, printer macet, tarik kabel) tidak pernah jadi
 * tiket resmi, tapi tetap menyita waktu staf dan HARUS dihitung di KPI.
 * Mencatatnya di sini membuat beban kerja nyata terlihat tanpa mengotori
 * statistik tiket (SLA, approval, rating).
 *
 * Yang dihitung otomatis (di database, bukan di sini):
 *   durasi        = waktu selesai - waktu mulai
 *   respon time   = waktu mulai  - waktu komplain
 * Form menampilkan pratinjau angka tersebut supaya pencatat langsung tahu
 * hasilnya sebelum menyimpan.
 */

import { useEffect, useMemo, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/page-header";
import { Sidebar } from "@/components/sidebar";
import { useAuth } from "@/lib/auth-context";
import {
  DailyTask,
  DailyTaskInput,
  Unit,
  listUnits,
  listDailyTasks,
  createDailyTask,
  updateDailyTask,
  deleteDailyTask,
} from "@/lib/api";
import { Pencil, Trash2, Plus, X, Save, Search, Clock } from "lucide-react";

const inputClass =
  "w-full rounded-md border border-border bg-card-hover px-3.5 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none transition-all duration-150 focus:border-accent";

const labelClass =
  "mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-text-muted";

function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

/** ISO -> nilai untuk <input type="datetime-local"> (waktu lokal, tanpa detik). */
function toLocalInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

function formatDate(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTime(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

/** Menit -> "1j 25m" supaya durasi panjang mudah dibaca. */
function formatMinutes(min?: number | null) {
  if (min === null || min === undefined) return "—";
  if (min < 60) return `${min} mnt`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}j ${m}m` : `${h}j`;
}

/**
 * Hitung durasi & respon di sisi klien HANYA untuk pratinjau.
 * Angka yang tersimpan tetap hasil generated column di database, jadi kalau
 * rumus di sini berbeda, yang tampil di tabel tetap benar.
 */
function previewMinutes(complain: string, start: string, end: string) {
  if (!complain) return { response: null as number | null, duration: null as number | null };
  const c = new Date(complain).getTime();
  const s = start ? new Date(start).getTime() : null;
  const e = end ? new Date(end).getTime() : null;
  return {
    response: s !== null && !Number.isNaN(s) ? Math.max(0, Math.round((s - c) / 60000)) : null,
    duration:
      s !== null && e !== null && !Number.isNaN(s) && !Number.isNaN(e)
        ? Math.max(0, Math.round((e - s) / 60000))
        : null,
  };
}

const emptyForm = (): DailyTaskInput => ({
  task_date: todayISO(),
  reporter_name: "",
  unit_id: "",
  issue: "",
  detail: "",
  solution: "",
  complain_at: "",
  start_at: "",
  end_at: "",
});

export default function DailyTasksPage() {
  const router = useRouter();
  const { user, token, isLoading } = useAuth();

  const [tasks, setTasks] = useState<DailyTask[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filter periode: default bulan berjalan — laporan harian biasanya
  // dibaca per bulan, bukan per tahun.
  const [from, setFrom] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [to, setTo] = useState(todayISO());
  const [unitFilter, setUnitFilter] = useState("");
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DailyTaskInput>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const isLeaderOrAdmin = user?.role === "leader" || user?.role === "admin";

  useEffect(() => {
    if (!isLoading && !user) router.push("/login");
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!isLoading && user && user.role === "user") router.push("/dashboard");
  }, [isLoading, user, router]);

  // Unit hanya perlu diambil sekali — daftarnya tidak berubah saat filter
  // tanggal digeser.
  useEffect(() => {
    if (!token) return;
    listUnits(token)
      .then((d) => setUnits(d || []))
      .catch(() => setUnits([]));
  }, [token]);

  async function loadTasks() {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const d = await listDailyTasks(token, {
        from,
        to,
        unit_id: unitFilter || undefined,
      });
      setTasks(d || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat daily task");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, from, to, unitFilter]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter(
      (t) =>
        t.issue.toLowerCase().includes(q) ||
        t.reporter_name.toLowerCase().includes(q) ||
        (t.unit_name || "").toLowerCase().includes(q) ||
        (t.detail || "").toLowerCase().includes(q)
    );
  }, [tasks, search]);

  const summary = useMemo(() => {
    const done = visible.filter((t) => t.end_at);
    const dur = done
      .map((t) => t.duration_minutes)
      .filter((v): v is number => typeof v === "number");
    const resp = visible
      .map((t) => t.response_minutes)
      .filter((v): v is number => typeof v === "number");
    const avg = (arr: number[]) =>
      arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
    return {
      total: visible.length,
      avgDuration: avg(dur),
      avgResponse: avg(resp),
    };
  }, [visible]);

  function openCreate() {
    setForm(emptyForm());
    setEditingId(null);
    setFormError("");
    setShowForm(true);
  }

  function openEdit(t: DailyTask) {
    setForm({
      task_date: t.task_date.slice(0, 10),
      reporter_name: t.reporter_name,
      unit_id: t.unit_id || "",
      issue: t.issue,
      detail: t.detail || "",
      solution: t.solution || "",
      complain_at: toLocalInput(t.complain_at),
      start_at: toLocalInput(t.start_at),
      end_at: toLocalInput(t.end_at),
    });
    setEditingId(t.id);
    setFormError("");
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setFormError("");

    if (!form.reporter_name.trim()) {
      setFormError("Pelapor wajib diisi.");
      return;
    }
    if (!form.complain_at) {
      setFormError("Waktu komplain wajib diisi — dari situ response time dihitung.");
      return;
    }
    if (form.start_at && form.start_at < form.complain_at) {
      setFormError("Waktu mulai tidak boleh lebih awal dari waktu komplain.");
      return;
    }
    if (form.end_at && form.start_at && form.end_at < form.start_at) {
      setFormError("Waktu selesai tidak boleh lebih awal dari waktu mulai.");
      return;
    }

    setSaving(true);
    try {
      // datetime-local menghasilkan "2026-11-12T08:30" tanpa zona waktu.
      // Backend (Go) mem-parse sebagai waktu LOKAL SERVER dan menyimpannya
      // sebagai timestamptz, jadi string ini dikirim apa adanya.
      const payload: DailyTaskInput = {
        ...form,
        unit_id: form.unit_id || null,
        start_at: form.start_at || null,
        end_at: form.end_at || null,
      };
      if (editingId) {
        await updateDailyTask(token, editingId, payload);
      } else {
        await createDailyTask(token, payload);
      }
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm());
      await loadTasks();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Gagal menyimpan daily task");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!token) return;
    try {
      await deleteDailyTask(token, id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
      setConfirmDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus daily task");
    }
  }

  const preview = previewMinutes(form.complain_at, form.start_at || "", form.end_at || "");

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto slim-scroll">
        <PageHeader
          title="Daily Task"
          subtitle="Pekerjaan harian di luar tiket — ikut dihitung di Laporan KPI"
          actions={[{ label: "+ Catat Daily Task", onClick: openCreate, variant: "primary" as const }]}
        />

        <div className="page-transition space-y-4 p-4 md:p-6">
          {/* Ringkasan periode — tiga angka yang paling sering ditanya leader. */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-border bg-card p-4">
              <p className="text-[11px] uppercase tracking-wide text-text-muted">Total Pekerjaan</p>
              <p className="mt-1 font-[family-name:var(--font-display)] text-2xl text-text-primary">
                {summary.total}
              </p>
            </div>
            <div className="rounded-md border border-border bg-card p-4">
              <p className="text-[11px] uppercase tracking-wide text-text-muted">Rata-rata Durasi</p>
              <p className="mt-1 font-[family-name:var(--font-display)] text-2xl text-text-primary">
                {formatMinutes(summary.avgDuration)}
              </p>
            </div>
            <div className="rounded-md border border-border bg-card p-4">
              <p className="text-[11px] uppercase tracking-wide text-text-muted">Rata-rata Respon</p>
              <p className="mt-1 font-[family-name:var(--font-display)] text-2xl text-text-primary">
                {formatMinutes(summary.avgResponse)}
              </p>
            </div>
          </div>

          {/* Filter */}
          <div className="rounded-md border border-border bg-card p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className={labelClass}>Dari tanggal</label>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Sampai tanggal</label>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Unit</label>
                <select value={unitFilter} onChange={(e) => setUnitFilter(e.target.value)} className={inputClass}>
                  <option value="">Semua unit</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Cari</label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Kendala, pelapor, unit..."
                    className={`${inputClass} pl-9`}
                  />
                </div>
              </div>
            </div>
          </div>

          {error && (
            <p className="rounded-md border border-red/30 bg-red/10 px-3 py-2 text-xs text-red">{error}</p>
          )}

          {/* Form */}
          {showForm && (
            <form onSubmit={handleSubmit} className="rounded-md border border-accent/30 bg-card p-4">
              <div className="mb-4 flex items-center justify-between">
                <p className="font-[family-name:var(--font-display)] text-sm text-text-primary">
                  {editingId ? "Ubah Daily Task" : "Catat Daily Task Baru"}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                  }}
                  className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-card-hover hover:text-text-primary"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className={labelClass}>Tanggal *</label>
                  <input
                    type="date"
                    required
                    value={form.task_date}
                    onChange={(e) => setForm({ ...form, task_date: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Pelapor *</label>
                  <input
                    required
                    value={form.reporter_name}
                    onChange={(e) => setForm({ ...form, reporter_name: e.target.value })}
                    placeholder="Nama orang / unit yang minta via WA"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Unit</label>
                  <select
                    value={form.unit_id || ""}
                    onChange={(e) => setForm({ ...form, unit_id: e.target.value })}
                    className={inputClass}
                  >
                    <option value="">Pilih unit</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2 lg:col-span-3">
                  <label className={labelClass}>Kendala *</label>
                  <input
                    required
                    value={form.issue}
                    onChange={(e) => setForm({ ...form, issue: e.target.value })}
                    placeholder="Ringkas: printer loket tidak mencetak"
                    className={inputClass}
                  />
                </div>

                <div className="sm:col-span-2 lg:col-span-3">
                  <label className={labelClass}>Keterangan kendala</label>
                  <textarea
                    rows={3}
                    value={form.detail || ""}
                    onChange={(e) => setForm({ ...form, detail: e.target.value })}
                    placeholder="Detail kondisi, lokasi, apa yang sudah dicoba..."
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>Waktu komplain *</label>
                  <input
                    type="datetime-local"
                    required
                    value={form.complain_at}
                    onChange={(e) => setForm({ ...form, complain_at: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Waktu mulai</label>
                  <input
                    type="datetime-local"
                    value={form.start_at || ""}
                    onChange={(e) => setForm({ ...form, start_at: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Waktu selesai</label>
                  <input
                    type="datetime-local"
                    value={form.end_at || ""}
                    onChange={(e) => setForm({ ...form, end_at: e.target.value })}
                    className={inputClass}
                  />
                </div>

                {/* Pratinjau otomatis: dihitung dari jam yang baru diisi,
                    supaya pencatat langsung lihat dampaknya ke KPI. */}
                <div className="sm:col-span-2 lg:col-span-3 flex flex-wrap items-center gap-3 rounded-md border border-border-subtle bg-card-hover px-3 py-2.5">
                  <Clock className="h-3.5 w-3.5 text-accent" />
                  <span className="text-[11px] uppercase tracking-wide text-text-muted">Otomatis</span>
                  <span className="text-xs text-text-secondary">
                    Respon time:{" "}
                    <span className="font-semibold text-text-primary">
                      {preview.response === null ? "—" : formatMinutes(preview.response)}
                    </span>
                  </span>
                  <span className="text-text-muted">·</span>
                  <span className="text-xs text-text-secondary">
                    Durasi pengerjaan:{" "}
                    <span className="font-semibold text-text-primary">
                      {preview.duration === null ? "—" : formatMinutes(preview.duration)}
                    </span>
                  </span>
                </div>

                <div className="sm:col-span-2 lg:col-span-3">
                  <label className={labelClass}>Solusi</label>
                  <textarea
                    rows={3}
                    value={form.solution || ""}
                    onChange={(e) => setForm({ ...form, solution: e.target.value })}
                    placeholder="Tindakan yang menyelesaikan kendala"
                    className={inputClass}
                  />
                </div>
              </div>

              {formError && (
                <p className="mt-3 rounded-md border border-red/30 bg-red/10 px-3 py-2 text-xs text-red">
                  {formError}
                </p>
              )}

              <div className="mt-4 flex items-center gap-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-xs font-medium text-bg-primary transition-all duration-150 hover:opacity-90 disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  {saving ? "Menyimpan..." : editingId ? "Simpan Perubahan" : "Simpan"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                  }}
                  className="rounded-md border border-border px-4 py-2 text-xs text-text-secondary transition-colors hover:bg-card-hover"
                >
                  Batal
                </button>
              </div>
            </form>
          )}

          {/* Tabel */}
          <div className="overflow-hidden rounded-md border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-card-hover text-[11px] uppercase tracking-wide text-text-muted">
                  <tr>
                    <th className="px-3 py-2.5">Tanggal</th>
                    <th className="px-3 py-2.5">Pelapor / Unit</th>
                    <th className="px-3 py-2.5">Kendala</th>
                    <th className="px-3 py-2.5">Komplain</th>
                    <th className="px-3 py-2.5">Mulai</th>
                    <th className="px-3 py-2.5">Selesai</th>
                    <th className="px-3 py-2.5">Respon</th>
                    <th className="px-3 py-2.5">Durasi</th>
                    {isLeaderOrAdmin && <th className="px-3 py-2.5">Pencatat</th>}
                    <th className="px-3 py-2.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={isLeaderOrAdmin ? 10 : 9} className="px-3 py-8 text-center text-text-muted">
                        Memuat data...
                      </td>
                    </tr>
                  )}
                  {!loading && visible.length === 0 && (
                    <tr>
                      <td colSpan={isLeaderOrAdmin ? 10 : 9} className="px-3 py-8 text-center text-text-muted">
                        Belum ada daily task pada periode ini.
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    visible.map((t) => (
                      <tr key={t.id} className="border-b border-border-subtle last:border-0 hover:bg-card-hover/50">
                        <td className="whitespace-nowrap px-3 py-2.5 text-text-secondary">{formatDate(t.task_date)}</td>
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-text-primary">{t.reporter_name}</p>
                          <p className="text-[11px] text-text-muted">{t.unit_name || "—"}</p>
                        </td>
                        <td className="max-w-[280px] px-3 py-2.5">
                          <p className="text-text-primary">{t.issue}</p>
                          {t.detail && (
                            <p className="mt-0.5 line-clamp-2 text-[11px] text-text-muted">{t.detail}</p>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-text-secondary">{formatTime(t.complain_at)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-text-secondary">{formatTime(t.start_at)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-text-secondary">{formatTime(t.end_at)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-text-secondary">
                          {formatMinutes(t.response_minutes)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-text-secondary">
                          {formatMinutes(t.duration_minutes)}
                        </td>
                        {isLeaderOrAdmin && (
                          <td className="whitespace-nowrap px-3 py-2.5 text-text-muted">{t.created_by_name || "—"}</td>
                        )}
                        <td className="whitespace-nowrap px-3 py-2.5 text-right">
                          {/* Staf hanya boleh mengubah catatannya sendiri;
                              leader/admin boleh mengubah semua. */}
                          {(isLeaderOrAdmin || t.created_by === user.id) && (
                            <>
                              <button
                                onClick={() => openEdit(t)}
                                title="Ubah"
                                className="mr-1 rounded-md p-1.5 text-text-muted transition-colors hover:bg-accent/10 hover:text-accent"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              {confirmDeleteId === t.id ? (
                                <span className="inline-flex items-center gap-1">
                                  <button
                                    onClick={() => handleDelete(t.id)}
                                    className="rounded-md bg-red/15 px-2 py-1 text-[11px] font-medium text-red transition-colors hover:bg-red/25"
                                  >
                                    Ya
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="rounded-md px-2 py-1 text-[11px] text-text-muted hover:text-text-primary"
                                  >
                                    Batal
                                  </button>
                                </span>
                              ) : (
                                <button
                                  onClick={() => setConfirmDeleteId(t.id)}
                                  title="Hapus"
                                  className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-red/10 hover:text-red"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[11px] text-text-muted">
            Durasi dan respon time dihitung otomatis oleh sistem dari jam yang diisi
            — tidak perlu diisi manual.
          </p>
        </div>
      </main>
    </div>
  );
}
