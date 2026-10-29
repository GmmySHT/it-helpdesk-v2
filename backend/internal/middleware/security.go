package middleware

import (
	"log"
	"net/http"
	"strings"
	"time"

	chimw "github.com/go-chi/chi/v5/middleware"
)

// SecurityHeaders menambahkan header keamanan standar ke semua response.
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "no-referrer")

		// HSTS hanya bermakna lewat HTTPS (langsung, atau lewat reverse proxy
		// yang meneruskan X-Forwarded-Proto).
		if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
			h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}

		// Data API bersifat pribadi & berubah-ubah: jangan di-cache browser/proxy.
		if strings.HasPrefix(r.URL.Path, "/api/") {
			h.Set("Cache-Control", "no-store")
		}
		next.ServeHTTP(w, r)
	})
}

// AccessLog mencatat satu baris per request: metode, PATH (tanpa query string),
// status, ukuran, dan durasi. Query string sengaja TIDAK dicatat karena koneksi
// WebSocket membawa token login di ?token=... — chi middleware.Logger bawaan
// akan menuliskan token itu ke log.
func AccessLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		// Koneksi WebSocket di-hijack; jangan dibungkus supaya aman.
		if r.URL.Path == "/ws" {
			log.Printf("%s %s (websocket) dari %s", r.Method, r.URL.Path, r.RemoteAddr)
			next.ServeHTTP(w, r)
			return
		}

		ww := chimw.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r)
		log.Printf("%s %s %d %dB %s dari %s",
			r.Method, r.URL.Path, ww.Status(), ww.BytesWritten(),
			time.Since(start).Round(time.Millisecond), r.RemoteAddr)
	})
}

// LimitBody membatasi ukuran body request: jsonMax untuk request biasa,
// multipartMax untuk upload file. Mencegah request raksasa menghabiskan
// memori/disk server.
func LimitBody(jsonMax, multipartMax int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			max := jsonMax
			if strings.HasPrefix(r.Header.Get("Content-Type"), "multipart/") {
				max = multipartMax
			}
			r.Body = http.MaxBytesReader(w, r.Body, max)
			next.ServeHTTP(w, r)
		})
	}
}
