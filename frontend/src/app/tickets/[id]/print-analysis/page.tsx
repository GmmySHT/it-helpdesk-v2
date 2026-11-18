"use client";

/**
 * Halaman cetak FORM PENYETUJUAN ANALISA / CATATAN staf IT.
 *
 * Sengaja terpisah dari aplikasi (tanpa Sidebar, bg-white): tujuannya jadi
 * dokumen kertas. Alurnya:
 *   1. Staf mengisi Analisa di halaman detail tiket, lalu buka halaman ini.
 *   2. Cetak → pelapor tanda tangan basah.
 *   3. Scan diunggah kembali lewat panel "Persetujuan Analisa" di detail tiket.
 *   4. Gate Claim hanya membuka tiket bila scan bertanda tangan sudah ada.
 *
 * Nomor dokumen direservasi dari backend supaya identik dengan nomor scan.
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
  Ticket,
  Category,
  getTicket,
  getDocumentNumber,
  listCategories,
  listCoordinators,
  fileUrl,
} from "@/lib/api";

const INSTITUTION_NAME =
  process.env.NEXT_PUBLIC_INSTITUTION_NAME ||
  "Rumah Sakit — Unit IT / SIMRS";

const STATUS_LABEL: Record<string, string> = {
  pending_approval: "Menunggu Persetujuan",
  unassigned: "Belum Ditugaskan",
  assigned: "Menunggu Diklaim",
  claimed: "Sedang Dikerjakan",
  resolved: "Menunggu Review",
  closed: "Selesai",
};

const PRIORITY_LABEL: Record<string, string> = {
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
  urgent: "Mendesak",
};

function formatDate(iso?: string) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit", month: "long", year: "numeric",
  });
}

function formatDateTime(iso?: string) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit", month: "long", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function sanitizeHtml(html: string) {
  if (!html) return "";
  return html
    .replace(/<(script|style|iframe|object|embed|link|meta)[\s\S]*?<\/\1>/gi, "")
    .replace(/<(script|style|iframe|object|embed|link|meta)[^>]*\/?>/gi, "")
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
}

function absolutizeImages(html: string) {
  return html.replace(
    /(<img[^>]+src=["'])(\/uploads\/[^"']+)(["'])/gi,
    (_m, pre, path, post) => `${pre}${fileUrl(path)}${post}`
  );
}

function printReadyHtml(html: string) {
  return absolutizeImages(sanitizeHtml(html));
}

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
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  window.print();
}

export default function TicketAnalysisPrintPage() {
  const params = useParams();
  const ticketId = params.id as string;
  const router = useRouter();
  const { user, token, isLoading } = useAuth();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [docNumber, setDocNumber] = useState("");
  const [coordinatorName, setCoordinatorName] = useState("");
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
    listCategories(token).then((d) => setCategories(d || [])).catch(() => {});
    // Koordinator IT / Leader IT dibaca dari role leader di sistem.
    listCoordinators(token)
      .then((users) => setCoordinatorName(users?.[0]?.name || ""))
      .catch(() => setCoordinatorName(""));
    getDocumentNumber(token, ticketId, "analysis")
      .then((res) => setDocNumber(res.doc_number))
      .catch(() => setDocNumber("PA-....-...."));
  }, [token, ticketId]);

  if (isLoading || !ticket) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-text-muted">{error || "Memuat dokumen..."}</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-white text-black print:bg-white">
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
        {ticket.status === "closed" && (
          <span className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
            Tiket sudah selesai — dokumen ini bersifat arsip.
          </span>
        )}
      </div>

      <main className="mx-auto max-w-[210mm] px-8 py-10 print:px-0 print:py-0">
        <div className="mb-6 border-b-2 border-black pb-4 text-center">
          <h1 className="text-base font-bold uppercase tracking-wide">
            Formulir Persetujuan Analisa / Catatan Staf IT
          </h1>
          <p className="mt-1 text-sm">{INSTITUTION_NAME}</p>
        </div>

        <div className="mb-5 flex justify-between text-xs">
          <span><strong>Nomor Dokumen:</strong> {docNumber}</span>
          <span><strong>Tanggal Cetak:</strong> {formatDate(new Date().toISOString())}</span>
        </div>

        <p className="mb-5 text-sm leading-relaxed">
          Pada hari ini, <strong>{formatDate(new Date().toISOString())}</strong>,
          staf IT mengajukan hasil analisa / catatan penanganan gangguan pada
          tiket di bawah ini untuk mendapatkan persetujuan tertulis dari pelapor.
          Dengan menandatangani dokumen ini, pelapor menyatakan telah membaca,
          memahami, dan <strong>menyetujui analisa serta rencana penanganan</strong>{" "}
          yang diuraikan, sehingga pekerjaan dapat dilanjutkan.
        </p>

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
              <td className="border border-neutral-300 px-3 py-2 font-semibold">Judul Tiket</td>
              <td className="border border-neutral-300 px-3 py-2">{ticket.title}</td>
            </tr>
            <tr>
              <td className="border border-neutral-300 px-3 py-2 font-semibold">Kategori</td>
              <td className="border border-neutral-300 px-3 py-2">{categories.find((c) => c.id === ticket.category_id)?.name || "-"}</td>
            </tr>
            <tr>
              <td className="border border-neutral-300 px-3 py-2 font-semibold">Prioritas / Status</td>
              <td className="border border-neutral-300 px-3 py-2">
                {PRIORITY_LABEL[ticket.priority] || ticket.priority} ·{" "}
                {STATUS_LABEL[ticket.status] || ticket.status}
              </td>
            </tr>
            <tr>
              <td className="border border-neutral-300 px-3 py-2 font-semibold">Nama Pelapor</td>
              <td className="border border-neutral-300 px-3 py-2">
                {ticket.created_by_name || "-"}
              </td>
            </tr>
            <tr>
              <td className="border border-neutral-300 px-3 py-2 font-semibold">Departemen / Unit</td>
              <td className="border border-neutral-300 px-3 py-2">
                {ticket.created_for_name || "-"}
              </td>
            </tr>
            <tr>
              <td className="border border-neutral-300 px-3 py-2 font-semibold">Tanggal Diajukan</td>
              <td className="border border-neutral-300 px-3 py-2">
                {formatDateTime(ticket.created_at)}
              </td>
            </tr>
            <tr>
              <td className="border border-neutral-300 px-3 py-2 font-semibold">
                Staf IT Penanggung Jawab
              </td>
              <td className="border border-neutral-300 px-3 py-2">
                {ticket.claimed_by_name || ticket.assigned_to_name || "-"}
              </td>
            </tr>
          </tbody>
        </table>

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

        <section className="mb-5">
          <h2 className="mb-1.5 text-sm font-bold uppercase tracking-wide">
            Analisa / Catatan Staf IT
          </h2>
          <div className="min-h-[90px] border border-neutral-300 px-3 py-2 text-sm leading-relaxed">
            {ticket.analysis_notes ? (
              <div
                className="print-rich"
                dangerouslySetInnerHTML={{ __html: printReadyHtml(ticket.analysis_notes) }}
              />
            ) : (
              <span className="text-neutral-500">
                (Belum ada analisa. Isi terlebih dahulu di halaman detail tiket.)
              </span>
            )}
          </div>
          <p className="mt-2 text-right text-sm">
            <span className="font-semibold">Dianalisa Oleh: </span>
            {ticket.analysis_by_name || "-"}
          </p>
        </section>

        <section className="mb-5">
          <h2 className="mb-1.5 text-sm font-bold uppercase tracking-wide">
            Daftar Pihak Yang Menyetujui
          </h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-neutral-100">
                <th className="border border-neutral-300 px-3 py-2 text-left">Peran</th>
                <th className="border border-neutral-300 px-3 py-2 text-left">Nama</th>
                <th className="border border-neutral-300 px-3 py-2 text-left">Keterangan</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-neutral-300 px-3 py-2">Pemohon</td>
                <td className="border border-neutral-300 px-3 py-2">........................</td>
                <td className="border border-neutral-300 px-3 py-2">Menyetujui analisa (boleh diwakili)</td>
              </tr>
              <tr>
                <td className="border border-neutral-300 px-3 py-2">Analyst</td>
                <td className="border border-neutral-300 px-3 py-2">
                  {ticket.analysis_by_name || "-"}
                </td>
                <td className="border border-neutral-300 px-3 py-2">Menyampaikan analisa</td>
              </tr>
              <tr>
                <td className="border border-neutral-300 px-3 py-2">Koordinator IT</td>
                <td className="border border-neutral-300 px-3 py-2">{coordinatorName || "-"}</td>
                <td className="border border-neutral-300 px-3 py-2">Mengetahui</td>
              </tr>
            </tbody>
          </table>
        </section>

        <p className="mb-8 text-sm leading-relaxed">
          Demikian formulir ini dibuat untuk dipergunakan sebagaimana mestinya.
          Tanda tangan basah pada dokumen ini menjadi bukti persetujuan analisa,
          dan scan/foto dokumen wajib diunggah kembali ke sistem sebelum tiket
          dapat diklaim untuk dikerjakan.
        </p>

        {/* Tiga kolom tanda tangan: Pelapor/Pengrequest, Analyst, Koordinator IT. */}
        <div className="mt-10 grid grid-cols-3 gap-8 text-center text-sm">
          <div>
            <p className="mb-20">Pemohon</p>
            <p className="border-t border-black pt-1 font-semibold">
              ...........................
            </p>
            <p className="text-xs text-neutral-600">Nama jelas &amp; tanda tangan</p>
          </div>
          <div>
            <p className="mb-20">Analyst</p>
            <p className="border-t border-black pt-1 font-semibold">
              {ticket.analysis_by_name || "..........................."}
            </p>
            <p className="text-xs text-neutral-600">Nama jelas &amp; tanda tangan</p>
          </div>
          <div>
            <p className="mb-20">Mengetahui, Koordinator IT</p>
            <p className="border-t border-black pt-1 font-semibold">
              {coordinatorName || "..........................."}
            </p>
            <p className="text-xs text-neutral-600">Nama jelas &amp; tanda tangan</p>
          </div>
        </div>

        <div className="mt-8 text-center text-sm">
          <p className="mb-2">Tanggal Tanda Tangan</p>
          <p className="font-semibold">........ / ........ / ............</p>
        </div>

        <p className="mt-10 border-t border-neutral-300 pt-2 text-[10px] leading-relaxed text-neutral-500">
          Dokumen ini dicetak dari sistem pada {new Date().toLocaleString("id-ID")}.
          Nomor dokumen: {docNumber}. Setelah ditandatangani, scan wajib
          diunggah kembali ke tiket {ticket.ticket_code || ticket.id} melalui
          menu &quot;Persetujuan Analisa&quot; agar menjadi bukti resmi.
        </p>
      </main>
    </div>
  );
}
