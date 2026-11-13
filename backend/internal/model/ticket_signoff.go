package model

import "time"

// TicketSignoff adalah bukti serah-terima yang ditandatangani pelapor.
//
// Alur pemakaiannya: tiket dicetak (BAST) → pelapor tanda tangan di kertas →
// dokumen di-scan → diunggah ke sini. Baris ini yang menjadi bukti resmi
// bahwa pelapor sudah menyatakan pekerjaan sesuai, sehingga klaim "belum
// sesuai" beberapa minggu kemudian punya pembanding tertulis.
type TicketSignoff struct {
	ID       string `json:"id"`
	TicketID string `json:"ticket_id"`

	FileURL  string `json:"file_url"`
	FileName string `json:"file_name"`
	FileType string `json:"file_type"` // "image" atau "pdf"
	FileSize int64  `json:"file_size"`

	SignedByName string     `json:"signed_by_name"`
	SignedAt     *time.Time `json:"signed_at,omitempty"`
	Note         *string    `json:"note,omitempty"`

	UploadedBy     string `json:"uploaded_by"`
	UploadedByName string `json:"uploaded_by_name,omitempty"`

	CreatedAt time.Time `json:"created_at"`
}
