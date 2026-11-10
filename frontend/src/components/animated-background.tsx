// Background dekoratif — beberapa "blob" warna blur yang bergerak pelan
// di belakang konten, memberi kesan halaman "hidup" tanpa mengganggu
// keterbacaan. Murni CSS animation (lihat @keyframes blob-float di
// globals.css), tidak ada JS yang jalan terus-menerus jadi ringan.
export function AnimatedBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-accent/20 blur-3xl"
        style={{ animation: "blob-float 14s ease-in-out infinite" }}
      />
      <div
        className="absolute right-[-80px] top-1/3 h-96 w-96 rounded-full bg-purple/20 blur-3xl"
        style={{ animation: "blob-float 18s ease-in-out infinite reverse" }}
      />
      <div
        className="absolute bottom-[-100px] left-1/3 h-80 w-80 rounded-full bg-amber/10 blur-3xl"
        style={{ animation: "blob-float 22s ease-in-out infinite" }}
      />
    </div>
  );
}
