import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { NotificationsProvider } from "@/lib/notifications-context";
import { ThemeProvider } from "@/lib/theme-context";
import { ToastContainer } from "@/components/toast-container";
import { CalmBackground } from "@/components/calm-background";

// next/font/google men-download font ini SEKALI saat build/dev, lalu
// di-serve dari server kita sendiri (self-hosted) — bukan minta browser
// user fetch dari Google tiap kali. Lebih cepat dan lebih privat.
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Ticketing IT",
  description: "Aplikasi Ticketing IT untuk monitoring kinerja staf IT support",
};

// AuthProvider dan NotificationsProvider dipasang di root layout supaya
// SEMUA halaman bisa mengakses status login dan notifikasi real-time.
// NotificationsProvider HARUS di dalam AuthProvider karena dia butuh
// token dari situ untuk membuka koneksi WebSocket.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={`${inter.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <AuthProvider>
            <NotificationsProvider>
              <CalmBackground />
              <div className="page-transition">
                {children}
              </div>
              <ToastContainer />
            </NotificationsProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
