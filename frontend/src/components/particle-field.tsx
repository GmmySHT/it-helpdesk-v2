"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  baseX: number;
  baseY: number;
}

interface ParticleFieldProps {
  /** Jumlah partikel di layar */
  particleCount?: number;
  /** Kekuatan tarikan partikel ke kursor (0-1) */
  attractionStrength?: number;
  /** Gesekan — makin besar makin cepat berhenti (0-1) */
  friction?: number;
  /** Kecepatan partikel kembali ke posisi semula */
  returnSpeed?: number;
  /** Jarak (px) di mana kursor mulai menarik partikel */
  radius?: number;
  colors?: string[];
  /** Gambar garis penghubung antar partikel terdekat */
  connect?: boolean;
}

/**
 * ParticleField — kanvas partikel interaktif yang bergerak mengikuti kursor.
 *
 * Meniru nuansa halaman awal Google Antigravity: titik-titik cahaya yang
 * "hidup", tertarik halus ke arah kursor lalu perlahan kembali ke posisinya,
 * dengan garis tipis yang menghubungkan partikel-partikel berdekatan.
 *
 * Semua event listener dipasang di `window` (bukan canvas) supaya tetap
 * bekerja walau wrapper-nya memakai `pointer-events-none` dan tidak
 * menghalangi interaksi form di atasnya. Animasi dijalankan dengan
 * requestAnimationFrame dan dibersihkan penuh saat unmount.
 */
export function ParticleField({
  particleCount = 90,
  attractionStrength = 0.06,
  friction = 0.94,
  returnSpeed = 0.012,
  radius = 180,
  colors = ["#2DD4BF", "#60A5FA", "#A78BFA", "#F5A623", "#34D399"],
  connect = true,
}: ParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: -9999, y: -9999, active: false });
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
        const x = Math.random() * w;
        const y = Math.random() * h;
        arr.push({
          x,
          y,
          baseX: x,
          baseY: y,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          size: Math.random() * 2.2 + 0.8,
          color: colorsRef.current[i % colorsRef.current.length],
          alpha: Math.random() * 0.45 + 0.25,
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

    function onMove(clientX: number, clientY: number) {
      const rect = canvas!.getBoundingClientRect();
      mouseRef.current = {
        x: clientX - rect.left,
        y: clientY - rect.top,
        active: true,
      };
    }
    function onMouseMove(e: MouseEvent) {
      onMove(e.clientX, e.clientY);
    }
    function onTouchMove(e: TouchEvent) {
      if (e.touches.length > 0) onMove(e.touches[0].clientX, e.touches[0].clientY);
    }
    function onLeave() {
      mouseRef.current.active = false;
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("mouseout", onLeave);

    function frame() {
      const { w, h } = sizeRef.current;
      ctx!.clearRect(0, 0, w, h);

      const mouse = mouseRef.current;
      const ps = particlesRef.current;

      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];

        // Tarikan halus ke arah kursor bila dalam radius.
        if (mouse.active) {
          const dx = mouse.x - p.x;
          const dy = mouse.y - p.y;
          const dist = Math.hypot(dx, dy);
          if (dist < radius && dist > 0.01) {
            const force = (radius - dist) / radius;
            p.vx += (dx / dist) * force * attractionStrength * 8;
            p.vy += (dy / dist) * force * attractionStrength * 8;
          }
        }

        // Pegas lembut kembali ke posisi awal.
        p.vx += (p.baseX - p.x) * returnSpeed;
        p.vy += (p.baseY - p.y) * returnSpeed;

        // Gesekan.
        p.vx *= friction;
        p.vy *= friction;

        p.x += p.vx;
        p.y += p.vy;

        // Gambar partikel dengan glow lembut.
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx!.fillStyle = p.color;
        ctx!.globalAlpha = p.alpha;
        ctx!.shadowBlur = 8;
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
            if (dist < 110) {
              ctx!.beginPath();
              ctx!.moveTo(a.x, a.y);
              ctx!.lineTo(b.x, b.y);
              ctx!.strokeStyle = a.color;
              ctx!.globalAlpha = ((110 - dist) / 110) * 0.14;
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
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("mouseout", onLeave);
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [particleCount, attractionStrength, friction, returnSpeed, radius, connect]);

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full"
      aria-hidden="true"
    />
  );
}
