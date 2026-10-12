# Database Seeds

Folder ini berisi file SQL seed untuk data sample transaksi (bukan master data).

## File Seeds

- `seed_sample_tickets.sql` - Contoh data tiket dengan berbagai status dan prioritas
- `seed_sample_asset_borrowings.sql` - Contoh data peminjaman aset dengan berbagai status

## Cara Menggunakan

### 1. Pastikan migrasi sudah berjalan
```bash
cd backend
./bin/migrate.exe up
```

### 2. Dapatkan UUID user yang valid
```sql
-- Login ke PostgreSQL
psql -U ticketing_user -d ticketing_it

-- Lihat daftar user
SELECT id, name, email, role FROM users;
```

### 3. Edit file seed
- Buka file `seed_sample_tickets.sql` atau `seed_sample_asset_borrowings.sql`
- Ganti UUID placeholder `00000000-0000-0000-0000-000000000001` dengan UUID user yang valid
- Ganti `asset_id` dengan ID aset yang sudah ada di database

### 4. Jalankan seed
```bash
# Dari folder backend
psql -U ticketing_user -d ticketing_it -f seeds/seed_sample_tickets.sql
psql -U ticketing_user -d ticketing_it -f seeds/seed_sample_asset_borrowings.sql
```

## Catatan

- Seed ini **tidak otomatis** jalan saat migrasi
- Hanya untuk development/testing, **jangan jalankan di production** yang sudah ada data real
- Sesuaikan timestamp dan UUID sesuai kebutuhan
- Master data (categories, SLA, modules, asset_categories) sudah di-seed otomatis lewat migrasi

## Status yang Tersedia

### Tickets
- `open` - Tiket baru belum di-assign
- `pending_approval` - Tiket dibuat leader untuk user lain, butuh approval
- `in_progress` - Sedang dikerjakan staff IT
- `resolved` - Sudah selesai diperbaiki
- `closed` - Ditutup setelah konfirmasi user

### Asset Borrowings
- `pending_approval` - Menunggu persetujuan leader/admin
- `approved` - Disetujui, belum diserahkan
- `borrowed` - Sedang dipinjam
- `returned` - Sudah dikembalikan
- `overdue` - Terlambat pengembalian
- `rejected` - Ditolak oleh leader/admin
- `cancelled` - Dibatalkan oleh peminjam

## Priority Tiket
- `low` - Tidak mendesak
- `medium` - Standar
- `high` - Penting
- `urgent` - Sangat mendesak

## Return Condition
- `good` - Baik
- `fair` - Cukup baik
- `damaged` - Rusak
