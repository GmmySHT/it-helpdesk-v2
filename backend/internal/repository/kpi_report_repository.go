package repository

import (
	"context"
	"time"
)

// StaffKPI menggabungkan dua sumber beban kerja seorang staf dalam satu baris:
// tiket resmi (tickets) dan pekerjaan harian di luar tiket (daily_tasks).
//
// Kenapa digabung di satu query: laporan KPI dipakai menilai orang, jadi
// angkanya harus datang dari satu snapshot yang sama — kalau tiket dan daily
// task diambil lewat dua request terpisah, leader bisa membaca angka dari
// rentang tanggal yang berbeda tanpa sadar.
//
// TicketsResolved menghitung tiket yang DIKLAIM staf ini dan sudah selesai.
// DailyTasks menghitung daily task yang DICATAT staf ini. Keduanya memang
// memakai kolom berbeda (claimed_by vs created_by) karena pada daily task
// pencatat = pengerjanya — tidak ada alur claim.
type StaffKPI struct {
	StaffID   string `json:"staff_id"`
	StaffName string `json:"staff_name"`
	Role      string `json:"role"`
	Department string `json:"department,omitempty"`

	// Dari tiket
	TicketsResolved      int     `json:"tickets_resolved"`
	AvgResolutionMinutes float64 `json:"avg_resolution_minutes"`
	SLACompliantCount    int     `json:"sla_compliant_count"`
	SLAComplianceRate    float64 `json:"sla_compliance_rate"`
	ReopenCount          int     `json:"reopen_count"`

	// Dari daily task
	DailyTasks            int     `json:"daily_tasks"`
	AvgDailyDurationMin   float64 `json:"avg_daily_duration_minutes"`
	AvgDailyResponseMin   float64 `json:"avg_daily_response_minutes"`

	// Gabungan — dipakai untuk mengurutkan leaderboard KPI.
	TotalWorkItems int `json:"total_work_items"`
}

// KPIOverview adalah ringkasan satu periode untuk kepala laporan.
type KPIOverview struct {
	From string `json:"from,omitempty"`
	To   string `json:"to,omitempty"`

	TotalTickets      int `json:"total_tickets"`
	TicketsResolved   int `json:"tickets_resolved"`
	TotalDailyTasks   int `json:"total_daily_tasks"`
	TotalWorkItems    int `json:"total_work_items"`

	AvgTicketResolutionMinutes float64 `json:"avg_ticket_resolution_minutes"`
	AvgDailyDurationMinutes    float64 `json:"avg_daily_duration_minutes"`
	AvgDailyResponseMinutes    float64 `json:"avg_daily_response_minutes"`

	// PerUnit memecah daily task per unit pelapor — menjawab "unit mana yang
	// paling sering minta bantuan", yang tidak terlihat dari data tiket.
	PerUnit []UnitTaskCount `json:"per_unit"`
}

type UnitTaskCount struct {
	UnitName string `json:"unit_name"`
	Count    int    `json:"count"`
}

// GetStaffKPIReport menghitung KPI semua staf (atau satu staf kalau staffID
// diisi) untuk rentang tanggal tertentu.
//
// Rentang tanggal mengacu ke:
//   - tiket  : created_at  (kapan pekerjaan masuk)
//   - daily  : task_date   (tanggal pekerjaan harian)
//
// Keduanya dipilih karena itulah tanggal yang dipakai manusia saat mengisi
// laporan; memakai timestamp selesai akan membuat tiket yang dibuat akhir
// bulan lalu tapi selesai bulan ini "hilang" dari kedua periode.
func (r *StatsRepository) GetStaffKPIReport(ctx context.Context, from, to *time.Time, staffID string) ([]StaffKPI, error) {
	var staffFilter interface{}
	if staffID != "" {
		staffFilter = staffID
	}

	rows, err := r.db.Query(ctx, `
		WITH ticket_stats AS (
			SELECT
				t.claimed_by AS staff_id,
				COUNT(*) AS tickets_resolved,
				COALESCE(AVG(EXTRACT(EPOCH FROM (t.last_resolved_at - t.claimed_at)) / 60), 0) AS avg_minutes,
				COUNT(*) FILTER (
					WHERE sr.resolution_time_minutes IS NOT NULL
					AND t.last_resolved_at <= t.claimed_at + (sr.resolution_time_minutes || ' minutes')::interval
				) AS sla_ok,
				COALESCE(SUM(t.reopen_count), 0) AS reopens
			FROM tickets t
			LEFT JOIN sla_rules sr ON sr.category_id = t.category_id AND sr.priority = t.priority
			WHERE t.status IN ('resolved', 'closed')
				AND t.claimed_by IS NOT NULL
				AND t.claimed_at IS NOT NULL
				AND t.last_resolved_at IS NOT NULL
				AND t.deleted_at IS NULL
				AND t.created_at >= COALESCE($1, '-infinity'::timestamptz)
				AND t.created_at <= COALESCE($2, 'infinity'::timestamptz)
			GROUP BY t.claimed_by
		),
		daily_stats AS (
			SELECT
				dt.created_by AS staff_id,
				COUNT(*) AS daily_tasks,
				COALESCE(AVG(dt.duration_minutes), 0) AS avg_duration,
				COALESCE(AVG(dt.response_minutes), 0) AS avg_response
			FROM daily_tasks dt
			WHERE dt.task_date >= COALESCE($1::date, '-infinity'::date)
				AND dt.task_date <= COALESCE($2::date, 'infinity'::date)
			GROUP BY dt.created_by
		)
		SELECT
			u.id, u.name, u.role::text, COALESCE(u.department, ''),
			COALESCE(ts.tickets_resolved, 0),
			COALESCE(ts.avg_minutes, 0),
			COALESCE(ts.sla_ok, 0),
			COALESCE(ts.reopens, 0),
			COALESCE(ds.daily_tasks, 0),
			COALESCE(ds.avg_duration, 0),
			COALESCE(ds.avg_response, 0)
		FROM users u
		LEFT JOIN ticket_stats ts ON ts.staff_id = u.id
		LEFT JOIN daily_stats ds ON ds.staff_id = u.id
		WHERE u.is_active = true
			AND u.deleted_at IS NULL
			AND u.role IN ('staff_it', 'leader', 'admin')
			AND ($3::uuid IS NULL OR u.id = $3::uuid)
			-- Staf tanpa pekerjaan sama sekali tidak perlu muncul sebagai baris
			-- kosong di leaderboard; leader yang tidak menangani tiket juga
			-- dilewati supaya tabel berisi orang yang benar-benar bekerja.
			AND (COALESCE(ts.tickets_resolved, 0) > 0 OR COALESCE(ds.daily_tasks, 0) > 0)
		ORDER BY (COALESCE(ts.tickets_resolved, 0) + COALESCE(ds.daily_tasks, 0)) DESC, u.name
	`, from, to, staffFilter)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []StaffKPI{}
	for rows.Next() {
		var k StaffKPI
		if err := rows.Scan(
			&k.StaffID, &k.StaffName, &k.Role, &k.Department,
			&k.TicketsResolved, &k.AvgResolutionMinutes, &k.SLACompliantCount, &k.ReopenCount,
			&k.DailyTasks, &k.AvgDailyDurationMin, &k.AvgDailyResponseMin,
		); err != nil {
			return nil, err
		}
		if k.TicketsResolved > 0 {
			k.SLAComplianceRate = float64(k.SLACompliantCount) / float64(k.TicketsResolved) * 100
		}
		k.TotalWorkItems = k.TicketsResolved + k.DailyTasks
		list = append(list, k)
	}
	return list, rows.Err()
}

// GetKPIOverview merangkum satu periode: total tiket, total daily task, dan
// sebaran daily task per unit.
//
// staffID kosong = ringkasan seluruh tim. Kalau diisi, SEMUA angka ikut
// menyempit ke orang itu (tiket yang dia klaim, daily task yang dia catat)
// supaya kartu ringkasan di atas tabel tidak bertentangan dengan baris
// staf yang sedang dilihat.
func (r *StatsRepository) GetKPIOverview(ctx context.Context, from, to *time.Time, staffID string) (*KPIOverview, error) {
	var staffFilter interface{}
	if staffID != "" {
		staffFilter = staffID
	}

	o := &KPIOverview{}
	if from != nil {
		o.From = from.Format("2006-01-02")
	}
	if to != nil {
		o.To = to.Format("2006-01-02")
	}

	err := r.db.QueryRow(ctx, `
		SELECT
			COUNT(*),
			COUNT(*) FILTER (WHERE status IN ('resolved', 'closed')),
			COALESCE(AVG(EXTRACT(EPOCH FROM (last_resolved_at - claimed_at)) / 60)
				FILTER (WHERE last_resolved_at IS NOT NULL AND claimed_at IS NOT NULL), 0)
		FROM tickets
		WHERE deleted_at IS NULL
			AND created_at >= COALESCE($1, '-infinity'::timestamptz)
			AND created_at <= COALESCE($2, 'infinity'::timestamptz)
			AND ($3::uuid IS NULL OR claimed_by = $3::uuid)
	`, from, to, staffFilter).Scan(&o.TotalTickets, &o.TicketsResolved, &o.AvgTicketResolutionMinutes)
	if err != nil {
		return nil, err
	}

	err = r.db.QueryRow(ctx, `
		SELECT
			COUNT(*),
			COALESCE(AVG(duration_minutes), 0),
			COALESCE(AVG(response_minutes), 0)
		FROM daily_tasks
		WHERE task_date >= COALESCE($1::date, '-infinity'::date)
			AND task_date <= COALESCE($2::date, 'infinity'::date)
			AND ($3::uuid IS NULL OR created_by = $3::uuid)
	`, from, to, staffFilter).Scan(&o.TotalDailyTasks, &o.AvgDailyDurationMinutes, &o.AvgDailyResponseMinutes)
	if err != nil {
		return nil, err
	}

	o.TotalWorkItems = o.TotalTickets + o.TotalDailyTasks

	rows, err := r.db.Query(ctx, `
		SELECT COALESCE(u.name, '(tanpa unit)'), COUNT(*)
		FROM daily_tasks dt
		LEFT JOIN units u ON u.id = dt.unit_id
		WHERE dt.task_date >= COALESCE($1::date, '-infinity'::date)
			AND dt.task_date <= COALESCE($2::date, 'infinity'::date)
			AND ($3::uuid IS NULL OR dt.created_by = $3::uuid)
		GROUP BY u.name
		ORDER BY COUNT(*) DESC
	`, from, to, staffFilter)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	o.PerUnit = []UnitTaskCount{}
	for rows.Next() {
		var u UnitTaskCount
		if err := rows.Scan(&u.UnitName, &u.Count); err != nil {
			return nil, err
		}
		o.PerUnit = append(o.PerUnit, u)
	}
	return o, rows.Err()
}
