"use client";

import { Suspense } from "react";
import { TicketsContent } from "./tickets-content";

export default function TicketsPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-transparent">
          <p className="text-sm text-text-muted">Memuat...</p>
        </main>
      }
    >
      <TicketsContent />
    </Suspense>
  );
}