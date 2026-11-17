# IT Helpdesk & Asset Management System

> **Karya:** Firaz Faruq — firaz.faruq@gmail.com
> **Hak Cipta © 2026 Firaz Faruq. Seluruh hak dilindungi.**

Sistem helpdesk IT internal dan manajemen aset berbasis web yang dirancang, diarsitektur, dan dibangun sepenuhnya oleh **Firaz Faruq** sebagai proyek pribadi. Ide, desain UI/UX, arsitektur sistem, skema database, dan seluruh implementasi kode merupakan hasil karya orisinal penulis.

---

## Tech Stack

| Layer | Teknologi |
|---|---|
| Frontend | Next.js 16 (App Router) + React 19 + Tailwind CSS v4 |
| Backend | Go 1.22 + Chi Router |
| Database | PostgreSQL (pgx/v5) |
| Auth | Custom JWT |
| Realtime | WebSocket (Gorilla) |
| Deploy | Docker Compose |

## Fitur Utama

- 🎫 **Ticketing System** — alur tiket lengkap dengan approval, klaim, resolve, review
- 🔢 **Kode Tiket per Kategori** — nomor otomatis berprefix (`SIMRS-00019`, `NTWRK-00029`), aman dari bentrok saat dibuat bersamaan
- 🖨️ **BAST (Berita Acara Serah-Terima)** — cetak dokumen serah-terima untuk tiket `closed`, pelapor tanda tangan, scan hasilnya diunggah kembali sebagai bukti
- 📋 **Daily Task** — catatan pekerjaan harian staf di luar tiket (kendala dari WhatsApp), lengkap dengan durasi & response time otomatis
- 📦 **Asset Management** — inventaris aset, peminjaman, disposal
- 📊 **Laporan & KPI** — performa tim, SLA, tren, KPI gabungan tiket + daily task, unduhan CSV, dan dokumen cetak per staf
- 🔒 **KPI Sesuai Role** — staf IT hanya melihat KPI dirinya, leader/admin melihat semua staf dan bisa memilih staf
- 📡 **Monitoring SIMRS** — dashboard pendapatan & kunjungan pasien real-time
- 🔑 **Profil & Kata Sandi** — user ganti password sendiri (verifikasi password lama), leader/admin reset password akun lain sesuai hierarki role; sesi lama otomatis berakhir
- 🔐 **RBAC** — hak akses per role dan per user, bisa diubah tanpa redeploy
- 🔔 **Notifikasi Real-time** — WebSocket push ke semua user terkait
- 🎨 **Dark/Light Mode** — tema elegan dengan animated background

## Struktur Proyek

```
ticketing-it/
├── frontend/          # Next.js App Router
│   └── src/
│       ├── app/       # Pages (tickets, asset, daily-tasks, reports, monitoring, admin, ...)
│       ├── components/# Shared components (Sidebar, PageHeader, SignoffPanel, ...)
│       └── lib/       # API client, auth context
├── backend/           # Go REST API
│   ├── cmd/api/       # Entry point
│   ├── internal/
│   │   ├── handler/   # HTTP handlers
│   │   ├── service/   # Business logic
│   │   ├── repository/# Database layer
│   │   ├── model/     # Data models
│   │   ├── middleware/ # Auth, RBAC, rate limit
│   │   └── router/    # Route definitions
│   └── migrations/    # 35 database migrations
└── docker-compose.yml
```

## Menjalankan Proyek

```bash
# 1. Database
docker compose up -d postgres

# 2. Migrasi (35 file, aman diulang)
cd backend && ./bin/migrate.exe

# 3. Backend  → http://localhost:8080
./bin/api.exe

# 4. Frontend → http://localhost:3000
cd ../frontend && npm run dev
```

Butuh `backend/.env` (lihat `backend/.env.example`): `DATABASE_URL`, `JWT_SECRET`, `CORS_ALLOWED_ORIGINS`, opsional `SIMRS_DATABASE_URL`.

## Halaman Cetak

| Halaman | URL | Keterangan |
|---|---|---|
| BAST tiket | `/tickets/{id}/print` | Hanya untuk tiket `closed`; tombol cetak tidak muncul untuk role `user` |
| Laporan KPI staf | `/reports/kpi/print` | Kop laporan, identitas staf, ringkasan, rincian tiket + daily task; `window.print()` → PDF |

## Endpoint Laporan & KPI

Semua menerima `?from=YYYY-MM-DD&to=YYYY-MM-DD`. Endpoint ber-`staff_id` **dipaksa ke user yang login** bila role = `staff_it`.

| Endpoint | Fungsi |
|---|---|
| `GET /api/v1/reports/kpi` | Ringkasan KPI tiket (total, selesai, SLA, reopen) |
| `GET /api/v1/reports/trend` | Tren tiket masuk/selesai per periode |
| `GET /api/v1/reports/priority-breakdown` | Distribusi prioritas |
| `GET /api/v1/reports/category-breakdown` | Distribusi kategori |
| `GET /api/v1/reports/staff-performance` | Performa per staf |
| `GET /api/v1/reports/asset-borrowing-stats` | Statistik peminjaman aset per periode |
| `GET /api/v1/reports/kpi/staff` | KPI gabungan tiket + daily task per staf |
| `GET /api/v1/reports/kpi/detail` | Rincian baris tiket & daily task untuk dokumen cetak |
| `GET /api/v1/reports/kpi/export` | Unduh CSV (BOM UTF-8, aman dibuka di Excel) |
| `GET/POST/PUT/DELETE /api/v1/daily-tasks` | CRUD daily task (staf ke atas) |
| `GET /api/v1/units` | Daftar unit untuk dropdown daily task |

## Lihat Juga

- [Manual Book Lengkap](./MANUAL_BOOK.md) — panduan penggunaan per role
- [Panduan Deploy Production](./backend/DEPLOY.md) — Caddy, NSSM service, backup, checklist uji
- `backend/.env.example` — daftar environment variable
- `frontend/env.production.example` — `NEXT_PUBLIC_API_URL`, opsional `NEXT_PUBLIC_INSTITUTION_NAME` (kop BAST & laporan KPI)

---

*Didesain dan dibangun oleh Firaz Faruq — firaz.faruq@gmail.com*
