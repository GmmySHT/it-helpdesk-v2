package repository

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type StatsSummary struct {
	TotalTickets int            `json:"total_tickets"`
	ByStatus     map[string]int `json:"by_status"`

	// TotalResolvedOrClosed = jumlah tiket yang pernah mencapai status
	// resolved/closed (dipakai sebagai penyebut untuk hitung SLA compliance).
	TotalResolvedOrClosed int `json:"total_resolved_or_closed"`
	// WithinSLACount = dari yang di atas, berapa yang diselesaikan SEBELUM
	// sla_deadline lewat (last_resolved_at <= sla_deadline).
	WithinSLACount int `json:"within_sla_count"`

	// AvgResolutionMinutes = rata-rata waktu dari claimed_at sampai
	// last_resolved_at, dalam menit, untuk tiket yang sudah pernah resolved.
	AvgResolutionMinutes float64 `json:"avg_resolution_minutes"`

	TotalReopens int `json:"total_reopens"`

	AvgRatingScore float64 `json:"avg_rating_score"`
	TotalRatings   int     `json:"total_ratings"`
}

// StaffPerformance adalah ringkasan kecepatan kerja SATU staf — dipakai
// untuk leaderboard performa. Semua metrik di sini mengukur "sejak diklaim",
// konsisten dengan makna SLA compliance yang sudah diperbaiki di atas.
type StaffPerformance struct {
	StaffID              string  `json:"staff_id"`
	StaffName            string  `json:"staff_name"`
	TicketsResolved      int     `json:"tickets_resolved"`
	AvgResolutionMinutes float64 `json:"avg_resolution_minutes"`
	SLACompliantCount    int     `json:"sla_compliant_count"`
	SLAComplianceRate    float64 `json:"sla_compliance_rate"` // persen, 0-100
}

// AssetBorrowingStats untuk laporan peminjaman aset per periode.
type AssetBorrowingStats struct {
	TotalBorrowings   int64   `json:"total_borrowings"`
	ActiveBorrowings  int64   `json:"active_borrowings"`  // status borrowed
	OverdueBorrowings int64   `json:"overdue_borrowings"`
	ReturnedBorrowings int64  `json:"returned_borrowings"`
	HandledByStaff    int64   `json:"handled_by_staff"`   // disetujui oleh staff IT
	AvgReturnDays     float64 `json:"avg_return_days"`    // rata-rata hari return
}

// GetAssetBorrowingStats menghitung statistik peminjaman aset dalam rentang waktu.
func (r *StatsRepository) GetAssetBorrowingStats(ctx context.Context, from, to *time.Time) (*AssetBorrowingStats, error) {
	var stats AssetBorrowingStats

	// Total peminjaman dalam periode
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM asset_borrowings
		WHERE created_at >= COALESCE($1, '-infinity'::timestamptz)
		AND created_at <= COALESCE($2, 'infinity'::timestamptz)
	`, from, to).Scan(&stats.TotalBorrowings)
	if err != nil {
		return nil, err
	}

	// Active (borrowed)
	err = r.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM asset_borrowings
		WHERE status = $1
		AND created_at >= COALESCE($2, '-infinity'::timestamptz)
		AND created_at <= COALESCE($3, 'infinity'::timestamptz)
	`, "borrowed", from, to).Scan(&stats.ActiveBorrowings)
	if err != nil {
		return nil, err
	}

	// Overdue
	err = r.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM asset_borrowings
		WHERE status = $1 AND return_deadline < NOW()
		AND created_at >= COALESCE($2, '-infinity'::timestamptz)
		AND created_at <= COALESCE($3, 'infinity'::timestamptz)
	`, "borrowed", from, to).Scan(&stats.OverdueBorrowings)
	if err != nil {
		return nil, err
	}

	// Returned
	err = r.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM asset_borrowings
		WHERE status = $1
		AND created_at >= COALESCE($2, '-infinity'::timestamptz)
		AND created_at <= COALESCE($3, 'infinity'::timestamptz)
	`, "returned", from, to).Scan(&stats.ReturnedBorrowings)
	if err != nil {
		return nil, err
	}

	// Handled by staff (approved)
	err = r.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM asset_borrowings
		WHERE status IN ($1, $2)
		AND created_at >= COALESCE($3, '-infinity'::timestamptz)
		AND created_at <= COALESCE($4, 'infinity'::timestamptz)
	`, "approved", "borrowed", from, to).Scan(&stats.HandledByStaff)
	if err != nil {
		return nil, err
	}

	// Avg return days (returned items only)
	// CATATAN: setelah migrasi ke TIMESTAMP WITH TIME ZONE, pengurangan
	// (actual_return_date - borrow_date) menghasilkan INTERVAL, dan PostgreSQL
	// TIDAK bisa melakukan AVG() pada INTERVAL. Karena itu kita konversi dulu
	// ke jumlah detik (EXTRACT EPOCH), baru di-rata-ratakan, lalu dibagi 86400
	// untuk mendapatkan jumlah hari.
	err = r.db.QueryRow(ctx, `
		SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (actual_return_date - borrow_date)) / 86400), 0)
		FROM asset_borrowings
		WHERE status = $1
		AND actual_return_date IS NOT NULL
		AND created_at >= COALESCE($2, '-infinity'::timestamptz)
		AND created_at <= COALESCE($3, 'infinity'::timestamptz)
	`, "returned", from, to).Scan(&stats.AvgReturnDays)
	if err != nil {
		return nil, err
	}

	return &stats, nil
}
// berdasarkan siapa yang mengklaim (claimed_by), lalu hitung rata-rata
// waktu kerja dan tingkat kepatuhan SLA masing-masing staf.
func (r *StatsRepository) GetStaffPerformance(ctx context.Context) ([]StaffPerformance, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			u.id, u.name,
			COUNT(*) AS tickets_resolved,
			COALESCE(AVG(EXTRACT(EPOCH FROM (t.last_resolved_at - t.claimed_at)) / 60), 0) AS avg_minutes,
			COUNT(*) FILTER (
				WHERE sr.resolution_time_minutes IS NOT NULL
				AND t.last_resolved_at <= t.claimed_at + (sr.resolution_time_minutes || ' minutes')::interval
			) AS sla_compliant_count
		FROM tickets t
		JOIN users u ON u.id = t.claimed_by
		LEFT JOIN sla_rules sr ON sr.category_id = t.category_id AND sr.priority = t.priority
		WHERE t.status IN ('resolved', 'closed') AND t.claimed_at IS NOT NULL AND t.last_resolved_at IS NOT NULL
		GROUP BY u.id, u.name
		ORDER BY tickets_resolved DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []StaffPerformance
	for rows.Next() {
		var p StaffPerformance
		if err := rows.Scan(&p.StaffID, &p.StaffName, &p.TicketsResolved, &p.AvgResolutionMinutes, &p.SLACompliantCount); err != nil {
			return nil, err
		}
		if p.TicketsResolved > 0 {
			p.SLAComplianceRate = float64(p.SLACompliantCount) / float64(p.TicketsResolved) * 100
		}
		list = append(list, p)
	}
	return list, rows.Err()
}

// GetStaffPerformanceRange sama seperti GetStaffPerformance, tapi dibatasi
// rentang tanggal (berdasarkan created_at tiket) — dipakai modul Laporan
// supaya tabel performa staf ikut rentang filter yang sama seperti
// KPI/grafik lain di laporan, bukan selalu "sepanjang masa".
func (r *StatsRepository) GetStaffPerformanceRange(ctx context.Context, from, to *time.Time) ([]StaffPerformance, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			u.id, u.name,
			COUNT(*) AS tickets_resolved,
			COALESCE(AVG(EXTRACT(EPOCH FROM (t.last_resolved_at - t.claimed_at)) / 60), 0) AS avg_minutes,
			COUNT(*) FILTER (
				WHERE sr.resolution_time_minutes IS NOT NULL
				AND t.last_resolved_at <= t.claimed_at + (sr.resolution_time_minutes || ' minutes')::interval
			) AS sla_compliant_count
		FROM tickets t
		JOIN users u ON u.id = t.claimed_by
		LEFT JOIN sla_rules sr ON sr.category_id = t.category_id AND sr.priority = t.priority
		WHERE t.status IN ('resolved', 'closed') AND t.claimed_at IS NOT NULL AND t.last_resolved_at IS NOT NULL
			AND t.created_at >= COALESCE($1, '-infinity'::timestamptz)
			AND t.created_at <= COALESCE($2, 'infinity'::timestamptz)
		GROUP BY u.id, u.name
		ORDER BY tickets_resolved DESC
	`, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []StaffPerformance
	for rows.Next() {
		var p StaffPerformance
		if err := rows.Scan(&p.StaffID, &p.StaffName, &p.TicketsResolved, &p.AvgResolutionMinutes, &p.SLACompliantCount); err != nil {
			return nil, err
		}
		if p.TicketsResolved > 0 {
			p.SLAComplianceRate = float64(p.SLACompliantCount) / float64(p.TicketsResolved) * 100
		}
		list = append(list, p)
	}
	return list, rows.Err()
}

// GetStaffPerformanceForUser sama seperti GetStaffPerformance tapi untuk
// SATU staf saja — dipakai dashboard personal staf, supaya tidak perlu
// menarik data semua staf lalu cari sendiri satu baris di frontend.
func (r *StatsRepository) GetStaffPerformanceForUser(ctx context.Context, userID string) (*StaffPerformance, error) {
	p := &StaffPerformance{StaffID: userID}
	err := r.db.QueryRow(ctx, `
		SELECT
			u.name,
			COUNT(t.id) AS tickets_resolved,
			COALESCE(AVG(EXTRACT(EPOCH FROM (t.last_resolved_at - t.claimed_at)) / 60), 0) AS avg_minutes,
			COUNT(*) FILTER (
				WHERE sr.resolution_time_minutes IS NOT NULL
				AND t.last_resolved_at <= t.claimed_at + (sr.resolution_time_minutes || ' minutes')::interval
			) AS sla_compliant_count
		FROM users u
		LEFT JOIN tickets t ON t.claimed_by = u.id
			AND t.status IN ('resolved', 'closed') AND t.claimed_at IS NOT NULL AND t.last_resolved_at IS NOT NULL
		LEFT JOIN sla_rules sr ON sr.category_id = t.category_id AND sr.priority = t.priority
		WHERE u.id = $1
		GROUP BY u.name
	`, userID).Scan(&p.StaffName, &p.TicketsResolved, &p.AvgResolutionMinutes, &p.SLACompliantCount)
	if err != nil {
		return nil, err
	}
	if p.TicketsResolved > 0 {
		p.SLAComplianceRate = float64(p.SLACompliantCount) / float64(p.TicketsResolved) * 100
	}
	return p, nil
}

// CurrentWorkload menghitung berapa tiket yang SEDANG dikerjakan (claimed,
// belum resolve) oleh satu staf — pelengkap StaffPerformance yang cuma
// menghitung tiket yang SUDAH selesai.
func (r *StatsRepository) CurrentWorkload(ctx context.Context, userID string) (int, error) {
	var count int
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(*) FROM tickets WHERE claimed_by = $1 AND status = 'claimed'
	`, userID).Scan(&count)
	return count, err
}

// CreatorTicketCounts menghitung tiket yang DIBUAT oleh satu user,
// dikelompokkan per status — dipakai untuk dashboard personal pelapor
// (role 'user'), supaya dia lihat progres laporannya sendiri, bukan
// statistik perusahaan yang tidak relevan buatnya.
func (r *StatsRepository) CreatorTicketCounts(ctx context.Context, userID string) (map[string]int, error) {
	rows, err := r.db.Query(ctx, `
		SELECT status, COUNT(*) FROM tickets WHERE created_by = $1 GROUP BY status
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	counts := map[string]int{}
	for rows.Next() {
		var status string
		var count int
		if err := rows.Scan(&status, &count); err != nil {
			return nil, err
		}
		counts[status] = count
	}
	return counts, rows.Err()
}

// TrendPoint adalah satu titik data harian — dipakai untuk grafik tren
// di dashboard leader (berapa tiket dibuat vs diselesaikan tiap hari).
type TrendPoint struct {
	Date     string `json:"date"`
	Created  int    `json:"created"`
	Resolved int     `json:"resolved"`
}

// GetTrend mengambil N hari terakhir, DIISI PENUH walau tidak ada data
// (generate_series) — supaya grafiknya tidak bolong-bolong di hari yang
// kebetulan nol aktivitas.
func (r *StatsRepository) GetTrend(ctx context.Context, days int) ([]TrendPoint, error) {
	rows, err := r.db.Query(ctx, `
		WITH date_series AS (
			SELECT generate_series(
				CURRENT_DATE - ($1::int - 1),
				CURRENT_DATE,
				'1 day'::interval
			)::date AS day
		)
		SELECT
			ds.day,
			COUNT(DISTINCT t1.id) AS created_count,
			COUNT(DISTINCT t2.id) AS resolved_count
		FROM date_series ds
		LEFT JOIN tickets t1 ON t1.created_at::date = ds.day
		LEFT JOIN tickets t2 ON t2.last_resolved_at::date = ds.day
		GROUP BY ds.day
		ORDER BY ds.day
	`, days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var points []TrendPoint
	for rows.Next() {
		var day time.Time
		var p TrendPoint
		if err := rows.Scan(&day, &p.Created, &p.Resolved); err != nil {
			return nil, err
		}
		p.Date = day.Format("02 Jan")
		points = append(points, p)
	}
	return points, rows.Err()
}

// MyStatusBreakdown menghitung tiket yang PERNAH/SEDANG dipegang satu staf
// (claimed_by = userID), dikelompokkan per status — dipakai pie chart
// personal di dashboard staf.
func (r *StatsRepository) MyStatusBreakdown(ctx context.Context, userID string) (map[string]int, error) {
	rows, err := r.db.Query(ctx, `
		SELECT status, COUNT(*) FROM tickets WHERE claimed_by = $1 GROUP BY status
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	counts := map[string]int{}
	for rows.Next() {
		var status string
		var count int
		if err := rows.Scan(&status, &count); err != nil {
			return nil, err
		}
		counts[status] = count
	}
	return counts, rows.Err()
}

type StatsRepository struct {
	db *pgxpool.Pool
}

func NewStatsRepository(db *pgxpool.Pool) *StatsRepository {
	return &StatsRepository{db: db}
}

// GetSummary menjalankan beberapa query agregat sekaligus. Dipecah jadi
// beberapa query kecil (bukan satu query raksasa) supaya masing-masing
// tetap mudah dibaca dan di-debug — trade-off wajar untuk dashboard yang
// tidak butuh sub-milidetik.
func (r *StatsRepository) GetSummary(ctx context.Context) (*StatsSummary, error) {
	summary := &StatsSummary{ByStatus: map[string]int{}}

	// 1. Jumlah tiket per status
	rows, err := r.db.Query(ctx, `SELECT status, COUNT(*) FROM tickets GROUP BY status`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var status string
		var count int
		if err := rows.Scan(&status, &count); err != nil {
			rows.Close()
			return nil, err
		}
		summary.ByStatus[status] = count
		summary.TotalTickets += count
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// 2. SLA compliance mengukur PERFORMA STAF: apakah tiket diselesaikan
	// dalam target waktu kerja SEJAK DIKLAIM (claimed_at + resolution_time
	// dari sla_rules), BUKAN dibandingkan ke sla_deadline tiket (yang sejak
	// perubahan terbaru berarti "batas waktu keseluruhan sejak dibuat" —
	// dua hal beda: satu untuk reminder biar tidak ada tiket terlewat,
	// satu lagi untuk menilai kecepatan kerja staf).
	err = r.db.QueryRow(ctx, `
		SELECT
			COUNT(*) FILTER (
				WHERE t.status IN ('resolved', 'closed')
				AND t.claimed_at IS NOT NULL AND sr.resolution_time_minutes IS NOT NULL
			),
			COUNT(*) FILTER (
				WHERE t.status IN ('resolved', 'closed')
				AND t.claimed_at IS NOT NULL AND sr.resolution_time_minutes IS NOT NULL
				AND t.last_resolved_at <= t.claimed_at + (sr.resolution_time_minutes || ' minutes')::interval
			)
		FROM tickets t
		LEFT JOIN sla_rules sr ON sr.category_id = t.category_id AND sr.priority = t.priority
	`).Scan(&summary.TotalResolvedOrClosed, &summary.WithinSLACount)
	if err != nil {
		return nil, err
	}

	// 3. Rata-rata waktu penyelesaian (claimed_at -> last_resolved_at) dalam menit.
	// COALESCE(...,0) supaya kalau belum ada data sama sekali, hasilnya 0
	// bukan NULL (yang bikin JSON jadi aneh di frontend).
	err = r.db.QueryRow(ctx, `
		SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (last_resolved_at - claimed_at)) / 60), 0)
		FROM tickets
		WHERE last_resolved_at IS NOT NULL AND claimed_at IS NOT NULL
	`).Scan(&summary.AvgResolutionMinutes)
	if err != nil {
		return nil, err
	}

	// 4. Total reopen di seluruh tiket (jumlah baris log reopen)
	err = r.db.QueryRow(ctx, `SELECT COUNT(*) FROM ticket_reopen_logs`).Scan(&summary.TotalReopens)
	if err != nil {
		return nil, err
	}

	// 5. Rata-rata rating kepuasan dari pelapor
	err = r.db.QueryRow(ctx, `SELECT COALESCE(AVG(score), 0), COUNT(*) FROM ratings`).
		Scan(&summary.AvgRatingScore, &summary.TotalRatings)
	if err != nil {
		return nil, err
	}

	return summary, nil
}

// KPIReport adalah rangkuman untuk modul Laporan & KPI — beda dari
// StatsSummary (dashboard) karena bisa difilter rentang tanggal dan
// istilahnya dibuat lebih "laporan formal" (Open/In Progress/dst).
type KPIReport struct {
	TotalTickets          int     `json:"total_tickets"`
	Open                  int     `json:"open"`       // pending_approval + unassigned + assigned (belum diklaim)
	InProgress            int     `json:"in_progress"` // claimed
	Resolved              int     `json:"resolved"`    // resolved + closed
	Overdue               int     `json:"overdue"`     // masih berjalan tapi sudah lewat deadline
	Critical              int     `json:"critical"`    // prioritas urgent yang masih berjalan
	AvgResponseMinutes    float64 `json:"avg_response_minutes"`   // created_at -> claimed_at
	AvgResolutionMinutes  float64 `json:"avg_resolution_minutes"` // claimed_at -> last_resolved_at
}

// GetKPIReport menghitung seluruh angka laporan sekaligus, opsional
// dibatasi rentang tanggal (from/to nil berarti tidak dibatasi ke arah itu).
// Semua filter tanggal mengacu ke created_at tiket.
func (r *StatsRepository) GetKPIReport(ctx context.Context, from, to *time.Time) (*KPIReport, error) {
	report := &KPIReport{}
	err := r.db.QueryRow(ctx, `
		SELECT
			COUNT(*),
			COUNT(*) FILTER (WHERE status IN ('pending_approval', 'unassigned', 'assigned')),
			COUNT(*) FILTER (WHERE status = 'claimed'),
			COUNT(*) FILTER (WHERE status IN ('resolved', 'closed')),
			COUNT(*) FILTER (WHERE status NOT IN ('resolved', 'closed') AND sla_deadline IS NOT NULL AND sla_deadline < now()),
			COUNT(*) FILTER (WHERE priority = 'urgent' AND status NOT IN ('resolved', 'closed')),
			COALESCE(AVG(EXTRACT(EPOCH FROM (claimed_at - created_at)) / 60) FILTER (WHERE claimed_at IS NOT NULL), 0),
			COALESCE(AVG(EXTRACT(EPOCH FROM (last_resolved_at - claimed_at)) / 60) FILTER (WHERE last_resolved_at IS NOT NULL AND claimed_at IS NOT NULL), 0)
		FROM tickets
		WHERE created_at >= COALESCE($1, '-infinity'::timestamptz)
			AND created_at <= COALESCE($2, 'infinity'::timestamptz)
	`, from, to).Scan(
		&report.TotalTickets, &report.Open, &report.InProgress, &report.Resolved,
		&report.Overdue, &report.Critical, &report.AvgResponseMinutes, &report.AvgResolutionMinutes,
	)
	if err != nil {
		return nil, err
	}
	return report, nil
}

// GetTrendRange sama seperti GetTrend tapi rentangnya eksplisit (from-to),
// dipakai modul Laporan supaya grafik trennya ikut rentang filter yang
// dipilih user, bukan selalu "N hari terakhir dari sekarang".
func (r *StatsRepository) GetTrendRange(ctx context.Context, from, to time.Time) ([]TrendPoint, error) {
	rows, err := r.db.Query(ctx, `
		WITH date_series AS (
			SELECT generate_series($1::date, $2::date, '1 day'::interval)::date AS day
		)
		SELECT
			ds.day,
			COUNT(DISTINCT t1.id) AS created_count,
			COUNT(DISTINCT t2.id) AS resolved_count
		FROM date_series ds
		LEFT JOIN tickets t1 ON t1.created_at::date = ds.day
		LEFT JOIN tickets t2 ON t2.last_resolved_at::date = ds.day
		GROUP BY ds.day
		ORDER BY ds.day
	`, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var points []TrendPoint
	for rows.Next() {
		var day time.Time
		var p TrendPoint
		if err := rows.Scan(&day, &p.Created, &p.Resolved); err != nil {
			return nil, err
		}
		p.Date = day.Format("02 Jan")
		points = append(points, p)
	}
	return points, rows.Err()
}

// GetPriorityBreakdown menghitung jumlah tiket per prioritas dalam rentang
// tanggal tertentu — dipakai pie chart "Distribusi Prioritas" di laporan.
func (r *StatsRepository) GetPriorityBreakdown(ctx context.Context, from, to *time.Time) (map[string]int, error) {
	rows, err := r.db.Query(ctx, `
		SELECT priority, COUNT(*)
		FROM tickets
		WHERE created_at >= COALESCE($1, '-infinity'::timestamptz)
			AND created_at <= COALESCE($2, 'infinity'::timestamptz)
		GROUP BY priority
	`, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	counts := map[string]int{}
	for rows.Next() {
		var priority string
		var count int
		if err := rows.Scan(&priority, &count); err != nil {
			return nil, err
		}
		counts[priority] = count
	}
	return counts, rows.Err()
}

type CategoryCount struct {
	CategoryName string `json:"category_name"`
	Count        int    `json:"count"`
}

// GetCategoryBreakdown menghitung jumlah tiket per kategori dalam rentang
// tanggal tertentu — dipakai pie chart "Distribusi Kategori" di laporan,
// diurutkan dari kategori paling banyak tiketnya.
func (r *StatsRepository) GetCategoryBreakdown(ctx context.Context, from, to *time.Time) ([]CategoryCount, error) {
	rows, err := r.db.Query(ctx, `
		SELECT c.name, COUNT(t.id)
		FROM tickets t
		JOIN categories c ON c.id = t.category_id
		WHERE t.created_at >= COALESCE($1, '-infinity'::timestamptz)
			AND t.created_at <= COALESCE($2, 'infinity'::timestamptz)
		GROUP BY c.name
		ORDER BY COUNT(t.id) DESC
	`, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []CategoryCount
	for rows.Next() {
		var c CategoryCount
		if err := rows.Scan(&c.CategoryName, &c.Count); err != nil {
			return nil, err
		}
		list = append(list, c)
	}
	return list, rows.Err()
}

// GetMyTrend menghitung tren personal SATU staf: berapa tiket yang dia
// KLAIM vs SELESAIKAN tiap hari, N hari terakhir — versi personal dari
// GetTrend yang tadinya cuma perusahaan-wide.
func (r *StatsRepository) GetMyTrend(ctx context.Context, userID string, days int) ([]TrendPoint, error) {
	rows, err := r.db.Query(ctx, `
		WITH date_series AS (
			SELECT generate_series(
				CURRENT_DATE - ($1::int - 1),
				CURRENT_DATE,
				'1 day'::interval
			)::date AS day
		)
		SELECT
			ds.day,
			COUNT(DISTINCT t1.id) AS claimed_count,
			COUNT(DISTINCT t2.id) AS resolved_count
		FROM date_series ds
		LEFT JOIN tickets t1 ON t1.claimed_at::date = ds.day AND t1.claimed_by = $2
		LEFT JOIN tickets t2 ON t2.last_resolved_at::date = ds.day AND t2.claimed_by = $2
		GROUP BY ds.day
		ORDER BY ds.day
	`, days, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var points []TrendPoint
	for rows.Next() {
		var day time.Time
		var p TrendPoint
		if err := rows.Scan(&day, &p.Created, &p.Resolved); err != nil {
			return nil, err
		}
		p.Date = day.Format("02 Jan")
		points = append(points, p)
	}
	return points, rows.Err()
}

// GetMyPriorityBreakdown menghitung tiket yang PERNAH/SEDANG dipegang satu
// staf, dikelompokkan per prioritas — dipakai untuk lihat apakah staf itu
// lebih banyak menangani tiket ringan atau justru yang mendesak.
func (r *StatsRepository) GetMyPriorityBreakdown(ctx context.Context, userID string) (map[string]int, error) {
	rows, err := r.db.Query(ctx, `
		SELECT priority, COUNT(*) FROM tickets WHERE claimed_by = $1 GROUP BY priority
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	counts := map[string]int{}
	for rows.Next() {
		var priority string
		var count int
		if err := rows.Scan(&priority, &count); err != nil {
			return nil, err
		}
		counts[priority] = count
	}
	return counts, rows.Err()
}
