package model

import "time"

type CommentType string

const (
	CommentTypeResolveNote     CommentType = "resolve_note"
	CommentTypeReopenNote      CommentType = "reopen_note"
	CommentTypeGeneralComment  CommentType = "general_comment"
)

type TicketComment struct {
	ID          string      `json:"id"`
	TicketID    string      `json:"ticket_id"`
	UserID      string      `json:"user_id"`
	UserName    string      `json:"user_name,omitempty"`
	CommentType CommentType `json:"comment_type"`
	Message     string      `json:"message"`
	CreatedAt   time.Time   `json:"created_at"`
	Attachments []CommentAttachment `json:"attachments,omitempty"`
}

type CommentAttachment struct {
	ID         string    `json:"id"`
	CommentID  string    `json:"comment_id"`
	FileURL    string    `json:"file_url"`
	FileType   string    `json:"file_type,omitempty"`
	UploadedAt time.Time `json:"uploaded_at"`
}
