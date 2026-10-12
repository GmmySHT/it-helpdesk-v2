-- Seed Sample Asset Borrowings
-- Jalankan setelah migrasi selesai dan sudah ada users + assets
-- Sesuaikan UUID dengan data user dan asset_id yang ada di database

-- CONTOH: Peminjaman Pending Approval
INSERT INTO asset_borrowings (
    asset_id,
    requester_id,
    quantity,
    borrow_date,
    return_deadline,
    status,
    purpose,
    notes,
    created_at
) VALUES (
    1,  -- ganti dengan ID aset yang valid (SELECT id FROM assets WHERE name = 'Laptop HP')
    '00000000-0000-0000-0000-000000000001',  -- UUID requester
    1,
    now() + interval '1 day',
    now() + interval '8 days',
    'pending_approval',
    'Untuk presentasi ke klien',
    'Butuh laptop dengan proyektor',
    now()
);

-- CONTOH: Peminjaman Approved
INSERT INTO asset_borrowings (
    asset_id,
    requester_id,
    quantity,
    borrow_date,
    return_deadline,
    status,
    approved_by_id,
    approved_at,
    purpose,
    created_at
) VALUES (
    2,  -- ID aset lain
    '00000000-0000-0000-0000-000000000002',
    1,
    now(),
    now() + interval '5 days',
    'approved',
    '00000000-0000-0000-0000-000000000003',  -- leader/admin yang approve
    now() - interval '1 hour',
    'Testing aplikasi mobile',
    now() - interval '2 hours'
);

-- CONTOH: Peminjaman Borrowed (sedang dipinjam)
INSERT INTO asset_borrowings (
    asset_id,
    requester_id,
    quantity,
    borrow_date,
    return_deadline,
    status,
    approved_by_id,
    approved_at,
    purpose,
    notes,
    created_at
) VALUES (
    3,
    '00000000-0000-0000-0000-000000000004',
    2,
    now() - interval '2 days',
    now() + interval '3 days',
    'borrowed',
    '00000000-0000-0000-0000-000000000003',
    now() - interval '3 days',
    'Event pameran IT',
    'Sudah diserahkan tanggal 10 Oktober',
    now() - interval '3 days'
);

-- CONTOH: Peminjaman Returned (sudah dikembalikan)
INSERT INTO asset_borrowings (
    asset_id,
    requester_id,
    quantity,
    borrow_date,
    return_deadline,
    actual_return_date,
    status,
    approved_by_id,
    approved_at,
    return_condition,
    return_notes,
    purpose,
    created_at
) VALUES (
    4,
    '00000000-0000-0000-0000-000000000005',
    1,
    now() - interval '10 days',
    now() - interval '3 days',
    now() - interval '2 days',
    'returned',
    '00000000-0000-0000-0000-000000000003',
    now() - interval '11 days',
    'good',  -- 'good', 'fair', 'damaged'
    'Dikembalikan dalam kondisi baik',
    'Workshop training karyawan',
    now() - interval '12 days'
);

-- CONTOH: Peminjaman Overdue (terlambat)
INSERT INTO asset_borrowings (
    asset_id,
    requester_id,
    quantity,
    borrow_date,
    return_deadline,
    status,
    approved_by_id,
    approved_at,
    purpose,
    created_at
) VALUES (
    5,
    '00000000-0000-0000-0000-000000000006',
    1,
    now() - interval '15 days',
    now() - interval '2 days',  -- deadline sudah lewat
    'overdue',
    '00000000-0000-0000-0000-000000000003',
    now() - interval '16 days',
    'Perbaikan sistem',
    now() - interval '16 days'
);

-- CONTOH: Peminjaman Rejected
INSERT INTO asset_borrowings (
    asset_id,
    requester_id,
    quantity,
    borrow_date,
    return_deadline,
    status,
    rejected_by_id,
    rejected_at,
    rejection_reason,
    purpose,
    created_at
) VALUES (
    6,
    '00000000-0000-0000-0000-000000000007',
    3,
    now() + interval '2 days',
    now() + interval '10 days',
    'rejected',
    '00000000-0000-0000-0000-000000000003',  -- leader/admin yang reject
    now() - interval '30 minutes',
    'Stok tidak mencukupi untuk jumlah yang diminta',
    'Backup untuk meeting besar',
    now() - interval '1 hour'
);

-- CONTOH: Peminjaman Cancelled (dibatalkan peminjam)
INSERT INTO asset_borrowings (
    asset_id,
    requester_id,
    quantity,
    borrow_date,
    return_deadline,
    status,
    purpose,
    notes,
    created_at
) VALUES (
    7,
    '00000000-0000-0000-0000-000000000008',
    1,
    now() + interval '5 days',
    now() + interval '12 days',
    'cancelled',
    'Demo produk ke customer',
    'Dibatalkan karena jadwal berubah',
    now() - interval '4 hours'
);

-- Template kosong untuk tambahan:
/*
INSERT INTO asset_borrowings (
    asset_id,           -- ID aset (SELECT id FROM assets)
    requester_id,       -- UUID peminjam
    quantity,           -- jumlah yang dipinjam
    borrow_date,        -- tanggal mulai pinjam
    return_deadline,    -- deadline pengembalian
    actual_return_date, -- tanggal dikembalikan (NULL jika belum)
    status,             -- 'pending_approval', 'approved', 'borrowed', 'returned', 'overdue', 'rejected', 'cancelled'
    approved_by_id,     -- UUID leader/admin yang approve (NULL jika belum)
    approved_at,        -- waktu approve
    rejected_by_id,     -- UUID yang reject (NULL jika tidak ditolak)
    rejected_at,        -- waktu reject
    rejection_reason,   -- alasan reject
    return_condition,   -- 'good', 'fair', 'damaged' (isi saat return)
    return_notes,       -- catatan saat dikembalikan
    purpose,            -- tujuan peminjaman
    notes,              -- catatan tambahan
    created_at
) VALUES (
    1,
    '00000000-0000-0000-0000-000000000000',
    1,
    now(),
    now() + interval '7 days',
    NULL,
    'pending_approval',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    'Keperluan...',
    NULL,
    now()
);
*/
