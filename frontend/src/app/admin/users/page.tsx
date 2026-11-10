"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import PageHeader from "@/components/page-header";
import { Sidebar } from "@/components/sidebar";
import {
  listAllUsers,
  createUserByAdmin,
  updateUserByAdmin,
  setUserActive,
  deleteUserByAdmin,
  User,
} from "@/lib/api";

type Role = "user" | "staff_it" | "leader" | "admin";

const ROLE_LABEL: Record<string, string> = {
  user: "Pelapor",
  staff_it: "Staf IT",
  leader: "Leader",
  admin: "Administrator",
};

const ROLE_BADGE: Record<string, string> = {
  user: "bg-text-muted/10 text-text-muted border-text-muted/30",
  staff_it: "bg-blue/10 text-blue border-blue/30",
  leader: "bg-amber/10 text-amber border-amber/30",
  admin: "bg-accent/10 text-accent border-accent/30",
};

const inputClass =
  "w-full rounded-md border border-border bg-card-hover px-3.5 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none focus:border-accent";
const labelClass =
  "mb-1.5 block text-xs font-medium uppercase tracking-wide text-text-muted";

// canManage meniru PERSIS aturan hierarki yang ditegakkan backend
// (service.canManageTarget): leader hanya boleh mengelola (edit/nonaktifkan/
// hapus) akun user/staff_it — akun leader/admin cuma boleh disentuh admin.
// Ini HANYA demi UX (sembunyikan tombol yang pasti akan ditolak backend);
// keamanan sesungguhnya tetap ditegakkan di server, bukan di sini.
function canManage(requesterRole: Role, targetRole: Role): boolean {
  if (targetRole === "leader" || targetRole === "admin") {
    return requesterRole === "admin";
  }
  return true;
}

type FormState = {
  name: string;
  email: string;
  username: string;
  password: string;
  role: Role;
  department: string;
};

const emptyForm: FormState = {
  name: "",
  email: "",
  username: "",
  password: "",
  role: "user",
  department: "",
};

export default function UserManagementPage() {
  const { user, token, isLoading } = useAuth();
  const router = useRouter();

  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // mode "create" = form Tambah User, "edit" = form Edit (editingId terisi).
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  // confirmTarget menampilkan panel konfirmasi inline hanya untuk DELETE.
  const [confirmTarget, setConfirmTarget] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // togglingUserId mencatat user mana yang sedang toggle statusnya
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);

  const myRole = (user?.role as Role) || "user";
  const isAdmin = myRole === "admin";
  const isLeaderOrAdmin = myRole === "leader" || myRole === "admin";

  // Halaman ini dijaga berdasarkan ROLE langsung (bukan RBAC modul), sama
  // seperti proteksi di backend — membuat akun bukan modul fitur yang wajar
  // diberikan/dicabut fleksibel, tapi fungsi inti manajemen identitas.
  useEffect(() => {
    if (!isLoading && (!user || !isLeaderOrAdmin)) {
      router.push("/dashboard");
    }
  }, [isLoading, user, isLeaderOrAdmin, router]);

  async function loadUsers() {
    if (!token) return;
    try {
      const data = await listAllUsers(token);
      setUsers(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat daftar user");
    }
  }

  useEffect(() => {
    if (token && isLeaderOrAdmin) loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isLeaderOrAdmin]);

  function openCreateForm() {
    setForm(emptyForm);
    setEditingId(null);
    setFormMode(formMode === "create" ? null : "create");
    setError("");
  }

  function openEditForm(u: User) {
    setForm({
      name: u.name,
      email: u.email,
      username: u.username || "",
      password: "",
      role: u.role,
      department: u.department || "",
    });
    setEditingId(u.id);
    setFormMode("edit");
    setError("");
  }

  function closeForm() {
    setFormMode(null);
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError("");
    setIsSubmitting(true);
    try {
      if (formMode === "edit" && editingId) {
        await updateUserByAdmin(token, editingId, {
          name: form.name,
          email: form.email,
          username: form.username || undefined,
          role: form.role,
          department: form.department || undefined,
        });
      } else {
        await createUserByAdmin(token, {
          name: form.name,
          email: form.email,
          username: form.username || undefined,
          password: form.password,
          role: form.role,
          department: form.department || undefined,
        });
      }
      closeForm();
      loadUsers();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : formMode === "edit"
          ? "Gagal memperbarui user"
          : "Gagal membuat user"
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleToggleStatus(u: User) {
    if (!token) return;
    setTogglingUserId(u.id);
    setError("");
    try {
      await setUserActive(token, u.id, !u.is_active);
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengubah status user");
    } finally {
      setTogglingUserId(null);
    }
  }

  async function confirmDelete() {
    if (!token || !confirmTarget) return;
    setIsDeleting(true);
    setError("");
    try {
      await deleteUserByAdmin(token, confirmTarget.id);
      setConfirmTarget(null);
      loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus user");
      setConfirmTarget(null);
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading || !user || !isLeaderOrAdmin) {
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
          title="Manajemen User"
          subtitle="Tambah, edit, atau nonaktifkan akun pengguna"
          actions={[
            {
              label: formMode === "create" ? "Batal" : "+ Tambah User",
              onClick: openCreateForm,
              variant: "primary" as const,
            },
          ]}
        />
        <div className="w-full px-6 py-12 sm:px-10">

          {error && (
            <div className="mb-6 rounded-md border border-red/30 bg-red/10 px-4 py-2.5 text-sm text-red">
              {error}
            </div>
          )}

          {formMode && (
            <form
              onSubmit={handleSubmit}
              className="mb-8 rounded-lg border border-border bg-card p-6"
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold text-text-primary">
                  {formMode === "edit" ? "Edit User" : "Tambah User Baru"}
                </h2>
                <button
                  type="button"
                  onClick={closeForm}
                  className="text-xs text-text-muted hover:text-text-primary"
                >
                  Batal
                </button>
              </div>

              <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Nama</label>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Email</label>
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Username (opsional)</label>
                  <input
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    className={inputClass}
                  />
                </div>
                {formMode === "create" && (
                  <div>
                    <label className={labelClass}>Password</label>
                    <input
                      required
                      type="password"
                      minLength={8}
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                )}
                <div>
                  <label className={labelClass}>Role</label>
                  <select
                    // Kalau sedang edit DIRI SENDIRI, role dikunci (tidak bisa
                    // diubah dari sini) — konsisten dengan aturan backend yang
                    // menolak permintaan ubah role atas akun sendiri, supaya
                    // tidak ada yang tidak sengaja menurunkan hak aksesnya
                    // sendiri sampai tidak bisa mengelola user lagi.
                    disabled={formMode === "edit" && editingId === user.id}
                    value={form.role}
                    onChange={(e) =>
                      setForm({ ...form, role: e.target.value as Role })
                    }
                    className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    <option value="user">Pelapor</option>
                    <option value="staff_it">Staf IT</option>
                    {/* Leader/Admin cuma boleh ditetapkan oleh admin — konsisten
                        dengan validasi yang sama persis di backend. */}
                    {isAdmin && <option value="leader">Leader</option>}
                    {isAdmin && <option value="admin">Administrator</option>}
                  </select>
                  {formMode === "edit" && editingId === user.id && (
                    <p className="mt-1 text-[11px] text-text-muted">
                      Role akun sendiri tidak bisa diubah lewat sini.
                    </p>
                  )}
                </div>
                <div>
                  <label className={labelClass}>Departemen (opsional)</label>
                  <input
                    value={form.department}
                    onChange={(e) => setForm({ ...form, department: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-card hover:bg-accent/80 disabled:opacity-50"
              >
                {isSubmitting
                  ? "Menyimpan..."
                  : formMode === "edit"
                  ? "Simpan Perubahan"
                  : "Buat User"}
              </button>
            </form>
          )}

          {confirmTarget && (
            <div className="mb-6 rounded-lg border border-red/30 bg-red/10 p-5">
              <p className="mb-3 text-sm text-text-primary">
                Hapus akun <strong>{confirmTarget.name}</strong>? User
                ini tidak akan bisa login lagi, tapi seluruh riwayat
                tiketnya tetap tersimpan.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={confirmDelete}
                  disabled={isDeleting}
                  className="rounded-md bg-red-500 px-4 py-1.5 text-sm font-semibold text-text-primary hover:bg-red-400 disabled:opacity-50"
                >
                  {isDeleting ? "Menghapus..." : "Ya, Hapus"}
                </button>
                <button
                  onClick={() => setConfirmTarget(null)}
                  disabled={isDeleting}
                  className="rounded-md border border-border px-4 py-1.5 text-sm text-text-secondary hover:bg-card-hover"
                >
                  Batal
                </button>
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-border bg-card">
            {users.length === 0 ? (
              <p className="p-8 text-center text-sm text-text-muted">Belum ada user.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-text-muted">
                      <th className="px-5 py-3">Nama</th>
                      <th className="px-5 py-3">Email</th>
                      <th className="px-5 py-3">Username</th>
                      <th className="px-5 py-3">Role</th>
                      <th className="px-5 py-3">Departemen</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => {
                      const isSelf = u.id === user.id;
                      const manageable = canManage(myRole, u.role);
                      return (
                        <tr key={u.id} className="border-b border-border-subtle">
                          <td className="px-5 py-3 text-text-primary">{u.name}</td>
                          <td className="px-5 py-3 text-text-secondary">{u.email}</td>
                          <td className="px-5 py-3 text-text-secondary">{u.username || "-"}</td>
                          <td className="px-5 py-3">
                            <span
                              className={`rounded-full border px-2.5 py-0.5 font-[family-name:var(--font-display)] text-[10px] uppercase tracking-wide ${ROLE_BADGE[u.role]}`}
                            >
                              {ROLE_LABEL[u.role]}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-text-muted">{u.department || "-"}</td>
                          <td className="px-5 py-3">
                            <button
                              onClick={() => handleToggleStatus(u)}
                              disabled={isSelf || !manageable || togglingUserId === u.id}
                              title={
                                isSelf
                                  ? "Tidak bisa mengubah status akun sendiri"
                                  : togglingUserId === u.id
                                  ? "Memproses..."
                                  : u.is_active
                                  ? "Nonaktifkan akun"
                                  : "Aktifkan akun"
                              }
                              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full transition-all duration-150 duration-200 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${
                                u.is_active ? "bg-green" : "bg-border"
                              }`}
                            >
                              <span
                                className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                                  u.is_active ? "translate-x-4" : "translate-x-1"
                                }`}
                              />
                            </button>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => openEditForm(u)}
                                disabled={!manageable && !isSelf}
                                title="Edit user"
                                className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-border/50 text-blue transition-all duration-150 hover:bg-card-hover hover:text-blue/80 disabled:cursor-not-allowed disabled:opacity-30"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                              </button>
                              <button
                                onClick={() => setConfirmTarget(u)}
                                disabled={isSelf || !manageable}
                                title={isSelf ? "Tidak bisa menghapus akun sendiri" : "Hapus user"}
                                className="flex h-8 w-8 items-center justify-center rounded-md border border-red-900/40 bg-red-950/20 text-red-400 transition-all duration-150 hover:bg-red-950/40 hover:text-red disabled:cursor-not-allowed disabled:opacity-30"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6"/>
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
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
