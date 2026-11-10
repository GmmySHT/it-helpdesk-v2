"use client";

import { useRef, useState, useEffect } from "react";
import { useNotificationsContext } from "@/lib/notifications-context";
import { Bell } from "lucide-react";

function formatNotificationTime(sentAt: string): string {
  const now = new Date();
  const sent = new Date(sentAt);
  const diffMs = now.getTime() - sent.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Baru saja";
  if (diffMins < 60) return `${diffMins}m lalu`;
  if (diffHours < 24) return `${diffHours}j lalu`;
  if (diffDays < 7) return `${diffDays}d lalu`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}mg lalu`;

  return sent.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: sent.getFullYear() !== now.getFullYear() ? "2-digit" : undefined,
  });
}

export function FloatingNotifications() {
  const { notifications, unreadCount, markRead } = useNotificationsContext();
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        notificationRef.current &&
        !notificationRef.current.contains(e.target as Node)
      ) {
        setShowNotifications(false);
      }
    }

    if (showNotifications) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showNotifications]);

  return (
    <div className="fixed top-6 right-6 z-50" ref={notificationRef}>
      {/* Floating button */}
      <button
        onClick={() => setShowNotifications(!showNotifications)}
        className="relative flex items-center justify-center rounded-full bg-accent p-3 text-card shadow-lg transition-all hover:bg-accent/90 hover:shadow-xl"
        aria-label="Notifikasi"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {showNotifications && (
        <div className="absolute -left-80 top-14 w-80 max-h-96 overflow-y-auto slim-scroll rounded-lg border border-border bg-card shadow-2xl">
          {notifications.length === 0 ? (
            <p className="p-4 text-center text-xs text-text-muted">
              Belum ada notifikasi.
            </p>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => markRead(n.id)}
                className={`block w-full border-b border-border px-4 py-3 text-left last:border-0 transition-colors hover:bg-card-hover ${
                  n.is_read ? "opacity-50" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="mb-0.5 text-xs font-medium text-text-primary">
                      {n.title}
                    </p>
                    <p className="text-[11px] leading-relaxed text-text-muted">
                      {n.message}
                    </p>
                  </div>
                  <span className="text-[10px] text-text-muted whitespace-nowrap ml-2">
                    {formatNotificationTime(n.sent_at)}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
