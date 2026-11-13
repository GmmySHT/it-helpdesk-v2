"use client";

/**
 * Panel "Bukti Serah-Terima" di halaman detail tiket.
 *
 * Kenapa panel ini ada: pelapor kadang beberapa minggu setelah tiket close
 * mengklaim pekerjaan "belum sesuai", padahal saat itu tidak ada bukti apa pun.
 * Alurnya dibuat berurutan supaya bukti benar-benar kuat:
 *
 *   1. Cetak BAST (hanya untuk tiket closed) → pelapor tanda tangan di kertas
 *   2. Scan/foto dokumen yang sudah bertanda tangan
 *   3. Unggah ke sini — tersimpan menempel pada tiket, bukan folder terpisah
 *
 * Dokumen hanya boleh dihapus leader/admin karena berfungsi sebagai bukti.
 */

import { useEffect, useRef, useState, FormEvent } from "react";
import {
  TicketSignoff,
  listSignoffs,
  uploadSignoff,
  deleteSignoff,
  fileUrl,
} from "@/lib/api";

type Props = {
  token: string;
  ticketId: string;
  isClosed: boolean;
  reporterName?: string;
  canDelete: boolean;
  // Pelapor (role 'user') hanya MELIHAT dokumen yang sudah diunggah staf.
  // Dia tidak boleh menerbitkan BAST sendiri maupun mengunggah scan, karena
  // dokumen itu justru bukti yang harus dibuat oleh pihak IT.
  canUpload: boolean;
};

const inputClass =
  "w-full rounded-md border border-border bg-card-hover px-3.5 py-2.5 text-sm text-text-primary placeholder-text-muted outline-none transition-all duration-150 focus:border-accent";

function formatDateTime(iso?: string) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fileSize(bytes: number) {
  if (!bytes) return "-";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SignoffPanel({
  token,
  ticketId,
  isClosed,
  reporterName,
  canDelete,
  canUpload,
}: Props) {
  const [docs, setDocs] = useState<TicketSignoff[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  // Konfirmasi hapus dibuat inline (bukan confirm() bawaan browser) mengikuti
  // aturan UI project: semua dialog harus bergaya sendiri.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [signedByName, setSignedByName] = useState(reporterName || "");
  const [signedAt, setSignedAt] = useState("");
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      const data = await listSignoffs(token, ticketId);
      setDocs(data || []);
    } catch {
      // Panel ini pelengkap; kalau gagal dimuat jangan ganggu tampilan tiket.
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, ticketId]);

  useEffect(() => {
    if (!signedByName && reporterName) setSignedByName(reporterName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reporterName]);

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    setError("");
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Pilih file scan dokumen yang sudah ditandatangani.");
      return;
    }
    if (!signedByName.trim()) {
      setError("Nama penanda tangan wajib diisi.");
      return;
    }

    setUploading(true);
    try {
      await uploadSignoff(token, ticketId, {
        file,
        signedByName: signedByName.trim(),
        signedAt: signedAt || undefined,
        note: note.trim() || undefined,
      });
      if (fileRef.current) fileRef.current.value = "";
      setNote("");
      setSignedAt("");
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengunggah dokumen");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(doc: TicketSignoff) {
    try {
      await deleteSignoff(token, ticketId, doc.id);
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
      setConfirmDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus dokumen");
    }
  }

  return (
    <div className="mt-4 rounded-md border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-[family-name:var(--font-display)] text-xs uppercase tracking-wide text-text-muted">
            Bukti Serah-Terima
          </p>
          <p className="mt-1 text-[11px] text-text-muted/80">
            Scan BAST yang sudah ditandatangani pelapor — bukti resmi bahwa
            pekerjaan dinyatakan sesuai.
          </p>
        </div>
        {isClosed && canUpload && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent transition-all duration-150 hover:bg-accent/20"
          >
            {showForm ? "Batal" : "+ Unggah Scan"}
          </button>
        )}
      </div>

      {!isClosed && canUpload && (
        <p className="rounded-md border border-amber/25 bg-amber/5 px-3 py-2 text-xs text-amber">
          Tombol cetak BAST &amp; unggah scan aktif setelah tiket berstatus
          Selesai (closed).
        </p>
      )}

      {error && (
        <p className="mb-3 rounded-md border border-red/30 bg-red/10 px-3 py-2 text-xs text-red">
          {error}
        </p>
      )}

      {showForm && isClosed && canUpload && (
        <form
          onSubmit={handleUpload}
          className="mb-4 rounded-md border border-border-subtle bg-card-hover p-3"
        >
          <div className="mb-3">
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-text-muted">
              File scan (JPG, PNG, WebP, atau PDF — maks 15 MB)
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="w-full text-xs text-text-secondary file:mr-3 file:rounded-md file:border-0 file:bg-accent/15 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-accent"
            />
          </div>

          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-text-muted">
                Nama penanda tangan
              </label>
              <input
                required
                value={signedByName}
                onChange={(e) => setSignedByName(e.target.value)}
                placeholder="Nama pelapor yang tanda tangan"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-text-muted">
                Tanggal tanda tangan (opsional)
              </label>
              <input
                type="date"
                value={signedAt}
                onChange={(e) => setSignedAt(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          <div className="mb-3">
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-text-muted">
              Catatan (opsional)
            </label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Misal: diserahkan langsung di ruang IT"
              className={inputClass}
            />
          </div>

          <button
            type="submit"
            disabled={uploading}
            className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-card transition-all duration-150 hover:bg-accent/80 disabled:opacity-50"
          >
            {uploading ? "Mengunggah..." : "Unggah Dokumen"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-xs text-text-muted">Memuat dokumen...</p>
      ) : docs.length === 0 ? (
        <p className="text-xs text-text-muted">
          Belum ada dokumen bertanda tangan yang diunggah.
        </p>
      ) : (
        <ul className="space-y-2">
          {docs.map((doc) => (
            <li
              key={doc.id}
              className="flex items-start gap-3 rounded-md border border-border-subtle bg-card-hover px-3 py-2.5"
            >
              <span className="mt-0.5 font-[family-name:var(--font-display)] text-[10px] uppercase text-text-muted">
                {doc.file_type === "pdf" ? "PDF" : "IMG"}
              </span>
              <div className="min-w-0 flex-1">
                <a
                  href={fileUrl(doc.file_url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-sm font-medium text-text-primary hover:text-accent"
                >
                  {doc.file_name}
                </a>
                <p className="mt-0.5 text-[11px] text-text-muted">
                  Ditandatangani: {doc.signed_by_name}
                  {doc.signed_at ? ` · ${formatDateTime(doc.signed_at)}` : ""}
                  {" · "}
                  {fileSize(doc.file_size)}
                </p>
                <p className="text-[11px] text-text-muted/70">
                  Diunggah {doc.uploaded_by_name || "-"} ·{" "}
                  {formatDateTime(doc.created_at)}
                </p>
                {doc.note && (
                  <p className="mt-1 text-[11px] text-text-secondary">
                    {doc.note}
                  </p>
                )}
              </div>
              {canDelete && (
                <div className="shrink-0">
                  {confirmDeleteId === doc.id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleDelete(doc)}
                        className="rounded-md border border-red/40 bg-red/15 px-2 py-1 text-[11px] font-medium text-red transition-all duration-150 hover:bg-red/25"
                      >
                        Ya, hapus
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded-md border border-border px-2 py-1 text-[11px] text-text-muted transition-all duration-150 hover:text-text-primary"
                      >
                        Batal
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(doc.id)}
                      className="rounded-md border border-red/30 px-2 py-1 text-[11px] text-red transition-all duration-150 hover:bg-red/10"
                    >
                      Hapus
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
