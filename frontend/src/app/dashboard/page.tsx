"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/page-header";
import { Sidebar } from "@/components/sidebar";
import { useAuth } from "@/lib/auth-context";
import { isSupervisor, isTechnicalStaff } from "@/lib/roles";
import { LeaderView } from "@/components/dashboard/LeaderView";
import { ReporterView } from "@/components/dashboard/ReporterView";
import { StaffView } from "@/components/dashboard/StaffView";
import { useDashboardRefresh } from "@/components/dashboard/useDashboardData";

export default function DashboardPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const { token, refreshKey } = useDashboardRefresh();
  const [updatedAt, setUpdatedAt] = useState("");

  useEffect(() => {
    if (!isLoading && !user) router.push("/login");
  }, [isLoading, user, router]);

  useEffect(() => {
    setUpdatedAt(new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }));
  }, [refreshKey]);

  if (isLoading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-transparent">
        <p className="text-sm text-text-muted">Memuat...</p>
      </main>
    );
  }

  const supervisor = isSupervisor(user.role);
  const staff = isTechnicalStaff(user.role);
  const showAsset = supervisor || staff || true;

  return (
    <div className="relative z-0 flex h-screen bg-transparent font-[family-name:var(--font-body)]">
      <Sidebar />
      <main className="relative flex-1 overflow-y-auto slim-scroll">
        <PageHeader
          title="Dashboard"
          greeting="Halo"
          userName={user.name.split(" ")[0]}
          subtitle={`Diperbarui ${updatedAt}`}
          actions={[
            { label: "+ Buat Tiket", href: "/tickets?create=1", variant: "primary" },
            ...(showAsset
              ? [{ label: "Pinjam Aset", href: "/asset/borrowings/new", variant: "secondary" as const }]
              : []),
          ]}
        />
        <div className="relative z-10 w-full px-6 py-8 sm:px-10">
          {supervisor && <LeaderView token={token} refreshKey={refreshKey} />}
          {!supervisor && staff && <StaffView token={token} userId={user.id} refreshKey={refreshKey} />}
          {!supervisor && !staff && <ReporterView token={token} userId={user.id} refreshKey={refreshKey} />}
        </div>
      </main>
    </div>
  );
}
