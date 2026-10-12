-- Migration: Create assets table
-- IT assets inventory with tracking per unit

CREATE TYPE asset_condition AS ENUM ('available', 'borrowed', 'needs_repair', 'broken', 'awaiting_disposal', 'disposed');

CREATE TABLE assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES asset_categories(id),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    brand VARCHAR(100),
    model VARCHAR(100),
    serial_number VARCHAR(200) UNIQUE,
    condition asset_condition NOT NULL DEFAULT 'available',
    stock INTEGER NOT NULL DEFAULT 1,
    location VARCHAR(200),
    notes TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_assets_category ON assets(category_id);
CREATE INDEX idx_assets_condition ON assets(condition);
CREATE INDEX idx_assets_code ON assets(code);
