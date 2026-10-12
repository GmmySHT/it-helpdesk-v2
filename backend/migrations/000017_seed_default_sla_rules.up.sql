-- Mengisi aturan SLA default untuk semua kombinasi kategori x prioritas
-- yang sudah ada. Tanpa ini, fitur reminder SLA tidak akan pernah aktif
-- karena tidak ada aturan yang bisa dipakai menghitung deadline.
-- Angka-angka ini contoh wajar, admin/leader bisa sesuaikan nanti kalau
-- sudah ada halaman pengaturannya.
INSERT INTO sla_rules (category_id, priority, response_time_minutes, resolution_time_minutes)
SELECT c.id, p.priority, p.response_minutes, p.resolution_minutes
FROM categories c
CROSS JOIN (VALUES
    ('urgent'::ticket_priority, 15, 60),
    ('high'::ticket_priority, 30, 240),
    ('medium'::ticket_priority, 120, 480),
    ('low'::ticket_priority, 240, 1440)
) AS p(priority, response_minutes, resolution_minutes);
