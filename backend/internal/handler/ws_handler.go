package handler

import (
	"log"
	"net/http"
	"strings"

	"github.com/gorilla/websocket"

	appmiddleware "ticketing-it/backend/internal/middleware"
	"ticketing-it/backend/internal/service"
)

type WSHandler struct {
	authService *service.AuthService
	hub         hubNotifier
	checker     *appmiddleware.SessionChecker
	upgrader    websocket.Upgrader
}

// hubNotifier adalah subset kecil dari *ws.Hub yang benar-benar dipakai
// handler ini — didefinisikan sebagai interface supaya handler tidak perlu
// import package ws secara langsung (menghindari saling ketergantungan).
type hubNotifier interface {
	ServeClient(conn *websocket.Conn, userID string)
}

// NewWSHandler membuat handler WebSocket. allowedOrigins = daftar origin
// frontend yang sah (sama dengan CORS_ALLOWED_ORIGINS): koneksi dari halaman
// web di domain lain ditolak, supaya situs asing tidak bisa membuka
// WebSocket atas nama user yang sedang login (cross-site WebSocket hijacking).
func NewWSHandler(authService *service.AuthService, hub hubNotifier, allowedOrigins []string, checker *appmiddleware.SessionChecker) *WSHandler {
	allowed := make(map[string]bool, len(allowedOrigins))
	for _, o := range allowedOrigins {
		allowed[strings.ToLower(strings.TrimRight(o, "/"))] = true
	}

	return &WSHandler{
		authService: authService,
		hub:         hub,
		checker:     checker,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				origin := r.Header.Get("Origin")
				if origin == "" {
					// Browser SELALU mengirim Origin pada WebSocket; yang
					// tanpa Origin adalah klien non-browser (tidak bisa
					// dipakai untuk serangan lintas situs).
					return true
				}
				return allowed[strings.ToLower(strings.TrimRight(origin, "/"))]
			},
		},
	}
}

// ServeWS meng-upgrade request HTTP biasa menjadi koneksi WebSocket.
//
// Autentikasi di sini SENGAJA lewat query param ?token=..., bukan header
// Authorization seperti endpoint REST lainnya — karena native WebSocket API
// di browser tidak mendukung custom header saat membuka koneksi. Query string
// TIDAK ditulis ke log (lihat middleware.AccessLog); pastikan reverse proxy
// juga tidak mencatat query string untuk path /ws.
func (h *WSHandler) ServeWS(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		respondError(w, http.StatusUnauthorized, "token wajib disertakan")
		return
	}

	claims, err := h.authService.ParseToken(token)
	if err != nil {
		respondError(w, http.StatusUnauthorized, "token tidak valid")
		return
	}

	// Akun yang sudah dinonaktifkan/dihapus tidak boleh membuka koneksi baru.
	if _, status := h.checker.Check(r.Context(), claims.UserID); status != appmiddleware.SessionOK {
		respondError(w, http.StatusUnauthorized, "akun tidak aktif")
		return
	}

	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws: gagal upgrade koneksi: %v", err)
		return
	}

	h.hub.ServeClient(conn, claims.UserID)
}
