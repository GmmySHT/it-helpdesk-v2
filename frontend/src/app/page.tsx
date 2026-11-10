import { redirect } from "next/navigation";

// Landing page default Next.js sudah diganti: langsung arahkan ke /login.
// User yang sudah login akan di-redirect lagi oleh AuthProvider ke /dashboard.
export default function Home() {
  redirect("/login");
}
