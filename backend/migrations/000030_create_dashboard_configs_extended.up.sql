-- Create dashboard configs for editable targets
CREATE TABLE IF NOT EXISTS dashboard_configs (
    id SERIAL PRIMARY KEY,
    config_key VARCHAR(100) UNIQUE NOT NULL,
    config_value TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default revenue target (8.5 billion)
INSERT INTO dashboard_configs (config_key, config_value)
VALUES ('monthly_revenue_target', '8500000000')
ON CONFLICT (config_key) DO NOTHING;

-- Create index
CREATE INDEX idx_dashboard_configs_key ON dashboard_configs(config_key);
