"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ParticleField } from "@/components/particle-field";
import { Mascot } from 'page-mascot';

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

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.3 20.3 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a20.3 20.3 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <path d="M1 1l22 22" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [clock, setClock] = useState("");
  const [mounted, setMounted] = useState(false);

  const mainRef = useRef<HTMLElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

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

  // Trigger animasi entrance setelah mount (staggered fade/slide per elemen).
  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 30);
    return () => clearTimeout(t);
  }, []);

  // Tilt halus untuk grid kiri & ilustrasi kanan, dihitung dari posisi kursor
  // relatif terhadap SELURUH halaman (bukan per-panel) — supaya efeknya tetap
  // jalan konsisten walau kursor pindah dari panel kiri ke kanan.
  function handleMouseMove(e: React.MouseEvent<HTMLElement>) {
    const rect = mainRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    setTilt({ x, y });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      await login(identifier, password);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login gagal");
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main
      ref={mainRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setTilt({ x: 0, y: 0 })}
      className="flex min-h-screen bg-page font-[family-name:var(--font-body)]"
    >
      {/* Particle field interaktif — partikel cahaya yang tertarik & mengikuti
          kursor, melapisi SELURUH halaman di belakang konten. Murni dekoratif,
          tidak menangkap klik (pointer-events-none). */}
      <div className="pointer-events-none absolute inset-0 z-0 opacity-60">
        <ParticleField
          particleCount={90}
          attractionStrength={0.06}
          friction={0.94}
          returnSpeed={0.012}
          radius={180}
        />
      </div>

      {/* Panel kiri — branding + ticker status, disembunyikan di layar kecil
          (mobile) supaya form login tetap jadi fokus utama di HP */}
      <section className="relative z-10 hidden w-1/2 flex-col justify-between overflow-hidden border-r border-border p-12 lg:flex">
        {/* Grid halus di background — nuansa "blueprint" sistem teknikal,
            bergerak tipis mengikuti kursor (parallax) */}
        <div
          className="pointer-events-none absolute inset-[-40px] opacity-[0.05] transition-transform duration-300 ease-out"
          style={{
            backgroundImage:
              "linear-gradient(#2DD4BF 1px, transparent 1px), linear-gradient(90deg, #2DD4BF 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            transform: `translate(${tilt.x * 8}px, ${tilt.y * 8}px)`,
          }}
        />

        {/* Animasi ambient — bola-bola cahaya melayang pelan secara mandiri
            (tidak tergantung kursor), memberi kesan panel "hidup" tanpa
            perlu elemen gambar. Tiap bola punya durasi & delay beda supaya
            gerakannya tidak terasa seragam/robotik. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="blob blob-1 absolute h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
          <div className="blob blob-2 absolute h-64 w-64 rounded-full bg-amber/10 blur-3xl" />
          <div className="blob blob-3 absolute h-48 w-48 rounded-full bg-purple/10 blur-3xl" />
        </div>

        <div
          className={`relative transition-all duration-700 ease-out ${
            mounted ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0"
          }`}
        >
          <div className="flex items-center gap-2 font-[family-name:var(--font-display)] text-sm text-text-muted">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
            </span>
            SISTEM AKTIF
            <span className="ml-auto tabular-nums">{clock}</span>
          </div>

          <h1 className="mt-16 font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight text-text-primary">
            IT
            <br />
            HELPDESK.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-text-muted">
            Laporkan kendala, pantau tiket, ajukan peminjaman aset, dan kelola kebutuhan IT dalam satu sistem yang terintegrasi.

            Setiap tiket tercatat sejak dibuat hingga ditutup. Setiap aset tercatat sejak dipinjam hingga dikembalikan. Semuanya terdokumentasi, terpantau, dan memiliki jejak yang jelas.
          </p>
          {/* <p className="text-4xs font-bold leading-relaxed text-red">
            Quiet at the Top, Alive at the Bottom
          </p> */}
        </div>

                  {/* Ilustrasi — ditaruh di tengah panel kanan, di atas form.
              Tilt ringan mengikuti kursor + melayang idle + glow berdenyut. */}
          <div className="mx-auto mb-6 flex justify-center">
            <div
              className="relative h-96 w-96 transition-transform duration-200 ease-out sm:h-96 sm:w-96"
              style={{
                transform: `perspective(800px) rotateX(${tilt.y * -4}deg) rotateY(${tilt.x * 5}deg)`,
              }}
            >
              <div className="float-idle relative h-full w-full">
                <div className="absolute inset-0 rounded-full blur-2xl glow-pulse" />
                <img
                  src="/images/coder-rage.png"
                  alt="Ilustrasi programmer panik menghadapi error"
                  className="relative h-full w-full rounded-xl border border-border/80 object-cover shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)]"
                  draggable={false}
                />
              </div>
            </div>
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
                className={`ticker-row flex items-center gap-3 rounded-md border border-border bg-card/60 px-3 py-2 font-[family-name:var(--font-display)] text-xs transition-all duration-500 ease-out hover:border-accent/40 hover:bg-card ${
                  mounted ? "translate-x-0 opacity-100" : "translate-x-3 opacity-0"
                }`}
                style={{ transitionDelay: mounted ? `${150 + i * 70}ms` : "0ms" }}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[item.tone]} ${item.tone === "amber" ? "pulse-soft" : ""}`} />
                <span className="text-text-muted">{item.code}</span>
                <span className="ml-auto text-text-primary">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Panel kanan — form login */}
      <section className="relative z-10 flex w-full flex-col items-center justify-center px-6 sm:px-12 lg:w-1/2">
        <div
          className={`mx-auto w-full max-w-sm transition-all duration-700 ease-out ${
            mounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
          }`}
        >
          <div className="mb-8 lg:hidden">
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-text-primary">
              Ticketing IT
            </h1>
          </div>

          {/* Maskot menggantikan teks "Masuk" */}
          <div className="mb-2 flex justify-center">
            <Mascot
              directions="/mascots/scout-directions.webp"
              reactions="/mascots/scout-reactions.webp"
            />
          </div>

          <h2 className="mb-8 text-center font-[family-name:var(--font-display)] text-2xl font-semibold text-text-primary">
            Selamat datang kembali
          </h2>

          <form onSubmit={handleSubmit} className={shake ? "shake-once" : ""}>
            {error && (
              <div className="mb-5 flex items-center gap-2 rounded-md border border-red/30 bg-red/10 px-4 py-2.5 text-sm text-red animate-[fadeIn_0.2s_ease-out]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {error}
              </div>
            )}

            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-text-muted">
                Email atau Username
              </label>
              <input
                type="text"
                required
                autoFocus
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="nama@perusahaan.com atau username"
                className="input-glow w-full rounded-md border border-border bg-card px-3.5 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none transition-all duration-200 focus:border-accent"
              />
            </div>

            <div className="mb-6">
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-text-muted">
                Kata Sandi
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-glow w-full rounded-md border border-border bg-card px-3.5 py-2.5 pr-10 text-sm text-text-primary placeholder-text-muted outline-none transition-all duration-200 focus:border-accent"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                  className="absolute right-0 top-0 flex h-full w-10 items-center justify-center text-text-muted transition-all duration-150 hover:text-accent"
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
            </div>

            {/* Tombol fluid-fill: lapisan "cairan" naik dari bawah ke atas
                saat hover, dengan tepi bergelombang (SVG wave) yang
                bergoyang pelan supaya terasa seperti cairan sungguhan,
                bukan sekadar transisi warna datar. */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="fluid-btn group relative block w-full overflow-hidden rounded-md border border-accent/50 bg-card px-4 py-2.5 text-sm font-semibold text-accent transition-all duration-150 duration-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
            >
              <span className="fluid-fill absolute inset-x-0 bottom-0 h-0 bg-accent transition-[height] duration-500 ease-in-out group-hover:h-full">
                <svg
                  className="wave-anim absolute -top-3 left-0 h-4 w-[200%] text-accent"
                  viewBox="0 0 200 20"
                  preserveAspectRatio="none"
                  fill="currentColor"
                >
                  <path d="M0 10 Q 12.5 0 25 10 T 50 10 T 75 10 T 100 10 T 125 10 T 150 10 T 175 10 T 200 10 V20 H0 Z" />
                </svg>
              </span>
              <span className="relative z-10 flex items-center justify-center gap-2 transition-all duration-150 duration-300 group-hover:text-card">
                {isSubmitting && <Spinner />}
                {isSubmitting ? "Memproses..." : "Masuk"}
              </span>
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-text-muted/60">
            Hubungi admin sistem kalau kamu belum punya akun.
          </p>
        </div>
      </section>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes shakeOnce {
          10%,
          90% {
            transform: translateX(-1px);
          }
          20%,
          80% {
            transform: translateX(2px);
          }
          30%,
          50%,
          70% {
            transform: translateX(-4px);
          }
          40%,
          60% {
            transform: translateX(4px);
          }
        }
        .shake-once {
          animation: shakeOnce 0.5s ease-in-out;
        }
        @keyframes pulseSoft {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.35;
          }
        }
        .pulse-soft {
          animation: pulseSoft 1.8s ease-in-out infinite;
        }
        .input-glow:focus {
          box-shadow: 0 0 0 3px rgba(45, 212, 191, 0.12);
        }
        .ticker-row:hover {
          transform: translateX(2px);
        }

        @keyframes floatIdle {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-10px);
          }
        }
        .float-idle {
          animation: floatIdle 4.5s ease-in-out infinite;
        }
        @keyframes glowPulse {
          0%,
          100% {
            opacity: 0.35;
            background: radial-gradient(circle, rgba(245, 166, 35, 0.35), rgba(239, 69, 101, 0.15) 55%, transparent 75%);
          }
          50% {
            opacity: 0.6;
            background: radial-gradient(circle, rgba(245, 166, 35, 0.5), rgba(239, 69, 101, 0.25) 55%, transparent 75%);
          }
        }
        .glow-pulse {
          animation: glowPulse 2.4s ease-in-out infinite;
        }

        /* Ambient blobs — tiap bola punya lintasan & durasi berbeda supaya
           gerakannya terasa organik, bukan berulang secara seragam. */
        .blob {
          animation-iteration-count: infinite;
          animation-timing-function: ease-in-out;
        }
        .blob-1 {
          top: 8%;
          left: 5%;
          animation-name: drift1;
          animation-duration: 16s;
        }
        .blob-2 {
          bottom: 12%;
          left: 30%;
          animation-name: drift2;
          animation-duration: 20s;
        }
        .blob-3 {
          top: 40%;
          right: 8%;
          animation-name: drift3;
          animation-duration: 13s;
        }
        @keyframes drift1 {
          0%,
          100% {
            transform: translate(0, 0) scale(1);
          }
          50% {
            transform: translate(40px, 30px) scale(1.15);
          }
        }
        @keyframes drift2 {
          0%,
          100% {
            transform: translate(0, 0) scale(1);
          }
          50% {
            transform: translate(-30px, -35px) scale(0.9);
          }
        }
        @keyframes drift3 {
          0%,
          100% {
            transform: translate(0, 0) scale(1);
          }
          50% {
            transform: translate(-25px, 25px) scale(1.1);
          }
        }

        /* Fluid-fill button */
        .wave-anim {
          animation: waveSlide 3s linear infinite;
        }
        @keyframes waveSlide {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </main>
  );
}
