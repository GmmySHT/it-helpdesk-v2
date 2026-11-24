export function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return "—";
  const total = Math.round(minutes);
  if (total === 0) return "0m";
  const days = Math.floor(total / (60 * 24));
  const hours = Math.floor((total % (60 * 24)) / 60);
  const mins = total % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} hari`);
  if (hours > 0) parts.push(`${hours}j`);
  if (mins > 0 && days === 0) parts.push(`${mins}m`);
  return parts.join(" ") || "0m";
}

const MONTHS_ID = [
  "Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des",
];

export function formatTanggalIndonesia(
  value: string | Date | null | undefined,
  opts?: { withTime?: boolean }
): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const day = d.getDate();
  const mon = MONTHS_ID[d.getMonth()];
  const year = d.getFullYear();
  if (!opts?.withTime) return `${day} ${mon} ${year}`;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${mon} ${year}, ${hh}:${mm}`;
}
