package model

import "time"

// DailyTask adalah catatan pekerjaan harian staf/leader di luar alur tiket.
//
// Permintaan seperti ini masuk lewat WhatsApp dan tidak pernah jadi tiket
// resmi, tapi tetap harus terhitung sebagai beban kerja. Karena itu tabelnya
// terpisah dari tickets: kalau digabung, statistik SLA/approval tiket rusak.
type DailyTask struct {
	ID       string `json:"id"`
	TaskDate string `json:"task_date"` // YYYY-MM-DD, disimpan sebagai DATE

	ReporterName string  `json:"reporter_name"`
	UnitID       *string `json:"unit_id,omitempty"`
	UnitName     *string `json:"unit_name,omitempty"`

	Issue    string `json:"issue"`
	Detail   string `json:"detail,omitempty"`
	Solution string `json:"solution,omitempty"`

	ComplainAt time.Time  `json:"complain_at"`
	StartAt    *time.Time `json:"start_at,omitempty"`
	EndAt      *time.Time `json:"end_at,omitempty"`

	// Dihitung database (kolom GENERATED), bukan dikirim klien — dipakai
	// laporan KPI supaya angkanya konsisten dari sumber mana pun.
	ResponseMinutes *int `json:"response_minutes,omitempty"`
	DurationMinutes *int `json:"duration_minutes,omitempty"`

	CreatedBy     string `json:"created_by"`
	CreatedByName string `json:"created_by_name,omitempty"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// Unit dipakai untuk dropdown Unit pada form daily task.
type Unit struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}
