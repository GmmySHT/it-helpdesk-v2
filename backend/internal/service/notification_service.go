package service

import (
	"context"
	"log"

	"ticketing-it/backend/internal/model"
	"ticketing-it/backend/internal/repository"
	"ticketing-it/backend/internal/ws"
)

// NotificationService adalah satu-satunya tempat yang tahu cara mengirim
// notifikasi: simpan ke database (supaya tetap ada riwayatnya & muncul
// walau user sedang offline) DAN push real-time kalau user itu sedang
// online lewat WebSocket. TicketService cukup panggil Notify() tanpa perlu
// tahu detail keduanya.
type NotificationService struct {
	repo *repository.NotificationRepository
	hub  *ws.Hub
}

func NewNotificationService(repo *repository.NotificationRepository, hub *ws.Hub) *NotificationService {
	return &NotificationService{repo: repo, hub: hub}
}

// Notify TIDAK mengembalikan error ke pemanggil dengan sengaja — notifikasi
// adalah efek samping, bukan bagian inti dari aksi (claim/resolve/dst).
// Kalau pengiriman notifikasi gagal, aksi utamanya (misalnya claim tiket)
// tetap harus berhasil; kita cukup catat errornya ke log.
func (s *NotificationService) Notify(ctx context.Context, recipientID string, ticketID *string, notifType, title, message string) {
	n := &model.Notification{
		TicketID:    ticketID,
		RecipientID: recipientID,
		Type:        notifType,
		Title:       title,
		Message:     message,
		Channel:     "in_app",
	}
	if err := s.repo.Create(ctx, n); err != nil {
		log.Printf("notification: gagal simpan ke DB untuk user %s: %v", recipientID, err)
		return
	}
	log.Printf("[DEBUG notify] berhasil simpan notif '%s' untuk user %s", notifType, recipientID)

	s.hub.NotifyUser(recipientID, ws.NotificationPayload{
		ID:       n.ID,
		TicketID: ticketID,
		Type:     notifType,
		Title:    title,
		Message:  message,
	})
}

func (s *NotificationService) ListForUser(ctx context.Context, userID string) ([]model.Notification, error) {
	return s.repo.ListByRecipient(ctx, userID)
}

func (s *NotificationService) MarkRead(ctx context.Context, id, userID string) error {
	return s.repo.MarkRead(ctx, id, userID)
}
