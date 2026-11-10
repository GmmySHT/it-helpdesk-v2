"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useNotificationsContext } from "@/lib/notifications-context";
import { Bell, Clock } from "lucide-react";

interface ActionButton {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  icon?: React.ReactNode;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  greeting?: string;
  userName?: string;
  actions?: ActionButton[];
  showNotifications?: boolean;
  showClock?: boolean;
}

function formatTime(sentAt: string): string {
  const now = new Date();
  const sent = new Date(sentAt);
  const diffMins = Math.floor((now.getTime() - sent.getTime()) / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Baru saja";
  if (diffMins < 60) return `${diffMins} menit lalu`;
  if (diffHours < 24) return `${diffHours} jam lalu`;
  if (diffDays < 7) return `${diffDays} hari lalu`;

  return sent.toLocaleDateString("id-ID", { day: "2-digit", month: "short" });
}

export default function PageHeader({
  title,
  subtitle,
  greeting,
  userName,
  actions = [],
  showNotifications = true,
  showClock = true,
}: PageHeaderProps) {
  const { notifications, unreadCount, markRead } = useNotificationsContext();
  const [isOpen, setIsOpen] = useState(false);
  const [clock, setClock] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showClock) return;
    const updateClock = () => {
      setClock(
        new Date().toLocaleTimeString("id-ID", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, [showClock]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-page/95 backdrop-blur-sm">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="min-w-0">
          {greeting && userName && (
            <p className="mb-0.5 font-[family-name:var(--font-display)] text-xs uppercase tracking-widest text-accent">
              {greeting}, <span className="font-semibold">{userName}</span>
            </p>
          )}
          <h1 className="truncate font-[family-name:var(--font-display)] text-2xl font-semibold text-text-primary">
            {title}
          </h1>
          {subtitle && <p className="text-sm text-text-muted">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-3">
          {showClock && (
            <div className="hidden items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 md:flex">
              <Clock className="h-4 w-4 text-accent" />
              <span className="font-[family-name:var(--font-display)] text-sm tabular-nums text-text-primary">
                {clock}
              </span>
            </div>
          )}

          {actions.map((action, idx) => {
            const baseClass =
              action.variant === "primary"
                ? "rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition-all duration-150 hover:bg-accent/90 active:scale-95 disabled:opacity-50"
                : "rounded-md border border-border bg-card px-4 py-2 text-sm font-medium text-text-primary transition-all duration-150 hover:border-accent/50 active:scale-95 disabled:opacity-50";

            const content = (
              <>
                {action.icon}
                {action.label}
              </>
            );

            if (action.href) {
              return (
                <Link
                  key={idx}
                  href={action.href}
                  className={`flex items-center gap-2 ${baseClass}`}
                >
                  {content}
                </Link>
              );
            }

            return (
              <button
                key={idx}
                onClick={action.onClick}
                disabled={action.disabled}
                className={`flex items-center gap-2 ${baseClass}`}
              >
                {content}
              </button>
            );
          })}

          {showNotifications && (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative flex items-center justify-center rounded-lg border border-border bg-card p-2 text-text-primary transition-all duration-150 hover:border-accent/50 hover:text-accent"
                aria-label="Notifikasi"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>

              {isOpen && (
                <div className="absolute right-0 top-12 w-80 overflow-hidden rounded-lg border border-border bg-card shadow-2xl">
                  <div className="border-b border-border px-4 py-3">
                    <h3 className="font-semibold text-text-primary">Notifikasi</h3>
                    {unreadCount > 0 && (
                      <p className="text-xs text-text-muted">{unreadCount} belum dibaca</p>
                    )}
                  </div>
                  <div className="slim-scroll max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="px-4 py-8 text-center text-sm text-text-muted">
                        Belum ada notifikasi.
                      </p>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => markRead(n.id)}
                          className={`block w-full border-b border-border px-4 py-3 text-left last:border-0 transition-colors hover:bg-page ${
                            n.is_read ? "opacity-50" : ""
                          }`}
                        >
                          <p className="text-sm font-medium text-text-primary">{n.title}</p>
                          {n.message && (
                            <p className="mt-0.5 text-xs text-text-muted">{n.message}</p>
                          )}
                          <p className="mt-1 text-[10px] text-text-muted">
                            {formatTime(n.sent_at)}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
