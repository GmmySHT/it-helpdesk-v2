"use client";

import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

// Ticker status ini murni dekoratif (bukan data asli) — dipakai untuk
// mencerminkan alur tiket yang sebenarnya (unassigned → claimed → resolved
// → closed) sebagai elemen visual khas halaman ini, bukan angka acak.
const TICKER_ITEMS = [
  { code: "TCK-2291", label: "Diklaim", tone: "amber" },
  { code: "TCK-2288", label: "Resolved", tone: "teal" },
  { code: "TCK-2295", label: "Belum Ditugaskan", tone: "slate" },
  { code: "TCK-2280", label: "Ditutup", tone: "teal" },
  { code: "TCK-2297", label: "Diklaim", tone: "amber" },
  { code: "TCK-2276", label: "Ditutup", tone: "teal" },
];

const TONE_DOT: Record<string, string> = {
  amber: "bg-amber",
  teal: "bg-accent",
  slate: "bg-text-muted",
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clock, setClock] = useState("");

  const { login } = useAuth();
  const router = useRouter();

  // Jam berjalan kecil di panel kiri — detail kecil yang memperkuat kesan
  // "sistem yang hidup", konsisten dengan tema monitoring operasional.
  useEffect(() => {
    function tick() {
      setClock(
        new Date().toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login gagal");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen bg-card font-[family-name:var(--font-body)]">
      {/* Panel kiri — branding + ticker status, disembunyikan di layar kecil
          (mobile) supaya form login tetap jadi fokus utama di HP */}
      <section className="relative hidden w-1/2 flex-col justify-between overflow-hidden border-r border-border p-12 lg:flex">
        {/* Grid halus di background — nuansa "blueprint" sistem teknikal */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(#2DD4BF 1px, transparent 1px), linear-gradient(90deg, #2DD4BF 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        <div className="relative">
          <div className="flex items-center gap-2 font-[family-name:var(--font-display)] text-sm text-text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            SISTEM AKTIF
            <span className="ml-auto tabular-nums">{clock}</span>
          </div>

          <h1 className="mt-16 font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight text-text-primary">
            Ticketing
            <br />
            IT.
          </h1>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-text-muted">
            Setiap tiket tercatat dari saat diklaim sampai ditutup. Tidak ada
            yang terlewat, tidak ada yang menggantung.
          </p>
        </div>

        {/* Signature element: ticker tiket berjalan, mencerminkan status
            asli yang dipakai di sistem (unassigned/claimed/resolved/closed) */}
        <div className="relative">
          <p className="mb-3 font-[family-name:var(--font-display)] text-xs uppercase tracking-widest text-text-muted">
            Aktivitas Terbaru
          </p>
          <div className="space-y-2">
            {TICKER_ITEMS.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-md border border-border bg-card/60 px-3 py-2 font-[family-name:var(--font-display)] text-xs"
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[item.tone]}`}
                />
                <span className="text-text-muted">{item.code}</span>
                <span className="ml-auto text-text-primary">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Panel kanan — form login */}
      <section className="flex w-full flex-col justify-center px-6 sm:px-12 lg:w-1/2">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-text-primary">
              Ticketing IT
            </h1>
          </div>

          <p className="mb-1 font-[family-name:var(--font-display)] text-xs uppercase tracking-widest text-accent">
            Masuk
          </p>
          <h2 className="mb-8 font-[family-name:var(--font-display)] text-2xl font-semibold text-text-primary">
            Selamat datang kembali
          </h2>

          <form onSubmit={handleSubmit}>
            {error && (
              <div className="mb-5 rounded-md border border-red-900/50 bg-red-950/50 px-4 py-2.5 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-text-muted">
                Alamat Email
              </label>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@perusahaan.com"
                className="w-full rounded-md border border-border bg-card px-3.5 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none transition-colors focus:border-accent"
              />
            </div>

            <div className="mb-6">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-text-muted">
                Kata Sandi
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-md border border-border bg-card px-3.5 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none transition-colors focus:border-accent"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-card transition-colors hover:bg-accent/80 disabled:opacity-50"
            >
              {isSubmitting ? "Memproses..." : "Masuk"}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-text-muted/60">
            Hubungi admin sistem kalau kamu belum punya akun.
          </p>
        </div>
      </section>
    </main>
  );
}
