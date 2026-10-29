package config

import (
	"errors"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
)

const defaultJWTSecret = "change-me-in-production"

// Config menyimpan seluruh konfigurasi aplikasi yang diambil dari environment variables.
type Config struct {
	// AppEnv: "production" mengaktifkan pemeriksaan keamanan ketat saat startup
	// (lihat Validate). Selain itu dianggap development.
	AppEnv string

	// AppHost = alamat yang didengarkan server. Kosong = semua interface.
	// Di belakang reverse proxy pada mesin yang sama, isi 127.0.0.1 supaya
	// backend tidak bisa dijangkau langsung dari jaringan.
	AppHost string

	AppPort          string
	DatabaseURL      string
	SIMRSDatabaseURL string // kosong = modul Monitoring dinonaktifkan
	JWTSecret        string

	// AllowedOrigins = daftar origin frontend yang boleh memanggil API dan
	// membuka WebSocket (CORS_ALLOWED_ORIGINS, dipisah koma).
	AllowedOrigins []string

	// AllowPublicRegistration membuka endpoint POST /auth/register. Default
	// MATI: akun dibuat oleh leader/admin lewat menu Manajemen User.
	AllowPublicRegistration bool

	// SLACheckMinutes = jeda pengecekan pengingat SLA di background.
	SLACheckMinutes int
}

func Load() *Config {
	_ = godotenv.Load()

	return &Config{
		AppEnv:  strings.ToLower(getEnv("APP_ENV", "development")),
		AppHost: getEnv("APP_HOST", ""),
		AppPort: getEnv("APP_PORT", "8080"),
		// Default ini HANYA nyaman untuk development lokal. Di production
		// DATABASE_URL wajib diisi lewat environment (lihat Validate).
		DatabaseURL: getEnv("DATABASE_URL", "postgres://ticketing_user:ticketing_pass@localhost:5432/ticketing_it?sslmode=disable"),
		// Sengaja TANPA default: alamat & kredensial SIMRS tidak boleh
		// tertanam di kode. Kosong = Monitoring nonaktif.
		SIMRSDatabaseURL:        getEnv("SIMRS_DATABASE_URL", ""),
		JWTSecret:               getEnv("JWT_SECRET", defaultJWTSecret),
		AllowedOrigins:          splitList(getEnv("CORS_ALLOWED_ORIGINS", "http://localhost:3000")),
		AllowPublicRegistration: getBool("ALLOW_PUBLIC_REGISTRATION", false),
		SLACheckMinutes:         getInt("SLA_CHECK_MINUTES", 5),
	}
}

func (c *Config) IsProduction() bool { return c.AppEnv == "production" }

// Validate menolak konfigurasi yang berbahaya. Di production, kesalahan
// fatal membuat aplikasi TIDAK mau start (lebih baik gagal start daripada
// jalan dengan secret default yang bisa dipakai memalsukan token admin).
// Di development hanya memberi peringatan.
func (c *Config) Validate() error {
	var problems []string

	if c.JWTSecret == defaultJWTSecret || len(c.JWTSecret) < 32 {
		problems = append(problems,
			"JWT_SECRET masih default atau kurang dari 32 karakter — isi dengan string acak panjang")
	}
	if c.IsProduction() {
		if _, ok := os.LookupEnv("DATABASE_URL"); !ok {
			problems = append(problems, "DATABASE_URL wajib diisi di production")
		}
		for _, o := range c.AllowedOrigins {
			if strings.Contains(o, "localhost") || strings.Contains(o, "127.0.0.1") {
				problems = append(problems,
					fmt.Sprintf("CORS_ALLOWED_ORIGINS masih memuat %q — isi dengan domain frontend yang sebenarnya", o))
			}
		}
	}

	if len(problems) == 0 {
		return nil
	}
	if c.IsProduction() {
		return errors.New(strings.Join(problems, "; "))
	}
	for _, p := range problems {
		log.Printf("PERINGATAN konfigurasi (development): %s", p)
	}
	return nil
}

func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok && value != "" {
		return value
	}
	return fallback
}

func getBool(key string, fallback bool) bool {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return fallback
}

func getInt(key string, fallback int) int {
	if v, ok := os.LookupEnv(key); ok && v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return fallback
}

func splitList(s string) []string {
	var out []string
	for _, part := range strings.Split(s, ",") {
		if p := strings.TrimSpace(part); p != "" {
			out = append(out, p)
		}
	}
	return out
}
