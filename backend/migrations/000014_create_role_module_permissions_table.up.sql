CREATE TYPE access_level AS ENUM ('none', 'view', 'editor');

CREATE TABLE role_module_permissions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role       user_role NOT NULL,
    module_id  UUID NOT NULL REFERENCES modules(id),
    access_level access_level NOT NULL DEFAULT 'none',
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (role, module_id)
);

-- Default: modul Ticketing tetap 'editor' untuk semua role (supaya perilaku
-- yang sudah jalan sekarang TIDAK berubah — aturan detail siapa boleh
-- klaim/resolve/close tetap dari logika role yang sudah ada, bukan dari
-- tabel ini). Modul lain (asset, reports) baru sebatas 'view' untuk
-- staf/leader/admin sebagai placeholder, karena fiturnya belum dibangun.
INSERT INTO role_module_permissions (role, module_id, access_level)
SELECT r.role::user_role, m.id,
    CASE
        WHEN m.code = 'ticketing' THEN 'editor'::access_level
        WHEN m.code = 'access_management' AND r.role = 'admin' THEN 'editor'::access_level
        WHEN m.code = 'access_management' THEN 'none'::access_level
        WHEN r.role = 'user' THEN 'none'::access_level
        ELSE 'view'::access_level
    END
FROM (VALUES ('user'), ('staff_it'), ('leader'), ('admin')) AS r(role)
CROSS JOIN modules m;
