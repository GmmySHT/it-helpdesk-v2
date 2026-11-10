"use client";

import { useNotificationsContext } from "@/lib/notifications-context";

// Dirender sekali di root layout supaya toast bisa muncul di halaman
// manapun (bukan cuma yang punya Sidebar), asalkan user sudah login.
export function ToastContainer() {
  const { toasts, dismissToast } = useNotificationsContext();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 top-4 z-50 flex w-full max-w-sm flex-col gap-2 sm:right-6 sm:top-6">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          onClick={() => dismissToast(toast.id)}
          className="animate-[slide-in_0.2s_ease-out] rounded-lg border border-border bg-card p-4 text-left shadow-lg shadow-black/30"
        >
          <div className="mb-1 flex items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            <p className="font-[family-name:var(--font-display)] text-xs font-semibold text-text-primary">
              {toast.title}
            </p>
          </div>
          <p className="pl-3.5 text-xs leading-relaxed text-text-secondary">
            {toast.message}
          </p>
        </button>
      ))}
    </div>
  );
}
