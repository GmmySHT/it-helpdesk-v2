"use client";

/**
 * Halaman Profil Saya.
 *
 * Kenapa halaman ini ada: sebelumnya password hanya bisa diisi saat akun
 * dibuat (oleh admin/leader), jadi user sendiri tidak punya cara mengganti
 * password — termasuk ketika admin mereset password-nya dengan password
 * sementara (must_change_password = true).
 *
 * Dua bagian halaman:
 *   1. Kartu identitas — read-only, supaya user tahu akun mana yang dipakai
 *      (email/username berbeda-beda dan sering tertukar).
 *   2. Form ganti password — wajib mengisi password LAMA. Setelah berhasil,
 *      semua token lama (termasuk di tab/browser lain) otomatis tidak sah,
 *      jadi halaman ini mengarahkan user login ulang.
 */

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/page-header";
import { Sidebar } from "@/components/sidebar";
import { useAuth } from "@/lib/auth-context";
import { changeMyPassword } from "@/lib/api";
import { KeyRound, Eye, EyeOff, ShieldCheck, Check, Loader2 } from "lucide-react";

const inputClass =
  "w-full rounded-md border border-border bg-card-hover px-3.5 py-2.5 pr-11 text-sm text-text-primary placeholder-text-muted outline-none transition-all duration-150 focus:border-accent disabled:opacity-50";

const labelClass =
  "mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-text-muted";

const ROLE_LABEL: Record<string, string> = {
  pelapor: "Pelapor",
  it_support: "IT Support",
  analyst: "Analyst",
  programmer: "Programmer",
  devops: "DevOps",
  leader: "Leader",
  admin: "Administrator",
};

const MIN_LENGTH = 8;

type PasswordFieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
};

/** Input password dengan tombol mata — dipakai tiga kali di halaman ini. */
function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className={inputClass}
        />
        {/* Tombol mata bukan hiasan: user sering salah ketik password saat
            membuat password baru, dan tidak bisa memverifikasi lewat login
            sebelum menyimpan. */}
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Sembunyikan password" : "Tampilkan password"}
          className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-card hover:text-text-primary"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { user, token, isLoading, logout } = useAuth();
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoading && !token) router.push("/login");
  }, [isLoading, token, router]);

  // Setelah password berubah, token yang tersimpan di browser ini juga sudah
  // tidak sah di backend. Menampilkan pesan sukses sebentar lalu logout
  // membuat user login ulang dengan password baru — bukan diam-diam
  // dibiarkan sampai request berikutnya gagal 401.
  useEffect(() => {
    if (!success) return;
    const t = setTimeout(() => logout(), 1800);
    return () => clearTimeout(t);
  }, [success, logout]);

  const tooShort = newPassword.length > 0 && newPassword.length < MIN_LENGTH;
  const mismatch = confirmPassword.length > 0 && confirmPassword !== newPassword;
  // Semua field terisi + valid adalah prasyarat tombol aktif, supaya user
  // tidak menekan simpan lalu mendapat error yang sebenarnya bisa dicegah.
  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= MIN_LENGTH &&
    confirmPassword === newPassword &&
    !isSubmitting;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token || !canSubmit) return;
    setError("");
    setIsSubmitting(true);
    try {
      await changeMyPassword(token, currentPassword, newPassword);
      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Gagal mengubah password"
      );
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

  return (
    <div className="relative z-0 flex h-screen bg-transparent font-[family-name:var(--font-body)]">
      <Sidebar />
      <main className="flex-1 overflow-y-auto slim-scroll">
        <PageHeader
          title="Profil Saya"
          subtitle="Identitas akun dan pengaturan kata sandi"
        />

        <div className="w-full px-6 py-8 sm:px-10">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
            {/* --- Kartu identitas --- */}
            <section className="h-fit rounded-lg border border-border bg-card p-6">
              <div className="mb-5 flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 font-[family-name:var(--font-display)] text-base font-bold text-accent">
                  {user.name
                    .split(" ")
                    .filter(Boolean)
                    .slice(0, 2)
                    .map((w) => w[0])
                    .join("")
                    .toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-[family-name:var(--font-display)] text-base font-semibold text-text-primary">
                    {user.name}
                  </p>
                  <p className="font-[family-name:var(--font-display)] text-[10px] uppercase tracking-wide text-accent">
                    {ROLE_LABEL[user.role] || user.role}
                  </p>
                </div>
              </div>

              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-text-muted">
                    Email
                  </dt>
                  <dd className="break-all text-text-primary">{user.email}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-text-muted">
                    Username
                  </dt>
                  <dd className="text-text-primary">{user.username || "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-text-muted">
                    Unit / Departemen
                  </dt>
                  <dd className="text-text-primary">{user.department || "—"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-text-muted">
                    Status Akun
                  </dt>
                  <dd>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] ${
                        user.is_active
                          ? "border-green/30 bg-green/10 text-green"
                          : "border-red/30 bg-red/10 text-red"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          user.is_active ? "bg-green" : "bg-red"
                        }`}
                      />
                      {user.is_active ? "Aktif" : "Nonaktif"}
                    </span>
                  </dd>
                </div>
              </dl>

              <p className="mt-5 border-t border-border-subtle pt-4 text-[11px] leading-relaxed text-text-muted">
                Nama, email, dan unit hanya bisa diubah oleh leader/admin lewat
                Manajemen User.
              </p>
            </section>

            {/* --- Form ganti password --- */}
            <section className="rounded-lg border border-border bg-card p-6">
              <div className="mb-1 flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-accent" />
                <h2 className="font-[family-name:var(--font-display)] text-sm font-semibold text-text-primary">
                  Ganti Kata Sandi
                </h2>
              </div>
              <p className="mb-5 text-xs text-text-muted">
                Minimal {MIN_LENGTH} karakter. Setelah berhasil, kamu akan
                diminta login ulang di semua perangkat.
              </p>

              {/* Banner wajib ganti: diisi backend saat password direset
                  leader/admin, jadi user tahu kenapa diminta mengganti. */}
              {user.must_change_password && !success && (
                <div className="mb-5 flex items-start gap-2.5 rounded-md border border-amber/40 bg-amber/10 px-4 py-3 text-xs leading-relaxed text-amber">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Kata sandi akun ini baru direset oleh leader/admin. Ganti
                    dengan kata sandi milikmu sendiri sekarang.
                  </span>
                </div>
              )}

              {success ? (
                <div className="flex items-start gap-3 rounded-md border border-green/40 bg-green/10 px-4 py-4">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green/20 text-green">
                    <Check className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-green">
                      Kata sandi berhasil diubah
                    </p>
                    <p className="mt-1 text-xs text-text-muted">
                      Mengarahkan ke halaman login...
                    </p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <PasswordField
                    label="Kata sandi saat ini"
                    value={currentPassword}
                    onChange={setCurrentPassword}
                    placeholder="Masukkan kata sandi yang sekarang"
                    autoComplete="current-password"
                  />

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <PasswordField
                        label="Kata sandi baru"
                        value={newPassword}
                        onChange={setNewPassword}
                        placeholder={`Minimal ${MIN_LENGTH} karakter`}
                        autoComplete="new-password"
                      />
                      {tooShort && (
                        <p className="mt-1 text-[11px] text-red">
                          Kurang {MIN_LENGTH - newPassword.length} karakter lagi.
                        </p>
                      )}
                    </div>
                    <div>
                      <PasswordField
                        label="Ulangi kata sandi baru"
                        value={confirmPassword}
                        onChange={setConfirmPassword}
                        placeholder="Ketik ulang kata sandi baru"
                        autoComplete="new-password"
                      />
                      {mismatch && (
                        <p className="mt-1 text-[11px] text-red">
                          Kedua kata sandi belum sama.
                        </p>
                      )}
                    </div>
                  </div>

                  {error && (
                    <div className="rounded-md border border-red/30 bg-red/10 px-4 py-2.5 text-sm text-red">
                      {error}
                    </div>
                  )}

                  <div className="flex items-center gap-3 pt-1">
                    <button
                      type="submit"
                      disabled={!canSubmit}
                      className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:bg-accent/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <KeyRound className="h-4 w-4" />
                      )}
                      {isSubmitting ? "Menyimpan..." : "Simpan Kata Sandi"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentPassword("");
                        setNewPassword("");
                        setConfirmPassword("");
                        setError("");
                      }}
                      disabled={isSubmitting}
                      className="rounded-md border border-border px-4 py-2.5 text-sm text-text-secondary transition-colors hover:bg-card-hover disabled:opacity-40"
                    >
                      Bersihkan
                    </button>
                  </div>
                </form>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
