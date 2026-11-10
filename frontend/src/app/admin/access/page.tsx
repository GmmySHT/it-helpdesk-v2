"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import PageHeader from "@/components/page-header";
import { Sidebar } from "@/components/sidebar";
import {
  Module,
  RoleModulePermission,
  UserModulePermission,
  User,
  AccessLevel,
  EffectivePermission,
  listModules,
  setModuleActive,
  listRolePermissions,
  upsertRolePermission,
  listUserOverrides,
  upsertUserOverride,
  deleteUserOverride,
  listStaff,
  getMyPermissions,
} from "@/lib/api";

const ROLES = ["user", "staff_it", "leader", "admin"] as const;
const ROLE_LABEL: Record<string, string> = {
  user: "Pelapor",
  staff_it: "Staf IT",
  leader: "Leader",
  admin: "Admin",
};

const ACCESS_LABEL: Record<AccessLevel, string> = {
  none: "Tidak Ada",
  view: "Lihat Saja",
  editor: "Penuh",
};

const selectClass =
  "rounded-md border border-border bg-card-hover px-2 py-1 text-xs text-text-primary outline-none focus:border-accent";

export default function AccessManagementPage() {
  const { user, token, isLoading } = useAuth();
  const router = useRouter();

  const [modules, setModules] = useState<Module[]>([]);
  const [rolePerms, setRolePerms] = useState<RoleModulePermission[]>([]);
  const [overrides, setOverrides] = useState<UserModulePermission[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [error, setError] = useState("");

  const [overrideUserId, setOverrideUserId] = useState("");
  const [overrideModuleId, setOverrideModuleId] = useState("");
  const [overrideLevel, setOverrideLevel] = useState<AccessLevel>("view");
  const [overrideNote, setOverrideNote] = useState("");

  // myAccessLevel null = belum diketahui (masih memuat). Halaman ini dijaga
  // berdasarkan izin efektif untuk modul 'access_management', BUKAN
  // hardcoded role === 'admin' lagi — konsisten dengan Sidebar.
  const [myAccessLevel, setMyAccessLevel] = useState<AccessLevel | null>(null);

  useEffect(() => {
    if (!token) return;
    getMyPermissions(token)
      .then((perms) => {
        const perm = (perms || []).find((p) => p.module_code === "access_management");
        setMyAccessLevel(perm?.access_level || "none");
      })
      .catch(() => setMyAccessLevel("none"));
  }, [token]);

  useEffect(() => {
    if (myAccessLevel === "none") {
      router.push("/dashboard");
    }
  }, [myAccessLevel, router]);

  async function loadAll() {
    if (!token) return;
    try {
      const [m, r, o, s] = await Promise.all([
        listModules(token),
        listRolePermissions(token),
        listUserOverrides(token),
        listStaff(token),
      ]);
      setModules(m || []);
      setRolePerms(r || []);
      setOverrides(o || []);
      setStaff(s || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data");
    }
  }

  useEffect(() => {
    if (token && myAccessLevel && myAccessLevel !== "none") loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, myAccessLevel]);

  async function handleToggleModule(mod: Module) {
    if (!token) return;
    try {
      await setModuleActive(token, mod.id, !mod.is_active);
      setModules((prev) =>
        prev.map((m) => (m.id === mod.id ? { ...m, is_active: !m.is_active } : m))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengubah status modul");
    }
  }

  async function handleRoleLevelChange(
    role: string,
    moduleId: string,
    level: AccessLevel
  ) {
    if (!token) return;
    try {
      await upsertRolePermission(token, role, moduleId, level);
      setRolePerms((prev) =>
        prev.map((p) =>
          p.role === role && p.module_id === moduleId
            ? { ...p, access_level: level }
            : p
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengubah izin");
    }
  }

  async function handleAddOverride(e: FormEvent) {
    e.preventDefault();
    if (!token || !overrideUserId || !overrideModuleId) return;
    try {
      await upsertUserOverride(
        token,
        overrideUserId,
        overrideModuleId,
        overrideLevel,
        overrideNote
      );
      setOverrideUserId("");
      setOverrideModuleId("");
      setOverrideNote("");
      loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan override");
    }
  }

  async function handleDeleteOverride(id: string) {
    if (!token) return;
    try {
      await deleteUserOverride(token, id);
      setOverrides((prev) => prev.filter((o) => o.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus override");
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
          title="Kontrol Akses"
          subtitle="Kelola izin modul per role dan user"
        />
        <div className="mx-auto max-w-4xl px-6 py-12 sm:px-10">

          {error && (
            <div className="mb-6 rounded-md border border-red/30 bg-red/10 px-4 py-2.5 text-sm text-red">
              {error}
            </div>
          )}

          {/* Bagian 1: Modules */}
          <section className="mb-8 rounded-lg border border-border bg-card p-6">
            <p className="mb-4 font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-text-muted">
              Modul Aplikasi
            </p>
            <div className="space-y-2">
              {modules.map((mod) => (
                <div
                  key={mod.id}
                  className="flex items-center justify-between rounded-md border border-border bg-card-hover px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-text-primary">{mod.name}</p>
                    <p className="text-xs text-text-muted">{mod.description}</p>
                  </div>
                  <button
                    onClick={() => handleToggleModule(mod)}
                    className={`rounded-full px-3 py-1 font-[family-name:var(--font-display)] text-[10px] uppercase tracking-wide ${
                      mod.is_active
                        ? "bg-accent/10 text-accent"
                        : "bg-text-muted/10 text-text-muted"
                    }`}
                  >
                    {mod.is_active ? "Aktif" : "Nonaktif"}
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Bagian 2: Matriks izin default per role */}
          <section className="mb-8 rounded-lg border border-border bg-card p-6">
            <p className="mb-4 font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-text-muted">
              Izin Default per Role
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-text-muted">
                    <th className="pb-2 pr-4">Modul</th>
                    {ROLES.map((role) => (
                      <th key={role} className="pb-2 pr-4">
                        {ROLE_LABEL[role]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {modules.map((mod) => (
                    <tr key={mod.id} className="border-b border-border-subtle">
                      <td className="py-2.5 pr-4 text-text-primary">{mod.name}</td>
                      {ROLES.map((role) => {
                        const perm = rolePerms.find(
                          (p) => p.role === role && p.module_id === mod.id
                        );
                        return (
                          <td key={role} className="py-2.5 pr-4">
                            <select
                              value={perm?.access_level || "none"}
                              onChange={(e) =>
                                handleRoleLevelChange(
                                  role,
                                  mod.id,
                                  e.target.value as AccessLevel
                                )
                              }
                              className={selectClass}
                            >
                              {(["none", "view", "editor"] as AccessLevel[]).map(
                                (level) => (
                                  <option key={level} value={level}>
                                    {ACCESS_LABEL[level]}
                                  </option>
                                )
                              )}
                            </select>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Bagian 3: Override per user */}
          <section className="rounded-lg border border-border bg-card p-6">
            <p className="mb-4 font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-text-muted">
              Override per Staf
            </p>

            <form
              onSubmit={handleAddOverride}
              className="mb-5 grid grid-cols-1 gap-3 rounded-md border border-border bg-card-hover p-4 sm:grid-cols-2"
            >
              <select
                required
                value={overrideUserId}
                onChange={(e) => setOverrideUserId(e.target.value)}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm text-text-primary"
              >
                <option value="">-- Pilih staf --</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                required
                value={overrideModuleId}
                onChange={(e) => setOverrideModuleId(e.target.value)}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm text-text-primary"
              >
                <option value="">-- Pilih modul --</option>
                {modules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <select
                value={overrideLevel}
                onChange={(e) => setOverrideLevel(e.target.value as AccessLevel)}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm text-text-primary"
              >
                {(["none", "view", "editor"] as AccessLevel[]).map((level) => (
                  <option key={level} value={level}>
                    {ACCESS_LABEL[level]}
                  </option>
                ))}
              </select>
              <input
                placeholder="Alasan override (opsional)"
                value={overrideNote}
                onChange={(e) => setOverrideNote(e.target.value)}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm text-text-primary placeholder-text-muted"
              />
              <button
                type="submit"
                className="col-span-full rounded-md bg-accent px-4 py-2 text-sm font-semibold text-card hover:bg-accent/80"
              >
                Tambah / Update Override
              </button>
            </form>

            {overrides.length === 0 ? (
              <p className="text-center text-xs text-text-muted">
                Belum ada override per-staf.
              </p>
            ) : (
              <div className="space-y-2">
                {overrides.map((o) => (
                  <div
                    key={o.id}
                    className="flex items-center justify-between rounded-md border border-border bg-card-hover px-4 py-3"
                  >
                    <div>
                      <p className="text-sm text-text-primary">
                        {o.user_name}{" "}
                        <span className="text-text-muted">→ {o.module_name}</span>
                      </p>
                      <p className="text-xs text-amber">
                        {ACCESS_LABEL[o.access_level]}
                        {o.note ? ` · ${o.note}` : ""}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteOverride(o.id)}
                      className="rounded-md border border-red-900/40 px-3 py-1 text-xs text-red hover:bg-red-950/30"
                    >
                      Hapus
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
