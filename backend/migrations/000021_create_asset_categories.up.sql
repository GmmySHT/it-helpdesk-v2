-- Migration: Create asset_categories table
-- Categories for IT assets: Input Device, Output Device, Computing, Network, Storage, Accessories

CREATE TABLE asset_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed default categories
INSERT INTO asset_categories (name, description) VALUES
    ('Input Device', 'Mouse, keyboard, webcam, scanner, barcode reader'),
    ('Output Device', 'Monitor, printer, projector, speaker'),
    ('Computing', 'Laptop, desktop, server, tablet, thin client'),
    ('Network', 'Router, switch, access point, firewall, modem'),
    ('Storage', 'HDD, SSD, flashdisk, NAS, tape drive'),
    ('Accessories', 'Cable, adapter, dock, headset, UPS, surge protector');
