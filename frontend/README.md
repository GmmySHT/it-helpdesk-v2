# Frontend — IT Helpdesk & Asset Management

Next.js 16 (App Router) + React 19 + Tailwind CSS v4 + lucide-react.
Konsumen API dari backend Go di `../backend` (`/api/v1`), plus WebSocket `/ws`.

## Menjalankan (development)

```bash
npm install
npm run dev          # http://localhost:3000
```

Buat `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8080/api/v1
# opsional — kop dokumen cetak (BAST & Laporan KPI)
NEXT_PUBLIC_INSTITUTION_NAME=Nama Instansi — Unit IT
```

Backend harus hidup di `:8080` dan database sudah dimigrasi (`cd ../backend && ./bin/migrate.exe`).

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Dev server (HMR) |
| `npm run build` | Build production |
| `npm start` | Jalankan hasil build |
| `npx tsc --noEmit` | Type-check tanpa build |

> Jangan jalankan `npm run build` saat `npm run dev` masih hidup — keduanya memakai folder `.next` yang sama, dev server akan menyajikan bundle basi.

## Struktur

```
src/
├── app/
│   ├── login/                 # Halaman login
│   ├── dashboard/             # Ringkasan per role
│   ├── tickets/               # Daftar, detail, buat tiket
│   │   └── [id]/print/        # Dokumen BAST siap cetak
│   ├── daily-tasks/           # Pencatatan daily task staf
│   ├── asset/                 # Inventaris, peminjaman, disposal
│   ├── reports/               # Laporan & KPI
│   │   └── kpi/               # Dashboard KPI + /print (dokumen)
│   ├── monitoring/            # Dashboard SIMRS
│   ├── pharmacy/              # Modul farmasi
│   └── admin/                 # Manajemen user & akses
├── components/                # Sidebar, PageHeader, SignoffPanel, dsb.
└── lib/                       # api.ts (client), auth context
```

## Halaman khusus cetak

| URL | Isi |
|---|---|
| `/tickets/{id}/print` | BAST — hanya tiket `closed`; role `user` tidak melihat tombol cetak |
| `/reports/kpi/print?from=&to=&staff_id=` | Laporan Kinerja staf: kop, ringkasan, rincian tiket + daily task, blok tanda tangan |

Keduanya memakai `window.print()` dan aturan `@media print` di `src/app/globals.css` (sidebar & toolbar disembunyikan, latar putih).

## Catatan UI

- Dialog konfirmasi memakai komponen sendiri — **jangan** pakai `confirm()` bawaan browser.
- Tema gelap/terang + animated background (`aurora`/`particle`) diatur di `src/app/layout.tsx` dan `globals.css`.
- Layout memakai `h-screen overflow-hidden` pada shell; hanya `<main>` yang menggulir, dengan kelas `.slim-scroll`.
- Ikon dari `lucide-react`; emoji hanya sebagai fallback ikon sidebar.

## Dokumen terkait

- [`../README.md`](../README.md) — gambaran proyek & endpoint API
- [`../MANUAL_BOOK.md`](../MANUAL_BOOK.md) — panduan penggunaan per role
- [`../backend/DEPLOY.md`](../backend/DEPLOY.md) — deploy production

---

*Didesain dan dibangun oleh Firaz Faruq — firaz.faruq@gmail.com*
