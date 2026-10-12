-- Seed Sample Tickets
-- Jalankan setelah migrasi selesai dan sudah ada users + categories
-- Sesuaikan UUID user_id dengan data user yang ada di database

-- CONTOH: Tiket Hardware - Status Open
INSERT INTO tickets (
    title,
    description,
    category_id,
    priority,
    status,
    reporter_id,
    created_by_id,
    created_for_id,
    created_at
) VALUES (
    'Keyboard rusak tidak bisa mengetik',
    'Keyboard di ruang IT lantai 2 beberapa tombol tidak berfungsi, mohon diganti',
    (SELECT id FROM categories WHERE name = 'Hardware' LIMIT 1),
    'medium',
    'open',
    '00000000-0000-0000-0000-000000000001',  -- ganti dengan UUID reporter yang valid
    '00000000-0000-0000-0000-000000000001',  -- created_by (sama dengan reporter atau leader)
    NULL,  -- created_for (NULL jika user buat sendiri, isi UUID jika leader buat untuk user lain)
    now() - interval '2 days'
);

-- CONTOH: Tiket Software - Status In Progress dengan assignee
INSERT INTO tickets (
    title,
    description,
    category_id,
    priority,
    status,
    reporter_id,
    assignee_id,
    created_by_id,
    created_at
) VALUES (
    'Install aplikasi Microsoft Teams',
    'Butuh instalasi Teams untuk meeting online',
    (SELECT id FROM categories WHERE name = 'Software' LIMIT 1),
    'low',
    'in_progress',
    '00000000-0000-0000-0000-000000000002',  -- reporter
    '00000000-0000-0000-0000-000000000003',  -- assignee (staff_it)
    '00000000-0000-0000-0000-000000000002',
    now() - interval '1 day'
);

-- CONTOH: Tiket Jaringan - Status Resolved
INSERT INTO tickets (
    title,
    description,
    category_id,
    priority,
    status,
    reporter_id,
    assignee_id,
    created_by_id,
    resolved_at,
    created_at
) VALUES (
    'Wifi tidak konek di ruang meeting',
    'Koneksi wifi di ruang meeting A putus-putus, mohon diperbaiki',
    (SELECT id FROM categories WHERE name = 'Jaringan' LIMIT 1),
    'high',
    'resolved',
    '00000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000003',  -- staff_it
    '00000000-0000-0000-0000-000000000004',
    now() - interval '2 hours',
    now() - interval '5 hours'
);

-- CONTOH: Tiket Urgent - Status Closed dengan rating
INSERT INTO tickets (
    title,
    description,
    category_id,
    priority,
    status,
    reporter_id,
    assignee_id,
    created_by_id,
    resolved_at,
    closed_at,
    created_at
) VALUES (
    'Server down tidak bisa akses sistem',
    'Server utama mati mendadak, semua user tidak bisa login',
    (SELECT id FROM categories WHERE name = 'Hardware' LIMIT 1),
    'urgent',
    'closed',
    '00000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000005',
    now() - interval '1 day',
    now() - interval '12 hours',
    now() - interval '2 days'
);

-- CONTOH: Tiket Pending Approval (leader buat untuk user)
INSERT INTO tickets (
    title,
    description,
    category_id,
    priority,
    status,
    reporter_id,
    created_by_id,
    created_for_id,
    created_at
) VALUES (
    'Permintaan akses VPN untuk WFH',
    'User butuh akses VPN untuk bekerja dari rumah',
    (SELECT id FROM categories WHERE name = 'Akun & Akses' LIMIT 1),
    'medium',
    'pending_approval',
    '00000000-0000-0000-0000-000000000006',  -- reporter (leader)
    '00000000-0000-0000-0000-000000000006',  -- created_by (leader)
    '00000000-0000-0000-0000-000000000007',  -- created_for (user yang dibuatkan)
    now() - interval '3 hours'
);

-- Template kosong untuk tambahan:
/*
INSERT INTO tickets (
    title,
    description,
    category_id,
    priority,           -- 'low', 'medium', 'high', 'urgent'
    status,             -- 'open', 'pending_approval', 'in_progress', 'resolved', 'closed'
    reporter_id,        -- UUID user pelapor
    assignee_id,        -- UUID staff_it (NULL jika belum di-assign)
    created_by_id,      -- UUID pembuat tiket
    created_for_id,     -- UUID user yang dibuatkan (NULL jika buat sendiri)
    created_at
) VALUES (
    'Judul tiket',
    'Deskripsi masalah',
    (SELECT id FROM categories WHERE name = 'Hardware' LIMIT 1),
    'medium',
    'open',
    '00000000-0000-0000-0000-000000000000',
    NULL,
    '00000000-0000-0000-0000-000000000000',
    NULL,
    now()
);
*/
