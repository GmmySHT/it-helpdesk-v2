package model

import "time"

type Notification struct {
	ID          string     `json:"id"`
	TicketID    *string    `json:"ticket_id,omitempty"`
	RecipientID string     `json:"recipient_id"`
	Type        string     `json:"type"`
	Title       string     `json:"title"`
	Message     string     `json:"message"`
	Channel     string     `json:"channel"`
	IsRead      bool       `json:"is_read"`
	SentAt      time.Time  `json:"sent_at"`
	ReadAt      *time.Time `json:"read_at,omitempty"`
}
