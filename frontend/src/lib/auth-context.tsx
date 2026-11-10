"use client";

// Context ini menyimpan siapa yang sedang login (token + data user)
// dan menyediakannya ke seluruh komponen di bawahnya lewat React Context,
// supaya tidak perlu passing props berlapis-lapis (prop drilling).
//
// Token disimpan di localStorage supaya user tidak perlu login ulang
// tiap kali refresh halaman.
//
// PENTING untuk halaman yang memakai useAuth(): saat halaman pertama
// dimuat, token masih null sampai sesi selesai dipulihkan dari
// localStorage (isLoading = true). Halaman HARUS menunggu isLoading
// bernilai false sebelum memutuskan redirect ke /login:
//
//   const { token, isLoading } = useAuth();
//   useEffect(() => {
//     if (isLoading) return;
//     if (!token) { router.push("/login"); return; }
//     ...
//   }, [isLoading, token]);

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { login as apiLogin, User } from "./api";

type AuthContextType = {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // Saat aplikasi pertama kali dimuat (misal setelah refresh browser),
  // coba pulihkan sesi login dari localStorage.
  useEffect(() => {
    try {
      const savedToken = localStorage.getItem("token");
      const savedUser = localStorage.getItem("user");
      if (savedToken && savedUser) {
        setUser(JSON.parse(savedUser));
        setToken(savedToken);
      }
    } catch {
      // Isi localStorage rusak/tidak bisa dibaca: anggap belum login
      // dan bersihkan, supaya aplikasi tidak crash saat dimuat.
      localStorage.removeItem("token");
      localStorage.removeItem("user");
    } finally {
      setIsLoading(false);
    }
  }, []);

  async function login(identifier: string, password: string) {
    const data = await apiLogin(identifier, password);
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
  }

  function logout() {
    setToken(null);
    setUser(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  }

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook ini yang akan dipakai di komponen manapun untuk akses status login,
// contoh: const { user, logout } = useAuth();
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth harus dipakai di dalam AuthProvider");
  }
  return context;
}
