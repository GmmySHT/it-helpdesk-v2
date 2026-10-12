-- 1. Analisis Penjamin (Insurance Analysis)
-- Mengelompokkan pendapatan dan jumlah kunjungan berdasarkan penjamin.
-- Digunakan untuk Pie Chart/Bar Chart Penjamin Terbanyak vs Terendah.

SELECT 
    pm.penjamin_nama,
    cm.carabayar_nama as kategori_bayar,
    COUNT(p.pendaftaran_id) as total_kunjungan,
    SUM(pp.totalbiayapelayanan) as total_pendapatan,
    SUM(pp.totalsubsidiasuransi + pp.totalsubsidipemerintah) as total_subsidi
FROM pendaftaran_t p
JOIN penjaminpasien_m pm ON p.penjamin_id = pm.penjamin_id
JOIN carabayar_m cm ON p.carabayar_id = cm.carabayar_id
LEFT JOIN pembayaranpelayanan_t pp ON p.pendaftaran_id = pp.pendaftaran_id
GROUP BY pm.penjamin_nama, cm.carabayar_nama
ORDER BY total_pendapatan DESC;

-- 2. Analisis Kategori Bayar (Asuransi vs Umum)
-- Membandingkan cash flow dari pasien mandiri (Umum/Tunai) vs pihak ketiga.

SELECT 
    cm.carabayar_nama,
    COUNT(p.pendaftaran_id) as volume_pasien,
    SUM(pp.totalbayartindakan) as cash_in,
    SUM(pp.totalsisatagihan) as piutang
FROM pendaftaran_t p
JOIN carabayar_m cm ON p.carabayar_id = cm.carabayar_id
LEFT JOIN pembayaranpelayanan_t pp ON p.pendaftaran_id = pp.pendaftaran_id
GROUP BY cm.carabayar_nama
ORDER BY volume_pasien DESC;

-- 3. Matriks Performa Ruangan (Ruangan & Instalasi)
-- Menghitung ruangan mana yang paling sibuk dan memberikan kontribusi revenue tertinggi.

SELECT 
    im.instalasi_nama,
    rm.ruangan_nama,
    COUNT(t.tindakanpelayanan_id) as total_tindakan,
    SUM(t.tarif_tindakan) as total_tarif
FROM tindakanpelayanan_t t
JOIN ruangan_m rm ON t.ruangan_id = rm.ruangan_id
JOIN instalasi_m im ON rm.instalasi_id = im.instalasi_id
GROUP BY im.instalasi_nama, rm.ruangan_nama
ORDER BY total_tarif DESC;

-- 4. Analisis Komponen Pendapatan (Detail Medis/Non-Medis)
-- Memisahkan pendapatan dari Jasa Dokter vs BHP vs Jasa RS.

SELECT 
    km.komponentarif_nama,
    SUM(tk.tarif_tindakankomp) as total_komponen
FROM tindakankomponen_t tk
JOIN komponentarif_m km ON tk.komponentarif_id = km.komponentarif_id
GROUP BY km.komponentarif_nama
ORDER BY total_komponen DESC;
