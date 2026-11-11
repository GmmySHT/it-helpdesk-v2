"use client";

import { useEffect, useState, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useNotificationsContext } from "@/lib/notifications-context";
import { Sidebar } from "@/components/sidebar";
import PageHeader from "@/components/page-header";
import { RichTextEditor } from "@/components/rich-text-editor";
import {
  Ticket,
  User,
  Rating,
  TicketComment,
  Category,
  getTicket,
  claimTicket,
  resolveTicket,
  closeTicket,
  reopenTicket,
  reassignTicket,
  approveTicket,
  rejectTicket,
  updateTicketDeadline,
  updateTicketDetails,
  listStaff,
  listCategories,
  getRating,
  rateTicket,
  listComments,
  createComment,
  softDeleteTicket,
} from "@/lib/api";

const STATUS_LABEL: Record<string, string> = {
  pending_approval: "Menunggu Persetujuan",
  unassigned: "Belum Ditugaskan",
  assigned: "Menunggu Diklaim",
  claimed: "Sedang Dikerjakan",
  resolved: "Menunggu Review",
  closed: "Selesai",
};

const STATUS_DOT: Record<string, string> = {
  pending_approval: "bg-purple",
  unassigned: "bg-text-muted",
  assigned: "bg-amber",
  claimed: "bg-amber",
  resolved: "bg-blue",
  closed: "bg-accent",
};

const inputClass =
  "w-full rounded-md border border-border bg-card-hover px-3.5 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none transition-all duration-150 focus:border-accent";

export default function TicketDetailPage() {
  const params = useParams();
  const ticketId = params.id as string;
  const router = useRouter();
  const { user, token, isLoading } = useAuth();
  const { notifications, lastMessageAt } = useNotificationsContext();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [staff, setStaff] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const [resolveMessage, setResolveMessage] = useState("");
  const [resolveFiles, setResolveFiles] = useState<File[]>([]);
  const [reopenReason, setReopenReason] = useState("");
  const [reassignStaffId, setReassignStaffId] = useState("");
  const [reassignReason, setReassignReason] = useState("");

  const [rating, setRating] = useState<Rating | null>(null);
  const [ratingScore, setRatingScore] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingSubmitting, setRatingSubmitting] = useState(false);

  const [approveStaffId, setApproveStaffId] = useState("");
  const [approveDeadline, setApproveDeadline] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  const [showEditDeadline, setShowEditDeadline] = useState(false);
  const [editDeadline, setEditDeadline] = useState("");

  const [comments, setComments] = useState<TicketComment[]>([]);
  const [commentMessage, setCommentMessage] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [showEditTicket, setShowEditTicket] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategoryId, setEditCategoryId] = useState("");
  const [editPriority, setEditPriority] = useState<
    "low" | "medium" | "high" | "urgent"
  >("medium");

  const isLeaderOrAdmin = user?.role === "leader" || user?.role === "admin";
  const isAdmin = user?.role === "admin";
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteTicket() {
    if (!token || !ticket) return;
    try {
      setDeleting(true);
      await softDeleteTicket(token, ticket.id, deleteReason);
      router.push("/tickets");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus tiket");
      setShowDeleteModal(false);
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    if (!isLoading && !user) router.push("/login");
  }, [isLoading, user, router]);

  async function loadTicket() {
    if (!token) return;
    try {
      const data = await getTicket(token, ticketId);
      setTicket(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat tiket");
    }
  }

  async function loadComments() {
    if (!token) return;
    try {
      const data = await listComments(token, ticketId);
      const next = data || [];
      // Jangan ganti state kalau isinya sama (jumlah & komentar terakhir
      // identik) — supaya polling berkala tidak membuat tampilan berkedip.
      setComments((prev) =>
        prev.length === next.length &&
        prev[prev.length - 1]?.id === next[next.length - 1]?.id
          ? prev
          : next
      );
    } catch {
      // Riwayat komentar bersifat pelengkap — kalau gagal dimuat, tidak
      // perlu mengganggu tampilan tiket utama dengan pesan error.
    }
  }

  useEffect(() => {
    if (!token) return;
    loadTicket();
    loadComments();
    listCategories(token).then((d) => setCategories(d || [])).catch(() => {});
    if (isLeaderOrAdmin) {
      listStaff(token).then(setStaff).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, ticketId]);

  // Real-time: server mengirim notifikasi lewat WebSocket tiap ada komentar
  // baru / perubahan status pada tiket ini. Begitu notifikasi untuk tiket
  // ini masuk, muat ulang komentar & data tiket — tanpa refresh manual.
  useEffect(() => {
    if (!token || !lastMessageAt) return;
    // Komentar dimuat ulang pada SETIAP notifikasi yang masuk (murah: satu
    // GET) — tidak bergantung pada pencocokan ticket_id, jadi tidak ada
    // satu syarat pun yang bisa membuat balasan terlewat. Data tiket
    // (status, dll.) hanya dimuat ulang kalau notifikasinya untuk tiket ini.
    loadComments();
    if (notifications[0]?.ticket_id === ticketId) {
      loadTicket();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessageAt]);

  // Cadangan kalau WebSocket putus atau notifikasi terlewat: periksa
  // komentar tiap 5 detik selama tab terlihat, dan langsung saat tab
  // kembali dibuka.
  useEffect(() => {
    if (!token) return;
    const refresh = () => {
      if (document.visibilityState === "visible") loadComments();
    };
    const timer = setInterval(refresh, 5_000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, ticketId]);

  // Rating hanya relevan kalau tiket sudah closed — baru dicek setelah
  // data tiketnya sendiri berhasil dimuat, supaya tidak nembak API dua kali
  // untuk kasus yang jelas tidak butuh (tiket masih berjalan).
  useEffect(() => {
    if (!token || !ticket || ticket.status !== "closed") return;
    getRating(token, ticketId).then(setRating);
  }, [token, ticket, ticketId]);

  async function handleSubmitRating(e: FormEvent) {
    e.preventDefault();
    if (!token || ratingScore === 0) return;
    setError("");
    setRatingSubmitting(true);
    try {
      const newRating = await rateTicket(token, ticketId, ratingScore, ratingComment);
      setRating(newRating);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim rating");
    } finally {
      setRatingSubmitting(false);
    }
  }

  async function handleSubmitComment(e: FormEvent) {
    e.preventDefault();
    if (!token || !commentMessage.trim()) return;
    setError("");
    setCommentSubmitting(true);
    try {
      await createComment(token, ticketId, commentMessage);
      setCommentMessage("");
      await loadComments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim komentar");
    } finally {
      setCommentSubmitting(false);
    }
  }

  async function runAction(action: () => Promise<Ticket>) {
    setError("");
    setActionLoading(true);
    try {
      const updated = await action();
      setTicket(updated);
      loadComments();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aksi gagal dijalankan");
    } finally {
      setActionLoading(false);
    }
  }

  function handleClaim() {
    if (!token) return;
    runAction(() => claimTicket(token, ticketId));
  }

  function handleResolve(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    const plainText = resolveMessage.replace(/<[^>]*>/g, "").trim();
    if (!plainText) {
      setError("Keterangan resolve wajib diisi");
      return;
    }
    if (resolveFiles.length === 0) {
      setError("Wajib upload minimal 1 gambar bukti");
      return;
    }
    runAction(() => resolveTicket(token, ticketId, resolveMessage, resolveFiles));
  }

  function handleClose() {
    if (!token) return;
    runAction(() => closeTicket(token, ticketId));
  }

  function handleReopen(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    runAction(() => reopenTicket(token, ticketId, reopenReason));
  }

  function handleReassign(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    runAction(() =>
      reassignTicket(token, ticketId, reassignStaffId, reassignReason)
    );
  }

  function handleApprove(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    runAction(() =>
      approveTicket(
        token,
        ticketId,
        approveStaffId || undefined,
        approveDeadline ? new Date(approveDeadline).toISOString() : undefined
      )
    );
  }

  function handleUpdateDeadline(e: FormEvent) {
    e.preventDefault();
    if (!token || !editDeadline) return;
    runAction(() =>
      updateTicketDeadline(token, ticketId, new Date(editDeadline).toISOString())
    ).then(() => setShowEditDeadline(false));
  }

  function handleReject(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    runAction(() => rejectTicket(token, ticketId, rejectReason));
  }

  function handleOpenEdit() {
    if (!ticket) return;
    setEditTitle(ticket.title);
    setEditDescription(ticket.description);
    setEditCategoryId(ticket.category_id);
    setEditPriority(ticket.priority);
    setShowEditTicket(true);
  }

  function handleSubmitEdit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    const plainText = editDescription.replace(/<[^>]*>/g, "").trim();
    if (!editTitle.trim() || !plainText || !editCategoryId) {
      setError("Judul, deskripsi, dan kategori wajib diisi");
      return;
    }
    runAction(() =>
      updateTicketDetails(token, ticketId, {
        title: editTitle,
        description: editDescription,
        category_id: editCategoryId,
        priority: editPriority,
      })
    ).then(() => setShowEditTicket(false));
  }

  if (isLoading || !user || !ticket) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-transparent">
        <p className="text-sm text-text-muted">{error || "Memuat..."}</p>
      </main>
    );
  }

  // Bug yang diperbaiki: sebelumnya siapa saja (termasuk 'user'/pelapor)
  // bisa lihat & klik tombol claim asal statusnya cocok. Sekarang wajib
  // role staff_it juga, konsisten dengan validasi yang sudah ada di backend.
  const canClaim =
    user.role === "staff_it" &&
    (ticket.status === "unassigned" ||
      (ticket.status === "assigned" && ticket.assigned_to === user.id));
  const canResolve =
    ticket.status === "claimed" && ticket.claimed_by === user.id;
  const canReassign = isLeaderOrAdmin && ticket.status === "claimed";
  const canReview = isLeaderOrAdmin && ticket.status === "resolved";
  const canApprove = isLeaderOrAdmin && ticket.status === "pending_approval";

  return (
    <div className="relative z-0 flex h-screen bg-transparent font-[family-name:var(--font-body)]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto slim-scroll">
        <PageHeader
          title={ticket.title}
          subtitle={`Tiket #${ticket.id.slice(0, 8)} · ${STATUS_LABEL[ticket.status]}`}
          actions={[
            ...(isAdmin ? [{ label: "🗑️ Hapus Tiket", onClick: () => setShowDeleteModal(true), variant: "danger" as const }] : []),
            { label: "← Kembali ke Daftar Tiket", href: "/tickets", variant: "secondary" as const },
          ]}
        />

        {/* Modal konfirmasi hapus tiket */}
        {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
              <h2 className="text-base font-semibold text-text-primary mb-2">Hapus Tiket</h2>
              <p className="text-sm text-text-muted mb-4">
                Tiket tidak akan benar-benar dihapus dari database — hanya ditandai sebagai dihapus dan tersimpan di log admin.
              </p>
              <div className="mb-4">
                <label className="block text-xs font-medium uppercase tracking-wide text-text-muted mb-1.5">
                  Alasan penghapusan (opsional)
                </label>
                <textarea
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-border bg-card-hover px-3 py-2 text-sm text-text-primary outline-none focus:border-red-400"
                  placeholder="Masukkan alasan penghapusan..."
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deleting}
                  className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-text-primary hover:bg-card-hover disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  onClick={handleDeleteTicket}
                  disabled={deleting}
                  className="rounded-md bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50"
                >
                  {deleting ? "Menghapus..." : "Ya, Hapus Tiket"}
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="w-full px-6 py-6 sm:px-10">

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h1 className="font-[family-name:var(--font-display)] text-lg font-semibold text-text-primary">
              {ticket.title}
            </h1>
            <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1 font-[family-name:var(--font-display)] text-[11px] uppercase tracking-wide text-text-muted">
              <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[ticket.status]}`} />
              {STATUS_LABEL[ticket.status]}
            </span>
          </div>

          <div
            className="rich-content mb-2 border-b border-border pb-5 text-sm leading-relaxed text-text-secondary"
            dangerouslySetInnerHTML={{ __html: ticket.description }}
          />

          <dl className="mb-6 grid grid-cols-2 gap-4 pt-4 font-[family-name:var(--font-display)] text-xs lg:hidden">
            <div>
              <dt className="mb-0.5 uppercase tracking-wide text-text-muted/60">
                Prioritas
              </dt>
              <dd className="text-text-primary">{ticket.priority}</dd>
            </div>
            <div>
              <dt className="mb-0.5 uppercase tracking-wide text-text-muted/60">
                Reopen
              </dt>
              <dd className="text-text-primary">{ticket.reopen_count}x</dd>
            </div>
          </dl>

          {isLeaderOrAdmin && ticket.status !== "closed" && (
            <div className="mb-4">
              {!showEditDeadline ? (
                <button
                  onClick={() => {
                    setEditDeadline(
                      ticket.sla_deadline
                        ? new Date(ticket.sla_deadline).toISOString().slice(0, 16)
                        : ""
                    );
                    setShowEditDeadline(true);
                  }}
                  className="text-xs text-accent hover:underline"
                >
                  Ubah Deadline
                </button>
              ) : (
                <form
                  onSubmit={handleUpdateDeadline}
                  className="rounded-md border border-border bg-card-hover p-3"
                >
                  <input
                    type="datetime-local"
                    required
                    value={editDeadline}
                    onChange={(e) => setEditDeadline(e.target.value)}
                    className={`${inputClass} mb-2`}
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-card hover:bg-accent/80 disabled:opacity-50"
                    >
                      Simpan
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowEditDeadline(false)}
                      className="rounded-md border border-border px-3 py-1.5 text-xs text-text-muted"
                    >
                      Batal
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Edit Tiket — logikanya sudah lama dibuat tapi belum pernah
              dipasang tombolnya di UI, sekarang dipasang di sini. */}
          {isLeaderOrAdmin && ticket.status !== "closed" && (
            <div className="mb-5">
              {!showEditTicket ? (
                <button
                  onClick={handleOpenEdit}
                  className="text-xs text-accent hover:underline"
                >
                  ✏️ Edit Tiket
                </button>
              ) : (
                <form
                  onSubmit={handleSubmitEdit}
                  className="rounded-md border border-border bg-card-hover p-4"
                >
                  <h3 className="mb-3 font-[family-name:var(--font-display)] text-xs font-semibold uppercase tracking-wide text-text-primary">
                    Edit Tiket
                  </h3>

                  <div className="mb-3">
                    <label className="mb-1 block text-[11px] uppercase tracking-wide text-text-muted">
                      Judul
                    </label>
                    <input
                      required
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div className="mb-3">
                    <label className="mb-1 block text-[11px] uppercase tracking-wide text-text-muted">
                      Deskripsi
                    </label>
                    <RichTextEditor
                      value={editDescription}
                      onChange={setEditDescription}
                      placeholder="Deskripsi tiket..."
                    />
                  </div>

                  <div className="mb-4 grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-[11px] uppercase tracking-wide text-text-muted">
                        Kategori
                      </label>
                      <select
                        required
                        value={editCategoryId}
                        onChange={(e) => setEditCategoryId(e.target.value)}
                        className={inputClass}
                      >
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] uppercase tracking-wide text-text-muted">
                        Prioritas
                      </label>
                      <select
                        value={editPriority}
                        onChange={(e) =>
                          setEditPriority(
                            e.target.value as "low" | "medium" | "high" | "urgent"
                          )
                        }
                        className={inputClass}
                      >
                        <option value="low">Rendah</option>
                        <option value="medium">Sedang</option>
                        <option value="high">Tinggi</option>
                        <option value="urgent">Mendesak</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={actionLoading}
                      className="rounded-md bg-accent px-4 py-2 text-xs font-semibold text-card hover:bg-accent/80 disabled:opacity-50"
                    >
                      Simpan Perubahan
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowEditTicket(false)}
                      className="rounded-md border border-border px-4 py-2 text-xs text-text-muted"
                    >
                      Batal
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* Actions Removed from Main Content */}
          {/* Action buttons removed from main content to be displayed in the right sidebar */}

          {error && (
            <div className="mb-5 rounded-md border border-red/30 bg-red/10 px-4 py-2.5 text-sm text-red">
              {error}
            </div>
          )}

          {canResolve && (
            <form
              onSubmit={handleResolve}
              className="mb-4 rounded-md border border-border bg-card-hover p-4"
            >
              <h3 className="mb-3 font-[family-name:var(--font-display)] text-xs font-semibold uppercase tracking-wide text-text-primary">
                Selesaikan Tiket
              </h3>
              <RichTextEditor
                value={resolveMessage}
                onChange={setResolveMessage}
                placeholder="Jelaskan bagaimana masalah ini diselesaikan... bisa sisipkan gambar langsung di sini"
              />
              <div className="my-3" />
              <input
                required
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setResolveFiles(Array.from(e.target.files || []))}
                className="mb-4 w-full text-xs text-text-muted file:mr-3 file:rounded-md file:border-0 file:bg-border file:px-3 file:py-2 file:text-xs file:text-text-primary"
              />
              <p className="mb-4 -mt-3 text-[11px] text-text-muted/60">
                Gambar di atas wajib sebagai bukti resmi. Kamu juga bisa sisipkan
                gambar tambahan langsung di dalam keterangan lewat tombol 🖼 pada editor.
              </p>
              <button
                type="submit"
                disabled={actionLoading}
                className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-card transition-all duration-150 hover:bg-accent/80 disabled:opacity-50"
              >
                {actionLoading ? "Menyimpan..." : "Resolve Tiket"}
              </button>
            </form>
          )}

          {canReassign && (
            <form
              onSubmit={handleReassign}
              className="mb-4 rounded-md border border-amber/30 bg-amber/5 p-4"
            >
              <h3 className="mb-3 font-[family-name:var(--font-display)] text-xs font-semibold uppercase tracking-wide text-text-primary">
                Reassign Paksa
              </h3>
              <select
                required
                value={reassignStaffId}
                onChange={(e) => setReassignStaffId(e.target.value)}
                className={`${inputClass} mb-3`}
              >
                <option value="">-- Pilih staf pengganti --</option>
                {staff
                  .filter((s) => s.id !== ticket.claimed_by)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
              <textarea
                required
                placeholder="Alasan reassign (misal: staf berhalangan)"
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
                rows={2}
                className={`${inputClass} mb-4`}
              />
              <button
                type="submit"
                disabled={actionLoading}
                className="w-full rounded-md bg-amber px-4 py-2.5 text-sm font-semibold text-card transition-all duration-150 hover:bg-amber/80 disabled:opacity-50"
              >
                {actionLoading ? "Memproses..." : "Reassign Sekarang"}
              </button>
            </form>
          )}

          {canReview && (
            <div className="space-y-3">
              <button
                onClick={handleClose}
                disabled={actionLoading}
                className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-card transition-all duration-150 hover:bg-accent/80 disabled:opacity-50"
              >
                {actionLoading ? "Memproses..." : "Sudah Sesuai → Close Tiket"}
              </button>

              <form
                onSubmit={handleReopen}
                className="rounded-md border border-red-900/40 bg-red-950/20 p-4"
              >
                <h3 className="mb-3 font-[family-name:var(--font-display)] text-xs font-semibold uppercase tracking-wide text-text-primary">
                  Belum Sesuai → Reopen
                </h3>
                <textarea
                  required
                  placeholder="Alasan reopen (kenapa hasil belum sesuai)"
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  rows={2}
                  className={`${inputClass} mb-4`}
                />
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="w-full rounded-md bg-red-500 px-4 py-2.5 text-sm font-semibold text-text-primary transition-all duration-150 hover:bg-red-400 disabled:opacity-50"
                >
                  {actionLoading ? "Memproses..." : "Reopen Tiket"}
                </button>
              </form>
            </div>
          )}

          {ticket.status === "closed" && (
            <div className="rounded-md border border-accent/20 bg-accent/5 px-4 py-3 text-sm text-accent">
              Tiket ini sudah selesai dan ditutup.
            </div>
          )}

          {/* Riwayat & Komentar — semua catatan resolve/reopen yang selama ini
              tersimpan di database tapi belum pernah ditampilkan ke user. */}
          {comments.length > 0 && (
            <div className="mt-6 border-t border-border pt-5">
              <p className="mb-4 font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-text-muted">
                Riwayat & Komentar
              </p>
              <div className="space-y-2">
                {comments.map((c) => {
                  const isOwn = c.user_id === user.id;
                  const userColorIndex = c.user_id.charCodeAt(0) % 8;
                  return (
                    <div
                      key={c.id}
                      className={`comment-container ${isOwn ? "own" : ""}`}
                    >
                      <div className="comment-bubble">
                        <div className="comment-header">
                          <p className={`comment-user-name user-${userColorIndex}`}>
                            {c.user_name}
                          </p>
                          <span className="comment-timestamp">
                            {new Date(c.created_at).toLocaleString("id-ID")}
                          </span>
                        </div>
                        <div
                          className="comment-message"
                          dangerouslySetInnerHTML={{ __html: c.message }}
                        />
                        {c.attachments && c.attachments.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {c.attachments.map((a) => (
                              <a
                                key={a.id}
                                href={
                                  (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1")
                                    .replace(/\/api\/v1\/?$/, "") + a.file_url
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <img
                                  src={
                                    (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1")
                                      .replace(/\/api\/v1\/?$/, "") + a.file_url
                                  }
                                  alt="Lampiran"
                                  className="h-20 w-20 rounded-md border border-border object-cover"
                                />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Comment form: untuk semua user yang bisa akses tiket */}
          <form
            onSubmit={handleSubmitComment}
            className="mt-6 rounded-md border border-border bg-card-hover p-4"
          >
            <p className="mb-3 font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-text-muted">
              Tambah Komentar
            </p>
            <textarea
              placeholder="Tulis komentar Anda..."
              value={commentMessage}
              onChange={(e) => setCommentMessage(e.target.value)}
              rows={3}
              className={inputClass}
            />
            <button
              type="submit"
              disabled={commentSubmitting || !commentMessage.trim()}
              className="mt-3 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-all duration-150 disabled:opacity-50 hover:enabled:bg-accent/90"
            >
              {commentSubmitting ? "Mengirim..." : "Kirim Komentar"}
            </button>
          </form>

          {/* Rating: hanya muncul untuk pelapor asli, setelah tiket closed */}
          {ticket.status === "closed" && ticket.created_by === user.id && (
            <div className="mt-4">
              {rating ? (
                <div className="rounded-md border border-border bg-card-hover p-4">
                  <p className="mb-2 font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-text-muted">
                    Penilaian Kamu
                  </p>
                  <div className="mb-2 flex gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <span
                        key={n}
                        className={n <= rating.score ? "text-amber" : "text-border"}
                      >
                        ★
                      </span>
                    ))}
                  </div>
                  {rating.comment && (
                    <p className="text-sm text-text-secondary">{rating.comment}</p>
                  )}
                </div>
              ) : (
                <form
                  onSubmit={handleSubmitRating}
                  className="rounded-md border border-border bg-card-hover p-4"
                >
                  <h3 className="mb-3 font-[family-name:var(--font-display)] text-xs font-semibold uppercase tracking-wide text-text-primary">
                    Beri Penilaian
                  </h3>
                  <div className="mb-3 flex gap-1 text-2xl">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setRatingScore(n)}
                        className={
                          n <= ratingScore ? "text-amber" : "text-border hover:text-text-secondary"
                        }
                      >
                        ★
                      </button>
                    ))}
                  </div>
                  <textarea
                    placeholder="Komentar (opsional)"
                    value={ratingComment}
                    onChange={(e) => setRatingComment(e.target.value)}
                    rows={2}
                    className={`${inputClass} mb-3`}
                  />
                  <button
                    type="submit"
                    disabled={ratingSubmitting || ratingScore === 0}
                    className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-card transition-all duration-150 hover:bg-accent/80 disabled:opacity-50"
                  >
                    {ratingSubmitting ? "Mengirim..." : "Kirim Penilaian"}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
        </div>

        {/* Panel kanan: informasi lengkap tiket — dibuat oleh siapa,
            ditugaskan ke siapa, diklaim kapan, SLA, dst. Semua yang
            sebelumnya cuma sebagian tampil di kolom kiri, sekarang
            dikumpulkan di sini supaya lebih rapi dan lengkap. */}
        <div className="lg:col-span-1">
          <div className="rounded-lg border border-border bg-card p-6 lg:sticky lg:top-6">
            <p className="mb-4 font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-text-muted">
              Informasi Tiket
            </p>

            <dl className="space-y-4 font-[family-name:var(--font-display)] text-xs">
              <div>
                <dt className="mb-0.5 uppercase tracking-wide text-text-muted/60">
                  Kategori
                </dt>
                <dd className="text-text-primary">
                  {categories.find((c) => c.id === ticket.category_id)?.name || "-"}
                </dd>
              </div>
              <div>
                <dt className="mb-0.5 uppercase tracking-wide text-text-muted/60">
                  Prioritas
                </dt>
                <dd className="text-text-primary">{ticket.priority}</dd>
              </div>
              <div>
                <dt className="mb-0.5 uppercase tracking-wide text-text-muted/60">
                  Dibuat Oleh
                </dt>
                <dd className="text-text-primary">{ticket.created_by_name || "-"}</dd>
                <dd className="text-[10px] text-text-muted/60">
                  {new Date(ticket.created_at).toLocaleString("id-ID")}
                </dd>
              </div>
              {ticket.created_for_name && (
                <div>
                  <dt className="mb-0.5 uppercase tracking-wide text-text-muted/60">
                    Atas Permintaan
                  </dt>
                  <dd className="text-text-primary">{ticket.created_for_name}</dd>
                </div>
              )}
              {ticket.assigned_to_name && (
                <div>
                  <dt className="mb-0.5 uppercase tracking-wide text-text-muted/60">
                    Ditugaskan Ke
                  </dt>
                  <dd className="text-text-primary">{ticket.assigned_to_name}</dd>
                  {ticket.assigned_at && (
                    <dd className="text-[10px] text-text-muted/60">
                      {new Date(ticket.assigned_at).toLocaleString("id-ID")}
                    </dd>
                  )}
                </div>
              )}
              {ticket.claimed_by_name && (
                <div>
                  <dt className="mb-0.5 uppercase tracking-wide text-text-muted/60">
                    Diklaim / Dikerjakan Oleh
                  </dt>
                  <dd className="text-text-primary">{ticket.claimed_by_name}</dd>
                  {ticket.claimed_at && (
                    <dd className="text-[10px] text-text-muted/60">
                      {new Date(ticket.claimed_at).toLocaleString("id-ID")}
                    </dd>
                  )}
                </div>
              )}
              {ticket.sla_deadline && (
                <div>
                  <dt className="mb-0.5 uppercase tracking-wide text-text-muted/60">
                    SLA Deadline
                  </dt>
                  <dd className="text-amber">
                    {new Date(ticket.sla_deadline).toLocaleString("id-ID")}
                  </dd>
                </div>
              )}
              {ticket.last_resolved_at && (
                <div>
                  <dt className="mb-0.5 uppercase tracking-wide text-text-muted/60">
                    Diselesaikan Pukul
                  </dt>
                  <dd className="text-text-primary">
                    {new Date(ticket.last_resolved_at).toLocaleString("id-ID")}
                  </dd>
                </div>
              )}
              {ticket.closed_by_name && (
                <div>
                  <dt className="mb-0.5 uppercase tracking-wide text-text-muted/60">
                    Ditutup Oleh
                  </dt>
                  <dd className="text-text-primary">{ticket.closed_by_name}</dd>
                  {ticket.closed_at && (
                    <dd className="text-[10px] text-text-muted/60">
                      {new Date(ticket.closed_at).toLocaleString("id-ID")}
                    </dd>
                  )}
                </div>
              )}
              <div>
                <dt className="mb-0.5 uppercase tracking-wide text-text-muted/60">
                  Reopen Count
                </dt>
                <dd className="text-text-primary">{ticket.reopen_count}x</dd>
              </div>
            </dl>
          </div>
          {(canApprove || canClaim) && (
          <div className="mt-6 rounded-lg border border-border bg-card p-6 lg:sticky lg:top-[calc(100vh-400px)]">
            {/* Actions Moved to Right Panel */}
            <div className="space-y-3">
              {canApprove && (
                <div className="space-y-3">
                  <form onSubmit={handleApprove} className="rounded-md border border-accent/20 bg-accent/5 p-4">
                    <h3 className="mb-3 font-[family-name:var(--font-display)] text-xs font-semibold uppercase tracking-wide text-text-primary">Setujui Tiket</h3>
                    <select value={approveStaffId} onChange={(e) => setApproveStaffId(e.target.value)} className={`${inputClass} mb-3`}>
                      <option value="">-- Biarkan terbuka (unassigned) --</option>
                      {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <div className="mb-3">
                      <label className="mb-1 block text-[11px] uppercase tracking-wide text-text-muted">Deadline (opsional)</label>
                      <input type="datetime-local" value={approveDeadline} onChange={(e) => setApproveDeadline(e.target.value)} className={inputClass} />
                    </div>
                    <button type="submit" disabled={actionLoading} className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-card hover:bg-accent/80 disabled:opacity-50">
                      {actionLoading ? "Memproses..." : "Setujui Tiket"}
                    </button>
                  </form>
                  <form onSubmit={handleReject} className="rounded-md border border-red-900/40 bg-red-950/20 p-4">
                    <h3 className="mb-3 font-[family-name:var(--font-display)] text-xs font-semibold uppercase tracking-wide text-text-primary">Tolak Tiket</h3>
                    <textarea required placeholder="Alasan penolakan" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={2} className={`${inputClass} mb-4`} />
                    <button type="submit" disabled={actionLoading} className="w-full rounded-md bg-red-500 px-4 py-2.5 text-sm font-semibold text-text-primary hover:bg-red-400 disabled:opacity-50">
                      {actionLoading ? "Memproses..." : "Tolak Tiket"}
                    </button>
                  </form>
                </div>
              )}
              {canClaim && (
                <button onClick={handleClaim} disabled={actionLoading} className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-card hover:bg-accent/80 disabled:opacity-50">
                  {actionLoading ? "Memproses..." : "Klaim Tiket Ini"}
                </button>
              )}
            </div>
          </div>
          )}
        </div>
        </div>
        </div>
      </main>
    </div>
  );
}
