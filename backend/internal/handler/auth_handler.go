package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"

	appmiddleware "ticketing-it/backend/internal/middleware"
	"ticketing-it/backend/internal/repository"
	"ticketing-it/backend/internal/service"
)

// accountLockNotifier memberi tahu pihak terkait saat akun terkunci
// (diimplementasikan service.SecurityAlertService).
type accountLockNotifier interface {
	NotifyAccountLocked(identifier, ip string, attempts int, lockout time.Duration)
}

type AuthHandler struct {
	userService *service.UserService
	// idLimiter membatasi kegagalan login per akun (identifier), ipLimiter
	// per alamat IP (lebih longgar: banyak pegawai bisa berbagi satu IP
	// di balik NAT/proxy rumah sakit).
	idLimiter *appmiddleware.LoginLimiter
	ipLimiter *appmiddleware.LoginLimiter
	alerts    accountLockNotifier
}

func NewAuthHandler(userService *service.UserService, idLimiter, ipLimiter *appmiddleware.LoginLimiter, alerts accountLockNotifier) *AuthHandler {
	return &AuthHandler{userService: userService, idLimiter: idLimiter, ipLimiter: ipLimiter, alerts: alerts}
}

// clientIP mengambil alamat IP klien. Di belakang reverse proxy, middleware
// RealIP sudah mengisi RemoteAddr dari header X-Forwarded-For/X-Real-IP.
func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

type registerRequest struct {
	Name       string  `json:"name"`
	Email      string  `json:"email"`
	Username   *string `json:"username,omitempty"`
	Password   string  `json:"password"`
	Department *string `json:"department,omitempty"`
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body request tidak valid")
		return
	}

	if req.Name == "" || req.Email == "" || req.Password == "" {
		respondError(w, http.StatusBadRequest, "name, email, dan password wajib diisi")
		return
	}
	if len(req.Password) < 8 {
		respondError(w, http.StatusBadRequest, "password minimal 8 karakter")
		return
	}

	user, err := h.userService.Register(r.Context(), service.RegisterInput{
		Name:       req.Name,
		Email:      req.Email,
		Username:   req.Username,
		Password:   req.Password,
		Department: req.Department,
	})
	if err != nil {
		if errors.Is(err, repository.ErrEmailAlreadyExists) {
			respondError(w, http.StatusConflict, "email sudah terdaftar")
			return
		}
		if errors.Is(err, repository.ErrUsernameAlreadyExists) {
			respondError(w, http.StatusConflict, "username sudah dipakai")
			return
		}
		respondError(w, http.StatusInternalServerError, "gagal mendaftarkan user")
		return
	}

	respondJSON(w, http.StatusCreated, user)
}

// loginRequest.Identifier menerima EMAIL ATAU USERNAME — nama field
// sengaja diubah dari "email" jadi "identifier" supaya jelas kalau field
// ini fleksibel, bukan cuma email.
type loginRequest struct {
	Identifier string `json:"identifier"`
	Password   string `json:"password"`
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body request tidak valid")
		return
	}

	identifier := strings.TrimSpace(req.Identifier)
	ip := clientIP(r)
	idKey := "id:" + strings.ToLower(identifier)
	ipKey := "ip:" + ip

	// Anti brute-force: tolak dulu kalau akun/IP ini sedang dikunci.
	for _, l := range []struct {
		limiter *appmiddleware.LoginLimiter
		key     string
	}{{h.idLimiter, idKey}, {h.ipLimiter, ipKey}} {
		if ok, wait := l.limiter.Check(l.key); !ok {
			w.Header().Set("Retry-After", strconv.Itoa(int(wait.Seconds())+1))
			respondError(w, http.StatusTooManyRequests,
				fmt.Sprintf("Terlalu banyak percobaan login. Coba lagi dalam %d menit.", int(wait.Minutes())+1))
			return
		}
	}

	token, user, err := h.userService.Login(r.Context(), req.Identifier, req.Password)
	if err != nil {
		if errors.Is(err, service.ErrInvalidCredentials) {
			idLocked, idRemaining := h.idLimiter.Fail(idKey)
			ipLocked, _ := h.ipLimiter.Fail(ipKey)
			lockout := h.idLimiter.Lockout()
			lockMinutes := int(lockout.Minutes())

			switch {
			case idLocked:
				// Percobaan yang memicu kunci: langsung beri tahu pengguna,
				// catat di log, dan kabari pemilik akun + admin/leader.
				w.Header().Set("Retry-After", strconv.Itoa(int(lockout.Seconds())))
				if h.alerts != nil {
					go h.alerts.NotifyAccountLocked(identifier, ip, h.idLimiter.Max(), lockout)
				}
				respondError(w, http.StatusTooManyRequests,
					fmt.Sprintf("Akun dikunci %d menit karena %d kali salah password. Hubungi admin bila perlu bantuan.",
						lockMinutes, h.idLimiter.Max()))
			case ipLocked:
				log.Printf("SECURITY: IP %s dikunci %s karena terlalu banyak login gagal", ip, h.ipLimiter.Lockout())
				w.Header().Set("Retry-After", strconv.Itoa(int(h.ipLimiter.Lockout().Seconds())))
				respondError(w, http.StatusTooManyRequests,
					fmt.Sprintf("Terlalu banyak percobaan login dari jaringan ini. Coba lagi dalam %d menit.",
						int(h.ipLimiter.Lockout().Minutes())))
			case idRemaining <= 2:
				// Peringatan dini, mulai percobaan ke-3.
				respondError(w, http.StatusUnauthorized,
					fmt.Sprintf("email/username atau password salah. Sisa %d percobaan sebelum akun dikunci %d menit.",
						idRemaining, lockMinutes))
			default:
				respondError(w, http.StatusUnauthorized, "email/username atau password salah")
			}
			return
		}
		if errors.Is(err, service.ErrAccountDeactivated) {
			respondError(w, http.StatusForbidden, err.Error())
			return
		}
		respondInternal(w, err, "gagal login")
		return
	}

	h.idLimiter.Reset(idKey)

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"token": token,
		"user":  user,
	})
}

func respondJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(payload)
}

func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, map[string]string{"error": message})
}

// respondInternal mencatat error ASLI di log server, tetapi ke pengguna hanya
// mengirim pesan umum — pesan internal (SQL, path, dll.) tidak boleh bocor.
func respondInternal(w http.ResponseWriter, err error, userMessage string) {
	log.Printf("ERROR %s: %v", userMessage, err)
	respondError(w, http.StatusInternalServerError, userMessage)
}
