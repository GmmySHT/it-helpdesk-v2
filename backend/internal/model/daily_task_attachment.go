package model

import "time"

// DailyTaskAttachment adalah bukti opsional (PDF/screenshot) yang dilampirkan
// pada Daily Task. Maksimal 5 file per task; tanpa lampiran task tetap sah.
type DailyTaskAttachment struct {
	ID          string    `json:"id"`
	TaskID      string    `json:"task_id"`
	FileURL     string    `json:"file_url"`
	FileName    string    `json:"file_name"`
	FileType    string    `json:"file_type"` // "image" atau "pdf"
	FileSize    int64     `json:"file_size"`
	UploadedBy  string    `json:"uploaded_by"`
	CreatedAt   time.Time `json:"created_at"`
}
