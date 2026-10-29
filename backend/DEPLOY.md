# Panduan Deploy Production — IT Helpdesk

Susunan yang disarankan: **satu domain HTTPS** → reverse proxy (Caddy) → frontend Next.js (`127.0.0.1:3000`) dan backend Go (`127.0.0.1:8080`). Hanya port **443** yang terbuka ke jaringan.

```
Pengguna --HTTPS 443--> Caddy --/api, /ws, /uploads--> Backend Go  127.0.0.1:8080 --> PostgreSQL (aplikasi)
                              \--(lainnya)-----------> Next.js     127.0.0.1:3000      \-> PostgreSQL SIMRS (read-only)
```

## 1. Sebelum mulai
- [ ] Ganti kredensial yang pernah ikut terkirim/ter-commit (password database, `.env` lama).
- [ ] Buat `JWT_SECRET` baru (PowerShell):
  ```powershell
  $b = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
  ```
- [ ] Minta DBA menjalankan `deploy/simrs-readonly.sql` → akun `ticketing_ro` (hanya baca) untuk SIMRS.
- [ ] Buat user database aplikasi dengan hak minimum (bukan superuser) untuk `ticketing_it`.

## 2. Backend
```powershell
cd C:\laragon\www\ticketing-it\backend
go build -o ticketing-api.exe ./cmd/api
```
Salin ke server, mis. `C:\apps\ticketing\`:
```
C:\apps\ticketing\
  ticketing-api.exe
  .env              <- dari .env.production.example, isi nilai asli
  uploads\          <- dibuat otomatis
```
Jalankan migrasi database seperti biasa sebelum start pertama.

Uji manual dulu: `.\ticketing-api.exe`. Dengan `APP_ENV=production`, aplikasi **menolak start** bila `JWT_SECRET` masih default/pendek atau CORS masih ke `localhost` — itu disengaja.

### Jadikan service Windows (NSSM)
```powershell
nssm install TicketingAPI "C:\apps\ticketing\ticketing-api.exe"
nssm set TicketingAPI AppDirectory "C:\apps\ticketing"      # penting: .env & uploads dicari relatif ke folder ini
nssm set TicketingAPI Start SERVICE_AUTO_START
nssm start TicketingAPI
```

## 3. Frontend
Buat `.env.production` di folder frontend (lihat `.env.production.example`), lalu:
```powershell
cd C:\laragon\www\ticketing-it\frontend
npm ci
npm run build          # NEXT_PUBLIC_API_URL ikut tertanam SAAT build — ulangi build kalau URL berubah
```
Service:
```powershell
nssm install TicketingWeb "C:\Program Files\nodejs\node.exe" "node_modules\next\dist\bin\next" start -p 3000 -H 127.0.0.1
nssm set TicketingWeb AppDirectory "C:\apps\ticketing-web"
nssm start TicketingWeb
```

## 4. Reverse proxy & HTTPS
Pakai `deploy/Caddyfile.example` (ganti domain). Poin penting yang sudah ada di contoh:
- WebSocket (`/ws`) diteruskan ke backend.
- Batas upload 50 MB.
- Token WebSocket (`?token=`) **tidak dicatat** di log akses.

Pakai Nginx/IIS? Syaratnya sama: teruskan `X-Forwarded-For` & `X-Forwarded-Proto`, izinkan upgrade WebSocket, batasi body 50 MB, dan jangan catat query string path `/ws`.

## 5. Firewall
```powershell
New-NetFirewallRule -DisplayName "Helpdesk HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
```
Pastikan **tidak ada** aturan inbound untuk 8080, 3000, dan 5432. Backend memang hanya mendengarkan `127.0.0.1` (`APP_HOST`). Itu juga yang membuat header `X-Forwarded-For` aman dipercaya.

## 6. Backup (jadwalkan harian lewat Task Scheduler)
```powershell
pg_dump -h 127.0.0.1 -U ticketing_user -Fc ticketing_it -f "D:\backup\ticketing_$(Get-Date -Format yyyyMMdd).dump"
robocopy C:\apps\ticketing\uploads D:\backup\uploads /MIR
```
Uji **restore** minimal sekali; backup yang belum pernah diuji belum bisa dianggap ada.

## 7. Uji setelah deploy (ganti `https://helpdesk.contoh-rs.id`)
```powershell
$u = "https://helpdesk.contoh-rs.id"
curl.exe -I $u/health                                   # ada X-Content-Type-Options & Strict-Transport-Security
curl.exe -i -X POST $u/api/v1/auth/register             # harus 404/405 (registrasi publik mati)
curl.exe -i $u/uploads/                                 # harus 404 (tidak ada daftar folder)
curl.exe -i $u/api/v1/tickets                           # harus 401 tanpa token
```
Uji manual di aplikasi:
- [ ] Salah password untuk satu akun: mulai percobaan ke-3 muncul "Sisa N percobaan…"; pada percobaan ke-5 muncul "Akun dikunci 15 menit…" (429).
- [ ] Setelah akun terkunci: admin & leader menerima notifikasi "Akun Terkunci", pemilik akun menerima "Percobaan Login Gagal" (terlihat saat ia berhasil login), dan log server memuat baris `SECURITY: akun ... dikunci`.
- [ ] Login sebagai pelapor A, buka tautan tiket milik pelapor B → "tiket tidak ditemukan".
- [ ] Unggah file `.html`/`.exe` (walau diganti nama `.jpg`) sebagai gambar → ditolak.
- [ ] Nonaktifkan sebuah akun lewat Manajemen User → sesi aktifnya terputus maksimal ±15 detik.
- [ ] Matikan koneksi SIMRS → halaman Monitoring menampilkan banner, halaman lain normal.

## 8. Yang belum tercakup (tahap berikutnya)
- Halaman **ganti password** dan reset password oleh user sendiri.
- Token login masih di `localStorage` (rentan jika ada celah XSS); cookie `HttpOnly` lebih aman.
- Autentikasi dua langkah (2FA) untuk akun leader/admin.
- Audit log (siapa mengubah apa), pemindaian antivirus untuk unggahan, dan pemantauan/alert (uptime, disk, error).
- Pembatasan laju (rate limit) umum di tingkat reverse proxy; saat ini hanya login yang dibatasi di aplikasi.
- Pembaruan rutin OS, Go, Node, dan dependency.
