-- Key-value settings untuk aplikasi (target pendapatan, dll)
CREATE TABLE IF NOT EXISTS app_settings (
    id SERIAL PRIMARY KEY,
    config_key VARCHAR(100) UNIQUE NOT NULL,
    config_value TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default revenue target (8.5 miliar)
INSERT INTO app_settings (config_key, config_value)
VALUES ('monthly_revenue_target', '8500000000')
ON CONFLICT (config_key) DO NOTHING;

-- Create index
CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(config_key);
