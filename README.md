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
- 📦 **Asset Management** — inventaris aset, peminjaman, disposal
- 📊 **Laporan & KPI** — performa tim, SLA, tren
- 📡 **Monitoring SIMRS** — dashboard pendapatan & kunjungan pasien real-time
- 🔐 **RBAC** — hak akses per role dan per user, bisa diubah tanpa redeploy
- 🔔 **Notifikasi Real-time** — WebSocket push ke semua user terkait
- 🎨 **Dark/Light Mode** — tema elegan dengan animated background

## Struktur Proyek

```
ticketing-it/
├── frontend/          # Next.js App Router
│   └── src/
│       ├── app/       # Pages (tickets, asset, monitoring, admin, ...)
│       ├── components/# Shared components (Sidebar, PageHeader, ...)
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
│   └── migrations/    # 30 database migrations
└── docker-compose.yml
```

## Lihat Juga

- [Manual Book Lengkap](./MANUAL_BOOK.md) — panduan penggunaan per role

---

*Didesain dan dibangun oleh Firaz Faruq — firaz.faruq@gmail.com*
