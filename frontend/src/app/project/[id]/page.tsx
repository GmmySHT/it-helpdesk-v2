"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import PageHeader from "@/components/page-header";
import { useAuth } from "@/lib/auth-context";
import {
  ProjectDetail, ProjectMilestone, ProjectTask, Ticket,
  getProject, createMilestone, updateMilestone, deleteMilestone,
  createProjectTask, updateProjectTask, deleteProjectTask, setProjectTaskStatus,
  setProjectStatus, updateProject, uploadProjectProposal, decideProjectProposal,
  addProjectMember, removeProjectMember, listStaff, listCoordinators,
  fetchProjectProposalFile, fetchProjectProposalVersion,
} from "@/lib/api";

const PROJECT_STATUS: Record<string, string> = {
  draft: "Draft", menunggu_persetujuan: "Menunggu Persetujuan",
  berjalan: "Berjalan", ditahan: "Ditahan", selesai: "Selesai",
  ditutup: "Ditutup", dibatalkan: "Dibatalkan",
};
const MILESTONE_STATUS: Record<string, string> = {
  belum_mulai: "Belum mulai", berjalan: "Berjalan", selesai: "Selesai",
};
const TASK_STATUS: Record<string, string> = {
  todo: "Belum", doing: "Dikerjakan", done: "Selesai",
};
const inputClass =
  "w-full rounded-md border border-border bg-card-hover px-3 py-2 text-sm text-text-primary outline-none focus:border-accent";

function fmtDate(v?: string | null) {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}
function lateDays(due?: string, done?: string, status?: string) {
  if (!due) return 0;
  const end = status === "done" && done ? new Date(done) : new Date();
  const diff = Math.floor((end.getTime() - new Date(due).getTime()) / 86400000);
  return diff > 0 ? diff : 0;
}
function isLate(t: ProjectTask) {
  return !!t.due_date && t.status !== "done" && lateDays(t.due_date, undefined, t.status) > 0;
}
function fileSize(n?: number) {
  if (!n) return "-";
  return n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

type Tab = "info" | "proposal" | "milestones" | "ringkasan";

export default function ProjectDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const { token, user, isLoading: authLoading } = useAuth();
  const [data, setData] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("info");
  const [filterMine, setFilterMine] = useState(false);
  const [filterLate, setFilterLate] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [newMilestone, setNewMilestone] = useState("");
  const [taskTitle, setTaskTitle] = useState<Record<string, string>>({});
  const [staff, setStaff] = useState<any[]>([]);
  const [leaders, setLeaders] = useState<any[]>([]);
  const [memberUserId, setMemberUserId] = useState("");
  const [memberRole, setMemberRole] = useState<"pic" | "member">("member");
  const [proposalFile, setProposalFile] = useState<{ url: string; name: string; type: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [editInfo, setEditInfo] = useState(false);
  const [infoForm, setInfoForm] = useState({ title: "", description: "", priority: "medium", start_date: "", target_date: "" });

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      setData(await getProject(token, id) || null);
      setError("");
    } catch (e) { setError((e as Error).message); }
  }, [token, id]);

  useEffect(() => {
    if (!authLoading && !token) router.push("/login");
    else if (token) {
      refresh();
      listStaff(token).then((v) => setStaff(v || [])).catch(() => {});
      listCoordinators(token).then((v) => setLeaders(v || [])).catch(() => {});
    }
  }, [token, authLoading, id, refresh]);

  useEffect(() => {
    return () => { if (proposalFile) URL.revokeObjectURL(proposalFile.url); };
  }, [proposalFile]);

  const loadProposalPreview = useCallback(async () => {
    if (!token || !data?.ticket?.id || !data.can_view_proposal) return;
    setPreviewLoading(true);
    try {
      const res = await fetchProjectProposalFile(token, data.ticket.id);
      setProposalFile({ url: res.url, name: res.file_name, type: res.content_type });
      setError("");
    } catch (e) { setError((e as Error).message); }
    finally { setPreviewLoading(false); }
  }, [token, data?.ticket?.id, data?.can_view_proposal]);

  // Pratinjau proposal langsung tampil begitu tab Proposal dibuka.
  useEffect(() => {
    if (tab === "proposal" && data?.proposal && data.can_view_proposal && !proposalFile) {
      loadProposalPreview();
    }
  }, [tab, data?.proposal, data?.can_view_proposal, proposalFile, loadProposalPreview]);

  // Ganti proposal → pratinjau lama dibuang supaya tidak menampilkan versi lawas.
  useEffect(() => {
    setProposalFile(null);
  }, [data?.proposal?.id]);

  const milestones = data?.milestones || [];
  const allTasks = data?.tasks || [];
  const isPIC = !!data?.members?.find((m) => m.role === "pic" && m.user_id === user?.id);
  const isLeader = ["leader", "admin"].includes(user?.role || "");
  const isCreator = !!user && !!data?.ticket?.created_by && data.ticket.created_by === user.id;
  // Hak kelola milestone/tugas = pembuat project atau PIC aktif.
  // Leader/admin hanya menyetujui proposal, bukan mengelola isi project.
  const canManage = isCreator || isPIC;
  const running = data?.ticket?.project_status === "berjalan";
  const draft = data?.ticket?.project_status === "draft";
  const waiting = data?.ticket?.project_status === "menunggu_persetujuan";
  const canUpload = isCreator && draft;
  const canDecide = isLeader && waiting;
  const activeMembers = data?.members || [];

  // Daftar anggota aktif untuk dropdown penanggung jawab.
  const assignable = useMemo(() => {
    const ids = new Set(activeMembers.map((m) => m.user_id));
    return [...staff, ...leaders].filter((u: any) => ids.has(u.id));
  }, [activeMembers, staff, leaders]);

  const visibleTasks = useMemo(() => {
    let out = allTasks;
    if (filterMine) out = out.filter((t) => t.assignee_id === user?.id);
    if (filterLate) out = out.filter(isLate);
    return out;
  }, [allTasks, filterMine, filterLate, user?.id]);

  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); await refresh(); }
    catch (e) { setError((e as Error).message); }
  };

  if (authLoading || !data) {
    return (
      <div className="relative z-0 flex h-screen bg-transparent">
        <Sidebar />
        <main className="flex-1 overflow-y-auto slim-scroll"><div className="w-full px-6 py-6 sm:px-10">Memuat project...</div></main>
      </div>
    );
  }

  const ticket = data.ticket || {};
  const pct = data.progress?.percent || 0;
  const versions = data.proposal_versions || [];
  const proposal = data.proposal;

  const tabs: { key: Tab; label: string }[] = [
    { key: "info", label: "Info & Tim" },
    { key: "proposal", label: "Proposal" },
    { key: "milestones", label: "Milestone & Tugas" },
    { key: "ringkasan", label: "Ringkasan" },
  ];

  return (
    <div className="relative z-0 flex h-screen bg-transparent font-[family-name:var(--font-body)]">
      <Sidebar />
      <main className="relative flex-1 overflow-y-auto slim-scroll">
        <PageHeader
          title={ticket.ticket_code ? `${ticket.ticket_code} — ${ticket.title}` : ticket.title}
          subtitle={`Project · ${PROJECT_STATUS[ticket.project_status || "draft"] || ticket.project_status}`}
          actions={[{ label: "← Kembali ke Project", href: "/project", variant: "secondary" as const }]}
        />
        <div className="relative z-10 w-full px-6 py-8 sm:px-10">
        {error && <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>}

        <div className="mb-6 flex gap-2 border-b border-border">
          {tabs.map((t) => (
            <button key={t.key}
              className={`px-4 py-2 text-sm ${tab === t.key ? "border-b-2 border-accent text-accent" : "text-text-muted"}`}
              onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </div>

        {tab === "info" && (
          <section className="space-y-5">
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">Informasi Project</h2>
                {canManage && <button className="text-sm text-accent" onClick={() => {
                  setInfoForm({
                    title: ticket.title, description: ticket.description,
                    priority: ticket.priority || "medium",
                    start_date: ticket.start_date?.slice(0, 10) || "",
                    target_date: ticket.target_date?.slice(0, 10) || "",
                  });
                  setEditInfo((v) => !v);
                }}>{editInfo ? "Batal" : "Edit"}</button>}
              </div>
              {editInfo ? (
                <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => {
                  e.preventDefault();
                  act(() => updateProject(token!, id, infoForm)).then(() => setEditInfo(false));
                }}>
                  <label className="text-sm">Judul<input className={inputClass} required value={infoForm.title}
                    onChange={(e) => setInfoForm({ ...infoForm, title: e.target.value })} /></label>
                  <label className="text-sm">Prioritas<select className={inputClass} value={infoForm.priority}
                    onChange={(e) => setInfoForm({ ...infoForm, priority: e.target.value })}>
                    {["low", "medium", "high", "urgent"].map((x) => <option key={x} value={x}>{x}</option>)}
                  </select></label>
                  <label className="text-sm">Mulai<input type="date" className={inputClass} value={infoForm.start_date}
                    onChange={(e) => setInfoForm({ ...infoForm, start_date: e.target.value })} /></label>
                  <label className="text-sm">Target<input type="date" className={inputClass} value={infoForm.target_date}
                    onChange={(e) => setInfoForm({ ...infoForm, target_date: e.target.value })} /></label>
                  <label className="text-sm md:col-span-2">Deskripsi<textarea className={inputClass} rows={3}
                    value={infoForm.description}
                    onChange={(e) => setInfoForm({ ...infoForm, description: e.target.value })} /></label>
                  <div className="md:col-span-2"><button className="rounded-md bg-accent px-4 py-2 text-sm text-white">Simpan</button></div>
                </form>
              ) : (
                <div className="text-sm text-text-muted">
                  <p className="mb-2 text-text-primary">{ticket.description || "Tanpa deskripsi"}</p>
                  <p>Prioritas: {ticket.priority} · Mulai: {fmtDate(ticket.start_date)} · Target: {fmtDate(ticket.target_date)}</p>
                </div>
              )}
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
              <h2 className="mb-3 text-lg font-semibold">Status &amp; Aksi</h2>
              <p className="mb-3 text-sm text-text-muted">
                Status: {PROJECT_STATUS[ticket.project_status || "draft"]} · Proposal: {proposal?.status || "belum ada"}
              </p>
              <div className="flex flex-wrap gap-2">
                {draft && isCreator && (
                  <button className="rounded-md border border-border px-4 py-2 text-sm"
                    onClick={() => setTab("proposal")}>Kelola Proposal</button>
                )}
                {canManage && proposal?.status === "disetujui" && draft && (
                  <button className="rounded-md bg-accent px-4 py-2 text-sm text-white"
                    onClick={() => act(() => setProjectStatus(token!, id, "berjalan"))}>Mulai Project</button>
                )}
                {canManage && running && (
                  <button className="rounded-md border border-border px-4 py-2 text-sm"
                    onClick={() => act(() => setProjectStatus(token!, id, "selesai"))}>Selesaikan Project</button>
                )}
                {canManage && running && (
                  <button className="rounded-md border border-border px-4 py-2 text-sm"
                    onClick={() => act(() => setProjectStatus(token!, id, "ditahan"))}>Tahan Project</button>
                )}
                {isLeader && draft && (
                  <button className="rounded-md border border-red-500/50 px-4 py-2 text-sm text-red-300"
                    onClick={() => { if (confirm("Batalkan project draft ini?")) act(() => setProjectStatus(token!, id, "dibatalkan")); }}>
                    Batalkan
                  </button>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
              <h2 className="mb-3 text-lg font-semibold">Tim Project</h2>
              <ul className="mb-3 space-y-2 text-sm">
                {activeMembers.map((m) => (
                  <li key={m.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <span>{m.user_name || m.user_id} <span className="text-xs text-text-muted">({m.role === "pic" ? "PIC" : "Anggota"})</span></span>
                    {canManage && <button className="text-xs text-red-400"
                      onClick={() => act(() => removeProjectMember(token!, id, m.user_id))}>Keluarkan</button>}
                  </li>
                ))}
                {activeMembers.length === 0 && <li className="text-text-muted">Belum ada anggota.</li>}
              </ul>
              {canManage && (
                <div className="flex flex-wrap gap-2">
                  <select className={inputClass + " max-w-xs"} value={memberUserId}
                    onChange={(e) => setMemberUserId(e.target.value)}>
                    <option value="">— pilih staf / leader —</option>
                    {(() => {
                      const seen = new Set<string>();
                      return [...staff, ...leaders].filter((u: any) => {
                        if (seen.has(u.id)) return false;
                        seen.add(u.id); return true;
                      }).map((u: any) => <option key={u.id} value={u.id}>{u.name}{["leader", "admin"].includes(u.role) ? ` (${u.role})` : ""}</option>);
                    })()}
                  </select>
                  <select className={inputClass + " max-w-[160px]"} value={memberRole}
                    onChange={(e) => setMemberRole(e.target.value as "pic" | "member")}>
                    <option value="member">Anggota</option><option value="pic">PIC</option>
                  </select>
                  <button className="rounded-md bg-accent px-4 py-2 text-sm text-white"
                    disabled={!memberUserId}
                    onClick={() => act(() => addProjectMember(token!, id, memberUserId, memberRole)).then(() => setMemberUserId(""))}>
                    Tambah
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {tab === "proposal" && (
          <section className="space-y-5">
            {!data.can_view_proposal && (
              <p className="text-sm text-text-muted">Anda tidak memiliki akses untuk melihat proposal project ini.</p>
            )}
            {data.can_view_proposal && (
              <>
                <div className="rounded-lg border border-border bg-card p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Proposal Project</h2>
                    {canUpload && (
                      <label className="cursor-pointer rounded-md bg-accent px-4 py-2 text-sm text-white">
                        {proposal ? "Ganti Proposal" : "Unggah Proposal"}
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden" onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          try {
                            await uploadProjectProposal(token!, id, f, user?.name || "");
                            await refresh();
                          } catch (err) { setError((err as Error).message); }
                        }} />
                      </label>
                    )}
                  </div>
                  {proposal ? (
                    <div className="space-y-2 text-sm">
                      <p><span className="text-text-muted">Nomor:</span> {proposal.doc_number || "-"} · <span className="text-text-muted">Versi:</span> {proposal.version}</p>
                      <p><span className="text-text-muted">File:</span> {proposal.file_name} ({proposal.file_type || "-"}, {fileSize(proposal.file_size)})</p>
                      <p><span className="text-text-muted">Pengunggah:</span> {proposal.signed_by_name || "-"} · <span className="text-text-muted">Waktu:</span> {fmtDate(proposal.created_at)}</p>
                      <p><span className="text-text-muted">Status:</span> {proposal.status}{proposal.notes ? ` · Catatan: ${proposal.notes}` : ""}</p>
                      <button className="rounded-md border border-border px-4 py-2 text-sm text-accent"
                        onClick={() => proposalFile && window.open(proposalFile.url, "_blank", "noopener,noreferrer")}>
                        Buka di Tab Baru
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-text-muted">Belum ada proposal.</p>
                  )}
                  {previewLoading && (
                    <div className="mt-4 rounded-md border border-border bg-card-hover px-4 py-10 text-center text-sm text-text-muted">
                      Memuat pratinjau proposal…
                    </div>
                  )}
                  {proposalFile && !previewLoading && (
                    <div className="mt-4 overflow-hidden rounded-md border border-border">
                      <div className="flex items-center justify-between bg-card-hover px-3 py-2 text-xs">
                        <span className="font-medium">Pratinjau — {proposalFile.name}</span>
                        <button className="text-text-muted hover:text-text-primary" onClick={() => setProposalFile(null)}>Tutup</button>
                      </div>
                      {proposalFile.type.includes("pdf") ? (
                        <iframe src={proposalFile.url} title="Pratinjau proposal PDF" className="h-[75vh] w-full bg-white" />
                      ) : (
                        <div className="bg-card p-3 text-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={proposalFile.url} alt="Pratinjau proposal" className="mx-auto max-h-[75vh] object-contain" />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {canDecide && (
                  <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/5 p-5">
                    <h2 className="mb-3 text-lg font-semibold">Keputusan Proposal</h2>
                    <div className="flex flex-wrap gap-2">
                      <button className="rounded-md bg-accent px-4 py-2 text-sm text-white"
                        onClick={() => act(() => decideProjectProposal(token!, id, "disetujui"))}>Setujui</button>
                      <button className="rounded-md border border-red-500/50 px-4 py-2 text-sm text-red-300"
                        onClick={() => setRejectOpen((v) => !v)}>Tolak</button>
                    </div>
                    {rejectOpen && (
                      <form className="mt-3 space-y-2" onSubmit={(e) => {
                        e.preventDefault();
                        if (!rejectReason.trim()) { setError("Alasan penolakan wajib diisi"); return; }
                        act(() => decideProjectProposal(token!, id, "ditolak", rejectReason.trim()))
                          .then(() => { setRejectOpen(false); setRejectReason(""); });
                      }}>
                        <textarea className={inputClass} rows={3} required placeholder="Alasan penolakan (wajib)"
                          value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                        <button className="rounded-md bg-red-600 px-4 py-2 text-sm text-white">Kirim Penolakan</button>
                      </form>
                    )}
                  </div>
                )}

                {versions.length > 1 && (
                  <div className="rounded-lg border border-border bg-card p-5">
                    <h2 className="mb-3 text-lg font-semibold">Riwayat Versi</h2>
                    <ul className="space-y-2 text-sm">
                      {versions.map((v) => (
                        <li key={v.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                          <span>V{v.version} · {v.file_name} · {fmtDate(v.created_at)} · {v.status}
                            {v.notes ? ` · ${v.notes}` : ""}</span>
                          <button className="text-xs text-accent" onClick={async () => {
                            if (!data?.ticket?.id) return;
                            try {
                              const r = await fetchProjectProposalVersion(token!, data.ticket.id, v.id);
                              setProposalFile({ url: r.url, name: r.file_name, type: r.content_type });
                            } catch (e) { setError((e as Error).message); }
                          }}>Lihat</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {tab === "ringkasan" && (
          <section className="rounded-lg border border-border bg-card p-5">
            <h2 className="mb-3 text-lg font-semibold">Progres Project</h2>
            <div className="mb-2 flex justify-between text-sm">
              <span>Selesai: {data.progress?.done || 0} dari {data.progress?.total || 0} bobot</span>
              <span className="font-semibold text-accent">{pct}%</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-card-hover">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="mt-5 space-y-3">
              {milestones.map((m) => (
                <div key={m.id}>
                  <div className="flex justify-between text-sm"><span>{m.title}</span><span>{m.progress}%</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-card-hover">
                    <div className="h-full bg-blue-400" style={{ width: `${m.progress}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === "milestones" && (
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={filterMine} onChange={(e) => setFilterMine(e.target.checked)} />
                  Tugas saya
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={filterLate} onChange={(e) => setFilterLate(e.target.checked)} />
                  Terlambat saja
                </label>
              </div>
              {canManage && running && (
                <form className="flex w-full max-w-md gap-2" onSubmit={(e) => {
                  e.preventDefault();
                  if (!newMilestone.trim()) return;
                  act(() => createMilestone(token!, id, { title: newMilestone.trim() }));
                  setNewMilestone("");
                }}>
                  <input className={inputClass} placeholder="Nama milestone baru" value={newMilestone}
                    onChange={(e) => setNewMilestone(e.target.value)} />
                  <button className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white">Tambah</button>
                </form>
              )}
            </div>

            {milestones.length === 0 && <p className="text-sm text-text-muted">Belum ada milestone.</p>}
            <div className="space-y-3">
              {milestones.map((m) => {
                const mtasks = visibleTasks.filter((t) => t.milestone_id === m.id);
                const allHere = (data?.tasks || []).filter((t) => t.milestone_id === m.id);
                const lateCount = allHere.filter(isLate).length;
                const span = m.start_date || m.due_date
                  ? `${fmtDate(m.start_date)} — ${fmtDate(m.due_date)}` : "";
                const isOpen = open[m.id] ?? true;
                return (
                  <div key={m.id} className="overflow-hidden rounded-lg border border-border bg-card">
                    <button className="flex w-full items-center justify-between p-4 text-left"
                      onClick={() => setOpen((s) => ({ ...s, [m.id]: !isOpen }))}>
                      <div>
                        <div className="font-medium">{m.title}</div>
                        <div className="text-xs text-text-muted">
                          {MILESTONE_STATUS[m.status] || m.status} · {allHere.length} tugas
                          {span && ` · ${span}`}
                          {lateCount > 0 && <span className="ml-2 text-red-300">{lateCount} terlambat</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-card-hover">
                          <div className="h-full bg-accent" style={{ width: `${m.progress}%` }} />
                        </div>
                        <span className="w-10 text-right text-sm">{m.progress}%</span>
                        <span>{isOpen ? "▾" : "▸"}</span>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="border-t border-border p-4">
                        <ul className="space-y-2">
                          {mtasks.map((t) => (
                            <TaskRow key={t.id} task={t} canManage={canManage}
                              members={assignable} currentUserId={user?.id}
                              onStatus={(s) => act(() => setProjectTaskStatus(token!, id, t.id, s))}
                              onAssign={(uid) => act(() => updateProjectTask(token!, id, t.id, { assignee_id: uid || undefined }))}
                              onDue={(d) => act(() => updateProjectTask(token!, id, t.id, { due_date: d || undefined }))}
                              onDelete={() => act(() => deleteProjectTask(token!, id, t.id))} />
                          ))}
                        </ul>
                        {mtasks.length === 0 && <p className="text-sm text-text-muted">Belum ada tugas di milestone ini.</p>}
                        {canManage && running && (
                          <TaskComposer value={taskTitle[m.id] || ""}
                            onChange={(v) => setTaskTitle((s) => ({ ...s, [m.id]: v }))}
                            members={assignable}
                            onSubmit={(title, assignee_id, due_date) => {
                              act(() => createProjectTask(token!, id, {
                                title, milestone_id: m.id, assignee_id, due_date,
                              }));
                              setTaskTitle((s) => ({ ...s, [m.id]: "" }));
                            }} />
                        )}
                        {canManage && !allHere.some((t) => !t.milestone_id) && (
                          <div className="mt-3 flex flex-wrap gap-3 text-xs">
                            <button className="text-accent" onClick={() => act(() => updateMilestone(token!, id, m.id, {
                              title: m.title, description: m.description, weight: m.weight, sort_order: m.sort_order,
                              start_date: m.start_date?.slice(0, 10), due_date: m.due_date?.slice(0, 10),
                            }))}>Ubah tanggal</button>
                            <button className="text-red-400" onClick={() => {
                              if (confirm("Hapus milestone ini?")) act(() => deleteMilestone(token!, id, m.id));
                            }}>Hapus</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {(() => {
                const orphan = visibleTasks.filter((t) => !t.milestone_id);
                if (orphan.length === 0) return null;
                return (
                  <div className="rounded-lg border border-border bg-card p-4">
                    <div className="mb-3 font-medium">Tanpa milestone</div>
                    <ul className="space-y-2">
                      {orphan.map((t) => (
                        <TaskRow key={t.id} task={t} canManage={canManage}
                          members={assignable} currentUserId={user?.id}
                          onStatus={(s) => act(() => setProjectTaskStatus(token!, id, t.id, s))}
                          onAssign={(uid) => act(() => updateProjectTask(token!, id, t.id, { assignee_id: uid || undefined }))}
                          onDue={(d) => act(() => updateProjectTask(token!, id, t.id, { due_date: d || undefined }))}
                          onDelete={() => act(() => deleteProjectTask(token!, id, t.id))} />
                      ))}
                    </ul>
                  </div>
                );
              })()}
            </div>
          </section>
        )}

        </div>
      </main>
    </div>
  );
}

function TaskComposer({ value, onChange, members, onSubmit }: {
  value: string; onChange: (v: string) => void; members: any[];
  onSubmit: (title: string, assignee_id?: string, due_date?: string) => void;
}) {
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState("");
  return (
    <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => {
      e.preventDefault();
      if (!value.trim()) return;
      onSubmit(value.trim(), assignee || undefined, due || undefined);
      setAssignee(""); setDue("");
    }}>
      <input className={inputClass + " max-w-xs"} placeholder="Tugas baru" value={value}
        onChange={(e) => onChange(e.target.value)} />
      <select className={inputClass + " max-w-[200px]"} value={assignee}
        onChange={(e) => setAssignee(e.target.value)}>
        <option value="">— penanggung jawab —</option>
        {members.map((m) => <option key={m.id} value={m.id}>{m.name}{["leader", "admin"].includes(m.role) ? ` (${m.role})` : ""}</option>)}
      </select>
      <input type="date" className={inputClass + " max-w-[170px]"} value={due}
        onChange={(e) => setDue(e.target.value)} />
      <button className="rounded-md bg-accent px-4 py-2 text-sm text-white">Tambah</button>
    </form>
  );
}

function TaskRow({ task, canManage, members, currentUserId, onStatus, onAssign, onDue, onDelete }: {
  task: ProjectTask; canManage: boolean; members: any[]; currentUserId?: string;
  onStatus: (s: string) => void; onAssign: (uid?: string) => void;
  onDue: (d?: string) => void; onDelete: () => void;
}) {
  const assignee = members.find((m) => m.id === task.assignee_id);
  const isAssignee = task.assignee_id === currentUserId;
  const late = isLate(task);
  const doneLate = task.status === "done" ? lateDays(task.due_date, task.completed_at, "done") : 0;
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card-hover px-3 py-2 text-sm">
      <div className="min-w-[180px] flex-1">
        <div className="flex items-center gap-2 font-medium">
          {task.title}
          {assignee && (
            <span title={assignee.name}
              className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-[10px] text-accent">
              {(assignee.name || "?").slice(0, 2).toUpperCase()}
            </span>
          )}
        </div>
        <div className="text-xs text-text-muted">
          {assignee ? `${assignee.name}${isAssignee ? " (Anda)" : ""}` : "Belum ditugaskan"}
          {task.due_date && ` · Tenggat ${fmtDate(task.due_date)}`}
          {task.status === "done" && task.due_date && (
            doneLate > 0
              ? <span className="ml-1 text-amber-300">· Telat {doneLate} hari</span>
              : <span className="ml-1 text-emerald-300">· Tepat waktu</span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {late && <span className="rounded bg-red-500/15 px-2 py-0.5 text-xs text-red-300">Terlambat</span>}
        {canManage && (
          <select className="rounded-md border border-border bg-card px-2 py-1 text-xs"
            value={task.assignee_id || ""} onChange={(e) => onAssign(e.target.value || undefined)}>
            <option value="">— penanggung jawab —</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
        {canManage && (
          <input type="date" className="rounded-md border border-border bg-card px-2 py-1 text-xs"
            value={task.due_date?.slice(0, 10) || ""} onChange={(e) => onDue(e.target.value || undefined)} />
        )}
        <select className="rounded-md border border-border bg-card px-2 py-1 text-sm disabled:opacity-50"
          value={task.status} disabled={!canManage && !isAssignee}
          onChange={(e) => onStatus(e.target.value)}>
          {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {canManage && <button className="text-xs text-red-400" onClick={onDelete}>Hapus</button>}
      </div>
    </li>
  );
}
