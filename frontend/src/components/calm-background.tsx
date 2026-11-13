"use client";

import { AmbientParticles } from "@/components/ambient-particles";

/**
 * CalmBackground — latar belakang elegan dan tenang untuk halaman setelah login.
 *
 * Nuansa: partikel cahaya yang melayang bebas & berkelap-kelip (twinkle)
 * seperti bintang/kunang-kunang di langit malam. Tidak ada interaksi cursor;
 * semua gerakan otomatis (drift + twinkle) via canvas + requestAnimationFrame.
 *
 * Layer:
 * 1. Base hitam pekat
 * 2. Partikel ambient — drift bebas, wrap-around, twinkle, garis penghubung
 * 3. Vignette halus di tepi
 */

export function CalmBackground() {
  return (
    <div className="calm-background pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Layer 1: partikel ambient — bergerak & berkelap-kelip */}
      <div className="absolute inset-0">
        <AmbientParticles
          particleCount={70}
          driftSpeed={0.18}
          connect
          colors={["#FFFFFF", "#E8E8E8", "#B0B0B0", "#808080", "#A0A0A0"]}
        />
      </div>


    </div>
  );
}
