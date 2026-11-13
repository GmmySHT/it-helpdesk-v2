-- Modul Daily Task: catatan pekerjaan harian staf/leader di luar tiket.
--
-- Kenapa terpisah dari tabel tickets: daily task adalah permintaan kecil yang
-- masuk lewat WhatsApp (tidak pernah jadi tiket resmi), tapi tetap harus
-- dihitung sebagai beban kerja staff di laporan KPI. Mencampurnya ke tabel
-- tickets akan merusak statistik tiket (SLA, approval, rating) yang sudah ada.

-- Dropdown Unit. Sebelumnya unit hanya tersimpan sebagai teks bebas di
-- users.department sehingga tidak bisa dipakai sebagai pilihan konsisten.
CREATE TABLE units (
    id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE
);

INSERT INTO units (name) VALUES
    ('SIMRS'),
    ('Jaringan'),
    ('Hardware'),
    ('Software'),
    ('Akun & Akses'),
    ('Radiologi'),
    ('Laboratorium'),
    ('Farmasi'),
    ('Rawat Inap'),
    ('Rawat Jalan'),
    ('IGD'),
    ('Kasir'),
    ('Rekam Medis'),
    ('Manajemen'),
    ('IT')
ON CONFLICT (name) DO NOTHING;

-- Unit yang sudah dipakai di data user ikut dimasukkan supaya dropdown
-- tidak kosong di instalasi yang unitnya berbeda.
INSERT INTO units (name)
SELECT DISTINCT department FROM users
WHERE department IS NOT NULL AND department <> ''
ON CONFLICT (name) DO NOTHING;

CREATE TABLE daily_tasks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    task_date       DATE NOT NULL,

    -- Pelapor ditulis manual (nama orang/unit dari chat WA), bukan FK ke
    -- users — banyak pelapor daily task tidak punya akun di sistem.
    reporter_name   VARCHAR(150) NOT NULL,
    unit_id         UUID REFERENCES units(id) ON DELETE SET NULL,

    issue           VARCHAR(200) NOT NULL,   -- kendala singkat
    detail          TEXT,                     -- keterangan kendala
    solution        TEXT,

    -- Tiga titik waktu inti. Semuanya opsional kecuali complain_at, karena
    -- permintaan WA kadang langsung dikerjakan tanpa dicatat jam mulainya.
    complain_at     TIMESTAMPTZ NOT NULL,
    start_at        TIMESTAMPTZ,
    end_at          TIMESTAMPTZ,

    -- Durasi & response time dihitung database, bukan frontend: nilai ini
    -- dipakai laporan KPI, jadi harus konsisten walau data diedit dari mana pun.
    -- Response time = jam mulai - jam komplain (kecepatan merespons).
    -- Durasi        = jam selesai - jam mulai (lama pengerjaan).
    response_minutes INTEGER GENERATED ALWAYS AS (
        CASE WHEN start_at IS NOT NULL
             THEN GREATEST(0, round(EXTRACT(EPOCH FROM (start_at - complain_at)) / 60)::int)
        END
    ) STORED,
    duration_minutes INTEGER GENERATED ALWAYS AS (
        CASE WHEN start_at IS NOT NULL AND end_at IS NOT NULL
             THEN GREATEST(0, round(EXTRACT(EPOCH FROM (end_at - start_at)) / 60)::int)
        END
    ) STORED,

    -- Pencatat = staf/leader yang memasukkan data. Inilah yang dihitung di
    -- KPI per orang (bukan reporter_name).
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Jam selesai tidak boleh mendahului jam mulai, jam mulai tidak boleh
    -- mendahului jam komplain. Dicek di database supaya durasi tidak pernah
    -- negatif walau ada klien yang lupa memvalidasi.
    CONSTRAINT daily_tasks_time_order CHECK (
        (start_at IS NULL OR start_at >= complain_at) AND
        (end_at IS NULL OR start_at IS NULL OR end_at >= start_at)
    )
);

CREATE INDEX idx_daily_tasks_date ON daily_tasks (task_date DESC);
CREATE INDEX idx_daily_tasks_created_by ON daily_tasks (created_by);
CREATE INDEX idx_daily_tasks_unit ON daily_tasks (unit_id);
