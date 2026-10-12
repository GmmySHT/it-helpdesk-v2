CREATE TABLE IF NOT EXISTS dashboard_configs (
    id SERIAL PRIMARY KEY,
    dashboard_name VARCHAR(100) UNIQUE NOT NULL,
    is_public BOOLEAN DEFAULT FALSE,
    show_revenue_to_public BOOLEAN DEFAULT FALSE,
    allowed_roles TEXT[] DEFAULT '{}',
    refresh_interval_seconds INTEGER DEFAULT 30,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO dashboard_configs (dashboard_name, is_public, allowed_roles) 
VALUES ('executive-monitoring', FALSE, '{admin,management}')
ON CONFLICT (dashboard_name) DO NOTHING;
