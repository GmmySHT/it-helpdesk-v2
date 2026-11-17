# Manual Book — IT Helpdesk & Asset Management System

> **Penulis & Pengembang:** Firaz Faruq — firaz.faruq@gmail.com
> **Hak Cipta © 2026 Firaz Faruq. Seluruh hak dilindungi.**
> Sistem ini merupakan karya orisinal Firaz Faruq — mulai dari ide, desain UI/UX, arsitektur sistem, hingga implementasi kode seluruhnya dikerjakan sendiri.

**Versi Dokumen:** 2.1
**Tanggal:** November 2026
**Platform:** Web (Desktop & Tablet)

---

## Daftar Isi

1. [Tentang Sistem](#1-tentang-sistem)
2. [Teknologi yang Digunakan](#2-teknologi-yang-digunakan)
3. [Pengenalan Fitur](#3-pengenalan-fitur)
   - 3.1 [Sistem Tiket](#31-sistem-tiket)
   - 3.2 [Manajemen Aset](#32-manajemen-aset)
   - 3.3 [Laporan & KPI](#33-laporan--kpi)
   - 3.4 [Monitoring SIMRS](#34-monitoring-simrs)
   - 3.5 [Notifikasi Real-time](#35-notifikasi-real-time)
   - 3.6 [RBAC (Role-Based Access Control)](#36-rbac-role-based-access-control)
   - 3.7 [Manajemen Pengguna](#37-manajemen-pengguna)
   - 3.8 [Keamanan Sistem](#38-keamanan-sistem)
   - 3.9 [Desain UI/UX](#39-desain-uiux)
   - 3.10 [Kode Tiket & BAST](#310-kode-tiket--bast)
   - 3.11 [Daily Task](#311-daily-task)
   - 3.12 [Kata Sandi & Profil](#312-kata-sandi--profil)
4. [Panduan Role: User (Pelapor)](#4-panduan-role-user-pelapor)
5. [Panduan Role: Staff IT](#5-panduan-role-staff-it)
6. [Panduan Role: Leader (Kepala IT)](#6-panduan-role-leader-kepala-it)
7. [Panduan Role: Admin](#7-panduan-role-admin)
8. [Alur Kerja Lengkap](#8-alur-kerja-lengkap)
9. [Tabel Hak Akses RBAC](#9-tabel-hak-akses-rbac)
10. [Panduan Deploy](#10-panduan-deploy)
11. [FAQ & Troubleshooting](#11-faq--troubleshooting)
12. [Riwayat Versi](#12-riwayat-versi)

---

## 1. Tentang Sistem

**IT Helpdesk & Asset Management** adalah sistem manajemen layanan IT internal yang dibangun khusus untuk mendukung operasional divisi IT di lingkungan rumah sakit. Sistem ini menggabungkan:

- Manajemen tiket permintaan layanan IT
- Serah-terima pekerjaan lewat dokumen **BAST** yang dicetak dan diunggah balik
- Pencatatan **Daily Task** — pekerjaan harian kecil di luar tiket
- Inventaris dan peminjaman aset perangkat IT
- Dashboard monitoring pendapatan rumah sakit real-time (integrasi SIMRS)
- Pelaporan KPI dan performa tim (tiket + daily task), bisa dicetak per staf
- Kontrol akses berbasis role (RBAC) yang fleksibel

### Filosofi Desain

Sistem dirancang dengan prinsip:
- **Clean Architecture** — backend berlapis handler → service → repository → model
- **RBAC Fleksibel** — hak akses bisa diubah per role maupun per individu tanpa redeploy
- **Real-time First** — notifikasi dan update data via WebSocket
- **Mobile-aware** — layout responsif untuk penggunaan di tablet
- **Visual Elegan** — dark mode dengan animated background (aurora/particle), light mode clean tosca

---

## 2. Teknologi yang Digunakan

### Frontend
| Teknologi | Versi | Fungsi |
|---|---|---|
| Next.js | 16.3.2 | Framework React (App Router) |
| React | 19.2.8 | UI library |
| Tailwind CSS | v4 | Styling utility-first |
| Recharts | — | Grafik dan chart interaktif |
| Lucide React | — | Icon library |
| WebSocket (native) | — | Koneksi real-time ke backend |

### Backend
| Teknologi | Versi | Fungsi |
|---|---|---|
| Go | 1.22 | Bahasa pemrograman backend |
| Chi Router | v5 | HTTP router |
| pgx | v5 | Driver PostgreSQL |
| golang-jwt | v5 | JWT authentication |
| Gorilla WebSocket | v1.5 | WebSocket server |
| godotenv | v1.5 | Environment variables |
| bcrypt | — | Password hashing |

### Database & Infrastruktur
| Teknologi | Fungsi |
|---|---|
| PostgreSQL | Database utama (34 migration) |
| PostgreSQL SIMRS | Database read-only rumah sakit (koneksi terpisah) |
| Docker Compose | Orkestrasi container |

---

## 3. Pengenalan Fitur

### 3.1 Sistem Tiket

Inti dari aplikasi ini. Alur tiket dirancang mengikuti ITIL sederhana:

**Fitur tiket:**
- Pembuatan tiket dengan judul, deskripsi rich-text, kategori, prioritas, dan lampiran foto
- **Kode tiket otomatis berprefix per kategori** — misal `SIMRS-00019`, `NTWRK-00029` (lihat [3.10](#310-kode-tiket--bast))
- Sistem approval dua tahap untuk tiket dari karyawan umum
- Penugasan langsung ke staff atau mekanisme klaim mandiri
- Komentar berformat rich-text dengan upload gambar inline
- SLA otomatis per kategori (warning + breach notification)
- Rating kepuasan pengguna (1–5 bintang) setelah tiket selesai
- Tiket on-behalf — leader/admin bisa buat tiket atas nama user lain
- Riwayat lengkap: reassign, reopen, perubahan deadline — semua tercatat sebagai komentar sistem
- **BAST** — cetak berita acara serah-terima, tanda tangan pelapor, scan diunggah kembali sebagai bukti
- Soft delete oleh admin — tiket dihapus tetap tersimpan untuk audit dan bisa dipulihkan

**Status tiket:**
| Status | Keterangan |
|---|---|
| `pending_approval` | Menunggu persetujuan leader/admin |
| `open` | Disetujui, menunggu diklaim staff |
| `in_progress` | Sedang dikerjakan staff |
| `resolved` | Staff selesai, menunggu review leader |
| `closed` | Selesai final, ditutup leader/admin |
| `rejected` | Ditolak saat approval |

**Prioritas & warna badge:**
| Prioritas | Warna |
|---|---|
| Rendah | Biru |
| Sedang | Kuning |
| Tinggi | Oranye |
| Kritis | Merah |

---

### 3.2 Manajemen Aset

Modul untuk mencatat dan melacak aset perangkat IT milik organisasi.

**Fitur aset:**
- Registrasi aset dengan kode unik, nama, merek, model, serial number, kondisi, stok, dan lokasi
- Kategori aset (laptop, monitor, printer, server, jaringan, dll.) — 6 kategori default + bisa tambah
- Peminjaman aset dengan tanggal pinjam, batas kembali, dan tujuan peminjaman
- Sistem approval peminjaman oleh staff editor/leader/admin
- Konfirmasi serah terima aset (handover)
- Pengembalian aset dengan catatan kondisi
- Disposal aset (daur ulang/donasi/jual/musnahkan) dengan catatan alasan
- Tracking otomatis status overdue jika tidak dikembalikan tepat waktu

**Status aset:**
| Status | Keterangan |
|---|---|
| `available` | Tersedia untuk dipinjam |
| `borrowed` | Sedang dipinjam |
| `needs_repair` | Perlu perbaikan |
| `broken` | Rusak |
| `awaiting_disposal` | Menunggu proses disposal |
| `disposed` | Sudah dibuang/dialihkan |

**Status peminjaman:**
| Status | Keterangan |
|---|---|
| `pending_approval` | Menunggu persetujuan |
| `approved` | Disetujui, menunggu serah terima |
| `borrowed` | Sedang dipinjam |
| `returned` | Sudah dikembalikan |
| `overdue` | Terlambat dikembalikan |
| `rejected` | Ditolak |
| `cancelled` | Dibatalkan peminjam |

---

### 3.3 Laporan & KPI

Dashboard performa tim IT berbasis data tiket **dan daily task**, dengan tampilan menyesuaikan role yang login.

**Dua halaman:**
| Halaman | Fungsi |
|---|---|
| `/reports` | Laporan ringkas: ringkasan KPI, tren, distribusi, performa staf, tabel detail tiket |
| `/reports/kpi` | Dashboard KPI per staf — tiket + daily task di satu tabel, unduhan CSV |
| `/reports/kpi/print` | Dokumen resmi siap cetak/PDF untuk satu staf atau seluruh tim |

**Cakupan data sesuai role:**

| Role | Yang terlihat | Bisa pilih staf? |
|---|---|---|
| `staff_it` | Hanya KPI dirinya sendiri | ❌ (server memaksa ke ID sendiri) |
| `leader` | Semua staf | ✅ |
| `admin` | Semua staf | ✅ |
| `user` | Tidak punya akses modul Laporan (403) | — |

> Pembatasan ini ditegakkan **di server**, bukan hanya di tampilan. Staf IT yang mengubah URL atau mengirim `?staff_id=` orang lain tetap hanya mendapat datanya sendiri.

**Isi laporan:**
- **Ringkasan KPI** — total tiket, tiket selesai, total daily task, total item pekerjaan, rata-rata penyelesaian, kepatuhan SLA, jumlah reopen
- **Tren tiket** — grafik jumlah tiket masuk dan selesai per periode
- **Performa per staff** — breakdown performa individu staff IT
- **Distribusi prioritas** — proporsi tiket kritis/tinggi/sedang/rendah
- **Distribusi kategori** — tiket terbanyak per kategori layanan
- **Statistik peminjaman aset** — tren peminjaman aset per periode
- **Unduhan CSV** — per staf, semua staf, atau KPI sendiri (leader/admin); staf IT hanya bisa mengunduh dirinya

**Dokumen cetak (`/reports/kpi/print`):**
- Kop instansi + judul "Laporan Kinerja (KPI) Staf IT"
- Identitas staf: nama, jabatan, departemen, periode
- Ringkasan kinerja (8 angka kunci)
- **A. Rincian Tiket** — kode, judul, kategori, prioritas, tanggal selesai, durasi, status SLA
- **B. Rincian Daily Task** — tanggal, kendala, unit, waktu, durasi, respon time, solusi
- Blok tanda tangan: staf yang dinilai + koordinator IT
- Tombol **Cetak / Simpan PDF** (leader/admin juga punya pemilih staf di toolbar)

> Periode default halaman cetak = bulan berjalan bila URL tidak menyertakan `?from`/`?to`.

---

### 3.4 Monitoring SIMRS

Dashboard eksekutif real-time yang terhubung ke database SIMRS (sistem informasi manajemen rumah sakit).

**Fitur monitoring:**
- Grafik pendapatan harian/bulanan/tahunan vs periode sebelumnya
- Grafik kunjungan pasien rawat jalan dan rawat inap
- Target pendapatan bulanan sebagai garis referensi oranye di grafik tahunan — dapat diubah admin kapan saja tanpa redeploy
- KPI cards: total pendapatan, total kunjungan, perbandingan YoY/MoM
- Breakdown per penjamin (BPJS, umum, asuransi, dll.)
- Distribusi per instalasi dan ruangan
- Distribusi komponen tarif
- Statistik pendaftaran aktif hari ini (antri, sedang periksa, sudah pulang, rawat inap, batal)
- Refresh otomatis setiap 30 detik
- Mode layar penuh (TV Dashboard) dengan tombol F / tombol di UI
- Navigasi periode dengan tombol ◀ ▶ atau keyboard panah kiri/kanan

---

### 3.5 Notifikasi Real-time

Sistem notifikasi berbasis WebSocket yang mengirim notifikasi langsung tanpa perlu refresh halaman.

**Event yang memicu notifikasi:**
| Event | Dikirim ke |
|---|---|
| Tiket baru masuk | Leader + Admin |
| Tiket disetujui/ditolak | Pembuat tiket |
| Tiket diklaim staff | Pembuat tiket + Leader |
| Tiket selesai (resolve) | Leader + Admin |
| Tiket ditutup (close) | Pembuat tiket |
| Tiket dibuka kembali (reopen) | Staff yang menangani |
| Tiket direassign | Staff penerima + Staff sebelumnya |
| SLA warning/breach | Leader + Admin + Staff penanganan |
| Peminjaman aset diajukan | Admin + Staff editor |
| Peminjaman disetujui/ditolak | Peminjam |
| Percobaan login gagal berulang | Pemilik akun + Admin |

**Tampilan notifikasi:**
- Bell icon di PageHeader dengan badge jumlah notifikasi belum dibaca
- Dropdown list notifikasi terbaru dengan timestamp
- Klik notifikasi → navigasi otomatis ke halaman terkait

---

### 3.6 RBAC (Role-Based Access Control)

Sistem kontrol akses dua lapis yang fleksibel.

**Lapis 1 — Default per Role:**
Setiap role memiliki akses default ke tiap modul. Admin dapat mengubah ini melalui halaman Manajemen Akses tab "Per Role".

**Lapis 2 — Override per User:**
Admin dapat memberikan akses berbeda untuk user individu, mengabaikan default role-nya.

**Level akses:**
| Level | Keterangan |
|---|---|
| `none` | Tidak bisa akses modul sama sekali |
| `view` | Bisa melihat data, tidak bisa modifikasi |
| `editor` | Akses penuh termasuk tambah/edit/hapus |

**Modul yang diatur RBAC:**
- Ticketing
- Asset Management
- Laporan & KPI
- Monitoring SIMRS
- Manajemen Akses

> **Daily Task tidak lewat RBAC modul** — aksesnya dijaga langsung oleh role (`staff_it`, `leader`, `admin`). Jadi menaikkan akses modul `reports` ke `user` tidak otomatis membuka Daily Task.

**Perubahan akses berlaku langsung** — tidak perlu restart server atau logout-login ulang.

> **Penting — RBAC modul ≠ cakupan data.** RBAC menentukan apakah kamu bisa *membuka* modul Laporan. Cakupan datanya ditentukan role: `staff_it` hanya melihat KPI dirinya, `leader`/`admin` melihat semua. Pemberian akses modul tidak bisa menembus batas ini.

---

### 3.7 Manajemen Pengguna

Khusus Leader dan Admin.

**Fitur:**
- Tambah akun pengguna baru (nama, email, username, password, role, departemen)
- Edit data pengguna
- Aktifkan / nonaktifkan akun (nonaktif = tidak bisa login, token langsung invalid)
- **Reset password** akun lain tanpa perlu tahu password lama (lihat [3.12](#312-kata-sandi--profil))
- Hapus akun
- Registrasi publik **dinonaktifkan** secara default — semua akun dibuat oleh leader/admin

---

### 3.8 Keamanan Sistem

**Mekanisme keamanan yang diimplementasikan:**
- **Brute force protection** — 5 kali gagal login per akun = dikunci 15 menit; 30 kali per IP = dikunci 15 menit
- **Session invalidation** — backend memverifikasi ulang status akun tiap 15 detik; akun nonaktif langsung logout
- **JWT short-lived** — token memiliki masa berlaku terbatas
- **Upload security** — file yang diupload divalidasi tipe dan ukuran (maks 50MB, hanya gambar untuk lampiran)
- **Security headers** — X-Content-Type-Options, X-Frame-Options, dsb.
- **Password hashing** — bcrypt dengan cost factor tinggi
- **Ganti password wajib verifikasi password lama** — mencegah orang yang menemukan sesi terbuka mengganti password lalu mengunci pemilik akun
- **Reset password memutus sesi lama** — setiap perubahan password mencatat waktunya; token yang diterbitkan sebelum waktu itu langsung ditolak server
- **Security alert** — notifikasi otomatis ke admin saat akun dikunci

---

### 3.9 Desain UI/UX

**Dark Mode:**
- Background utama: `#0B1120` (deep navy)
- Animated background: aurora borealis + particle field yang bisa dimatikan
- Card: `bg-white/[0.03]` dengan border `white/10`
- Sidebar: dark gray elegan dengan gambar backdrop + gradient fade dari bawah

**Light Mode:**
- Background: `#F4FBFC`
- Card: putih `#FFFFFF` dengan border `#C7EDF0` dan shadow tosca
- Warna primer: tosca `#0D9488` dengan hover `#5EEAD4`
- Teks utama: `#115E70`
- Sidebar: gradient teal

**Komponen kustom yang dibangun:**
- `PageHeader` — header terpusat dengan jam live, notifikasi, dan action buttons
- `Sidebar` — navigasi dengan role-aware menu, gambar backdrop, slim scrollbar
- `RichTextEditor` — editor teks kaya dengan bold/italic/list/gambar inline
- `AnimatedBackground` — aurora borealis CSS animation
- `ParticleField` — partikel bergerak di background
- `ToastContainer` — notifikasi toast kustom
- `SignoffPanel` — unggah & kelola scan BAST pada detail tiket
- Slim scrollbar custom via global CSS (`.slim-scroll`)

**Layout:** sidebar `fixed` tidak ikut scroll — konten di `<main class="flex-1 overflow-y-auto">`, jadi form panjang (mis. Daily Task) menggulir konten saja.

---

### 3.10 Kode Tiket & BAST

#### Kode Tiket Otomatis

Setiap tiket mendapat nomor unik berprefix sesuai kategorinya:

| Kategori | Prefix | Contoh |
|---|---|---|
| SIMRS | `SIMRS` | `SIMRS-00002` |
| Jaringan | `NTWRK` | `NTWRK-00029` |
| Hardware | `HW` | `HW-00007` |
| Software | `SW` | `SW-00003` |
| Akun & Akses | `ACC` | `ACC-00011` |

- Nomor urut per prefix, lima digit (`lpad(seq, 5, '0')`), dihitung atomik lewat tabel `ticket_code_counters` → **tidak pernah bentrok** meski dua tiket dibuat bersamaan
- Prefix disimpan di kolom `categories.code` (unik), jadi kalau nama kategori diganti, kode tiket lama tidak berubah
- Kategori baru otomatis dapat prefix dari 5 huruf pertama namanya (non-alfanumerik dibuang, huruf besar)

#### BAST — Berita Acara Serah-Terima

Alur dokumen serah-terima pekerjaan tiket:

1. Tiket diselesaikan staff → di-**resolve**
2. Leader/Admin me-**close** tiket
3. Muncul tombol **🖨️ Cetak BAST** di detail tiket (hanya untuk tiket `closed`)
4. Dokumen dicetak → pelapor tanda tangan di kolom yang tersedia
5. Scan/foto dokumen diunggah kembali lewat panel **Bukti Serah-Terima**
6. Dokumen menempel pada tiket — dapat dilihat kapan saja sebagai bukti resmi

**Ketentuan:**
- Tombol cetak & unggah **tidak tersedia untuk role `user`** — pelapor hanya bisa melihat dokumen yang sudah diunggah
- Satu tiket boleh punya beberapa dokumen (scan ulang/koreksi); dokumen terbaru yang dianggap berlaku
- Upload dokumen saat **resolve bersifat opsional** — tidak menghalangi penyelesaian tiket
- Data yang diisi saat unggah: file scan, nama penanda tangan, tanggal tanda tangan, catatan
- Kop dokumen memakai `NEXT_PUBLIC_INSTITUTION_NAME` (default nama instansi di `print/page.tsx`)

---

### 3.11 Daily Task

Modul pencatatan pekerjaan harian staf IT di luar tiket resmi — biasanya permintaan kecil yang masuk lewat WhatsApp dan tidak pernah menjadi tiket.

**Kenapa terpisah dari tiket:** daily task tidak punya approval, SLA, atau rating. Kalau dicampur ke tabel tiket, statistik SLA dan rating jadi rusak. Tapi bebannya tetap harus terhitung di KPI.

**Field:**
| Field | Wajib | Keterangan |
|---|---|---|
| Tanggal | ✅ | Tanggal pekerjaan |
| Pelapor | ✅ | Nama orang/unit yang minta (teks bebas — banyak pelapor tak punya akun) |
| Unit | — | Dropdown (17 unit default: SIMRS, Jaringan, Hardware, Radiologi, IGD, Kasir, dll.) |
| Kendala | ✅ | Ringkasan singkat |
| Keterangan kendala | — | Detail kondisi/lokasi |
| Waktu komplain | ✅ | Kapan permintaan masuk |
| Waktu mulai | — | Kapan mulai dikerjakan |
| Waktu selesai | — | Kapan selesai |
| Solusi | — | Tindakan yang menyelesaikan kendala |

**Dua angka yang dihitung otomatis database (bukan frontend):**
- **Durasi** = waktu selesai − waktu mulai
- **Respon time** = waktu mulai − waktu komplain

**Hak akses:** yang boleh mencatat hanya `staff_it`, `leader`, `admin`. Staf IT hanya melihat & mengubah catatannya sendiri; leader/admin melihat semua catatan tim. Role `user` tidak punya akses (403).

**Daftar daily task** punya filter: rentang tanggal, unit, dan pencarian teks (kendala/pelapor/unit).

> Daily task otomatis masuk ke **Laporan KPI** (kolom "Daily Task" di tabel rekap dan bagian **B. Rincian Daily Task** di halaman cetak).

---

### 3.12 Kata Sandi & Profil

Dua jalur berbeda, sengaja dipisah karena risikonya berbeda:

| Siapa | Jalur | Password lama | Halaman |
|---|---|---|---|
| Pemilik akun | Ganti sendiri | **Wajib benar** | `/profile` |
| Leader / Admin | Reset akun lain | Tidak perlu | `/admin/users` → tombol kunci |

**Kenapa dipisah:** reset tanpa password lama adalah pintu darurat (kasus lupa password), jadi hanya boleh dibuka untuk akun yang hierarkinya di bawah si pelaku. Ganti sendiri tetap wajib membuktikan kepemilikan dengan password lama.

**Halaman Profil (`/profile`)** — bisa dibuka semua role dari menu profil di bagian bawah sidebar:
- Kartu identitas: nama, email, username, unit, status akun (read-only; diubah lewat Manajemen User)
- Form ganti kata sandi: kata sandi saat ini, kata sandi baru (min. 8 karakter), ulangi kata sandi baru
- Tombol mata untuk menampilkan isian — user sering salah ketik dan tidak bisa memverifikasi sebelum menyimpan
- Setelah berhasil: pesan sukses, lalu otomatis logout ke halaman login. Ini disengaja: semua token lama sudah tidak sah, jadi melanjutkan tanpa login ulang hanya akan menghasilkan error 401

**Reset oleh Leader / Admin** (`/admin/users` → ikon kunci pada baris user):
- Password lama tidak diminta
- Batas hierarki: `leader` hanya bisa mereset akun `user` dan `staff_it`; akun `leader`/`admin` hanya bisa direset `admin`
- Mereset akun sendiri ditolak — arahkan ke halaman Profil
- Setelah direset, akun ditandai **wajib ganti password**: saat login berikutnya halaman Profil menampilkan banner kuning yang meminta pemilik mengganti password hasil reset
- Semua sesi aktif akun itu langsung berakhir
- Password baru harus disampaikan ke pemilik lewat jalur aman (bukan grup chat umum)

---

## 4. Panduan Role: User (Pelapor)

### Siapa User?
Karyawan umum di luar divisi IT — bisa dari departemen apapun (HRD, keuangan, keperawatan, dll.).

### Hak Akses Modul — User (Pelapor)
| Modul | Akses |
|---|---|
| Ticketing | ✅ Editor |
| Asset | ❌ None |
| Laporan & KPI | ❌ None |
| Monitoring | ❌ None |
| Manajemen Akses | ❌ None |

> Admin bisa memberikan akses tambahan ke modul lain jika diperlukan.

### 4.1 Login

1. Buka URL sistem di browser
2. Masukkan email/username dan password yang telah diberikan admin
3. Klik **Masuk**

> Jika lupa password, hubungi Admin atau Leader IT untuk reset. Setelah direset, kamu akan diminta membuat password sendiri lewat halaman **Profil** — lihat [4.8 Ganti Password Sendiri](#48-ganti-password-sendiri).

### 4.2 Membuat Tiket Baru

1. Klik **+ Buat Tiket** di halaman utama atau menu Tiket
2. Isi formulir:
   - **Judul** — deskripsi singkat masalah (contoh: "Komputer tidak bisa nyala")
   - **Kategori** — pilih kategori yang sesuai (Hardware, Software, Jaringan, dll.)
   - **Prioritas** — pilih tingkat urgensi (Rendah / Sedang / Tinggi / Kritis)
   - **Deskripsi** — penjelasan lengkap masalah, bisa format teks kaya (bold, list, gambar)
   - **Lampiran** — upload foto/screenshot pendukung (opsional)
3. Klik **Kirim Tiket**

> **Penting:** Tiket yang kamu buat akan masuk status **Menunggu Persetujuan** terlebih dahulu. Leader atau Admin akan mereview dan menyetujui/menolak tiketmu.

### 4.3 Memantau Status Tiket

1. Buka menu **Tiket** di sidebar
2. Kamu hanya bisa melihat tiket yang kamu buat sendiri
3. Status tiket ditampilkan dengan warna badge:
   - 🔵 **Menunggu** — belum disetujui atau belum diklaim
   - 🟡 **Sedang Dikerjakan** — sudah diklaim staff IT
   - 🟢 **Selesai** — sudah ditutup
   - 🔴 **Ditolak** — tidak disetujui

### 4.4 Berkomunikasi di Tiket

1. Klik tiket yang ingin dikomentari
2. Gulir ke bawah ke bagian **Komentar**
3. Ketik pesan (bisa dengan gambar inline menggunakan editor rich-text)
4. Klik **Kirim**

> Komentarmu tampil di kanan, komentar staff IT tampil di kiri.

### 4.5 Memberikan Rating

Setelah tiket ditutup (status **Selesai**):
1. Buka detail tiket
2. Muncul form rating bintang (1–5)
3. Pilih bintang dan tulis komentar opsional
4. Klik **Kirim Rating**

### 4.6 Notifikasi

Kamu akan menerima notifikasi (bell icon di kanan atas) saat:
- Tiket disetujui atau ditolak
- Staff IT mulai mengerjakan tiketmu
- Tiketmu selesai ditutup

### 4.7 Dokumen BAST

Setelah tiket ditutup, staff IT mencetak **BAST** (Berita Acara Serah-Terima) dan meminta tanda tanganmu di kertas. Scan dokumen yang sudah ditandatangani diunggah kembali oleh staff ke tiket.

1. Buka detail tiket yang sudah **Selesai**
2. Gulir ke panel **Bukti Serah-Terima**
3. Dokumen hasil scan bisa kamu lihat kapan saja

> Kamu **tidak bisa** mencetak atau mengunggah BAST sendiri — tombolnya hanya untuk staff IT, leader, dan admin. Kalau dokumen belum ada, hubungi staff yang menangani tiketmu.

### 4.8 Ganti Password Sendiri

1. Klik menu profil di bagian bawah sidebar → **Profil & Kata Sandi**
2. Isi **Kata sandi saat ini** — ini bukti bahwa akun memang milikmu
3. Isi **Kata sandi baru** (minimal 8 karakter) dan ulangi di kolom sebelahnya
4. Klik **Simpan Kata Sandi**
5. Setelah berhasil, kamu otomatis keluar ke halaman login — masuk lagi dengan password baru

> Semua perangkat/browser lain yang masih login dengan password lama langsung terputus. Itu memang tujuannya: kalau password bocor, orang yang sudah masuk tidak bisa bertahan.

### Batasan User
- ❌ Tidak bisa melihat tiket orang lain
- ❌ Tidak bisa mengakses menu Laporan, Monitoring, Asset (kecuali diberi akses Admin)
- ❌ Tidak bisa approve/klaim/close tiket
- ❌ Tidak bisa mencetak atau mengunggah dokumen BAST
- ❌ Tidak bisa mencatat Daily Task

---

## 5. Panduan Role: Staff IT

### Siapa Staff IT?
Teknisi atau anggota divisi IT yang bertugas menangani tiket dan mengelola aset perangkat IT.

### Hak Akses Modul — Staff IT
| Modul | Akses Default |
|---|---|
| Ticketing | ✅ Editor |
| Asset | ✅ View (bisa ditingkatkan ke Editor oleh Admin) |
| Laporan & KPI | ✅ View |
| Monitoring SIMRS | ✅ View |
| Manajemen Akses | ❌ None |

### 5.1 Dashboard

Halaman utama menampilkan:
- Ringkasan tiket yang sedang kamu tangani
- Statistik personal: jumlah tiket selesai, rata-rata waktu resolve
- Tiket terbaru yang masuk

### 5.2 Menangani Tiket

#### Melihat Semua Tiket
1. Buka menu **Tiket**
2. Staff IT bisa melihat **semua tiket** dari semua user
3. Filter berdasarkan status, kategori, atau prioritas

#### Mengklaim Tiket
1. Cari tiket berstatus **Menunggu Diklaim** (open)
2. Klik tiket untuk membuka detail
3. Klik tombol **Klaim Tiket**
4. Tiket sekarang ditugaskan ke kamu

#### Update Progress
1. Buka tiket yang sudah diklaim
2. Tambahkan komentar perkembangan pekerjaan
3. Lampirkan foto hasil perbaikan jika perlu

#### Menyelesaikan Tiket (Resolve)
1. Setelah masalah selesai ditangani, buka detail tiket
2. Klik tombol **Tandai Selesai**
3. Tulis laporan penyelesaian di komentar
4. Lampiran bukti **opsional** — tidak wajib
5. Tiket masuk status **Menunggu Review** — notifikasi dikirim ke Leader/Admin

> Tiket belum benar-benar selesai sampai Leader/Admin menutupnya.

#### Mencetak & Mengunggah BAST
Setelah tiket **closed** oleh Leader/Admin:
1. Tombol **🖨️ Cetak BAST** muncul di header detail tiket
2. Cetak dokumen, minta pelapor tanda tangan
3. Scan/foto hasilnya
4. Buka panel **Bukti Serah-Terima** → **+ Unggah Scan**
5. Isi nama penanda tangan, tanggal tanda tangan, catatan → **Unggah Dokumen**

> Role `user` tidak bisa mencetak atau mengunggah BAST — hanya melihat dokumen yang sudah ada.

### 5.3 Tiket Berisiko (At-Risk)

1. Buka menu **Tiket** → tab **Berisiko**
2. Menampilkan tiket yang mendekati atau sudah melewati batas SLA
3. Prioritaskan tiket-tiket ini sebelum deadline

### 5.4 Manajemen Aset

#### Dengan Akses View (Default)
- Melihat seluruh daftar aset dan detail tiap aset
- Melihat riwayat peminjaman

#### Meminjam Aset
1. Buka menu **Asset** → klik aset yang ingin dipinjam
2. Klik tombol **Pinjam**
3. Isi formulir: jumlah, tanggal pinjam, batas kembali, tujuan
4. Submit — tunggu persetujuan

#### Jika Akses Asset Ditingkatkan ke Editor (oleh Admin)
- Tambah aset baru ke inventaris
- Edit data aset (kondisi, lokasi, dll.)
- Approve/tolak peminjaman aset
- Input disposal aset

### 5.5 Laporan & KPI

Dengan akses view, halaman laporan **membaca siapa yang login**:

- Kamu **hanya melihat KPI dirimu sendiri** — bukan performa tim lain
- Tabel performa berjudul **"Performa Saya"**
- Dropdown pemilih staf **tidak muncul** (diganti ikon kunci 🔒)
- Tombol unduhan berbunyi **"Unduh KPI Saya (CSV)"**
- Halaman cetak otomatis terkunci ke namamu — tidak bisa mengganti ke staf lain

> Ini bukan sekadar tampilan: server memaksa `staff_id` ke ID kamu, jadi mengubah URL atau parameter tidak membuka data orang lain.

Yang tetap bisa kamu lihat:
- Ringkasan kinerja pribadi (tiket selesai, total item, kepatuhan SLA, reopen)
- Distribusi tiket per kategori dan prioritas **milikmu**
- Tren penyelesaian harian **milikmu**
- Dokumen cetak **Laporan KPI** pribadi siap tanda tangan koordinator

### 5.6 Daily Task

1. Buka menu **Daily Task** di sidebar
2. Klik **+ Catat Daily Task**
3. Isi tanggal, pelapor, unit, kendala, waktu komplain (waktu mulai/selesai diisi saat dikerjakan)
4. Simpan — durasi & respon time dihitung otomatis
5. Kamu hanya melihat & mengubah catatan milikmu sendiri

> Daily task yang kamu catat ikut dihitung di KPI pribadi dan laporan tim.

### 5.7 Monitoring SIMRS

Dengan akses view, kamu bisa melihat:
- Dashboard pendapatan dan kunjungan pasien real-time
- Grafik perbandingan periode

### Shortcut Keyboard (Halaman Monitoring)
| Tombol | Fungsi |
|---|---|
| `←` / `→` | Navigasi periode sebelum/berikutnya |
| `F` | Toggle mode layar penuh |
| `Esc` | Keluar dari layar penuh |

---

## 6. Panduan Role: Leader (Kepala IT)

### Siapa Leader?
Kepala atau supervisor divisi IT. Bertanggung jawab mengawasi pengerjaan tiket, mereview hasil kerja staff, dan mengelola tim.

### Hak Akses Modul — Leader
| Modul | Akses Default |
|---|---|
| Ticketing | ✅ Editor |
| Asset | ✅ View (bisa ditingkatkan ke Editor oleh Admin) |
| Laporan & KPI | ✅ View |
| Monitoring SIMRS | ✅ View |
| Manajemen Akses | ❌ None (tidak bisa ubah RBAC) |

### 6.1 Approve / Tolak Tiket

Setiap tiket dari karyawan umum butuh persetujuanmu:
1. Buka notifikasi atau menu **Tiket** → filter status **Menunggu Persetujuan**
2. Klik tiket untuk mereview isinya
3. Pilih:
   - **Setujui** → tiket masuk antrian, siap diklaim staff
   - **Tolak** → tiket ditolak beserta alasan, user mendapat notifikasi

### 6.2 Membuat Tiket On-Behalf

1. Klik **+ Buat Tiket**
2. Di bagian **Dibuat untuk**, pilih nama karyawan
3. Tiket langsung disetujui (tidak perlu approval lagi)
4. Opsional: langsung assign ke staff tertentu

### 6.3 Menugaskan Langsung ke Staff

Saat membuat tiket baru:
1. Aktifkan opsi **Tugaskan ke Staff**
2. Pilih nama staff dari dropdown
3. Tiket langsung masuk ke staff tersebut (skip mekanisme klaim)

### 6.4 Menutup Tiket (Close)

Setelah staff menandai selesai:
1. Buka notifikasi atau filter tiket status **Menunggu Review**
2. Klik tiket, review laporan penyelesaian staff
3. Klik **Tutup Tiket** jika pekerjaan sudah memuaskan
4. User mendapat notifikasi dan bisa memberikan rating

### 6.5 Reopen Tiket

Jika penyelesaian tidak memuaskan atau masalah muncul kembali:
1. Buka detail tiket
2. Klik **Buka Kembali**
3. Tulis alasan reopen
4. Tiket kembali ke staff untuk dikerjakan ulang

### 6.6 Reassign Tiket

1. Buka detail tiket
2. Klik **Reassign**
3. Pilih staff tujuan + tulis alasan
4. Kedua staff mendapat notifikasi

### 6.7 Update Deadline

1. Buka detail tiket
2. Klik ikon edit di bagian deadline
3. Pilih tanggal/waktu baru
4. Konfirmasi

### 6.8 Edit Detail Tiket

1. Buka detail tiket
2. Klik **Edit**
3. Ubah judul, deskripsi, kategori, atau prioritas
4. Simpan

### 6.9 Manajemen Pengguna

Buka menu **Admin → Kelola Pengguna**:

#### Tambah User Baru
1. Klik **+ Tambah Pengguna**
2. Isi nama, email, username, password, role, departemen
3. Simpan — user bisa langsung login

#### Edit / Nonaktifkan / Hapus
1. Klik nama user di tabel
2. Pilih aksi: Edit, Nonaktifkan, atau Hapus
3. User yang dinonaktifkan **tidak bisa login** dan sesi aktifnya langsung dicabut

#### Reset Password User
1. Klik ikon **kunci** pada baris user → panel **Reset Password** terbuka di atas tabel
2. Isi password baru (min. 8 karakter) dua kali, lalu klik **Reset Password**
3. Password lama user tidak diperlukan — ini jalur untuk kasus lupa password
4. Sampaikan password baru ke pemilik akun lewat jalur aman; saat login mereka diminta mengganti sendiri

**Batas yang perlu diketahui sebagai leader:**
- Kamu hanya bisa mereset akun `user` dan `staff_it`. Akun sesama `leader` dan `admin` **tidak bisa** — minta admin yang melakukannya.
- Mereset password akun sendiri ditolak; gunakan halaman **Profil & Kata Sandi** di sidebar.
- Setelah direset, seluruh sesi aktif akun itu langsung berakhir.

> Password tidak pernah ditampilkan kembali oleh sistem, termasuk oleh admin. Kalau user lupa lagi, lakukan reset ulang — bukan mencari password lama.

### 6.10 Daily Task Tim

1. Buka menu **Daily Task**
2. Kamu melihat catatan **seluruh staf** (bukan hanya milikmu)
3. Filter rentang tanggal / unit / kata kunci untuk meninjau beban kerja
4. Klik **+ Catat Daily Task** untuk mencatat permintaan yang kamu tangani sendiri

### 6.11 Laporan & KPI Semua Staf

Sebagai leader, halaman laporan **tidak terkunci** — kamu bisa melihat seluruh tim:

1. Buka menu **Laporan & KPI** (`/reports`)
2. Tabel **Performa Staf (N)** menampilkan semua staf beserta tiket selesai, rata-rata resolve, dan % SLA
3. Buka **Laporan KPI** (`/reports/kpi`) untuk KPI gabungan tiket + daily task
4. Pilih staf di dropdown **Staf** → tabel menyempit ke orang itu
5. Klik **Laporan Lengkap — <nama>** untuk membuka dokumen cetak/PDF staf tersebut
6. **Unduh CSV** tersedia per staf maupun semua staf

> Semua angka ikut menyempit saat staf dipilih — bukan hanya tabelnya, tapi juga kartu ringkasan, distribusi, dan tren.

---

## 7. Panduan Role: Admin

### Siapa Admin?
Administrator sistem dengan akses penuh. Semua kemampuan Leader ditambah konfigurasi RBAC dan monitoring.

### Hak Akses Modul — Admin
| Modul | Akses |
|---|---|
| Ticketing | ✅ Editor |
| Asset | ✅ Editor (penuh) |
| Laporan & KPI | ✅ View |
| Monitoring SIMRS | ✅ **Editor** (termasuk konfigurasi target) |
| Manajemen Akses | ✅ **Editor** (penuh) |

### 7.1 Semua Kemampuan Leader

Admin memiliki **semua akses Leader** (approve tiket, close, reopen, reassign, deadline, on-behalf, manajemen user).

### 7.2 Manajemen Akses (RBAC)

Buka menu **Admin → Manajemen Akses**:

#### Tab Per Role — Ubah Default Akses
1. Pilih role yang ingin diubah (user / staff_it / leader)
2. Tiap modul ditampilkan dengan pilihan: `none` / `view` / `editor`
3. Ubah sesuai kebutuhan
4. Klik **Simpan** — berlaku langsung untuk semua user dengan role tersebut

**Contoh penggunaan:**
- Buka akses view Asset untuk semua user biasa
- Beri akses editor Laporan ke semua staff_it

#### Tab Per User — Override Individual
1. Cari nama user
2. Ubah akses modul spesifik untuk user tersebut
3. Override ini **mengalahkan** default role-nya

**Contoh penggunaan:**
- Staff IT bernama Budi diberi editor Asset tanpa mengubah akses staff_it lain
- User dari departemen keuangan diberi view Monitoring SIMRS

### 7.3 Konfigurasi Target Pendapatan Monitoring

Buka menu **Admin → Konfigurasi Dashboard**:

1. Masukkan angka target pendapatan bulanan dalam Rupiah (tanpa titik/koma)
   - Contoh: `8500000000` untuk Rp 8.500.000.000
2. Klik **Simpan Target**
3. Buka halaman Monitoring → pilih periode **Tahunan**
4. Garis oranye putus-putus muncul di grafik pada level target yang kamu set

> Perubahan ini **tidak memerlukan restart server atau redeploy**. Langsung aktif.

### 7.4 Asset Management (Editor Penuh)

#### Tambah Aset Baru
1. Buka menu **Asset** → **+ Tambah Aset**
2. Isi: kategori, kode aset, nama, merek, model, nomor seri, kondisi, stok, lokasi, catatan
3. Simpan

#### Approve Peminjaman
1. Buka menu **Asset → Peminjaman**
2. Filter status **Menunggu Persetujuan**
3. Review permintaan → Setujui atau Tolak
4. Jika disetujui → konfirmasi serah terima saat aset diserahkan ke peminjam

#### Input Disposal Aset
1. Buka menu **Asset → Disposal**
2. Klik **+ Disposal Baru**
3. Pilih aset, metode (daur ulang/donasi/jual/musnahkan), tanggal, alasan
4. Simpan — status aset otomatis berubah ke `disposed`

### 7.5 Pantau Keamanan

Sistem mencatat percobaan login gagal:
- 5 kali gagal per akun → akun dikunci 15 menit, notifikasi dikirim ke pemilik akun dan admin
- 30 kali gagal per IP → IP dikunci 15 menit
- Semua event dicatat di log sistem

---

## 8. Alur Kerja Lengkap

### 8.1 Alur Tiket Normal (dari User)

```
[User]                    [Leader/Admin]              [Staff IT]
  |                              |                         |
  |-- Buat Tiket --------------->|                         |
  |                    [Menunggu Persetujuan]              |
  |                              |                         |
  |<-- Notif: Approve -----------|                         |
  |                    [Open / Menunggu Diklaim] --------->|
  |                                                        |
  |                                              [Klaim Tiket]
  |                                         [In Progress]  |
  |<-- Notif: Tiket diklaim --------------------------------|
  |                                                        |
  |<--> Komentar bolak-balik <---------------------------->|
  |                                                        |
  |                              |<-- Notif: Resolve ------|
  |                    [Menunggu Review]                   |
  |                              |                         |
  |<-- Notif: Closed ------------|                         |
  |                    [Closed / Selesai]                  |
  |                                                        |
  |-- Beri Rating ------------->|                          |
```

### 8.2 Alur Tiket Kritis (Leader Assign Langsung)

```
[Leader/Admin]                                  [Staff IT]
      |                                               |
      |-- Buat tiket + assign langsung -------------->|
      |                        [In Progress langsung] |
      |                                               |
      |<-- Notif: Resolve -----------------------------|
      |-- Review & Close ----------------------------->|
      |                        [Closed]               |
```

### 8.3 Alur Peminjaman Aset

```
[Peminjam]              [Admin/Staff Editor]
    |                           |
    |-- Ajukan pinjam --------->|
    |             [Pending Approval]
    |                           |
    |<-- Notif: Approved -------|
    |             [Approved]    |
    |                           |-- Konfirmasi serah terima
    |             [Borrowed]    |
    |                           |
    |-- Kembalikan ------------>|
    |             [Returned]    |
```

### 8.4 Alur BAST (Serah-Terima Tiket)

```
[Staff IT]                [Leader/Admin]            [Pelapor]
    |                          |                       |
    |-- resolve -------------->|                       |
    |   (lampiran opsional)    |                       |
    |                          |-- close ------------->|
    |                          |      [closed]         |
    |<-- tombol Cetak BAST ----|                       |
    |       aktif (bukan user) |                       |
    |-- cetak & serahkan dokumen ---------------------->|
    |                          |     tanda tangan      |
    |<-- terima scan balik --------------------------- |
    |-- unggah scan ke tiket   |                       |
    |           [dokumen bukti menempel di tiket]       |
```

> Role `user` tidak punya tombol cetak/unggah — hanya bisa melihat dokumen hasil unggahan staff.

### 8.5 Alur Daily Task → KPI

```
[Staf IT]                          [Leader/Admin]
    |                                    |
    |-- catat daily task (WA, non-tiket) |
    |   pelapor, unit, kendala,          |
    |   waktu komplain/mulai/selesai     |
    |                                    |
    |       DB hitung durasi & respon    |
    |                                    |
    |-- tiket yang di-claim ------------>|
    |                                    |
    |              [Laporan KPI periode] |
    |              tiket + daily task    |
    |              filter per staf       |
    |                                    |
    |<-- staf: barisnya sendiri ---------|
    |<-- leader/admin: semua, bisa pilih |
```

---

## 9. Tabel Hak Akses RBAC

### Default Per Role (Sebelum Dikustomisasi Admin)

| Aksi | User | Staff IT | Leader | Admin |
|---|---|---|---|---|
| **AUTENTIKASI** | | | | |
| Login | ✅ | ✅ | ✅ | ✅ |
| **TIKET** | | | | |
| Buat tiket | ✅ | ✅ | ✅ | ✅ |
| Buat tiket on-behalf | ❌ | ❌ | ✅ | ✅ |
| Lihat tiket sendiri | ✅ | ✅ | ✅ | ✅ |
| Lihat semua tiket | ❌ | ✅ | ✅ | ✅ |
| Lihat tiket berisiko | ❌ | ✅ | ✅ | ✅ |
| Approve/tolak tiket | ❌ | ❌ | ✅ | ✅ |
| Klaim tiket | ❌ | ✅ | ❌ | ❌ |
| Assign langsung ke staff | ❌ | ❌ | ✅ | ✅ |
| Update progress (komentar) | ✅ | ✅ | ✅ | ✅ |
| Resolve tiket | ❌ | ✅ | ❌ | ❌ |
| Close tiket | ❌ | ❌ | ✅ | ✅ |
| Reopen tiket | ❌ | ❌ | ✅ | ✅ |
| Reassign tiket | ❌ | ❌ | ✅ | ✅ |
| Update deadline | ❌ | ❌ | ✅ | ✅ |
| Edit detail tiket | ❌ | ❌ | ✅ | ✅ |
| Beri rating | ✅ | ❌ | ❌ | ❌ |
| **BAST** | | | | |
| Cetak BAST (tiket `closed`) | ❌ | ✅ | ✅ | ✅ |
| Unggah scan BAST | ❌ | ✅ | ✅ | ✅ |
| Lihat dokumen BAST | ✅ (milik sendiri) | ✅ | ✅ | ✅ |
| **ASET** | | | | |
| Lihat daftar aset | ❌† | ✅ | ✅ | ✅ |
| Lihat detail aset | ❌† | ✅ | ✅ | ✅ |
| Pinjam aset | ❌† | ✅ | ✅ | ✅ |
| Tambah aset baru | ❌ | ❌† | ❌† | ✅ |
| Edit data aset | ❌ | ❌† | ❌† | ✅ |
| Hapus aset | ❌ | ❌† | ❌† | ✅ |
| Approve peminjaman | ❌ | ❌† | ❌† | ✅ |
| Input disposal | ❌ | ❌† | ❌† | ✅ |
| **LAPORAN & KPI** | | | | |
| Statistik personal | ✅ | ✅ | ✅ | ✅ |
| Laporan KPI tim | ❌ | ❌ | ✅ | ✅ |
| KPI diri sendiri (terkunci) | ❌ | ✅ | ✅ | ✅ |
| Pilih staf di laporan | ❌ | ❌ | ✅ | ✅ |
| Performa semua staf | ❌ | ❌ | ✅ | ✅ |
| Unduh CSV KPI sendiri | ❌ | ✅ | ✅ | ✅ |
| Unduh CSV semua staf | ❌ | ❌ | ✅ | ✅ |
| Dokumen cetak KPI (/reports/kpi/print) | ❌ | ✅ (diri sendiri) | ✅ (semua) | ✅ (semua) |
| **DAILY TASK** | | | | |
| Lihat daily task | ❌ | ✅ (milik sendiri) | ✅ (semua) | ✅ (semua) |
| Catat daily task | ❌ | ✅ | ✅ | ✅ |
| Edit/hapus daily task | ❌ | ✅ (milik sendiri) | ✅ (semua) | ✅ (semua) |
| **MONITORING** | | | | |
| Lihat dashboard monitoring | ❌ | ✅ | ✅ | ✅ |
| Atur target pendapatan | ❌ | ❌ | ❌ | ✅ |
| **MANAJEMEN** | | | | |
| Tambah/edit/hapus user | ❌ | ❌ | ✅ | ✅ |
| Nonaktifkan user | ❌ | ❌ | ✅ | ✅ |
| Atur RBAC per role | ❌ | ❌ | ❌ | ✅ |
| Atur RBAC per user | ❌ | ❌ | ❌ | ✅ |

> `❌†` = bisa diberikan oleh Admin melalui Manajemen Akses

---

## 10. Panduan Deploy

### Prasyarat
- Docker & Docker Compose terinstall
- File `.env` sudah diisi (salin dari `.env.example`)

### Langkah Deploy

```bash
# 1. Jalankan PostgreSQL via Docker
docker compose up -d postgres

# 2. Tunggu database siap
sleep 10

# 3. Jalankan migrasi database (34 migration)
./bin/migrate.exe

# 4. (Opsional) Seed data contoh — lihat seeds/README.md
# psql -U ticketing_user -d ticketing_it -f seeds/seed_sample_tickets.sql

# 5. Jalankan backend server
./bin/api.exe

# 6. Build dan jalankan frontend
cd frontend && npm run build && npm start
```

> **Catatan migrasi:** `migrate.exe` membaca `DATABASE_URL` dari `.env` dan folder `migrations/` relatif ke direktori kerjanya — jadi jalankan dari `backend/`. Tidak perlu flag `-url`/`-path`. Output normal: `Found 34 migration files, 34 already applied`. Kalau dijalankan dari folder lain: `scan migrations: open migrations: The system cannot find the file specified.`

### Environment Variables (.env)

```env
APP_ENV=development
APP_HOST=              # kosong = 0.0.0.0 (dev); production isi 127.0.0.1
APP_PORT=8080
DATABASE_URL=postgres://user:***@localhost:5432/ticketing_it?sslmode=disable
SIMRS_DATABASE_URL=    # opsional; kosongkan bila modul Monitoring tidak dipakai
JWT_SECRET=your-secret-key-minimum-32-chars
CORS_ALLOWED_ORIGINS=http://localhost:3000
ALLOW_PUBLIC_REGISTRATION=false
SLA_CHECK_MINUTES=5
```

> Di production (`APP_ENV=production`) aplikasi **menolak start** bila `JWT_SECRET` masih default/pendek atau CORS masih menunjuk `localhost`.

### Port Default
| Service | Port |
|---|---|
| Backend API | 8080 |
| Frontend | 3000 |
| PostgreSQL | 5432 |

---

## 11. FAQ & Troubleshooting

**Q: Tiket saya sudah masuk tapi tidak ada yang kerjakan?**
A: Tiket perlu disetujui Leader/Admin terlebih dahulu. Hubungi Leader IT untuk mereview tiketmu.

**Q: Saya tidak bisa mengakses menu Asset / Laporan?**
A: Akses modul dikontrol oleh Admin. Minta Admin memberikan akses view atau editor ke akunmu di halaman Manajemen Akses.

**Q: Akun saya terkunci tidak bisa login?**
A: Mungkin terjadi 5 kali percobaan login gagal. Tunggu 15 menit atau hubungi Admin untuk membuka kunci lebih cepat.

**Q: Notifikasi tidak muncul?**
A: Pastikan browser tidak memblokir koneksi WebSocket. Refresh halaman dan login ulang.

**Q: Grafik monitoring tidak update?**
A: Grafik monitoring auto-refresh setiap 30 detik. Pastikan koneksi ke database SIMRS aktif.

**Q: Bagaimana cara mengubah akses user tertentu tanpa mengubah akses semua user role-nya?**
A: Admin gunakan tab **Per User** di halaman Manajemen Akses. Set override akses untuk individu tersebut.

**Q: Apakah ada cara melihat riwayat perubahan tiket?**
A: Ya. Buka detail tiket dan gulir ke bagian komentar. Semua aksi tercatat sebagai komentar sistem (klaim, reassign, reopen, perubahan deadline).

**Q: Garis target di grafik monitoring tidak muncul?**
A: Garis target hanya muncul di periode **Tahunan**. Pastikan Admin sudah mengisi target di menu Konfigurasi Dashboard.

**Q: Kenapa saya (staf IT) tidak bisa melihat KPI rekan setim?**
A: Itu memang aturannya. Halaman laporan membaca role yang login — `staff_it` hanya mendapat KPI dirinya sendiri, dan server memaksa `staff_id` ke ID kamu. Yang bisa melihat semua staf hanya `leader` dan `admin`. Kalau kamu butuh melihat data tim, minta Admin menaikkan role-mu.

**Q: Kenapa dropdown pilih staf tidak muncul di halaman KPI?**
A: Dropdown itu hanya untuk `leader`/`admin`. Untuk staf IT kontrolnya diganti ikon kunci karena server tidak akan mengabulkan permintaan melihat staf lain — menampilkan dropdown hanya akan menyesatkan.

**Q: Angka di kartu ringkasan beda dengan jumlah baris tabel?**
A: Kartu ringkasan dihitung server dari tiket yang kamu klaim; tabel detail juga disaring ke tiket yang kamu pegang. Kalau dulu pernah terlihat beda, itu bug lama yang sudah diperbaiki — sekarang keduanya bersumber dari cakupan yang sama.

**Q: Bagaimana cara mencetak BAST?**
A: BAST hanya bisa dicetak untuk tiket berstatus **closed**, oleh staf IT/leader/admin. Buka detail tiket → tombol **🖨️ Cetak BAST** di header. Pelapor tanda tangan di kertas, lalu scan-nya diunggah kembali lewat panel **Bukti Serah-Terima**. Role `user` hanya bisa melihat dokumen yang sudah diunggah.

**Q: Apakah wajib upload scan BAST saat resolve?**
A: Tidak. Resolve bisa dilakukan tanpa lampiran. Dokumen BAST diurus setelah tiket ditutup.

**Q: Apa bedanya Daily Task dengan tiket?**
A: Tiket punya approval, SLA, dan rating — permintaan resmi. Daily Task mencatat pekerjaan kecil yang masuk lewat WhatsApp tanpa tiket. Keduanya sama-sama dihitung di KPI, tapi Daily Task hanya bisa dicatat oleh `staff_it`/`leader`/`admin`.

**Q: Durasi dan response time Daily Task dihitung bagaimana?**
A: Oleh database, bukan browser. **Durasi** = waktu selesai − waktu mulai; **respon time** = waktu mulai − waktu komplain. Karena itu isi ketiga jam tersebut dengan benar.

**Q: Kode tiket saya tidak berurutan dengan tiket lain?**
A: Nomor urut dihitung **per prefix kategori**. Tiket `SIMRS-00002` dan `NTWRK-00029` punya penghitung masing-masing, jadi urutannya tidak akan sama antar kategori.

**Q: Sidebar ikut tergulir saat membuka form panjang?**
A: Sudah diperbaiki — sidebar tetap di tempat, hanya area konten yang menggulir.

---

## 12. Riwayat Versi

### Versi 2.2 — November 2026
- **Halaman Profil (`/profile`)** — setiap user bisa mengganti kata sandinya sendiri dengan verifikasi password lama; menu profil di sidebar
- **Reset password oleh leader/admin** — tombol kunci di Manajemen User, tanpa password lama, dibatasi hierarki role
- **Sesi lama otomatis berakhir** — perubahan password mencatat `password_changed_at`; token yang terbit sebelumnya langsung ditolak server (claim `pwd_at`)
- **Wajib ganti password setelah direset** — banner di halaman Profil meminta pemilik akun membuat password sendiri
- Migrasi database bertambah menjadi **35 file** (000035 untuk jejak perubahan password)

### Versi 2.1 — November 2026
- **Kode tiket per kategori** — prefix `SIMRS`, `NTWRK`, `HW`, `SW`, `ACC`; nomor urut lima digit per prefix, penghitung atomik di tabel `ticket_code_counters`
- **BAST (Berita Acara Serah-Terima)** — cetak untuk tiket `closed`, unggah scan balik ke tiket
- **Daily Task** — pencatatan pekerjaan harian di luar tiket, durasi & respon time dihitung database
- **Laporan KPI gabungan** — tiket + daily task dalam satu laporan, unduhan CSV, dokumen cetak per staf
- **RBAC laporan & KPI** — `staff_it` terkunci ke KPI dirinya sendiri (ditegakkan di server), `leader`/`admin` melihat semua staf dan bisa memilih staf
- **Resolve tanpa lampiran** — bukti penyelesaian tidak lagi wajib
- **Sidebar tetap** — hanya area konten yang menggulir
- Migrasi database bertambah menjadi **34 file** (000032–000034 untuk BAST, kode tiket, daily task)

### Versi 2.0 — Oktober 2026
- Modul Asset Management (inventaris, peminjaman, disposal)
- RBAC per modul dan per user
- Monitoring SIMRS real-time

### Versi 1.0 — Agustus 2026
- Rilis awal: sistem tiket, approval, notifikasi WebSocket

---

```
╔══════════════════════════════════════════════════════════╗
║       IT Helpdesk & Asset Management System              ║
║       Hak Cipta © 2026 Firaz Faruq                       ║
╠══════════════════════════════════════════════════════════╣
║  Penulis  : Firaz Faruq                                  ║
║  Email    : firaz.faruq@gmail.com                        ║
║  Tahun    : 2026                                         ║
╠══════════════════════════════════════════════════════════╣
║  Seluruh karya dalam proyek ini — termasuk namun tidak   ║
║  terbatas pada desain antarmuka, arsitektur sistem,      ║
║  skema database, logika bisnis, dan implementasi kode    ║
║  — merupakan karya orisinal Firaz Faruq.                 ║
║                                                          ║
║  Dilarang menyalin, mendistribusikan, atau menggunakan   ║
║  sebagian atau seluruh kode dan desain tanpa izin        ║
║  tertulis dari pemilik.                                  ║
╚══════════════════════════════════════════════════════════╝
```

---

*Dokumen ini ditulis berdasarkan implementasi aktual sistem.*
*Untuk pertanyaan teknis: firaz.faruq@gmail.com*
