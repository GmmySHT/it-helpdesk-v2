package model

import "time"

type Rating struct {
	ID        string    `json:"id"`
	TicketID  string    `json:"ticket_id"`
	Score     int       `json:"score"`
	Comment   string    `json:"comment,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}
