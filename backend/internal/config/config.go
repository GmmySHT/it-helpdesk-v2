package config

import (
	"os"

	"github.com/joho/godotenv"
)

// Config menyimpan seluruh konfigurasi aplikasi yang diambil dari environment variables.
type Config struct {
	AppPort          string
	DatabaseURL      string
	SIMRSDatabaseURL string
	JWTSecret        string
}

func Load() *Config {
	_ = godotenv.Load()

	return &Config{
		AppPort:          getEnv("APP_PORT", "8080"),
		DatabaseURL:      getEnv("DATABASE_URL", "postgres://ticketing_user:***@localhost:5432/ticketing_it?sslmode=disable"),
		SIMRSDatabaseURL: getEnv("SIMRS_DATABASE_URL", "postgres://itrs:***@172.0.40.106:5234/db_rsih_simulasi?sslmode=disable"),
		JWTSecret:        getEnv("JWT_SECRET", "change-me-in-production"),
	}
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok && value != "" {
		return value
	}
	return fallback
}
