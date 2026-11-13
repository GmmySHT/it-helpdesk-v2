"use client";

/**
 * Halaman cetak BAST (Berita Acara Serah-Terima) tiket.
 *
 * Halaman ini SENGAJA terpisah dari /tickets/[id] dan tidak memakai Sidebar:
 * tujuannya hanya jadi dokumen kertas. Alurnya:
 *   1. Staf/pelapor buka halaman ini untuk tiket yang sudah 'closed'
 *   2. Klik "Cetak / Simpan PDF" → browser print dialog
 *   3. Pelapor tanda tangan di kertas
 *   4. Dokumen di-scan, lalu diunggah balik di halaman detail tiket
 *      (panel "Bukti Serah-Terima") sebagai bukti digital.
 *
 * Tombol cetak & navigasi diberi class "no-print" supaya tidak ikut tercetak.
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Ticket, TicketComment, getTicket, listComments, fileUrl } from "@/lib/api";

const STATUS_LABEL: Record<string, string> = {
  pending_approval: "Menunggu Persetujuan",
  unassigned: "Belum Ditugaskan",
  assigned: "Menunggu Diklaim",
  claimed: "Sedang Dikerjakan",
  resolved: "Menunggu Review",
  closed: "Selesai",
};

// Nama instansi di kop BAST. Bisa diganti lewat env NEXT_PUBLIC_INSTITUTION_NAME
// tanpa menyentuh kode; default-nya netral karena project tidak menyimpan nama
// instansi di mana pun.
const INSTITUTION_NAME =
  process.env.NEXT_PUBLIC_INSTITUTION_NAME ||
  "Rumah Sakit — Unit IT / SIMRS";

const PRIORITY_LABEL: Record<string, string> = {
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
  urgent: "Mendesak",
};

function formatDate(iso?: string) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatDateTime(iso?: string) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Deskripsi tiket disimpan sebagai HTML dari rich text editor (TipTap).
// Untuk dokumen cetak, HTML harus tetap dirender — bukan di-strip — supaya
// gambar dan daftar bernomor ikut tercetak. Yang dibuang hanya tag berbahaya
// (script/style/iframe) dan atribut event handler, karena isi ini berasal
// dari input user dan dirender lewat dangerouslySetInnerHTML.
function sanitizeHtml(html: string) {
  if (!html) return "";
  return html
    // Tag yang tidak boleh ada di dokumen cetak.
    .replace(/<(script|style|iframe|object|embed|link|meta)[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|style|iframe|object|embed|link|meta)[^>]*\/?>/gi, "")
    // Atribut event handler (onclick, onerror, ...) dan javascript: URL.
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
}

// Gambar dari editor disimpan dengan URL absolut ke API (http://host/uploads/x.png).
// Kalau suatu saat URL-nya relatif, ubah ke absolut supaya browser cetak
// bisa mengambilnya. Pakai fileUrl() agar konsisten dengan helper di api.ts.
function absolutizeImages(html: string) {
  return html.replace(
    /(<img[^>]+src=["'])(\/uploads\/[^"']+)(["'])/gi,
    (_m, pre, path, post) => `${pre}${fileUrl(path)}${post}`
  );
}

function printReadyHtml(html: string) {
  return absolutizeImages(sanitizeHtml(html));
}

// Cetak setelah semua gambar selesai dimuat. window.print() yang dipanggil
// sebelum <img> selesai loading menghasilkan dokumen tanpa gambar (atau
// halaman kosong), jadi tunggu dulu dengan batas waktu supaya tidak menggantung.
async function printWhenImagesReady() {
  const images = Array.from(document.querySelectorAll<HTMLImageElement>("main img"));
  await Promise.all(
    images.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
            setTimeout(resolve, 4000);
          })
    )
  );
  // Beri satu frame supaya layout hasil decode gambar ikut terhitung.
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  window.print();
}

export default function TicketPrintPage() {
  const params = useParams();
  const ticketId = params.id as string;
  const router = useRouter();
  const { user, token, isLoading } = useAuth();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<TicketComment[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoading && !user) router.push("/login");
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!token) return;
    getTicket(token, ticketId)
      .then(setTicket)
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Gagal memuat tiket")
      );
    listComments(token, ticketId)
      .then(setComments)
      .catch(() => {});
  }, [token, ticketId]);

  if (isLoading || !ticket) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-text-muted">
          {error || "Memuat dokumen..."}
        </p>
      </main>
    );
  }

  const resolveNote = comments.find((c) => c.comment_type === "resolve_note");
  const reopenNotes = comments.filter((c) => c.comment_type === "reopen_note");

  return (
    <div className="min-h-screen bg-white text-black print:bg-white">
      {/* Toolbar — tidak ikut tercetak */}
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-neutral-200 bg-neutral-50 px-6 py-3">
        <button
          onClick={printWhenImagesReady}
          className="rounded-md bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
        >
          Cetak / Simpan PDF
        </button>
        <Link
          href={`/tickets/${ticket.id}`}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
        >
          ← Kembali ke Tiket
        </Link>
        {ticket.status !== "closed" && (
          <span className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
            Tiket belum selesai — dokumen ini belum final.
          </span>
        )}
      </div>

      <main className="mx-auto max-w-[210mm] px-8 py-10 print:px-0 print:py-0">
        {/* Kop dokumen */}
        <div className="mb-6 border-b-2 border-black pb-4 text-center">
          <h1 className="text-base font-bold uppercase tracking-wide">
            Berita Acara Serah-Terima Penyelesaian Tiket IT
          </h1>
          <p className="mt-1 text-sm">{INSTITUTION_NAME}</p>
        </div>

        <p className="mb-5 text-sm leading-relaxed">
          Pada hari ini, <strong>{formatDate(ticket.closed_at || ticket.created_at)}</strong>,
          telah diselesaikan pekerjaan penanganan gangguan IT sebagaimana tercatat
          pada tiket di bawah ini. Pihak pelapor menyatakan bahwa pekerjaan
          tersebut <strong>telah dilaksanakan dan sesuai</strong> dengan kebutuhan
          yang diajukan.
        </p>

        {/* Identitas tiket */}
        <table className="mb-6 w-full border-collapse text-sm">
          <tbody>
            <tr>
              <td className="w-[38%] border border-neutral-300 px-3 py-2 font-semibold">
                Nomor Tiket
              </td>
              <td className="border border-neutral-300 px-3 py-2 font-[family-name:var(--font-display)]">
                {ticket.ticket_code || ticket.id}
              </td>
            </tr>
            <tr>
              <td className="border border-neutral-300 px-3 py-2 font-semibold">
                Judul Pekerjaan
              </td>
              <td className="border border-neutral-300 px-3 py-2">{ticket.title}</td>
            </tr>
            <tr>
              <td className="border border-neutral-300 px-3 py-2 font-semibold">
                Prioritas / Status
              </td>
              <td className="border border-neutral-300 px-3 py-2">
                {PRIORITY_LABEL[ticket.priority]} · {STATUS_LABEL[ticket.status]}
              </td>
            </tr>
            <tr>
              <td className="border border-neutral-300 px-3 py-2 font-semibold">
                Pelapor
              </td>
              <td className="border border-neutral-300 px-3 py-2">
                {ticket.created_by_name || "-"}
                {ticket.created_for_name ? ` (untuk: ${ticket.created_for_name})` : ""}
              </td>
            </tr>
            <tr>
              <td className="border border-neutral-300 px-3 py-2 font-semibold">
                Dikerjakan Oleh
              </td>
              <td className="border border-neutral-300 px-3 py-2">
                {ticket.claimed_by_name || ticket.assigned_to_name || "-"}
              </td>
            </tr>
            <tr>
              <td className="border border-neutral-300 px-3 py-2 font-semibold">
                Tanggal Dilaporkan
              </td>
              <td className="border border-neutral-300 px-3 py-2">
                {formatDateTime(ticket.created_at)}
              </td>
            </tr>
            <tr>
              <td className="border border-neutral-300 px-3 py-2 font-semibold">
                Tanggal Selesai (Close)
              </td>
              <td className="border border-neutral-300 px-3 py-2">
                {formatDateTime(ticket.closed_at)}
              </td>
            </tr>
            <tr>
              <td className="border border-neutral-300 px-3 py-2 font-semibold">
                Ditutup Oleh
              </td>
              <td className="border border-neutral-300 px-3 py-2">
                {ticket.closed_by_name || "-"}
              </td>
            </tr>
          </tbody>
        </table>

        {/* Uraian masalah — dirender sebagai HTML supaya gambar dari editor
            ikut tercetak. Gambar dipaksa muat lebar kertas dan tidak
            terpotong antar halaman. */}
        <section className="mb-5">
          <h2 className="mb-1.5 text-sm font-bold uppercase tracking-wide">
            Uraian Permintaan / Gangguan
          </h2>
          <div
            className="print-rich border border-neutral-300 px-3 py-2 text-sm leading-relaxed"
            dangerouslySetInnerHTML={{
              __html: printReadyHtml(ticket.description) || "-",
            }}
          />
        </section>

        {/* Penyelesaian */}
        <section className="mb-5">
          <h2 className="mb-1.5 text-sm font-bold uppercase tracking-wide">
            Uraian Penyelesaian
          </h2>
          <div
            className="print-rich border border-neutral-300 px-3 py-2 text-sm leading-relaxed"
            dangerouslySetInnerHTML={{
              __html: printReadyHtml(resolveNote?.message || "") || "-",
            }}
          />
          {resolveNote && resolveNote.attachments && resolveNote.attachments.length > 0 && (
            <p className="mt-1 text-xs text-neutral-600">
              Lampiran bukti pekerjaan: {resolveNote.attachments.length} file
              (tersimpan di sistem, tidak dicetak).
            </p>
          )}
        </section>

        {reopenNotes.length > 0 && (
          <section className="mb-5">
            <h2 className="mb-1.5 text-sm font-bold uppercase tracking-wide">
              Catatan Reopen
            </h2>
            <ul className="list-disc border border-neutral-300 px-8 py-2 text-sm leading-relaxed">
              {reopenNotes.map((c) => (
                <li key={c.id} className="mb-1">
                  <span className="font-semibold">{formatDateTime(c.created_at)}</span>
                  {" — "}
                  <span
                    className="print-rich"
                    dangerouslySetInnerHTML={{
                      __html: printReadyHtml(c.message),
                    }}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mb-8 text-sm leading-relaxed">
          Demikian berita acara ini dibuat dengan sebenarnya, untuk dipergunakan
          sebagaimana mestinya. Dengan menandatangani dokumen ini, pelapor
          menyatakan <strong>tidak memiliki keberatan</strong> atas hasil
          pekerjaan dan menyetujui tiket ditutup.
        </p>

        {/* Area tanda tangan */}
        <div className="mt-10 grid grid-cols-2 gap-10 text-center text-sm">
          <div>
            <p className="mb-20">Pelapor / Penerima Pekerjaan</p>
            <p className="border-t border-black pt-1 font-semibold">
              {ticket.created_for_name || ticket.created_by_name || "(...........................)"}
            </p>
            <p className="text-xs text-neutral-600">Nama jelas &amp; tanda tangan</p>
          </div>
          <div>
            <p className="mb-20">Teknisi / Pelaksana</p>
            <p className="border-t border-black pt-1 font-semibold">
              {ticket.claimed_by_name || ticket.assigned_to_name || "(...........................)"}
            </p>
            <p className="text-xs text-neutral-600">Nama jelas &amp; tanda tangan</p>
          </div>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-10 text-center text-sm">
          <div>
            <p className="mb-20">Mengetahui, Koordinator IT</p>
            <p className="border-t border-black pt-1 font-semibold">
              (...........................)
            </p>
          </div>
          <div>
            <p className="mb-20">Tanggal Tanda Tangan</p>
            <p className="border-t border-black pt-1 font-semibold">
              ........ / ........ / ............
            </p>
          </div>
        </div>

        <p className="mt-10 border-t border-neutral-300 pt-2 text-[10px] leading-relaxed text-neutral-500">
          Dokumen ini dicetak dari sistem pada{" "}
          {new Date().toLocaleString("id-ID")}. Setelah ditandatangani, scan
          dokumen wajib diunggah kembali ke tiket {ticket.id} melalui menu
          &quot;Bukti Serah-Terima&quot; agar menjadi bukti resmi yang tersimpan.
        </p>
      </main>
    </div>
  );
}
