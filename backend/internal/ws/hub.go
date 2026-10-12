package ws

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	// writeWait: batas waktu satu penulisan ke koneksi. Tanpa ini, koneksi
	// yang macet bisa menahan writePump selamanya.
	writeWait = 10 * time.Second
	// pongWait: kalau browser tidak membalas ping dalam waktu ini, koneksi
	// dianggap mati dan di-unregister.
	pongWait = 60 * time.Second
	// pingPeriod: seberapa sering server mengirim ping. HARUS lebih kecil
	// dari pongWait. Ping juga menjaga koneksi tetap hidup di balik
	// proxy/load balancer yang memutus koneksi idle.
	pingPeriod = (pongWait * 9) / 10
	// maxMessageSize: browser tidak diharapkan mengirim apa pun, jadi
	// batasnya dibuat kecil.
	maxMessageSize = 512
)

// Client merepresentasikan SATU koneksi WebSocket dari browser (1 tab = 1 client).
// Satu user bisa punya lebih dari satu client kalau buka beberapa tab/device.
type Client struct {
	UserID string
	conn   *websocket.Conn
	send   chan []byte
}

// Hub menyimpan semua client yang sedang terhubung, dikelompokkan per UserID,
// supaya saat ada notifikasi untuk user tertentu, kita tinggal cari
// client-nya di map ini tanpa perlu broadcast ke semua orang.
type Hub struct {
	mu      sync.RWMutex
	clients map[string][]*Client // key: userID
}

func NewHub() *Hub {
	return &Hub{clients: make(map[string][]*Client)}
}

func (h *Hub) register(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[c.UserID] = append(h.clients[c.UserID], c)
}

func (h *Hub) unregister(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	list := h.clients[c.UserID]
	for i, existing := range list {
		if existing == c {
			h.clients[c.UserID] = append(list[:i], list[i+1:]...)
			break
		}
	}
	if len(h.clients[c.UserID]) == 0 {
		delete(h.clients, c.UserID)
	}
	close(c.send)
}

// trySend memasukkan payload ke buffer client tanpa memblokir. Kalau buffer
// penuh (koneksi macet), payload dilewati daripada menahan seluruh hub.
func (c *Client) trySend(payload []byte) bool {
	select {
	case c.send <- payload:
		return true
	default:
		return false
	}
}

// SendToUser mengirim payload (biasanya notifikasi dalam bentuk JSON) ke
// SEMUA koneksi aktif milik satu user. Kalau user itu sedang tidak online
// sama sekali, fungsi ini tidak melakukan apa-apa — notifikasinya tetap
// aman tersimpan di database (lewat NotificationRepository), tinggal
// dimuat saat user itu login/refresh nanti.
func (h *Hub) SendToUser(userID string, payload []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, c := range h.clients[userID] {
		if !c.trySend(payload) {
			log.Printf("ws: buffer penuh untuk user %s, pesan dilewati", userID)
		}
	}
}

// Broadcast mengirim payload ke SEMUA client yang sedang terhubung,
// milik user mana pun. Hanya dipakai untuk pesan yang tidak berisi data
// sensitif (mis. sinyal "izin berubah, silakan fetch ulang").
func (h *Hub) Broadcast(payload []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for userID, list := range h.clients {
		for _, c := range list {
			if !c.trySend(payload) {
				log.Printf("ws: buffer penuh untuk user %s, broadcast dilewati", userID)
			}
		}
	}
}

// ServeClient dijalankan dalam goroutine terpisah untuk setiap koneksi baru.
// Dua goroutine dijalankan: satu untuk baca (readPump, sekaligus mendeteksi
// kalau koneksi putus), satu untuk tulis (writePump, mengirim apa pun yang
// masuk ke channel c.send, plus ping berkala).
func (h *Hub) ServeClient(conn *websocket.Conn, userID string) {
	client := &Client{
		UserID: userID,
		conn:   conn,
		send:   make(chan []byte, 16),
	}
	h.register(client)

	go client.writePump()
	client.readPump(h)
}

func (c *Client) readPump(h *Hub) {
	defer func() {
		h.unregister(c)
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	// Setiap pong dari browser memperpanjang batas waktu baca. Kalau
	// jaringan putus tanpa close frame (laptop tidur, wifi mati), tidak
	// ada pong, deadline lewat, ReadMessage error, dan client
	// di-unregister — bukan menggantung selamanya di map.
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(pongWait))
	})

	for {
		// Kita tidak mengharapkan pesan apa pun DARI browser lewat koneksi ini
		// (arahnya satu arah: server -> browser). ReadMessage tetap dipanggil
		// terus-menerus untuk mendeteksi kapan koneksi ditutup atau mati,
		// supaya client ini bisa di-unregister.
		if _, _, err := c.conn.ReadMessage(); err != nil {
			break
		}
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case payload, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Hub menutup channel (client di-unregister).
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, payload); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// NotificationPayload adalah bentuk JSON yang dikirim ke browser lewat
// WebSocket — field-nya sengaja mirip dengan model.Notification supaya
// frontend gampang mem-parsingnya jadi tipe yang sama dengan hasil REST API.
type NotificationPayload struct {
	ID       string  `json:"id"`
	TicketID *string `json:"ticket_id,omitempty"`
	Type     string  `json:"type"`
	Title    string  `json:"title"`
	Message  string  `json:"message"`
}

func (h *Hub) NotifyUser(userID string, payload NotificationPayload) {
	data, err := json.Marshal(payload)
	if err != nil {
		log.Printf("ws: gagal marshal payload: %v", err)
		return
	}
	h.SendToUser(userID, data)
}

// EventPayload adalah pesan kontrol (bukan notifikasi): hanya membawa
// nama event. Frontend mengenalinya lewat field "type" dan TIDAK
// memasukkannya ke daftar notifikasi.
type EventPayload struct {
	Type string `json:"type"`
}

const eventPermissionsChanged = "permissions_changed"

// NotifyPermissionsChanged memberi tahu SEMUA client yang sedang online
// bahwa izin RBAC berubah, supaya frontend mengambil ulang
// /me/permissions. Dipakai untuk perubahan yang berlaku per role atau per
// modul, karena user yang terdampak bisa banyak.
func (h *Hub) NotifyPermissionsChanged() {
	data, err := json.Marshal(EventPayload{Type: eventPermissionsChanged})
	if err != nil {
		log.Printf("ws: gagal marshal event: %v", err)
		return
	}
	h.Broadcast(data)
}

// NotifyUserPermissionsChanged sama seperti di atas, tetapi hanya untuk
// satu user (mis. saat override izin per-user diubah).
func (h *Hub) NotifyUserPermissionsChanged(userID string) {
	data, err := json.Marshal(EventPayload{Type: eventPermissionsChanged})
	if err != nil {
		log.Printf("ws: gagal marshal event: %v", err)
		return
	}
	h.SendToUser(userID, data)
}
