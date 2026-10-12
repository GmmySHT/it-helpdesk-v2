-- Aktifkan pgcrypto agar bisa pakai gen_random_uuid() sebagai primary key.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE user_role AS ENUM ('user', 'staff_it', 'leader', 'admin');

CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(150) NOT NULL,
    email       VARCHAR(150) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role        user_role NOT NULL DEFAULT 'user',
    department  VARCHAR(100),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_role ON users (role);
