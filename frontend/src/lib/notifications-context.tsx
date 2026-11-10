"use client";

// Dulu ini hook biasa (useNotifications), sekarang jadi Context supaya
// SATU koneksi WebSocket dipakai bersama oleh Sidebar (lonceng) dan
// ToastContainer (pop-up) — kalau masing-masing buka koneksi sendiri,
// browser jadi punya 2 koneksi WS dobel untuk hal yang sama.
//
// Koneksi yang sama juga membawa event "permissions_changed": backend
// mengirimnya saat izin RBAC diubah, dan Sidebar meresponsnya dengan
// mengambil ulang /me/permissions (lihat permissionsVersion).

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { useAuth } from "./auth-context";
import {
  Notification,
  listNotifications,
  markNotificationRead,
} from "./api";

function getWsUrl(token: string): string {
  const apiBase =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1";
  const origin = apiBase.replace(/\/api\/v1\/?$/, "");
  const wsOrigin = origin.replace(/^http/, "ws");
  return `${wsOrigin}/ws?token=${encodeURIComponent(token)}`;
}

// Toast = notifikasi yang tampil sebentar sebagai pop-up, lalu hilang sendiri.
// Terpisah dari daftar notifikasi permanen (yang muncul di dropdown lonceng).
export type Toast = {
  id: string;
  title: string;
  message: string;
};

type NotificationsContextType = {
  notifications: Notification[];
  unreadCount: number;
  markRead: (id: string) => void;
  lastMessageAt: number;
  toasts: Toast[];
  dismissToast: (id: string) => void;
  // Naik 1 setiap kali izin mungkin berubah (event dari server, atau
  // WebSocket baru tersambung/tersambung ulang). Komponen yang
  // bergantung pada izin cukup memantau nilai ini lalu fetch ulang.
  permissionsVersion: number;
};

const NotificationsContext = createContext<NotificationsContextType | undefined>(
  undefined
);

// playNotificationSound membuat bunyi "ting" pendek pakai Web Audio API —
// tidak perlu file .mp3 terpisah, suaranya digenerate langsung oleh browser.
function playNotificationSound() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new AudioContextClass();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(1046, ctx.currentTime); // nada C6
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    // Volume diturunkan bertahap (fade out) supaya bunyinya terdengar
    // seperti "ting" pendek, bukan bunyi datar yang berhenti tiba-tiba.
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.4);
    // Tutup AudioContext setelah selesai: browser membatasi jumlah
    // context yang terbuka bersamaan, jadi kalau tidak ditutup, suara
    // bisa berhenti berbunyi setelah puluhan notifikasi.
    oscillator.onended = () => {
      ctx.close().catch(() => {});
    };
  } catch {
    // Browser lama/tanpa dukungan Web Audio API — abaikan saja,
    // pop-up visual tetap muncul tanpa suara.
  }
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [lastMessageAt, setLastMessageAt] = useState(0);
  const [permissionsVersion, setPermissionsVersion] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  // Dipakai untuk membedakan "koneksi ditutup karena effect cleanup (misalnya
  // token berubah/logout)" vs "koneksi putus tak terduga (server restart,
  // jaringan)". Reconnect HANYA jalan untuk kasus kedua.
  const shouldReconnectRef = useRef(true);

  useEffect(() => {
    if (!token) {
      // Logout: kosongkan state supaya user berikutnya di tab yang sama
      // tidak sempat melihat notifikasi milik user sebelumnya.
      setNotifications([]);
      setToasts([]);
      return;
    }
    listNotifications(token)
      .then((data) => setNotifications(data || []))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;
    shouldReconnectRef.current = true;

    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let attempt = 0; // untuk exponential backoff

    function connect() {
      const socket = new WebSocket(getWsUrl(token as string));
      wsRef.current = socket;

      socket.onopen = () => {
        attempt = 0;
        // Selama koneksi putus, event perubahan izin mungkin terlewat.
        // Naikkan versi supaya izin di-fetch ulang begitu tersambung.
        setPermissionsVersion((v) => v + 1);
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);

          // Event kontrol (bukan notifikasi): jangan masuk daftar
          // notifikasi, jangan bunyi, jangan tampil toast.
          if (payload.type === "permissions_changed") {
            setPermissionsVersion((v) => v + 1);
            return;
          }

          const newNotification: Notification = {
            id: payload.id,
            ticket_id: payload.ticket_id,
            recipient_id: "",
            type: payload.type,
            title: payload.title,
            message: payload.message,
            channel: "in_app",
            is_read: false,
            sent_at: new Date().toISOString(),
          };
          // Dedupe berdasarkan id: kalau notifikasi dengan id yang sama
          // sudah ada (mis. karena koneksi WS dobel / pesan terkirim ulang),
          // jangan tambahkan lagi supaya tidak muncul 2 kartu identik.
          setNotifications((prev) =>
            prev.some((n) => n.id === newNotification.id)
              ? prev
              : [newNotification, ...prev]
          );
          setLastMessageAt(Date.now());

          const toastId = payload.id as string;
          setToasts((prev) =>
            prev.some((t) => t.id === toastId)
              ? prev
              : [{ id: toastId, title: payload.title, message: payload.message }, ...prev]
          );
          playNotificationSound();

          setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== toastId));
          }, 5000);
        } catch {
          // Payload tidak sesuai format — abaikan, jangan sampai crash.
        }
      };

      // onclose dipanggil browser setiap kali koneksi berakhir — baik
      // karena kita sengaja tutup (logout/unmount) MAUPUN karena server
      // mati/restart/jaringan putus. shouldReconnectRef membedakan kedua
      // kasus itu: kalau bukan kita yang sengaja tutup, coba sambung lagi
      // otomatis — dengan jeda yang makin panjang (2s, 4s, 8s, ... maks
      // 30s) supaya token kedaluwarsa atau server mati tidak membuat
      // browser menembak backend tiap 2 detik tanpa henti.
      //
      // PENTING: syarat `wsRef.current === socket` mencegah koneksi "hantu".
      // Saat React StrictMode me-mount effect dua kali, socket lama ditutup
      // dan socket baru dibuat; event onclose socket lama menyala belakangan
      // dan TANPA cek ini akan ikut menjadwalkan reconnect → terbentuk
      // koneksi kedua yang aktif → tiap notifikasi terkirim dobel.
      socket.onclose = () => {
        if (shouldReconnectRef.current && wsRef.current === socket) {
          const delay = Math.min(2000 * 2 ** attempt, 30000);
          attempt += 1;
          reconnectTimeout = setTimeout(connect, delay);
        }
      };

      socket.onerror = () => {
        socket.close();
      };
    }

    connect();

    return () => {
      shouldReconnectRef.current = false;
      clearTimeout(reconnectTimeout);
      wsRef.current?.close();
    };
  }, [token]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markRead = useCallback(
    async (id: string) => {
      if (!token) return;
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      try {
        await markNotificationRead(token, id);
      } catch {
        // Bukan hal kritis untuk di-rollback kalau gagal.
      }
    },
    [token]
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        unreadCount,
        markRead,
        lastMessageAt,
        toasts,
        dismissToast,
        permissionsVersion,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotificationsContext() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error(
      "useNotificationsContext harus dipakai di dalam NotificationsProvider"
    );
  }
  return context;
}
