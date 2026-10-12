package handler

import (
	"net/http"
	"strconv"
	"time"

	appmiddleware "ticketing-it/backend/internal/middleware"
	"ticketing-it/backend/internal/repository"
)

type StatsHandler struct {
	statsRepo *repository.StatsRepository
}

func NewStatsHandler(statsRepo *repository.StatsRepository) *StatsHandler {
	return &StatsHandler{statsRepo: statsRepo}
}

func (h *StatsHandler) Summary(w http.ResponseWriter, r *http.Request) {
	summary, err := h.statsRepo.GetSummary(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "gagal menghitung statistik")
		return
	}
	respondJSON(w, http.StatusOK, summary)
}

func (h *StatsHandler) StaffPerformance(w http.ResponseWriter, r *http.Request) {
	list, err := h.statsRepo.GetStaffPerformance(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "gagal menghitung performa staf")
		return
	}
	respondJSON(w, http.StatusOK, list)
}

// MyPerformance dipakai dashboard staf — performa personal DIA (bukan
// staf lain), diambil dari user_id di JWT, bukan parameter yang bisa
// dimanipulasi dari luar.
func (h *StatsHandler) MyPerformance(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)

	perf, err := h.statsRepo.GetStaffPerformanceForUser(r.Context(), userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "gagal menghitung performa")
		return
	}

	workload, err := h.statsRepo.CurrentWorkload(r.Context(), userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "gagal menghitung beban kerja")
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"tickets_resolved":       perf.TicketsResolved,
		"avg_resolution_minutes": perf.AvgResolutionMinutes,
		"sla_compliance_rate":    perf.SLAComplianceRate,
		"current_workload":       workload,
	})
}

// MyCreatorStats dipakai dashboard pelapor (role 'user') — ringkasan tiket
// yang DIA laporkan, per status.
func (h *StatsHandler) MyCreatorStats(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)

	counts, err := h.statsRepo.CreatorTicketCounts(r.Context(), userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "gagal menghitung tiket")
		return
	}
	respondJSON(w, http.StatusOK, counts)
}

// Trend dipakai grafik tren dashboard leader — jumlah tiket dibuat vs
// diselesaikan per hari, N hari terakhir (default 7, maksimal dibatasi
// 30 supaya query generate_series tidak dipakai berlebihan).
func (h *StatsHandler) Trend(w http.ResponseWriter, r *http.Request) {
	days := 7
	if v := r.URL.Query().Get("days"); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil && parsed > 0 && parsed <= 30 {
			days = parsed
		}
	}

	points, err := h.statsRepo.GetTrend(r.Context(), days)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "gagal mengambil data tren")
		return
	}
	respondJSON(w, http.StatusOK, points)
}

// MyStatusBreakdown dipakai pie chart personal di dashboard staf.
func (h *StatsHandler) MyStatusBreakdown(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)

	counts, err := h.statsRepo.MyStatusBreakdown(r.Context(), userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "gagal menghitung status tiket")
		return
	}
	respondJSON(w, http.StatusOK, counts)
}

// KPIReport dipakai modul Laporan & KPI — mendukung filter rentang tanggal
// opsional lewat query param ?from=2026-01-01&to=2026-01-31 (format YYYY-MM-DD).
func (h *StatsHandler) KPIReport(w http.ResponseWriter, r *http.Request) {
	from, to := parseDateRange(r)

	report, err := h.statsRepo.GetKPIReport(r.Context(), from, to)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "gagal menghitung laporan")
		return
	}
	respondJSON(w, http.StatusOK, report)
}

// parseDateRange dipakai bersama oleh beberapa handler laporan supaya
// logika parsing ?from=&to= tidak ditulis berulang-ulang.
func parseDateRange(r *http.Request) (from, to *time.Time) {
	if v := r.URL.Query().Get("from"); v != "" {
		if parsed, err := time.Parse("2006-01-02", v); err == nil {
			from = &parsed
		}
	}
	if v := r.URL.Query().Get("to"); v != "" {
		if parsed, err := time.Parse("2006-01-02", v); err == nil {
			endOfDay := parsed.Add(23*time.Hour + 59*time.Minute + 59*time.Second)
			to = &endOfDay
		}
	}
	return from, to
}

// TrendRange dipakai grafik tren di modul Laporan — beda dari Trend biasa
// (dashboard) karena rentangnya ikut filter tanggal laporan, bukan selalu
// "N hari terakhir". Default 30 hari terakhir kalau user belum pilih filter.
func (h *StatsHandler) TrendRange(w http.ResponseWriter, r *http.Request) {
	from, to := parseDateRange(r)

	toVal := time.Now()
	if to != nil {
		toVal = *to
	}
	fromVal := toVal.AddDate(0, 0, -29)
	if from != nil {
		fromVal = *from
	}

	points, err := h.statsRepo.GetTrendRange(r.Context(), fromVal, toVal)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "gagal mengambil data tren")
		return
	}
	respondJSON(w, http.StatusOK, points)
}

func (h *StatsHandler) PriorityBreakdown(w http.ResponseWriter, r *http.Request) {
	from, to := parseDateRange(r)

	counts, err := h.statsRepo.GetPriorityBreakdown(r.Context(), from, to)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "gagal menghitung distribusi prioritas")
		return
	}
	respondJSON(w, http.StatusOK, counts)
}

func (h *StatsHandler) CategoryBreakdown(w http.ResponseWriter, r *http.Request) {
	from, to := parseDateRange(r)

	list, err := h.statsRepo.GetCategoryBreakdown(r.Context(), from, to)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "gagal menghitung distribusi kategori")
		return
	}
	respondJSON(w, http.StatusOK, list)
}

// StaffPerformanceRange dipakai tabel "Performa Staf" di modul Laporan —
// beda dari StaffPerformance biasa (dashboard) karena bisa difilter
// rentang tanggal yang sama dengan laporan.
func (h *StatsHandler) StaffPerformanceRange(w http.ResponseWriter, r *http.Request) {
	from, to := parseDateRange(r)

	list, err := h.statsRepo.GetStaffPerformanceRange(r.Context(), from, to)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "gagal menghitung performa staf")
		return
	}
	respondJSON(w, http.StatusOK, list)
}

// MyTrend dipakai dashboard staf — tren personal klaim vs selesai per hari.
func (h *StatsHandler) MyTrend(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)

	days := 7
	if v := r.URL.Query().Get("days"); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil && parsed > 0 && parsed <= 30 {
			days = parsed
		}
	}

	points, err := h.statsRepo.GetMyTrend(r.Context(), userID, days)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "gagal mengambil tren personal")
		return
	}
	respondJSON(w, http.StatusOK, points)
}

// MyPriorityBreakdown dipakai dashboard staf — pie chart prioritas tiket
// yang pernah/sedang dia pegang.
func (h *StatsHandler) MyPriorityBreakdown(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)

	counts, err := h.statsRepo.GetMyPriorityBreakdown(r.Context(), userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "gagal menghitung prioritas tiket")
		return
	}
	respondJSON(w, http.StatusOK, counts)
}

// AssetBorrowingStats mengembalikan statistik peminjaman aset dalam rentang waktu.
func (h *StatsHandler) AssetBorrowingStats(w http.ResponseWriter, r *http.Request) {
	from, to := parseDateRange(r)

	stats, err := h.statsRepo.GetAssetBorrowingStats(r.Context(), from, to)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "gagal menghitung statistik peminjaman aset")
		return
	}

	respondJSON(w, http.StatusOK, stats)
}
