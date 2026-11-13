package repository

import (
	"context"
	"time"
)

// KPITicketRow adalah satu baris rincian tiket pada laporan KPI cetak.
//
// Kenapa rincian ini diambil terpisah dari GetStaffKPIReport: tabel ringkas
// hanya menjawab "berapa", sedangkan dokumen cetak harus bisa dibuktikan —
// pembaca perlu melihat nomor tiket dan judul pekerjaannya. Keduanya dibaca
// dalam satu request supaya angka ringkas dan daftar rincian berasal dari
// snapshot periode yang sama.
type KPITicketRow struct {
	TicketCode   string     `json:"ticket_code"`
	Title        string     `json:"title"`
	CategoryName string     `json:"category_name"`
	Priority     string     `json:"priority"`
	Status       string     `json:"status"`
	ClaimedAt    *time.Time `json:"claimed_at,omitempty"`
	ResolvedAt   *time.Time `json:"resolved_at,omitempty"`
	Minutes      float64    `json:"minutes"`
	SLACompliant bool       `json:"sla_compliant"`
}

// KPIDailyRow adalah satu baris rincian daily task pada laporan KPI cetak.
// Semua field form ikut dibawa (bukan hanya angka KPI) karena laporan ini
// dipakai sebagai bukti pekerjaan saat penilaian staf.
type KPIDailyRow struct {
	TaskDate        string     `json:"task_date"`
	ReporterName    string     `json:"reporter_name"`
	UnitName        string     `json:"unit_name"`
	Issue           string     `json:"issue"`
	Detail          string     `json:"detail"`
	Solution        string     `json:"solution"`
	ComplainAt      time.Time  `json:"complain_at"`
	StartAt         *time.Time `json:"start_at,omitempty"`
	EndAt           *time.Time `json:"end_at,omitempty"`
	ResponseMinutes *int       `json:"response_minutes,omitempty"`
	DurationMinutes *int       `json:"duration_minutes,omitempty"`
}

// StaffKPIDetail menggabungkan angka ringkas satu staf dengan rincian
// pekerjaannya — dipakai halaman cetak /reports/kpi/print.
type StaffKPIDetail struct {
	Staff      StaffKPI       `json:"staff"`
	Tickets    []KPITicketRow `json:"tickets"`
	DailyTasks []KPIDailyRow  `json:"daily_tasks"`
}

// GetStaffKPIDetail mengembalikan ringkasan + rincian pekerjaan per staf.
// staffID kosong berarti semua staf yang punya pekerjaan pada periode itu.
//
// Query rincian memakai kolom yang sama dengan laporan ringkas (claimed_by
// untuk tiket, created_by untuk daily task) supaya jumlah baris rincian
// selalu cocok dengan angka "Tiket Selesai" / "Daily Task" di tabel.
func (r *StatsRepository) GetStaffKPIDetail(ctx context.Context, from, to *time.Time, staffID string) ([]StaffKPIDetail, error) {
	summary, err := r.GetStaffKPIReport(ctx, from, to, staffID)
	if err != nil {
		return nil, err
	}

	out := make([]StaffKPIDetail, 0, len(summary))
	for _, s := range summary {
		detail := StaffKPIDetail{
			Staff:      s,
			Tickets:    []KPITicketRow{},
			DailyTasks: []KPIDailyRow{},
		}

		tRows, err := r.db.Query(ctx, `
			SELECT
				COALESCE(t.ticket_code, t.id::text),
				t.title,
				COALESCE(c.name, '-'),
				t.priority::text,
				t.status::text,
				t.claimed_at,
				t.last_resolved_at,
				COALESCE(EXTRACT(EPOCH FROM (t.last_resolved_at - t.claimed_at)) / 60, 0),
				COALESCE(
					t.last_resolved_at <= t.claimed_at + (sr.resolution_time_minutes || ' minutes')::interval,
					false
				)
			FROM tickets t
			LEFT JOIN categories c ON c.id = t.category_id
			LEFT JOIN sla_rules sr ON sr.category_id = t.category_id AND sr.priority = t.priority
			WHERE t.claimed_by = $1::uuid
				AND t.status IN ('resolved', 'closed')
				AND t.claimed_at IS NOT NULL
				AND t.last_resolved_at IS NOT NULL
				AND t.deleted_at IS NULL
				AND t.created_at >= COALESCE($2, '-infinity'::timestamptz)
				AND t.created_at <= COALESCE($3, 'infinity'::timestamptz)
			ORDER BY t.last_resolved_at ASC
		`, s.StaffID, from, to)
		if err != nil {
			return nil, err
		}
		for tRows.Next() {
			var tr KPITicketRow
			if err := tRows.Scan(
				&tr.TicketCode, &tr.Title, &tr.CategoryName, &tr.Priority, &tr.Status,
				&tr.ClaimedAt, &tr.ResolvedAt, &tr.Minutes, &tr.SLACompliant,
			); err != nil {
				tRows.Close()
				return nil, err
			}
			detail.Tickets = append(detail.Tickets, tr)
		}
		tRows.Close()
		if err := tRows.Err(); err != nil {
			return nil, err
		}

		dRows, err := r.db.Query(ctx, `
			SELECT
				dt.task_date::text,
				dt.reporter_name,
				COALESCE(u.name, ''),
				dt.issue,
				COALESCE(dt.detail, ''),
				COALESCE(dt.solution, ''),
				dt.complain_at,
				dt.start_at,
				dt.end_at,
				dt.response_minutes,
				dt.duration_minutes
			FROM daily_tasks dt
			LEFT JOIN units u ON u.id = dt.unit_id
			WHERE dt.created_by = $1::uuid
				AND dt.task_date >= COALESCE($2::date, '-infinity'::date)
				AND dt.task_date <= COALESCE($3::date, 'infinity'::date)
			ORDER BY dt.task_date ASC, dt.complain_at ASC
		`, s.StaffID, from, to)
		if err != nil {
			return nil, err
		}
		for dRows.Next() {
			var dr KPIDailyRow
			if err := dRows.Scan(
				&dr.TaskDate, &dr.ReporterName, &dr.UnitName,
				&dr.Issue, &dr.Detail, &dr.Solution,
				&dr.ComplainAt, &dr.StartAt, &dr.EndAt,
				&dr.ResponseMinutes, &dr.DurationMinutes,
			); err != nil {
				dRows.Close()
				return nil, err
			}
			detail.DailyTasks = append(detail.DailyTasks, dr)
		}
		dRows.Close()
		if err := dRows.Err(); err != nil {
			return nil, err
		}

		out = append(out, detail)
	}

	return out, nil
}
