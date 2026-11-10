"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  /** Kecerahan dasar partikel (0-1) */
  baseAlpha: number;
  /** Fase animasi twinkle agar tiap partikel berkedip beda waktu */
  twinklePhase: number;
  /** Kecepatan kedip */
  twinkleSpeed: number;
}

interface AmbientParticlesProps {
  /** Jumlah partikel */
  particleCount?: number;
  /** Kecepatan drift partikel */
  driftSpeed?: number;
  /** Gambar garis penghubung antar partikel terdekat */
  connect?: boolean;
  colors?: string[];
}

/**
 * AmbientParticles — kanvas partikel yang bergerak sendiri & berkelap-kelip.
 *
 * Beda dari ParticleField: TIDAK mengikuti kursor. Partikel melayang bebas
 * (drift) ke segala arah dan berkedip halus (twinkle) seperti bintang /
 * kunang-kunang. Cocok jadi latar halaman kerja agar tidak membosankan
 * tapi tetap tenang dan tidak mengganggu fokus.
 *
 * Partikel yang keluar dari tepi layar akan muncul kembali di sisi
 * seberangnya (wrap-around), jadi bidangnya terasa tak berujung.
 */
export function AmbientParticles({
  particleCount = 70,
  driftSpeed = 0.18,
  connect = true,
  colors = ["#2DD4BF", "#60A5FA", "#A78BFA", "#F5A623", "#34D399"],
}: AmbientParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animRef = useRef<number | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const colorsRef = useRef(colors);
  colorsRef.current = colors;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    function build(w: number, h: number) {
      canvas!.width = Math.floor(w * dpr);
      canvas!.height = Math.floor(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w, h };

      const arr: Particle[] = [];
      for (let i = 0; i < particleCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (Math.random() * 0.6 + 0.4) * driftSpeed;
        arr.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: Math.random() * 2 + 0.6,
          color: colorsRef.current[i % colorsRef.current.length],
          baseAlpha: Math.random() * 0.5 + 0.3,
          twinklePhase: Math.random() * Math.PI * 2,
          twinkleSpeed: Math.random() * 0.02 + 0.008,
        });
      }
      particlesRef.current = arr;
    }

    function resize() {
      const parent = canvas!.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      build(rect.width, rect.height);
    }

    resize();
    window.addEventListener("resize", resize);

    function frame() {
      const { w, h } = sizeRef.current;
      ctx!.clearRect(0, 0, w, h);

      const ps = particlesRef.current;

      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];

        // Drift bebas — partikel melayang ke arah kecepatannya.
        p.x += p.vx;
        p.y += p.vy;

        // Wrap-around: keluar tepi → muncul di sisi seberang.
        if (p.x < -10) p.x = w + 10;
        else if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        else if (p.y > h + 10) p.y = -10;

        // Twinkle — kecerahan berosilasi sinus, tiap partikel beda fase.
        p.twinklePhase += p.twinkleSpeed;
        const twinkle = (Math.sin(p.twinklePhase) + 1) / 2; // 0..1
        const alpha = p.baseAlpha * (0.35 + twinkle * 0.65);

        // Gambar partikel dengan glow.
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx!.fillStyle = p.color;
        ctx!.globalAlpha = alpha;
        ctx!.shadowBlur = 10;
        ctx!.shadowColor = p.color;
        ctx!.fill();
      }
      ctx!.shadowBlur = 0;

      // Garis penghubung partikel berdekatan.
      if (connect) {
        for (let i = 0; i < ps.length; i++) {
          for (let j = i + 1; j < ps.length; j++) {
            const a = ps[i];
            const b = ps[j];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 120) {
              ctx!.beginPath();
              ctx!.moveTo(a.x, a.y);
              ctx!.lineTo(b.x, b.y);
              ctx!.strokeStyle = a.color;
              ctx!.globalAlpha = ((120 - dist) / 120) * 0.1;
              ctx!.lineWidth = 0.6;
              ctx!.stroke();
            }
          }
        }
      }

      ctx!.globalAlpha = 1;
      animRef.current = requestAnimationFrame(frame);
    }

    frame();

    return () => {
      window.removeEventListener("resize", resize);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [particleCount, driftSpeed, connect]);

  return <canvas ref={canvasRef} className="h-full w-full" aria-hidden="true" />;
}
