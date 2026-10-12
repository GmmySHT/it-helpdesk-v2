package handler

import (
	"log"
	"net/http"

	"github.com/gorilla/websocket"

	"ticketing-it/backend/internal/service"
)

var upgrader = websocket.Upgrader{
	// CheckOrigin dibuka untuk semua origin di sini karena development
	// (frontend Next.js beda port dari backend). Untuk production, ganti
	// jadi hanya izinkan domain frontend yang sah.
	CheckOrigin: func(r *http.Request) bool { return true },
}

type WSHandler struct {
	authService *service.AuthService
	hub         hubNotifier
}

// hubNotifier adalah subset kecil dari *ws.Hub yang benar-benar dipakai
// handler ini — didefinisikan sebagai interface supaya handler tidak perlu
// import package ws secara langsung (menghindari saling ketergantungan).
type hubNotifier interface {
	ServeClient(conn *websocket.Conn, userID string)
}

func NewWSHandler(authService *service.AuthService, hub hubNotifier) *WSHandler {
	return &WSHandler{authService: authService, hub: hub}
}

// ServeWS meng-upgrade request HTTP biasa menjadi koneksi WebSocket.
//
// Autentikasi di sini SENGAJA lewat query param ?token=..., bukan header
// Authorization seperti endpoint REST lainnya — karena native WebSocket API
// di browser tidak mendukung custom header saat membuka koneksi.
func (h *WSHandler) ServeWS(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "token wajib disertakan", http.StatusUnauthorized)
		return
	}

	claims, err := h.authService.ParseToken(token)
	if err != nil {
		http.Error(w, "token tidak valid", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws: gagal upgrade koneksi: %v", err)
		return
	}

	h.hub.ServeClient(conn, claims.UserID)
}
