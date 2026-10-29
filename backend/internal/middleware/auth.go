package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"ticketing-it/backend/internal/model"
	"ticketing-it/backend/internal/repository"
	"ticketing-it/backend/internal/service"
)

type contextKey string

const (
	ContextUserID contextKey = "user_id"
	ContextRole   contextKey = "role"
)

// Auth memvalidasi JWT dari header Authorization: Bearer <token>, lalu
// memastikan akunnya masih aktif lewat SessionChecker. Role yang disisipkan
// ke context adalah role TERBARU dari database (bukan dari isi token).
func Auth(authService *service.AuthService, checker *SessionChecker) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("Authorization")
			if header == "" || !strings.HasPrefix(header, "Bearer ") {
				respondUnauthorized(w, "token tidak ditemukan")
				return
			}

			tokenString := strings.TrimPrefix(header, "Bearer ")
			claims, err := authService.ParseToken(tokenString)
			if err != nil {
				respondUnauthorized(w, "token tidak valid atau kedaluwarsa")
				return
			}

			role, status := checker.Check(r.Context(), claims.UserID)
			switch status {
			case SessionInvalid:
				respondUnauthorized(w, "akun tidak aktif atau tidak ditemukan")
				return
			case SessionError:
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusServiceUnavailable)
				json.NewEncoder(w).Encode(map[string]string{"error": "layanan sementara tidak tersedia, coba lagi"})
				return
			}

			ctx := context.WithValue(r.Context(), ContextUserID, claims.UserID)
			ctx = context.WithValue(ctx, ContextRole, role)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireRole membatasi akses hanya untuk role tertentu.
// Dipasang SETELAH middleware Auth, karena butuh role dari context.
func RequireRole(allowedRoles ...model.UserRole) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			role, _ := r.Context().Value(ContextRole).(model.UserRole)
			for _, allowed := range allowedRoles {
				if role == allowed {
					next.ServeHTTP(w, r)
					return
				}
			}
			respondForbidden(w, "kamu tidak punya akses untuk aksi ini")
		})
	}
}

func respondUnauthorized(w http.ResponseWriter, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

// respondForbidden dipakai saat token VALID tapi izinnya kurang (RBAC).
// SENGAJA 403, BUKAN 401 — supaya frontend tidak menganggap sesi habis
// dan memaksa logout. 401 = "siapa kamu?" (token invalid), 403 = "kamu
// sudah login tapi tidak boleh" (izin kurang).
func respondForbidden(w http.ResponseWriter, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusForbidden)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

// accessRank dipakai untuk membandingkan level akses secara numerik
// (none < view < editor), supaya RequireModuleAccess bisa cek
// "apakah izin user CUKUP", bukan cuma "apakah sama persis".
var accessRank = map[model.AccessLevel]int{
	model.AccessNone:   0,
	model.AccessView:   1,
	model.AccessEditor: 2,
}

// RequireModuleAccess adalah inti dari sistem RBAC — BUKAN sekadar cek role
// seperti RequireRole di atas, tapi benar-benar menghitung izin efektif
// (override per-user ATAU default per-role) dari tabel di database secara
// real-time. Inilah yang membuat perubahan di halaman "Manajemen Akses"
// langsung berpengaruh tanpa perlu deploy ulang kode.
//
// Dipasang SETELAH middleware Auth, karena butuh user_id & role dari context.
func RequireModuleAccess(permRepo *repository.PermissionRepository, moduleCode string, minLevel model.AccessLevel) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, _ := r.Context().Value(ContextUserID).(string)
			role, _ := r.Context().Value(ContextRole).(model.UserRole)

			level, err := permRepo.GetEffectiveLevel(r.Context(), userID, role, moduleCode)
			if err != nil {
				respondForbidden(w, "gagal memeriksa izin akses")
				return
			}

			if accessRank[level] < accessRank[minLevel] {
				respondForbidden(w, "kamu tidak punya izin cukup untuk mengakses modul ini")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}
