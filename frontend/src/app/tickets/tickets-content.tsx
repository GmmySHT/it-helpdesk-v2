"use client";

import { useEffect, useState, FormEvent, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useNotificationsContext } from "@/lib/notifications-context";
import { Sidebar } from "@/components/sidebar";
import PageHeader from "@/components/page-header";
import { RichTextEditor } from "@/components/rich-text-editor";
import {
  Ticket,
  Category,
  User,
  listTickets,
  listCategories,
  listStaff,
  listAllUsers,
  createTicket,
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

const STATUS_BADGE: Record<string, string> = {
  pending_approval: "bg-purple/10 text-purple border-purple/30",
  unassigned: "bg-text-muted/10 text-text-muted border-text-muted/30",
  assigned: "bg-amber/10 text-amber border-amber/30",
  claimed: "bg-amber/10 text-amber border-amber/30",
  resolved: "bg-blue/10 text-blue border-blue/30",
  closed: "bg-accent/10 text-accent border-accent/30",
};

const PRIORITY_LABEL: Record<string, string> = {
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
  urgent: "Mendesak",
};

const PRIORITY_BADGE: Record<string, string> = {
  low: "bg-text-muted/15 text-text-secondary border-text-muted/30",
  medium: "bg-blue/15 text-blue border-blue/30",
  high: "bg-amber/15 text-amber border-amber/30",
  urgent: "bg-red-500/15 text-red-400 border-red-500/30",
};

export function TicketsContent() {
  const { user, token, isLoading } = useAuth();
  const { lastMessageAt } = useNotificationsContext();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [staffFilter, setStaffFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (searchParams.get("create") === "1") {
      setShowForm(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [assignedTo, setAssignedTo] = useState("");
  const [createdFor, setCreatedFor] = useState("");
  const [deadline, setDeadline] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isLeaderOrAdmin = user?.role === "leader" || user?.role === "admin";

  useEffect(() => {
    if (!isLoading && !user) router.push("/login");
  }, [isLoading, user, router]);

  async function loadTickets() {
    if (!token) return;
    try {
      const data = await listTickets(token, statusFilter || undefined);
      setTickets(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat tiket");
    }
  }

  useEffect(() => {
    if (!token) return;
    loadTickets();
    listCategories(token).then(setCategories).catch(() => {});
    listStaff(token).then(setStaff).catch(() => {});
    listAllUsers(token).then(setUsers).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, statusFilter]);

  useEffect(() => {
    if (!token || lastMessageAt === 0) return;
    loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastMessageAt]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError("");

    const plainText = description.replace(/<[^>]*>/g, "").trim();
    if (!plainText) {
      setError("Deskripsi wajib diisi");
      return;
    }

    setIsSubmitting(true);
    try {
      await createTicket(token, {
        title,
        description,
        category_id: categoryId,
        priority,
        assigned_to: assignedTo || undefined,
        created_for: createdFor || undefined,
        deadline: deadline ? new Date(deadline).toISOString() : undefined,
      });
      setTitle("");
      setDescription("");
      setCategoryId("");
      setPriority("medium");
      setAssignedTo("");
      setCreatedFor("");
      setDeadline("");
      setShowForm(false);
      loadTickets();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat tiket");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-transparent">
        <p className="text-sm text-text-muted">Memuat...</p>
      </main>
    );
  }

  const inputClass =
    "w-full rounded-md border border-border bg-card-hover px-3.5 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none transition-all duration-150 focus:border-accent";
  const labelClass =
    "mb-1.5 block text-xs font-medium uppercase tracking-wide text-text-muted";

  const filteredTickets = tickets.filter((t) => {
    if (staffFilter && t.claimed_by !== staffFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q)
    );
  });

  function formatDateTime(iso?: string) {
    if (!iso) return null;
    return new Date(iso).toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="relative z-0 flex h-screen bg-transparent font-[family-name:var(--font-body)]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto slim-scroll">
        <PageHeader
          title="Daftar Tiket"
          subtitle="Kelola semua permintaan layanan IT"
          actions={[{
            label: showForm ? "Batal" : "+ Buat Tiket",
            onClick: () => setShowForm(!showForm),
            variant: showForm ? "secondary" as const : "primary" as const,
          }]}
        />
        <div className="w-full px-6 py-6 sm:px-10">

        {error && (
          <div className="mb-5 rounded-md border border-red/30 bg-red/10 px-4 py-2.5 text-sm text-red">
            {error}
          </div>
        )}

        {showForm && (
          <form
            onSubmit={handleCreate}
            className="mb-8 rounded-lg border border-border bg-card p-6"
          >
            <h2 className="mb-4 font-[family-name:var(--font-display)] text-sm font-semibold text-text-primary">
              Buat Tiket Baru
            </h2>

            <div className="mb-4">
              <label className={labelClass}>Judul</label>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="mb-4">
              <label className={labelClass}>Deskripsi</label>
              <RichTextEditor
                value={description}
                onChange={setDescription}
                placeholder="Jelaskan masalahnya... bisa sisipkan gambar langsung di sini"
              />
            </div>

            <div className="mb-4">
              <label className={labelClass}>Kategori</label>
              <select
                required
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className={inputClass}
              >
                <option value="">-- Pilih kategori --</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-3">
              <label className={labelClass}>Prioritas</label>
              <select
                value={priority}
                onChange={(e) =>
                  setPriority(e.target.value as "low" | "medium" | "high" | "urgent")
                }
                className={inputClass}
              >
                <option value="low">Rendah</option>
                <option value="medium">Sedang</option>
                <option value="high">Tinggi</option>
                <option value="urgent">Mendesak</option>
              </select>
              <p className="mt-1 text-[11px] text-text-muted/60">
                Menentukan target waktu penyelesaian (SLA) sesuai aturan yang berlaku.
              </p>
            </div>

            {isLeaderOrAdmin && (
              <div className="mb-5">
                <label className={labelClass}>
                  Buat untuk (atas permintaan user, opsional)
                </label>
                <select
                  value={createdFor}
                  onChange={(e) => setCreatedFor(e.target.value)}
                  className={inputClass}
                >
                  <option value="">-- Untuk diri sendiri --</option>
                  {users
                    .filter((u) => u.role === "user" && u.id !== user?.id)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                </select>
                <p className="mt-1 text-xs text-text-muted">
                  Tiket akan terlihat oleh user tersebut di daftar tiketnya.
                </p>
              </div>
            )}

            {isLeaderOrAdmin && (
              <div className="mb-5">
                <label className={labelClass}>
                  Assign langsung ke staf (opsional)
                </label>
                <select
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  className={inputClass}
                >
                  <option value="">-- Biarkan terbuka (unassigned) --</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {isLeaderOrAdmin && (
              <div className="mb-3">
                <label className={labelClass}>Deadline (opsional)</label>
                <input
                  type="datetime-local"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className={inputClass}
                />
                <p className="mt-1 text-[11px] text-text-muted/60">
                  Kosongkan untuk hitung otomatis dari prioritas.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-card transition-all duration-150 hover:bg-accent/80 disabled:opacity-50"
            >
              {isSubmitting ? "Menyimpan..." : "Simpan Tiket"}
            </button>
          </form>
        )}

        <div className="mb-4">
          <input
            type="text"
            placeholder="Cari tiket berdasarkan judul atau deskripsi..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-2">
          {["", "pending_approval", "unassigned", "assigned", "claimed", "resolved", "closed"].map(
            (s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-full border px-3 py-1 font-[family-name:var(--font-display)] text-[11px] uppercase tracking-wide transition-all duration-150 ${
                  statusFilter === s
                    ? "border-accent bg-accent/15 text-accent font-semibold"
                    : "border-border text-text-secondary hover:border-text-primary hover:text-text-primary hover:bg-card-hover"
                }`}
              >
                {s === "" ? "Semua" : STATUS_LABEL[s]}
              </button>
            )
          )}

          <select
            value={staffFilter}
            onChange={(e) => setStaffFilter(e.target.value)}
            className="ml-auto rounded-md border border-border bg-card-hover px-3 py-1.5 text-xs text-text-primary outline-none focus:border-accent"
          >
            <option value="">Semua Staf</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                Dikerjakan oleh: {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          {filteredTickets.length === 0 ? (
            <p className="p-8 text-center text-sm text-text-muted">
              {tickets.length === 0
                ? "Belum ada tiket."
                : "Tidak ada tiket yang cocok dengan pencarian."}
            </p>
          ) : (
            <ul className="divide-y divide-border-subtle">
              {filteredTickets.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/tickets/${t.id}`}
                    className="flex items-start gap-4 px-5 py-4 transition-all duration-150 hover:bg-card-hover"
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[t.status]}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-text-primary">
                        {t.title}
                      </p>
                      <div className="mb-1 mt-1 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-full border px-2 py-0.5 font-[family-name:var(--font-display)] text-[10px] uppercase tracking-wide ${PRIORITY_BADGE[t.priority]}`}
                        >
                          {PRIORITY_LABEL[t.priority] || t.priority}
                        </span>
                        {t.reopen_count > 0 && (
                          <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 font-[family-name:var(--font-display)] text-[10px] uppercase tracking-wide text-red-400">
                            Reopen {t.reopen_count}x
                          </span>
                        )}
                        {t.created_for_name && (
                          <span className="rounded-full border border-tosca/30 bg-tosca/10 px-2 py-0.5 font-[family-name:var(--font-display)] text-[10px] uppercase tracking-wide text-tosca-light">
                            Untuk: {t.created_for_name}
                          </span>
                        )}
                      </div>
                      {(t.claimed_by_name || t.last_resolved_at) && (
                        <p className="font-[family-name:var(--font-display)] text-[11px] text-text-muted">
                          {t.claimed_by_name && (
                            <>
                              Dikerjakan oleh <span className="text-text-secondary">{t.claimed_by_name}</span>
                            </>
                          )}
                          {t.claimed_at && (
                            <> · Diklaim {formatDateTime(t.claimed_at)}</>
                          )}
                          {t.last_resolved_at && (
                            <> · Selesai {formatDateTime(t.last_resolved_at)}</>
                          )}
                        </p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-1 font-[family-name:var(--font-display)] text-[10px] uppercase tracking-wide ${STATUS_BADGE[t.status]}`}
                    >
                      {STATUS_LABEL[t.status]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        </div>
      </main>
    </div>
  );
}
