-- Remove seeded categories
DELETE FROM asset_categories WHERE name IN (
    'Input Device', 'Output Device', 'Computing', 'Network', 'Storage', 'Accessories'
);
