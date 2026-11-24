"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useNotificationsContext } from "@/lib/notifications-context";

/**
 * Dashboard bump data saat notifikasi masuk. Debounce 2,5 detik supaya
 * notifikasi beruntun tidak memicu request beruntun. Request usang dibatalkan
 * lewat AbortController; fetch dari @/lib/api tidak menerima sinyal, jadi
 * hasil lama diabaikan memakai token lokal.
 */
export function useDashboardRefresh() {
  const { token } = useAuth();
  const notif = useNotificationsContext();
  const lastMessageAt = notif?.lastMessageAt;
  const [refreshKey, setRefreshKey] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (!lastMessageAt) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (mounted.current) setRefreshKey((k) => k + 1);
    }, 2500);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [lastMessageAt]);

  const reload = useCallback(() => setRefreshKey((k) => k + 1), []);
  return { token, refreshKey, reload };
}

/** Helper fetch generik dengan allSettled + guard unmount. */
export function useDashboardFetch<T>(
  loader: (token: string) => Promise<T>,
  token: string | null,
  refreshKey: number,
  fallback: T
) {
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    Promise.allSettled([loader(token)]).then(([res]) => {
      if (cancelled || !alive.current) return;
      if (res.status === "fulfilled") setData(res.value);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [token, refreshKey, loader]);

  return { data, loading };
}
