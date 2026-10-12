CREATE TABLE user_module_permissions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id),
    module_id    UUID NOT NULL REFERENCES modules(id),
    access_level access_level NOT NULL,
    granted_by   UUID NOT NULL REFERENCES users(id),  -- admin yang memberi override ini
    granted_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    note         TEXT,                                 -- alasan override, opsional
    UNIQUE (user_id, module_id)
);
