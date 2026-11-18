// Definisi role & helper untuk frontend. Sejak migrasi 000036 role dinamis
// (TEXT di DB) — daftar ini hanya label default, JANGAN dipakai untuk
// memblokir aksi. Izin sebenarnya ada di /me/permissions (RBAC).

export const DEFAULT_ROLES = [
  "pelapor",
  "it_support",
  "analyst",
  "programmer",
  "devops",
  "leader",
  "admin",
] as const;

export type UserRole = (typeof DEFAULT_ROLES)[number] | (string & {});

export const ROLE_LABEL: Record<string, string> = {
  pelapor: "Pelapor",
  it_support: "IT Support",
  analyst: "Analyst",
  programmer: "Programmer",
  devops: "DevOps",
  leader: "Leader",
  admin: "Administrator",
};

export function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role;
}

// Staf teknis: mengerjakan tiket, daily task, KPI staf.
export function isTechnicalStaff(role?: string): boolean {
  return (
    role === "it_support" ||
    role === "analyst" ||
    role === "programmer" ||
    role === "devops"
  );
}

export function isSupervisor(role?: string): boolean {
  return role === "leader" || role === "admin";
}

export function isReporter(role?: string): boolean {
  return role === "pelapor" || role === "user"; // 'user' untuk data lama
}

// Bisa edit detail tiket: semua staf teknis + supervisor. Role dinamis lain
// juga diizinkan di sini; keputusan akhir ada di izin RBAC backend.
export function canEditTicket(role?: string): boolean {
  if (!role) return false;
  return isTechnicalStaff(role) || isSupervisor(role) || !isReporter(role);
}

// Bisa lihat/cetak BAST & upload dokumen: semua kecuali pelapor.
export function canSignoff(role?: string): boolean {
  if (!role) return false;
  return !isReporter(role);
}
