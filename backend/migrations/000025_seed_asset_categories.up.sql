-- Seed default asset categories for IT inventory
INSERT INTO asset_categories (id, name, description) VALUES
    (gen_random_uuid(), 'Input Device', 'Perangkat input: mouse, keyboard, webcam, scanner, barcode reader'),
    (gen_random_uuid(), 'Output Device', 'Perangkat output: monitor, printer, projector, speaker'),
    (gen_random_uuid(), 'Computing', 'Perangkat komputasi: laptop, desktop, server, tablet, thin client'),
    (gen_random_uuid(), 'Network', 'Perangkat jaringan: router, switch, access point, firewall, modem'),
    (gen_random_uuid(), 'Storage', 'Perangkat penyimpanan: HDD, SSD, NAS, flashdisk, external drive'),
    (gen_random_uuid(), 'Accessories', 'Aksesoris IT: kabel, adapter, dock, headset, UPS, surge protector')
ON CONFLICT (name) DO NOTHING;
