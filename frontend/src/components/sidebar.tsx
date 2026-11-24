"use client";

// Sidebar dipakai bersama di semua halaman setelah login.
// - Desktop: statis di kiri, bisa DICIUTKAN jadi rail ikon (pilihan disimpan
//   di localStorage).
// - Mobile: berubah jadi DRAWER lewat tombol ☰ (selalu dalam mode lebar penuh).
// Logika izin (moduleCode, visibleForRoles, getMyPermissions) sama seperti
// versi sebelumnya — yang berubah hanya tampilan & pengelompokan menu.

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useTheme } from "@/lib/theme-context";
import { getMyPermissions, EffectivePermission } from "@/lib/api";

type Role = "pelapor" | "it_support" | "analyst" | "programmer" | "devops" | "leader" | "admin" | (string & {});

type NavChild = {
  label: string;
  href: string;
  icon?: IconName;
  visibleForRoles?: Role[];
};

type NavItem = {
  label: string;
  href: string;
  icon: IconName;
  group: "Utama" | "Operasional" | "Administrasi";
  moduleCode?: string;
  // visibleForRoles dipakai untuk menu yang proteksinya berbasis ROLE
  // langsung (bukan RBAC modul), seperti Manajemen User.
  visibleForRoles?: Role[];
  children?: NavChild[];
};

const GROUP_ORDER: NavItem["group"][] = ["Utama", "Operasional", "Administrasi"];

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "grid", group: "Utama" },
  {
    // Dijaga modul RBAC "monitoring" (sama dengan RequireModuleAccess di backend).
    label: "Monitoring SIMRS",
    href: "/monitoring",
    icon: "pulse",
    group: "Utama",
    moduleCode: "monitoring",
  },
  { label: "Tiket", href: "/tickets", icon: "ticket", group: "Utama" },
  {
    // Project = tiket bertipe project (milestone & task), modul RBAC "project".
    label: "Project",
    href: "/project",
    icon: "layers",
    group: "Utama",
    moduleCode: "project",
  },
  {
    // Daily Task = pekerjaan harian kecil dari WhatsApp; masuk KPI staf.
    label: "Daily Task",
    href: "/daily-tasks",
    icon: "task",
    group: "Operasional",
    visibleForRoles: ["it_support", "analyst", "programmer", "devops", "leader", "admin"],
  },
  {
    label: "Aset IT",
    href: "/asset",
    icon: "box",
    group: "Operasional",
    moduleCode: "asset",
    children: [
      {
        label: "Pinjam Aset",
        href: "/asset/borrowings/new",
        icon: "plus",
        visibleForRoles: ["it_support", "analyst", "programmer", "devops", "leader", "admin"],
      },
      {
        label: "Peminjaman",
        href: "/asset/borrowings",
        icon: "list",
        visibleForRoles: ["it_support", "analyst", "programmer", "devops", "leader", "admin"],
      },
      {
        label: "Data Aset",
        href: "/asset",
        icon: "box",
        visibleForRoles: ["it_support", "analyst", "programmer", "devops", "leader", "admin"],
      },
      // Pelapor hanya melihat riwayat miliknya; karena cuma satu submenu
      // yang terlihat, otomatis ditampilkan sebagai link tunggal.
      {
        label: "Riwayat Peminjaman",
        href: "/asset/borrowings",
        icon: "list",
        visibleForRoles: ["pelapor"],
      },
    ],
  },
  {
    label: "Laporan & KPI",
    href: "/reports",
    icon: "chart",
    group: "Administrasi",
    moduleCode: "reports",
  },
  {
    label: "Manajemen User",
    href: "/admin/users",
    icon: "users",
    group: "Administrasi",
    visibleForRoles: ["leader", "admin"],
  },
  {
    label: "Pengaturan Kategori",
    href: "/admin/categories",
    icon: "tag",
    group: "Administrasi",
    visibleForRoles: ["leader", "admin"],
  },
  {
    label: "Manajemen Akses",
    href: "/admin/access",
    icon: "shield",
    group: "Administrasi",
    moduleCode: "access_management",
  },
  {
    label: "Konfigurasi Dashboard",
    href: "/admin/dashboard-config",
    icon: "cog",
    group: "Administrasi",
    visibleForRoles: ["leader", "admin"],
  },
];

const ROLE_LABEL: Record<string, string> = {
  pelapor: "Pelapor",
  it_support: "IT Support",
  analyst: "Analyst",
  programmer: "Programmer",
  devops: "DevOps",
  leader: "Leader",
  admin: "Administrator",
};

const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  pulse: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  ticket:
    '<path d="M3 9a2 2 0 0 0 0 6v3h18v-3a2 2 0 0 1 0-6V6H3z"/><path d="M13 6v12" stroke-dasharray="2 3"/>',
  task: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  users:
    '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.5 3.3-5.5 6.5-5.5s5.9 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .7 3.2 2.5 3.5 5.2"/>',
  shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/>',
  out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 8.6-8.6M16 3.5 20.5 8M14 5.5 18.5 10"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  left: '<path d="m11 17-5-5 5-5M18 17l-5-5 5-5"/>',
  right: '<path d="m13 17 5-5-5-5M6 17l5-5-5-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  tag: '<path d="M20.6 13.6 12 22.2 2 12.2V3h9.2l9.4 9.4a1.5 1.5 0 0 1 0 2.2z"/><circle cx="7" cy="7" r="1.4"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5M3 17l9 5 9-5"/>',
} as const;

type IconName = keyof typeof ICONS;

function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`h-[18px] w-[18px] shrink-0 ${className}`}
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}

const ACCENT = "#5EEAD4";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, token, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [permissions, setPermissions] = useState<EffectivePermission[]>([]);
  // permsLoaded mencegah menu bermodul "berkedip" selama izin di-fetch.
  const [permsLoaded, setPermsLoaded] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [tip, setTip] = useState<{ label: string; top: number } | null>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;
    getMyPermissions(token)
      .then((data) => setPermissions(data || []))
      .catch(() => {})
      .finally(() => setPermsLoaded(true));
  }, [token]);

  // Baca preferensi ciut dari localStorage (di effect agar tidak mismatch hydration).
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("sidebar-collapsed") === "1");
    } catch {}
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebar-collapsed", next ? "1" : "0");
      } catch {}
      return next;
    });
    setTip(null);
  }

  useEffect(() => {
    // Hanya tutup drawer di mobile, jangan di desktop
    const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
    if (isMobile) setIsMobileOpen(false);
  }, [pathname]);

  // Auto-expand dropdown kalau halaman aktif berada di bawah menu tersebut.
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

  // Tutup popover user saat klik di luar.
  useEffect(() => {
    if (!userMenuOpen) return;
    function onDown(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [userMenuOpen]);

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

  // Kelas yang menyembunyikan teks hanya di desktop saat sidebar diciutkan
  // (di mobile drawer selalu lebar penuh).
  const hideWhenCollapsed = collapsed ? "lg:hidden" : "";

  const itemClass = (active: boolean, unlocked = true, small = false) =>
    `group relative flex w-full items-center gap-3 rounded-[10px] transition-all duration-150 focus-visible:outline-2 focus-visible:outline-focus-ring ${
      small ? "px-2.5 py-1.5 text-[12.5px]" : "px-2.5 py-2 text-[13.5px]"
    } ${collapsed ? "lg:justify-center lg:px-0" : ""} ${
      active
        ? "bg-white/[0.17] font-semibold text-white ring-1 ring-inset ring-white/15"
        : unlocked
          ? "text-sidebar-text-secondary hover:bg-sidebar-hover hover:text-sidebar-text-primary"
          : "cursor-not-allowed text-sidebar-text-muted opacity-60"
    }`;

  const ActiveBar = ({ show }: { show: boolean }) =>
    show ? (
      <span
        className="absolute -left-3 bottom-2 top-2 w-1 rounded-r"
        style={{ background: ACCENT }}
      />
    ) : null;

  const tipHandlers = (label: string) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      if (!collapsed) return;
      const r = e.currentTarget.getBoundingClientRect();
      setTip({ label, top: r.top + r.height / 2 });
    },
    onMouseLeave: () => setTip(null),
  });

  const initials = user.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  return (
    <>
      <button
        onClick={() => setIsMobileOpen(true)}
        className="fixed left-4 top-4 z-30 flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card text-text-primary lg:hidden"
        aria-label="Buka menu"
      >
        <Icon name="menu" />
      </button>

      {isMobileOpen && (
        <div
          onClick={() => setIsMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-64 shrink-0 flex-col overflow-hidden border-r border-sidebar-border transition-all duration-200 lg:static lg:translate-x-0 ${
          collapsed ? "lg:w-[76px]" : "lg:w-64"
        } ${isMobileOpen ? "translate-x-0" : "-translate-x-full"} ${
          theme === "light"
            ? "bg-gradient-to-b from-[#0B3B40] via-[#0D9488] to-[#14B8A6]"
            : "bg-gradient-to-b from-[#1A1A1A] via-[#252525] to-[#2D2D2D]"
        }`}
      >
        {/* Gambar latar sidebar (tetap), fade ke atas */}
        <div
          className="pointer-events-none absolute inset-0 z-0"
          style={{
            backgroundImage: "url('/images/sidebar-bacdkdrop.webp')",
            backgroundSize: "cover",
            backgroundPosition: "bottom center",
            backgroundAttachment: "fixed",
            maskImage: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 80%)",
            WebkitMaskImage: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 80%)",
          }}
        />

        {/* Header */}
        <div
          className={`relative z-10 flex items-center gap-2.5 px-4 pb-3 pt-4 ${
            collapsed ? "lg:flex-col lg:gap-2 lg:px-0 lg:pt-4" : ""
          }`}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-white/20 bg-white/15 text-[13px] font-bold text-white">
            IT
          </div>
          <div className={`min-w-0 flex-1 leading-tight ${hideWhenCollapsed}`}>
            <span className="block font-[family-name:var(--font-display)] text-[13px] font-semibold tracking-wider text-sidebar-text-primary">
              IT HELPDESK
            </span>
            <span className="block text-[10px] text-sidebar-text-secondary opacity-70">
              Sistem Tiketing Internal
            </span>
          </div>
          <button
            onClick={toggleCollapsed}
            className="hidden h-8 w-8 items-center justify-center rounded-md text-sidebar-text-secondary transition-all duration-150 hover:bg-sidebar-hover hover:text-sidebar-text-primary focus-visible:outline-2 focus-visible:outline-focus-ring lg:flex"
            aria-label={collapsed ? "Lebarkan sidebar" : "Ciutkan sidebar"}
            title={collapsed ? "Lebarkan sidebar" : "Ciutkan sidebar"}
          >
            <Icon name={collapsed ? "right" : "left"} />
          </button>
          <button
            onClick={() => setIsMobileOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-sidebar-text-secondary transition-all duration-150 hover:bg-sidebar-hover hover:text-sidebar-text-primary lg:hidden"
            aria-label="Tutup menu"
          >
            <Icon name="close" />
          </button>
        </div>

        {/* Navigasi */}
        <nav className="slim-scroll relative z-10 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-3">
          {GROUP_ORDER.map((group) => {
            const groupItems = items.filter((i) => i.group === group);
            if (groupItems.length === 0) return null;

            const rendered = groupItems.map((item) => {
              const hasChildren = !!item.children && item.children.length > 0;
              const visibleChildren = hasChildren
                ? item.children!.filter((child) => {
                    if (!child.visibleForRoles) return true;
                    return child.visibleForRoles.includes(user.role);
                  })
                : [];

              if (hasChildren && visibleChildren.length === 0) return null;

              // Hanya 1 submenu terlihat → tampilkan sebagai link langsung.
              if (hasChildren && visibleChildren.length === 1) {
                const only = visibleChildren[0];
                const onlyPath = only.href.split("?")[0];
                const onlyActive =
                  pathname === onlyPath || !!pathname?.startsWith(onlyPath + "/");
                return (
                  <Link
                    key={item.label}
                    href={item.unlocked ? only.href : "#"}
                    className={itemClass(onlyActive)}
                    {...tipHandlers(only.label)}
                  >
                    <ActiveBar show={onlyActive} />
                    <Icon
                      name={only.icon || item.icon}
                      className={onlyActive ? "text-[#5EEAD4]" : ""}
                    />
                    <span className={`flex-1 whitespace-nowrap ${hideWhenCollapsed}`}>
                      {only.label}
                    </span>
                  </Link>
                );
              }

              const isActive = !!item.unlocked && !!pathname?.startsWith(item.href);
              const isExpanded = !!expandedMenus[item.label];

              if (hasChildren) {
                const showSub = isExpanded && !collapsed;
                return (
                  <div key={item.label}>
                    <button
                      onClick={() => {
                        // Saat diciutkan, klik induk melebarkan sidebar dulu.
                        if (collapsed) {
                          toggleCollapsed();
                          setExpandedMenus((p) => ({ ...p, [item.label]: true }));
                          return;
                        }
                        setExpandedMenus((p) => ({ ...p, [item.label]: !p[item.label] }));
                      }}
                      aria-expanded={showSub}
                      className={itemClass(isActive, !!item.unlocked)}
                      {...tipHandlers(item.label)}
                    >
                      <ActiveBar show={isActive} />
                      <Icon name={item.icon} className={isActive ? "text-[#5EEAD4]" : ""} />
                      <span className={`flex-1 whitespace-nowrap text-left ${hideWhenCollapsed}`}>
                        {item.label}
                      </span>
                      <Icon
                        name="chev"
                        className={`!h-[15px] !w-[15px] transition-transform duration-200 ${
                          showSub ? "rotate-180" : ""
                        } ${hideWhenCollapsed}`}
                      />
                    </button>
                    <div
                      className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                        showSub ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                      }`}
                    >
                      <div className="overflow-hidden">
                        <div className="ml-[21px] mt-0.5 space-y-0.5 border-l border-white/20 pl-3">
                          {visibleChildren.map((child) => {
                            const childPath = child.href.split("?")[0];
                            // Exact match selalu menang supaya tidak ada dua submenu aktif.
                            const hasExact = visibleChildren.some(
                              (c) => c.href.split("?")[0] === pathname
                            );
                            const childActive = hasExact
                              ? pathname === childPath
                              : pathname === childPath ||
                                !!pathname?.startsWith(childPath + "/");
                            return (
                              <Link
                                key={child.label}
                                href={child.href}
                                tabIndex={showSub ? 0 : -1}
                                className={itemClass(childActive, true, true)}
                              >
                                {child.icon && (
                                  <Icon
                                    name={child.icon}
                                    className={`!h-4 !w-4 ${childActive ? "text-[#5EEAD4]" : ""}`}
                                  />
                                )}
                                <span className="whitespace-nowrap">{child.label}</span>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <Link
                  key={item.label}
                  href={item.unlocked ? item.href : "#"}
                  aria-disabled={!item.unlocked}
                  className={itemClass(isActive, !!item.unlocked)}
                  onClick={(e) => {
                    if (!item.unlocked) e.preventDefault();
                  }}
                  {...tipHandlers(item.label)}
                >
                  <ActiveBar show={isActive} />
                  <Icon name={item.icon} className={isActive ? "text-[#5EEAD4]" : ""} />
                  <span className={`flex-1 whitespace-nowrap ${hideWhenCollapsed}`}>
                    {item.label}
                  </span>
                  {!item.unlocked && (
                    <span
                      className={`font-[family-name:var(--font-display)] text-[9px] uppercase tracking-wide text-text-muted opacity-60 ${hideWhenCollapsed}`}
                    >
                      Segera
                    </span>
                  )}
                </Link>
              );
            });

            return (
              <div key={group}>
                {/* Label grup; saat diciutkan berubah jadi garis pemisah */}
                <p
                  className={`px-2.5 pb-1.5 pt-4 text-[10px] font-medium uppercase tracking-[0.12em] text-sidebar-text-secondary opacity-60 ${
                    collapsed ? "lg:mx-2 lg:my-2.5 lg:h-px lg:bg-white/20 lg:p-0 lg:text-[0px]" : ""
                  }`}
                >
                  {group}
                </p>
                <div className="space-y-0.5">{rendered}</div>
              </div>
            );
          })}
        </nav>

        {/* Kartu user + popover */}
        <div ref={userMenuRef} className="relative z-10 mx-3 mb-3">
          {userMenuOpen && (
            <div
              className={`absolute bottom-[calc(100%+8px)] left-0 z-20 rounded-xl border border-white/15 bg-[#0b1d21] p-1.5 shadow-2xl ${
                collapsed ? "lg:w-48" : "right-0"
              } right-0`}
            >
              <button
                onClick={() => {
                  toggleTheme();
                  setUserMenuOpen(false);
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-white transition-colors hover:bg-white/10"
              >
                <Icon name={theme === "dark" ? "sun" : "moon"} className="!h-4 !w-4" />
                {theme === "dark" ? "Mode Terang" : "Mode Gelap"}
              </button>
              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  setIsMobileOpen(false);
                  router.push("/profile");
                }}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-white transition-colors hover:bg-white/10"
              >
                <Icon name="key" className="!h-4 !w-4" />
                Profil & Kata Sandi
              </button>
              <button
                onClick={logout}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-white transition-colors hover:bg-white/10"
              >
                <Icon name="out" className="!h-4 !w-4" />
                Keluar
              </button>
            </div>
          )}
          <button
            onClick={() => setUserMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            className={`flex w-full items-center gap-2.5 rounded-[14px] border border-white/20 bg-white/10 p-2.5 text-left backdrop-blur-sm transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-focus-ring ${
              collapsed ? "lg:justify-center lg:p-2" : ""
            }`}
          >
            <span
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-[#115E70]"
              style={{ background: ACCENT }}
            >
              {initials}
            </span>
            <span className={`min-w-0 flex-1 ${hideWhenCollapsed}`}>
              <span className="block truncate text-[13px] font-medium text-sidebar-text-primary">
                {user.name}
              </span>
              <span className="block font-[family-name:var(--font-display)] text-[10px] uppercase tracking-wide text-[#5EEAD4]">
                {ROLE_LABEL[user.role]}
              </span>
            </span>
          </button>
        </div>
      </aside>

      {/* Tooltip saat sidebar diciutkan (desktop saja) */}
      {collapsed && tip && (
        <span
          className="pointer-events-none fixed left-[84px] z-[60] hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-[#0b1d21] px-2.5 py-1.5 text-xs text-white shadow-xl lg:block"
          style={{ top: tip.top }}
        >
          {tip.label}
        </span>
      )}
    </>
  );
}
