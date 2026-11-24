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
	TicketCode    string     `json:"ticket_code"`
	Title         string     `json:"title"`
	CategoryName  string     `json:"category_name"`
	Priority      string     `json:"priority"`
	Status        string     `json:"status"`
	CreatedByName string     `json:"created_by_name,omitempty"`
	UpdatedByName string     `json:"updated_by_name,omitempty"`
	ClaimedAt     *time.Time `json:"claimed_at,omitempty"`
	ResolvedAt    *time.Time `json:"resolved_at,omitempty"`
	Minutes       float64    `json:"minutes"`
	SLACompliant  bool       `json:"sla_compliant"`
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
// KPIProjectRow adalah satu baris rincian keterlibatan project pada laporan
// KPI cetak. Project tidak masuk rincian tiket — ini blok terpisah.
type KPIProjectRow struct {
	TicketCode    string `json:"ticket_code"`
	Title         string `json:"title"`
	ProjectStatus string `json:"project_status"`
	MemberRole    string `json:"member_role"`
	TasksDone     int    `json:"tasks_done"`
	CreatedAt     string `json:"created_at"`
}

// KPIProjectTaskRow adalah rincian tugas project yang diselesaikan staf.
type KPIProjectTaskRow struct {
	TicketCode   string `json:"ticket_code"`
	ProjectTitle string `json:"project_title"`
	Title        string `json:"title"`
	Milestone    string `json:"milestone,omitempty"`
	CompletedAt  string `json:"completed_at"`
	Weight       int    `json:"weight"`
}

type StaffKPIDetail struct {
	Staff   StaffKPI       `json:"staff"`
	Tickets []KPITicketRow `json:"tickets"`
	// AnalyzedTickets = rincian tiket yang dianalisa staf ini. Untuk analyst
	// yang tidak mengklaim tiket, ini satu-satunya bukti kontribusinya.
	AnalyzedTickets []KPITicketRow      `json:"analyzed_tickets"`
	DailyTasks      []KPIDailyRow       `json:"daily_tasks"`
	Projects        []KPIProjectRow     `json:"projects"`
	ProjectTasks    []KPIProjectTaskRow `json:"project_tasks"`
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
			Staff:           s,
			Tickets:         []KPITicketRow{},
			AnalyzedTickets: []KPITicketRow{},
			DailyTasks:      []KPIDailyRow{},
			Projects:        []KPIProjectRow{},
			ProjectTasks:    []KPIProjectTaskRow{},
		}

		tRows, err := r.db.Query(ctx, `
			SELECT
				COALESCE(t.ticket_code, t.id::text),
				t.title,
				COALESCE(c.name, '-'),
				t.priority::text,
				t.status::text,
				COALESCE(creator.name, '-'),
				COALESCE(updater.name, '-'),
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
			LEFT JOIN users creator ON creator.id = t.created_by
			LEFT JOIN users updater ON updater.id = t.updated_by
			WHERE t.claimed_by = $1::uuid
				AND t.ticket_type = 'regular'
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
				&tr.CreatedByName, &tr.UpdatedByName,
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

		aRows, err := r.db.Query(ctx, `
			SELECT
				COALESCE(t.ticket_code, t.id::text),
				t.title,
				COALESCE(c.name, '-'),
				t.priority::text,
				t.status::text,
				COALESCE(creator.name, '-'),
				COALESCE(updater.name, '-'),
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
			LEFT JOIN users creator ON creator.id = t.created_by
			LEFT JOIN users updater ON updater.id = t.updated_by
			WHERE t.analysis_by = $1::uuid
				AND t.ticket_type = 'regular'
				AND t.deleted_at IS NULL
				AND t.created_at >= COALESCE($2, '-infinity'::timestamptz)
				AND t.created_at <= COALESCE($3, 'infinity'::timestamptz)
			ORDER BY t.created_at ASC
		`, s.StaffID, from, to)
		if err != nil {
			return nil, err
		}
		for aRows.Next() {
			var tr KPITicketRow
			if err := aRows.Scan(
				&tr.TicketCode, &tr.Title, &tr.CategoryName, &tr.Priority, &tr.Status,
				&tr.CreatedByName, &tr.UpdatedByName,
				&tr.ClaimedAt, &tr.ResolvedAt, &tr.Minutes, &tr.SLACompliant,
			); err != nil {
				aRows.Close()
				return nil, err
			}
			detail.AnalyzedTickets = append(detail.AnalyzedTickets, tr)
		}
		aRows.Close()
		if err := aRows.Err(); err != nil {
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

		// Rincian project — blok terpisah dari tiket/daily task. Diambil dari
		// ticket_members (keanggotaan aktif pada periode project dibuat) dan
		// project_tasks yang completed_at-nya jatuh pada periode laporan.
		pRows, err := r.db.Query(ctx, `
			SELECT
				COALESCE(t.ticket_code, t.id::text),
				t.title,
				COALESCE(t.project_status, '-'),
				tm.role,
				(SELECT COUNT(*) FROM project_tasks pt
				 WHERE pt.ticket_id = t.id AND pt.assignee_id = $1::uuid
				   AND pt.deleted_at IS NULL AND pt.status = 'done'),
				to_char(t.created_at, 'DD Mon YYYY')
			FROM ticket_members tm
			JOIN tickets t ON t.id = tm.ticket_id
			WHERE tm.user_id = $1::uuid
				AND t.ticket_type = 'project'
				AND t.deleted_at IS NULL
				AND tm.removed_at IS NULL
				AND t.created_at >= COALESCE($2, '-infinity'::timestamptz)
				AND t.created_at <= COALESCE($3, 'infinity'::timestamptz)
			ORDER BY t.created_at ASC
		`, s.StaffID, from, to)
		if err != nil {
			return nil, err
		}
		for pRows.Next() {
			var pr KPIProjectRow
			if err := pRows.Scan(
				&pr.TicketCode, &pr.Title, &pr.ProjectStatus,
				&pr.MemberRole, &pr.TasksDone, &pr.CreatedAt,
			); err != nil {
				pRows.Close()
				return nil, err
			}
			detail.Projects = append(detail.Projects, pr)
		}
		pRows.Close()
		if err := pRows.Err(); err != nil {
			return nil, err
		}

		ptRows, err := r.db.Query(ctx, `
			SELECT
				COALESCE(t.ticket_code, t.id::text),
				t.title,
				pt.title,
				COALESCE(pm.title, ''),
				to_char(pt.completed_at, 'DD Mon YYYY'),
				pt.weight
			FROM project_tasks pt
			JOIN tickets t ON t.id = pt.ticket_id
			LEFT JOIN project_milestones pm ON pm.id = pt.milestone_id
			WHERE pt.assignee_id = $1::uuid
				AND pt.deleted_at IS NULL
				AND pt.status = 'done'
				AND pt.completed_at >= COALESCE($2, '-infinity'::timestamptz)
				AND pt.completed_at <= COALESCE($3, 'infinity'::timestamptz)
			ORDER BY pt.completed_at ASC
		`, s.StaffID, from, to)
		if err != nil {
			return nil, err
		}
		for ptRows.Next() {
			var tr KPIProjectTaskRow
			if err := ptRows.Scan(
				&tr.TicketCode, &tr.ProjectTitle, &tr.Title,
				&tr.Milestone, &tr.CompletedAt, &tr.Weight,
			); err != nil {
				ptRows.Close()
				return nil, err
			}
			detail.ProjectTasks = append(detail.ProjectTasks, tr)
		}
		ptRows.Close()
		if err := ptRows.Err(); err != nil {
			return nil, err
		}

		out = append(out, detail)
	}

	return out, nil
}
