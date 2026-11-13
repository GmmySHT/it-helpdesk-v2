"use client";

// Sidebar ini dipakai bersama di semua halaman setelah login. Di layar
// besar (desktop), tampil seperti biasa (statis di kiri). Di layar kecil
// (HP), berubah jadi DRAWER: tersembunyi di luar layar, muncul lewat
// tombol ☰ di pojok kiri atas, dan bisa ditutup lagi (klik ✕ atau klik
// area gelap di luar drawer).

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { getMyPermissions, EffectivePermission } from "@/lib/api";

type NavItem = {
  label: string;
  href: string;
  icon: string;
  moduleCode?: string;
  // visibleForRoles dipakai untuk menu yang proteksinya berbasis ROLE
  // langsung (bukan RBAC modul yang bisa admin atur bebas) — seperti
  // Manajemen User, yang memang fungsi inti leader/admin, bukan modul
  // fitur yang wajar diberi/dicabut fleksibel.
  visibleForRoles?: Array<"user" | "staff_it" | "leader" | "admin">;
  // Submenu untuk menu dropdown (misal: Asset → Peminjaman, Riwayat, dll)
  children?: Array<{
    label: string;
    href: string;
    icon?: string;
    visibleForRoles?: Array<"user" | "staff_it" | "leader" | "admin">;
  }>;
};

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "📊" },
  {
    // Dijaga modul RBAC "monitoring" (sama dengan RequireModuleAccess di
    // backend), sehingga menu hilang otomatis untuk role/user yang
    // izinnya 'none' atau modulnya tidak ada di /me/permissions.
    label: "Monitoring SIMRS",
    href: "/monitoring",
    icon: "🏥",
    moduleCode: "monitoring",
  },
  { label: "Tiket", href: "/tickets", icon: "🎫" },
  {
    // Daily Task = pekerjaan harian kecil dari WhatsApp. Bukan tiket, tapi
    // masuk perhitungan KPI staf — jadi menunya diletakkan tepat sebelum
    // Laporan & KPI. Pelapor tidak melihat menu ini.
    label: "Daily Task",
    href: "/daily-tasks",
    icon: "📝",
    visibleForRoles: ["staff_it", "leader", "admin"],
  },
  {
    label: "Aset IT",
    href: "/asset",
    icon: "💻",
    moduleCode: "asset",
    children: [
      // Tim IT: Pinjam → Peminjaman (riwayat + persetujuan jadi satu) → Data Aset
      {
        label: "Pinjam Aset",
        href: "/asset/borrowings/new",
        icon: "➕",
        visibleForRoles: ["staff_it", "leader", "admin"],
      },
      {
        label: "Peminjaman",
        href: "/asset/borrowings",
        icon: "📋",
        visibleForRoles: ["staff_it", "leader", "admin"],
      },
      {
        label: "Data Aset",
        href: "/asset",
        icon: "📦",
        visibleForRoles: ["staff_it", "leader", "admin"],
      },
      // Pelapor: sidebar hanya berisi riwayat peminjaman miliknya sendiri.
      // Karena hanya satu submenu yang terlihat, sidebar otomatis
      // menampilkannya sebagai link tunggal (tanpa dropdown).
      {
        label: "Riwayat Peminjaman",
        href: "/asset/borrowings",
        icon: "📋",
        visibleForRoles: ["user"],
      },
    ],
  },
  { label: "Laporan & KPI", href: "/reports", icon: "📈", moduleCode: "reports" },
  {
    label: "Manajemen User",
    href: "/admin/users",
    icon: "👥",
    visibleForRoles: ["leader", "admin"],
  },
  {
    label: "Manajemen Akses",
    href: "/admin/access",
    icon: "🔐",
    moduleCode: "access_management",
  },
  {
    label: "Konfigurasi Dashboard",
    href: "/admin/dashboard-config",
    icon: "⚙️",
    visibleForRoles: ["leader", "admin"],
  },
];

const ROLE_LABEL: Record<string, string> = {
  user: "Pelapor",
  staff_it: "Staf IT",
  leader: "Leader",
  admin: "Administrator",
};

export function Sidebar() {
  const pathname = usePathname();
  const { user, token, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [permissions, setPermissions] = useState<EffectivePermission[]>([]);
  // permsLoaded mencegah menu bermodul "berkedip" (hilang lalu muncul)
  // selama izin masih di-fetch dari backend.
  const [permsLoaded, setPermsLoaded] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!token) return;
    getMyPermissions(token)
      .then((data) => setPermissions(data || []))
      .catch(() => {})
      .finally(() => setPermsLoaded(true));
  }, [token]);

  useEffect(() => {
    // Hanya tutup drawer di mobile, jangan di desktop
    const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
    if (isMobile) {
      setIsMobileOpen(false);
    }
  }, [pathname]);

  // Auto-expand dropdown kalau halaman aktif berada di bawah menu tersebut —
  // supaya user langsung lihat submenu yang relevan tanpa klik dulu.
  useEffect(() => {
    if (!pathname) return;
    NAV_ITEMS.forEach((item) => {
      if (item.children && item.children.length > 1) {
        const basePath = item.href.split("?")[0];
        if (pathname === basePath || pathname.startsWith(basePath + "/")) {
          setExpandedMenus((prev) =>
            prev[item.label] ? prev : { ...prev, [item.label]: true }
          );
        }
      }
    });
  }, [pathname]);

  if (!user) return null;

  const items = NAV_ITEMS.filter((item) => {
    if (item.visibleForRoles) {
      return item.visibleForRoles.includes(user.role);
    }
    if (!item.moduleCode) return true;
    // Tunggu izin selesai dimuat supaya menu tidak berkedip.
    if (!permsLoaded) return false;
    const perm = permissions.find((p) => p.module_code === item.moduleCode);
    return perm ? perm.access_level !== "none" : false;
  }).map((item) => {
    if (!item.moduleCode) return { ...item, unlocked: true };
    const perm = permissions.find((p) => p.module_code === item.moduleCode);
    return { ...item, unlocked: !!perm?.is_active };
  });

  return (
    <>
      <button
        onClick={() => setIsMobileOpen(true)}
        className="fixed left-4 top-4 z-30 flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-text-primary lg:hidden"
        aria-label="Buka menu"
      >
        ☰
      </button>

      {isMobileOpen && (
        <div
          onClick={() => setIsMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col border-r border-sidebar-border transition-transform duration-200 lg:static lg:w-60 lg:translate-x-0 ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${theme === "light" ? "bg-gradient-to-b from-[#0B3B40] via-[#0D9488] to-[#14B8A6]" : "bg-gradient-to-b from-[#1A1A1A] via-[#252525] to-[#2D2D2D]"}`}
      >
        {/* Sidebar backdrop image overlay dengan fade ke atas */}
        <div
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: "url('/images/sidebar-bacdkdrop.webp')",
            backgroundSize: "cover",
            backgroundPosition: "bottom center",
            backgroundAttachment: "fixed",
            maskImage: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 80%)",
            WebkitMaskImage: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 80%)",
          }}
        />
        <div className="relative z-10 px-5 py-5">
          <div className="flex items-center justify-between">
            <span className="font-[family-name:var(--font-display)] text-sm font-semibold tracking-wide text-sidebar-text-primary">
              IT HELPDESK
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={toggleTheme}
                className="rounded-md p-1.5 text-sidebar-text-secondary transition-all duration-150 hover:bg-sidebar-hover hover:text-sidebar-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring"
                aria-label={theme === "dark" ? "Aktifkan mode terang" : "Aktifkan mode gelap"}
                title={theme === "dark" ? "Mode Terang" : "Mode Gelap"}
              >
                {theme === "dark" ? (
                  /* Icon matahari (mode terang) */
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
                  </svg>
                ) : (
                  /* Icon bulan (mode gelap) */
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                )}
              </button>
              <button
                onClick={() => setIsMobileOpen(false)}
                className="rounded-md p-1.5 text-sidebar-text-secondary transition-all duration-150 hover:bg-sidebar-hover hover:text-sidebar-text-primary lg:hidden"
                aria-label="Tutup menu"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        <nav className="relative z-10 flex-1 space-y-1 overflow-y-auto px-3 py-4 slim-scroll">
          {items.map((item) => {
            const hasChildren = !!item.children && item.children.length > 0;

            // Filter children berdasarkan role user
            const visibleChildren = hasChildren
              ? item.children!.filter((child) => {
                  if (!child.visibleForRoles) return true;
                  return child.visibleForRoles.includes(user.role);
                })
              : [];

            if (hasChildren && visibleChildren.length === 0) return null;

            // Jika hanya ada 1 submenu yang terlihat (mis. pelapor hanya
            // "Riwayat Peminjaman"), tampilkan sebagai link langsung tanpa
            // dropdown — lebih sederhana dan sesuai kebutuhan role tsb.
            if (hasChildren && visibleChildren.length === 1) {
              const only = visibleChildren[0];
              const onlyPath = only.href.split("?")[0];
              // Exact match atau anak dari path-nya ("/" dipakai sebagai
              // pemisah supaya "/asset" tidak ikut aktif di "/assets-x").
              const onlyActive =
                pathname === onlyPath || !!pathname?.startsWith(onlyPath + "/");
              return (
                <Link
                  key={item.label}
                  href={item.unlocked ? only.href : "#"}
                  className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-all duration-150 ${
                    onlyActive
                      ? "bg-[#5EEAD4] font-bold text-[#115E70] shadow-lg"
                      : "text-sidebar-text-secondary hover:bg-sidebar-hover hover:text-sidebar-text-primary"
                  }`}
                >
                  <span className="shrink-0">{only.icon || item.icon}</span>
                  <span className="flex-1">{only.label}</span>
                </Link>
              );
            }

            const isActive = item.unlocked && pathname?.startsWith(item.href);
            const isExpanded = expandedMenus[item.label] || false;

            return (
              <div key={item.label}>
                {hasChildren ? (
                  <>
                    <button
                      onClick={() =>
                        setExpandedMenus((prev) => ({
                          ...prev,
                          [item.label]: !prev[item.label],
                        }))
                      }
                      className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-all duration-150 ${
                        isActive
                          ? "bg-[#5EEAD4] font-bold text-[#115E70] shadow-lg"
                          : item.unlocked
                            ? "text-sidebar-text-secondary hover:bg-sidebar-hover hover:text-sidebar-text-primary"
                            : "cursor-not-allowed text-sidebar-text-muted opacity-60"
                      }`}
                    >
                      <span className="shrink-0">{item.icon}</span>
                      <span className="flex-1 text-left">{item.label}</span>
                      <span
                        className={`shrink-0 text-xs transition-transform ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      >
                        ▼
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="mt-1 space-y-0.5 pl-8">
                        {visibleChildren.map((child) => {
                          // Bandingkan path saja (tanpa query) supaya link
                          // seperti "?status=pending_approval" tetap bisa aktif.
                          const childPath = child.href.split("?")[0];
                          // Cegah dua submenu aktif bersamaan: exact match selalu
                          // menang; prefix-match hanya dipakai kalau tidak ada
                          // submenu lain yang cocok persis dengan pathname.
                          const hasExact = visibleChildren.some(
                            (c) => c.href.split("?")[0] === pathname
                          );
                          const childActive = hasExact
                            ? pathname === childPath
                            : pathname === childPath ||
                              pathname?.startsWith(childPath + "/");
                          return (
                            <Link
                              key={child.label}
                              href={child.href}
                              className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-all duration-150 ${
                                childActive
                                  ? "bg-[#5EEAD4] font-semibold text-[#115E70]"
                                  : "text-sidebar-text-secondary hover:bg-sidebar-hover hover:text-sidebar-text-primary"
                              }`}
                            >
                              {child.icon && <span className="shrink-0">{child.icon}</span>}
                              <span>{child.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <Link
                    href={item.unlocked ? item.href : "#"}
                    aria-disabled={!item.unlocked}
                    className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-all duration-150 ${
                      isActive
                        ? "bg-[#5EEAD4] font-bold text-[#115E70] shadow-lg"
                        : item.unlocked
                          ? "text-sidebar-text-secondary hover:bg-sidebar-hover hover:text-sidebar-text-primary"
                          : "cursor-not-allowed text-sidebar-text-muted opacity-60"
                    }`}
                    onClick={(e) => {
                      if (!item.unlocked) e.preventDefault();
                    }}
                  >
                    <span className="shrink-0">{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                    {!item.unlocked && (
                      <span className="font-[family-name:var(--font-display)] text-[9px] uppercase tracking-wide text-text-muted opacity-60">
                        Segera
                      </span>
                    )}
                  </Link>
                )}
              </div>
            );
          })}
        </nav>

        <div
          className="relative z-10 mx-3 mb-3 rounded-xl overflow-hidden bg-white/10 backdrop-blur-sm"
        >
          <div className="relative z-10 p-3">
            <p className="truncate text-sm font-medium text-sidebar-text-primary">{user.name}</p>
            <p className="mb-3 font-[family-name:var(--font-display)] text-[10px] uppercase tracking-wide text-[#5EEAD4]">
              {ROLE_LABEL[user.role]}
            </p>
            <button
              onClick={logout}
              className="w-full rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-sidebar-text-secondary transition-all duration-150 hover:border-white/40 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-focus-ring"
            >
              Keluar
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
