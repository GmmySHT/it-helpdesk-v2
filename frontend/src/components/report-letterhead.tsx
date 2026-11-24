"use client";

/**
 * Kop surat formal untuk dokumen cetak (KPI, BAST, persetujuan analisa).
 *
 * Layout: logo kiri, identitas instansi di tengah, garis ganda di bawah.
 * Gambar logo memakai <img> biasa (bukan next/image) supaya ikut tercetak
 * di window.print()/CDP tanpa perlu konfigurasi loader gambar lokal.
 */
import { INSTITUTION_NAME } from "@/lib/institution";

type ReportLetterheadProps = {
  title: string;
  address?: string;
  contact?: string;
  logo?: string;
  className?: string;
};

export default function ReportLetterhead({
  title,
  address,
  contact,
  logo = "/images/logorsih.png",
  className = "",
}: ReportLetterheadProps) {
  return (
    <div className={`report-letterhead ${className}`}>
      <div className="report-letterhead-row">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="Logo instansi" className="report-letterhead-logo" />
        <div className="report-letterhead-identity">
          <h1 className="report-letterhead-title">{title}</h1>
          <p className="report-letterhead-institution">{INSTITUTION_NAME}</p>
          {address && <p className="report-letterhead-meta">{address}</p>}
          {contact && <p className="report-letterhead-meta">{contact}</p>}
        </div>
      </div>
      <div className="report-letterhead-rule" />
      <div className="report-letterhead-rule thin" />
    </div>
  );
}
