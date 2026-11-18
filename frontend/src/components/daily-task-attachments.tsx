"use client";

/**
 * Panel lampiran opsional Daily Task: 0-5 file, PDF/JPG/PNG/WEBP, maks 5 MB.
 * Upload & hapus hanya untuk pemilik task (canEdit); semua pembaca bisa
 * melihat dan membuka lampiran. Konfirmasi hapus memakai inline dua tombol,
 * bukan confirm() bawaan browser.
 */

import { useRef, useState, DragEvent } from "react";
import {
  DailyTaskAttachment,
  deleteDailyTaskAttachment,
  fileUrl,
  uploadDailyTaskAttachments,
} from "@/lib/api";
import { FileText, Trash2, Paperclip, X } from "lucide-react";

const MAX_FILES = 5;
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

type Props = {
  token: string;
  taskId: string;
  attachments: DailyTaskAttachment[];
  canEdit: boolean;
  onChanged: (items: DailyTaskAttachment[]) => void;
};

export default function DailyTaskAttachments({
  token,
  taskId,
  attachments,
  canEdit,
  onChanged,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function addFiles(files: File[]) {
    if (!canEdit || files.length === 0) return;
    setError("");
    const rejected: string[] = [];
    const accepted: File[] = [];
    for (const f of files) {
      if (!ACCEPTED.includes(f.type)) {
        rejected.push(`${f.name}: format tidak didukung (PDF/JPG/PNG/WEBP)`);
      } else if (f.size > MAX_BYTES) {
        rejected.push(`${f.name}: lebih dari 5 MB`);
      } else {
        accepted.push(f);
      }
    }
    const remaining = MAX_FILES - attachments.length;
    if (accepted.length > remaining) {
      rejected.push(`maksimal ${MAX_FILES} lampiran per task (tersisa ${remaining})`);
      accepted.splice(remaining);
    }
    if (rejected.length > 0) setError(rejected.join(" • "));
    if (accepted.length === 0) return;

    setBusy(true);
    try {
      const created = await uploadDailyTaskAttachments(token, taskId, accepted);
      onChanged([...attachments, ...created]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengunggah lampiran");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    if (!canEdit) return;
    void addFiles(Array.from(e.dataTransfer.files));
  }

  async function remove(id: string) {
    setBusy(true);
    setError("");
    try {
      await deleteDailyTaskAttachment(token, taskId, id);
      onChanged(attachments.filter((a) => a.id !== id));
      setConfirmId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus lampiran");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
          Lampiran Bukti <span className="normal-case">(Opsional)</span>
        </span>
        <span className="text-[10px] text-text-muted/70">
          {attachments.length}/{MAX_FILES} file
        </span>
      </div>

      {canEdit && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Unggah lampiran opsional"
          className={`upload-dropzone ${dragging ? "is-dragging" : ""} ${busy ? "is-disabled" : ""}`}
          onClick={() => !busy && inputRef.current?.click()}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && !busy) inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (canEdit && !busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <Paperclip size={18} className="text-text-muted" />
          <p className="text-xs text-text-secondary">
            {busy ? "Mengunggah..." : "Klik atau tarik file ke sini"}
          </p>
          <p className="text-[10px] text-text-muted">
            PDF, JPG, PNG, WEBP · maks 5 MB/file · maks {MAX_FILES} file
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            className="hidden"
            onChange={(e) => void addFiles(Array.from(e.target.files || []))}
          />
        </div>
      )}

      {error && (
        <p className="mt-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-600">
          {error}
        </p>
      )}

      {attachments.length > 0 && (
        <ul className="mt-2 space-y-2">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
            >
              {a.file_type === "image" ? (
                <img
                  src={fileUrl(a.file_url)}
                  alt={a.file_name}
                  className="attachment-thumb"
                />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-card-hover">
                  <FileText size={18} className="text-text-muted" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <a
                  href={fileUrl(a.file_url)}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-xs font-medium text-accent hover:underline"
                >
                  {a.file_name}
                </a>
                <span className="text-[10px] text-text-muted">{formatSize(a.file_size)}</span>
              </div>
              {canEdit &&
                (confirmId === a.id ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(a.id)}
                      className="rounded-md bg-red-500/15 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-500/25 disabled:opacity-50"
                    >
                      Ya, hapus
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      className="rounded-md px-2 py-1 text-[11px] text-text-muted hover:text-text-primary"
                    >
                      Batal
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    aria-label={`Hapus lampiran ${a.file_name}`}
                    onClick={() => setConfirmId(a.id)}
                    className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-red-500/10 hover:text-red-500"
                  >
                    <Trash2 size={15} />
                  </button>
                ))}
              {confirmId === a.id && (
                <button
                  type="button"
                  aria-label="Batal hapus"
                  onClick={() => setConfirmId(null)}
                  className="text-text-muted"
                >
                  <X size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
