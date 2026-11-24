"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import PageHeader from "@/components/page-header";
import { useAuth } from "@/lib/auth-context";
import {
  Ticket, Category, listProjects, getProjectDashboard, createProject,
  updateProject, deleteProject, listCategories, ProjectDashboard, ProjectSummary,
  decideProjectProposal, openProjectFile,
} from "@/lib/api";

const STATUS: Record<string, string> = {
  "": "Semua", draft: "Draft", menunggu_persetujuan: "Menunggu Persetujuan",
  berjalan: "Berjalan", ditahan: "Ditahan", selesai: "Selesai",
  ditutup: "Ditutup", dibatalkan: "Dibatalkan",
};
const inputClass =
  "w-full rounded-md border border-border bg-card-hover px-3 py-2 text-sm text-text-primary outline-none focus:border-accent";

type FormState = {
  title: string; description: string; category_id: string; priority: string;
  start_date: string; target_date: string;
};
const emptyForm: FormState = {
  title: "", description: "", category_id: "", priority: "medium",
  start_date: "", target_date: "",
};

function fmtPriority(p: string) {
  return ({ low: "Rendah", medium: "Sedang", high: "Tinggi", urgent: "Mendesak" } as Record<string, string>)[p] || p;
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-card-hover/60 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-0.5 truncate font-medium text-text-primary" title={value}>{value}</div>
    </div>
  );
}

function StatusBadge({ projectStatus, status }: { projectStatus: string; status: string }) {
  const key = projectStatus || status;
  const style = ({
    draft: "bg-slate-500/15 text-slate-300 border-slate-500/30",
    menunggu_persetujuan: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    berjalan: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    ditahan: "bg-orange-500/15 text-orange-300 border-orange-500/30",
    selesai: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    ditutup: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    dibatalkan: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  } as Record<string, string>)[key] || "bg-border/30 text-text-muted border-border";
  return (
    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium ${style}`}>
      {STATUS[key] || key}
    </span>
  );
}

export default function ProjectListPage() {
  const { token, user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [stats, setStats] = useState<ProjectDashboard | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<{ url: string; name: string; type: string } | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm);

  // Href dari action-items dashboard, mis. /project?status=menunggu_persetujuan.
  useEffect(() => {
    // Baca langsung dari location: hook useSearchParams butuh Suspense
    // boundary saat prerender, sedangkan halaman ini sudah "use client".
    const qs = new URLSearchParams(window.location.search).get("status");
    if (qs) setStatus(qs);
  }, []);
  const isLeader = ["leader", "admin"].includes(user?.role || "");

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [list, dash] = await Promise.all([
        listProjects(token, status || undefined),
        getProjectDashboard(token),
      ]);
      // Kompatibel dengan biner lama yang belum di-restart: dulu endpoint
      // mengembalikan Ticket[] langsung, sekarang ProjectSummary[].
      setProjects(list.map((item: any) => item && item.ticket
        ? item
        : { ticket: item, pic_name: "", member_count: 0, milestone_count: 0,
            milestone_done: 0, task_count: 0, task_done: 0, progress: 0,
            proposal_version: 0, proposal_uploader: "", late_tasks: 0 }));
      setStats(dash);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token, status]);

  useEffect(() => {
    if (!authLoading && !token) { router.push("/login"); return; }
    if (!token) return;
    listCategories(token).then(setCategories).catch(() => {});
    load();
  }, [token, authLoading, router, load]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (p: Ticket) => {
    setEditing(p.id);
    setForm({
      title: p.title, description: p.description, category_id: p.category_id,
      priority: p.priority || "medium",
      start_date: p.start_date ? p.start_date.slice(0, 10) : "",
      target_date: p.target_date ? p.target_date.slice(0, 10) : "",
    });
    setShowForm(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      if (editing) await updateProject(token, editing, form);
      else await createProject(token, form);
      setShowForm(false);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (p: ProjectSummary) => {
    if (!token || !confirm(`Hapus project "${p.ticket.title}"?`)) return;
    try {
      await deleteProject(token, p.ticket.id);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const seeProposal = async (p: ProjectSummary) => {
    if (!token) return;
    try {
      const f = await openProjectFile(token, p.ticket.id);
      setPreviewUrl({ url: f.url, name: f.file_name, type: f.content_type });
    } catch (e) { setError((e as Error).message); }
  };

  const decide = async (projectId: string, decision: "disetujui" | "ditolak") => {
    if (!token) return;
    if (decision === "ditolak" && !reason.trim()) {
      setError("Alasan penolakan wajib diisi."); return;
    }
    try {
      await decideProjectProposal(token, projectId, decision, reason.trim());
      setDeciding(null); setReason(""); await load();
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <div className="relative z-0 flex h-screen bg-transparent font-[family-name:var(--font-body)]">
      <Sidebar />
      <main className="relative flex-1 overflow-y-auto slim-scroll">
        <PageHeader
          title="Project"
          subtitle="Daftar project — terpisah dari tiket biasa"
          actions={[{ label: "+ Project Baru", onClick: openCreate, variant: "primary" as const }]}
        />
        <div className="relative z-10 w-full px-6 py-8 sm:px-10">
        {error && <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}

        {stats && (
          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            {([
              ["Total", stats.total], ["Draft", stats.draft], ["Menunggu", stats.menunggu],
              ["Berjalan", stats.berjalan], ["Ditahan", stats.ditahan], ["Selesai", stats.selesai],
              ["Tugas Selesai", stats.done_tasks],
            ] as [string, number][]).map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border bg-card p-3">
                <div className="text-xs text-text-muted">{label}</div>
                <div className="mt-1 text-xl font-semibold text-accent">{value}</div>
              </div>
            ))}
          </div>
        )}

        <div className="mb-4 flex gap-2 overflow-x-auto">
          {Object.entries(STATUS).map(([k, v]) => (
            <button key={k} onClick={() => { setStatus(k); setLoading(true); }}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${status === k ? "bg-accent text-white" : "border border-border bg-card text-text-muted"}`}>
              {v}
            </button>
          ))}
        </div>

        {showForm && (
          <form onSubmit={submit} className="mb-6 rounded-lg border border-border bg-card p-5">
            <h2 className="mb-4 text-lg font-semibold">{editing ? "Edit Project" : "Project Baru"}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="text-sm">Judul<input className={inputClass} required value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
              <label className="text-sm">Kategori<select className={inputClass} required value={form.category_id}
                disabled={!!editing}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                <option value="">— pilih —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
              <label className="text-sm">Prioritas<select className={inputClass} value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                {["low", "medium", "high", "urgent"].map((p) => <option key={p} value={p}>{p}</option>)}
              </select></label>
              <label className="text-sm">Mulai<input type="date" className={inputClass} value={form.start_date}
                onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></label>
              <label className="text-sm">Target<input type="date" className={inputClass} value={form.target_date}
                onChange={(e) => setForm({ ...form, target_date: e.target.value })} /></label>
              <label className="text-sm md:col-span-2">Deskripsi<textarea className={inputClass} rows={3}
                value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
            </div>
            <div className="mt-4 flex gap-2">
              <button className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white">Simpan</button>
              <button type="button" className="rounded-md border border-border px-4 py-2 text-sm"
                onClick={() => setShowForm(false)}>Batal</button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="text-sm text-text-muted">Memuat project...</p>
        ) : projects.length === 0 ? (
          <p className="text-sm text-text-muted">Belum ada project.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((p) => {
              const t = p.ticket;
              const ps = t.project_status || "draft";
              const isCreator = t.created_by === user?.id;
              const canDecide = isLeader && ps === "menunggu_persetujuan";
              const cardCls = "rounded-lg border border-border bg-card p-4 transition-colors hover:border-accent/60";
              return (
                <article key={t.id} className={cardCls}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-mono text-xs text-text-muted">{t.ticket_code || "PROJECT"}</div>
                      <h3 className="mt-0.5 truncate font-semibold text-text-primary">{t.title}</h3>
                    </div>
                    <StatusBadge projectStatus={ps} status={t.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                    <span>Progres · {p.milestone_count} milestone</span>
                    <span className="font-semibold text-text-primary">{p.progress}%</span>
                    {t.target_date && (
                      <span>Target {new Date(t.target_date).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}</span>
                    )}
                    {p.late_tasks > 0 && <span className="text-rose-400">{p.late_tasks} terlambat</span>}
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-card-hover">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-accent to-accent/50 transition-all"
                      style={{ width: `${p.progress}%` }}
                    />
                  </div>
                  {p.proposal_version > 0 ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                      <span>Proposal v{p.proposal_version} oleh {p.proposal_uploader || "—"}</span>
                      <button className="text-accent hover:underline" onClick={() => seeProposal(p)}>Lihat proposal</button>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-text-muted">Proposal belum diunggah · tim belum dipilih</p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
                    <button className="text-sm text-accent hover:underline"
                      onClick={() => router.push(`/project/${t.id}`)}>{ps === "draft" ? "Lanjutkan" : "Buka"}</button>
                    {canDecide && (
                      <>
                        <button className="text-sm text-emerald-400 hover:underline"
                          onClick={() => decide(t.id, "disetujui")}>Setujui</button>
                        <button className="text-sm text-rose-400 hover:underline"
                          onClick={() => { setDeciding(t.id); setReason(""); }}>Tolak</button>
                      </>
                    )}
                    {isCreator && ps === "draft" && (
                      <button className="ml-auto text-xs text-text-muted hover:text-rose-400" onClick={() => remove(p)}>Batalkan</button>
                    )}
                    {isLeader && (
                      <button className="text-xs text-text-muted hover:text-rose-400" onClick={() => remove(p)}>Hapus</button>
                    )}
                  </div>
                  {deciding === t.id && (
                    <div className="mt-3 space-y-2 rounded border border-rose-500/40 bg-rose-500/5 p-3">
                      <textarea className={`${inputClass} min-h-[60px]`} placeholder="Alasan penolakan (wajib)"
                        value={reason} onChange={(e) => setReason(e.target.value)} />
                      <div className="flex gap-3 text-sm">
                        <button className="text-rose-400 hover:underline" onClick={() => decide(t.id, "ditolak")}>Kirim penolakan</button>
                        <button className="text-text-muted hover:underline" onClick={() => { setDeciding(null); setReason(""); }}>Batal</button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
        </div>
        {previewUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6" onClick={() => { URL.revokeObjectURL(previewUrl.url); setPreviewUrl(null); }}>
            <div className="max-h-full w-full max-w-4xl rounded-lg bg-card p-4" onClick={(e) => e.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between">
                <span className="truncate text-sm">{previewUrl.name}</span>
                <div className="flex gap-3 text-sm">
                  {previewUrl.type.includes("pdf") && <a className="text-accent" href={previewUrl.url} target="_blank" rel="noreferrer">Buka tab baru</a>}
                  <button className="text-text-muted" onClick={() => { URL.revokeObjectURL(previewUrl.url); setPreviewUrl(null); }}>Tutup</button>
                </div>
              </div>
              {previewUrl.type.includes("pdf")
                ? <iframe className="h-[70vh] w-full" src={previewUrl.url} />
                : <img className="mx-auto max-h-[70vh] max-w-full" src={previewUrl.url} alt={previewUrl.name} />}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
