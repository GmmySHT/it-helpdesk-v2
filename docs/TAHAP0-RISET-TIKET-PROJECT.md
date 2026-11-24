# TAHAP 0 — RISET: Tiket Tipe "Project"

Status: **riset selesai, belum ada kode/DB yang diubah**. Menunggu konfirmasi sebelum Tahap 1.

Sumber: `C:/laragon/www/ticketing-it` (backend `internal/*`, `migrations/*.up.sql`, frontend `src/*`).

---

## 1. Semua tempat yang mengasumsikan SATU penangan tiket

Berada di `backend/internal/service/ticket_service.go`:

| Fungsi | Baris | Asumsi single-handler |
|---|---|---|
| `Create` | 103–233 | `created_by` satu orang, `assigned_to` satu UUID, SLA dihitung dari kategori+prioritas |
| `Claim` | 260–374 | `claimed_by` satu staf; gate analisa; notif "tiket sudah diklaim staf lain" ke staf lain |
| `Resolve` | 376–457 | `WHERE id=$1 AND status='claimed' AND claimed_by=$2` — hanya si pengklaim boleh resolve |
| `Close` | 459–481 | `role` supervisor; notif ke `created_by` |
| `Reopen` | 549–632 | `claimed_by` tidak berubah; SLA baru; `reopen_count+1` |
| `Reassign` | 634–722 | `claimed_by` dipindah ke staf baru; SLA baru |
| `Approve` / `Reject` | 724–865 | keputusan tunggal oleh leader/admin |
| `CheckSLAReminders` | 867–951 | one `claimed_by`/assignee per tiket |
| `UpdateDeadline` | 953–1010 | leader ubah `sla_deadline` tiket |
| `UpdateAnalysis` | 522–547 | actor analisa tunggal `analysis_by` |

Model & tabel terkait:
- `backend/internal/model/ticket.go` — field `AssignedTo`, `ClaimedBy`, `ClosedBy`, `AnalysisBy` bertipe `uuid` opsional, bukan array.
- `backend/migrations/000004_create_tickets_table.up.sql` — `assigned_to`, `claimed_by`, `closed_by` semua FK ke `users(id)` tunggal; `sla_deadline`, `reopen_count`.
- `claim_type` enum hanya `'assigned' | 'self_claimed'` — tidak ada konsep tim.
- `ticket_code_counters` per kategori, satu kode per tiket — masih bisa dipakai project.
- `backend/internal/repository/ticket_repository.go:98` — `ticketListSelect` mengambil satu `assignee.name`, `claimer.name`, `analysis_by_name` via LEFT JOIN.

Kesimpulan: konsep "satu PIC + banyak anggota" benar-benar baru. PIC **jangan** ditaruh ke `assigned_to`/`claimed_by` tanpa guard, karena 10 fungsi di atas akan mengira PIC = satu-satunya pengerja.

---

## 2. Query statistik/KPI/dashboard/SLA yang perlu filter `ticket_type`

Semua query di bawah **bermatch `FROM tickets` / `JOIN tickets`** dan akan ikut menghitung project jika tidak difilter. Daftar lengkap 33 lokasi:

### `stats_repository.go` (18 query)
| Fungsi | Baris | Keterangan |
|---|---|---|
| `GetStaffPerformance` | 144 | leaderboard lama |
| `GetStaffPerformanceRange` | 194 | tabel performa + filter staf |
| `GetStaffPerformanceForUser` | 239 | performa personal |
| `CurrentWorkload` | 261 | jumlah tiket `claimed` |
| `CreatorTicketCounts` | 272 | jumlah tiket per status by creator |
| `GetDailyTrendRange` | 368–369 | `LEFT JOIN tickets t1/t2` — **filter di klausul ON, bukan WHERE** |
| `GetTrend` | 467 | tren N hari |
| `GetSummary` | 480, 541, 574, 577, 611 | ringkasan dashboard + SLA + trend + prioritas; beberapa join di `ON` |
| `GetKPIReport` | 651 | ekspor KPI |
| `GetTrendRange` | 574, 577 | tren periode |
| `GetPriorityBreakdown` | 603 | pie chart prioritas |
| `GetCategoryBreakdown` | 643 | pie chart kategori |
| `GetMyTrend` | 693–694 | tren personal — filter di `ON` |
| `GetMyPriorityBreakdown` | 721 | prioritas personal |
| `GetAssetBorrowingStats` | 54 | tidak relevan (tabel asset), dicek sekadar keragaman |

### `kpi_report_repository.go` (5 query)
| Fungsi | Baris | Keterangan |
|---|---|---|
| `GetStaffKPIReport` | 99, 112, 121 | `ticket_stats` (claimed), `analysis_stats` (analysis_by), `created_stats` (created_by) |
| `GetKPIOverview` | 217, 247, 265 | total tiket, avg resolution, tiket dianalisa |

### `kpi_detail_repository.go` (2 query)
| Fungsi | Baris | Keterangan |
|---|---|---|
| `GetStaffKPIDetail` | 94, 144 | rincian tiket dianalisa & detail KPI |

### `ticket_repository.go` (6 query)
| Fungsi | Baris | Keterangan |
|---|---|---|
| `ticketListSelect` | 98 | **semua daftar/detail tiket**, termasuk `has_signoff` |
| `FindByID` | 248 | detail tiket |
| `ListAtRisk` | 352 | widget "Tiket Berisiko" — **harus excl. project** |
| `ListSLACandidates` | 404 | **background job reminder SLA — harus excl. project** |
| `Close` | 466 | update status |
| (update lain) | 352, 404, 466 | — |

### `user_repository.go` (2 query)
| Baris | Keterangan |
|---|---|
| 164 | `SELECT t.created_by FROM tickets` — agregasi aktivitas user |
| 166 | `SELECT t.created_for FROM tickets` — agregasi pihak ditiketkan |

### Lainnya
- `rating_repository.go` — menyimpan `ratings.ticket_id`, **tidak** query `FROM tickets`; project sebaiknya tidak memakai endpoint rating (guard di handler).
- `frontend/src/lib/api.ts` — daftar tiket via `/tickets` memakai `ticketListSelect`; perlu filter `ticket_type=regular` atau project disembunyikan dari daftar reguler.
- Dashboard frontend lain yang hitung angka dari `/reports/*` otomatis mengikuti query backend.

**Pola filter**: `t.ticket_type = 'regular'` di `WHERE`, atau di klausul `ON` untuk `LEFT JOIN` (literal `'regular'` aman karena kolom `NOT NULL DEFAULT 'regular'`). `deleted_at IS NULL` sudah ada di sebagian besar query; pola penempatannya jadi panduan.

---

## 3. Struktur tabel & endpoint dokumen tiket

Tabel: `ticket_signoffs` (migrasi `000032`), kolom:
`id, ticket_id, file_url, file_name, file_type, file_size, signed_by_name, signed_at, note, uploaded_by, created_at`.

Migrasi `000038` menambah:
- `doc_type VARCHAR(20) NOT NULL DEFAULT 'bast'` — **bukan enum**, jadi nilai `'proposal'` bisa langsung dipakai tanpa `ALTER TYPE`.
- `doc_number VARCHAR(40)`, index `(ticket_id, doc_type, created_at DESC)`.
- `document_number_counters` + fungsi `next_document_number(prefix)` → `PROP-2026-0001` bisa langsung dipakai.
- Tabel `daily_task_attachments`, gate analisa (`categories.requires_analysis_approval`, `tickets.analysis_approval_required`), `analysis_notes`.

Migrasi `000039`: `ticket_document_numbers (ticket_id, doc_type, year_part, doc_number)` — nomor yang direservasi saat halaman cetak.

Jadi **doc_type 'proposal' tidak butuh migrasi enum**. Yang perlu ditambah:
- Kolom status/versi proposal — `ticket_signoffs` **belum punya** `status`, `version`, `approver_id`, `approved_at`. Bisa ditambah lewat migrasi baru (`ALTER TABLE ... ADD COLUMN`), atau tabel metadata proposal terpisah. Yang sudah disetujui tidak boleh diedit → perlu kolom `status` + validasi di handler.
- Status diajukan/disetujui/ditolak; revisi = versi baru (baris baru dengan `version+1`).

Handler `backend/internal/handler/signoff_handler.go`:
- `GET /tickets/{id}/signoffs?type=...` — validasi hardcode `if docType == "analysis" || docType == "bast"`, **perlu diperluas** ke `proposal`.
- `POST /tickets/{id}/signoffs` — validasi `doc_type harus 'analysis' atau 'bast'` di baris 77; **perlu diperluas**.
- `GET /tickets/{id}/document-number` — pakai `next_document_number()`.
- `DELETE /tickets/{id}/signoffs/{signoffId}` — hanya leader/admin.
- Upload pakai `saveValidatedDoc` (`backend/internal/handler/upload_security.go:57`) → PDF/image, max 15 MB/file, deteksi magic bytes, nama acak. **Bisa dipakai ulang tanpa ubah**.

Frontend `frontend/src/lib/api.ts:310`: `doc_type?: "analysis" | "bast"` — perlu `| "proposal"`.

Route: `backend/internal/router/router.go:309–312`, semuanya di grup dengan auth; akses dijaga `ensureAccess` di handler (bukan middleware modul).

---

## 4. Cara modul RBAC didaftarkan & dicek di frontend

**Backend pendaftaran:**
1. `modules` (migrasi `000013`) — baris `(code, name, description, is_active)`. Contoh penambahan modul baru ada di migrasi `000028`: `INSERT INTO modules ... ON CONFLICT (code) DO UPDATE SET is_active = true`.
2. `role_module_permissions` (migrasi `000014`) — `(role, module_id, access_level)` enum `('none','view','editor')`. Pola seed `000028`: `INSERT ... SELECT ... CROSS JOIN modules m WHERE m.code='<modul>' AND NOT EXISTS (...)` supaya aman dijalankan ulang.
3. Sejak migrasi `000036`, kolom `role` bertipe `TEXT` — role dinamis bisa langsung dipakai, tidak butuh `ALTER TYPE`.
4. `backend/internal/middleware/auth.go:108` — `RequireModuleAccess(permRepo, moduleCode, minLevel)`: ambil `GetEffectiveLevel(userID, role, moduleCode)`, tolak 403 bila level < min. Override per-user (`user_module_permissions`) menang atas default role.
5. Daftarkan group route dengan `r.Use(appmiddleware.RequireModuleAccess(permissionRepo, "project", model.AccessView/Editor))` — pola sama seperti group `/reports` di router.go:260–277. Endpoint `/me/permissions` (router.go:321) terbuka untuk semua user login.

**Frontend:**
- `frontend/src/lib/api.ts:481` — `getMyPermissions(token)` → `GET /me/permissions`, tipe `EffectivePermission {module_code, module_name, is_active, access_level}`.
- `frontend/src/components/sidebar.tsx` — `NAV_ITEMS` punya `moduleCode`; filter: `perm.access_level !== "none"`; `unlocked = !!perm?.is_active`.
- `permissionsVersion` di `notifications-context.tsx` — WS event `permissions_changed` memicu fetch ulang izin tanpa refresh.
- Halaman Manajemen Akses (`/admin/access...`) otomatis menampilkan modul baru karena `listModules()` / `setModuleActive()` / `PUT /admin/permissions/roles` membaca tabel `modules`.

Jadi cukup: 1 baris seed modul + seed permission per role + 1 entri `NAV_ITEMS` + group route ber-`RequireModuleAccess`.

---

## 5. Enum `ticket_status` vs `project_status`

**Aman dibiarkan.** Alasan:
- `ticket_status` adalah enum DB: `('unassigned','assigned','claimed','resolved','closed')` + `pending_approval` (migrasi `000012`). Menambah nilai project ke enum butuh `ALTER TYPE ... ADD VALUE`, dan di PostgreSQL transaksional ada batasan penggunaan value baru pada transaksi yang sama.
- `project_status` baru (`draft`, `menunggu_persetujuan`, `berjalan`, `ditahan`, `selesai`, `ditutup`, `dibatalkan`) disimpan sebagai kolom `TEXT` atau enum tersendiri di tabel tiket — tidak menyentuh enum lama.
- `ticket_type TEXT NOT NULL DEFAULT 'regular' CHECK (ticket_type IN ('regular','project'))` — projek dan reguler beda dimensi; `ticket_status` bisa tetap `unassigned` (atau nilai netral) untuk project.
- Guard di service layer menolak `Claim/Resolve/Reopen/Reassign/UpdateDeadline` untuk `ticket_type='project'`, sehingga status lama tidak pernah dipakai project.
- **Catatan hati-hati**: query `WHERE status IN ('resolved','closed')` di KPI/SLA mengira status lama = siklus tiket. Selama project tidak pernah masuk `resolved`/`closed`, ia tidak akan ikut dihitung — tapi filter eksplisit `ticket_type='regular'` tetap dipasang di semua query poin 2 sebagai pertahanan ganda.

Rekomendasi: **jangan ubah enum `ticket_status`**. Tambah `ticket_type`, `project_status`, `start_date`, `target_date` di tabel `tickets` lewat migrasi `000042`.

---

## 6. Nomor migrasi terakhir

`000041_daily_task_category.up.sql` / `.down.sql`. Migrasi berikutnya: **`000042`**.

Runner: `backend/migrate_runner.go` → `backend/bin/migrate.exe` (pgx-based, tanpa golang-migrate). Pola file pasangan `.up.sql` + `.down.sql` wajib dipertahankan.

---

## Ringkasan risiko & rekomendasi sebelum Tahap 1

1. **Paling kritis**: 33 query statistik/KPI/SLA + 10 fungsi service. Satu query terlewat = angka KPI lama berubah. Strategi: filter eksplisit `ticket_type='regular'` di semua query poin 2, bukan mengandalkan status.
2. `ticketListSelect` dipakai semua daftar/detail — menambah kolom `ticket_type`/`project_status` ke SELECT harus sinkron dengan urutan `rows.Scan` di `ListFiltered` dan `FindByID`.
3. SLA: `ListSLACandidates` dan `ListAtRisk` wajib `AND ticket_type='regular'`; `Create`/`Approve` jangan hitung `sla_deadline` untuk project.
4. Dokumen: `doc_type` sudah VARCHAR — proposal gampang, tapi metadata status/versi/penyetuju belum ada → migrasi `000042` perlu menambahnya (atau tabel `project_proposals`).
5. KPI project (Tahap 4) butuh agregasi baru di `kpi_report_repository.go` + `kpi_detail_repository.go`, kolom di `/reports/kpi/staff`, CSV, cetak, dan ringkasan `/reports` — **terpisah** dari angka lama.
6. `getMyPermissions` + `NAV_ITEMS` + `RequireModuleAccess` sudah pola matang, risiko rendah.

**BERHENTI. Tunggu konfirmasi untuk masuk Tahap 1.**
