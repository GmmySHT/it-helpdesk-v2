-- Migration: Create asset_disposals table
-- Tracks asset disposal/destruction records

CREATE TYPE disposal_method AS ENUM ('recycle', 'donate', 'destroy', 'sell');

CREATE TABLE asset_disposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES assets(id),
    reason TEXT NOT NULL,
    disposal_method disposal_method NOT NULL DEFAULT 'destroy',
    disposed_by UUID NOT NULL REFERENCES users(id),
    disposed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    certificate_number VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_disposals_asset ON asset_disposals(asset_id);
