package handler

import (
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	appmiddleware "ticketing-it/backend/internal/middleware"
	"ticketing-it/backend/internal/model"
	"ticketing-it/backend/internal/repository"
)

// KPIHandler melayani laporan KPI gabungan (tiket + daily task) dan
// mengunduhnya sebagai CSV.
//
// Kenapa CSV, bukan XLSX: project ini tidak punya library spreadsheet, dan
// CSV dibuka langsung oleh Excel/LibreOffice tanpa dependency tambahan.
// Nama file memakai prefix BOM UTF-8 supaya huruf beraksen dan simbol
// "—" tidak rusak saat dibuka di Excel versi Indonesia.
type KPIHandler struct {
	repo *repository.StatsRepository
}

func NewKPIHandler(repo *repository.StatsRepository) *KPIHandler {
	return &KPIHandler{repo: repo}
}

// resolveStaffScope menentukan cakupan laporan berdasarkan siapa yang login.
//
// Aturan akses:
//   - staff_it  → dipaksa ke DIRINYA SENDIRI, apa pun isi ?staff_id=. Staf
//     tidak boleh melihat beban kerja rekan setim; ini sama dengan aturan
//     pada /daily-tasks dan /tickets.
//   - leader & admin → boleh melihat semua staf, atau memilih satu orang
//     lewat ?staff_id=.
//
// Parameter staffID yang diminta staf sengaja DIABAIKAN, bukan ditolak 403:
// halaman cetak yang membawa staff_id rekan setim tetap menampilkan laporan
// milik si pemanggil, bukan halaman error.
func resolveStaffScope(r *http.Request) (staffID string, canViewAll bool) {
	userID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)
	role, _ := r.Context().Value(appmiddleware.ContextRole).(model.UserRole)

	if role == model.RoleLeader || role == model.RoleAdmin {
		return r.URL.Query().Get("staff_id"), true
	}
	return userID, false
}

// StaffKPI menampilkan tabel KPI lengkap. Filter: ?from= ?to= ?staff_id=
//
// Cakupan baris mengikuti role yang login — lihat resolveStaffScope.
func (h *KPIHandler) StaffKPI(w http.ResponseWriter, r *http.Request) {
	from, to := parseDateRange(r)
	staffID, canViewAll := resolveStaffScope(r)

	list, err := h.repo.GetStaffKPIReport(r.Context(), from, to, staffID)
	if err != nil {
		respondInternal(w, err, "gagal menghitung KPI staf")
		return
	}

	overview, err := h.repo.GetKPIOverview(r.Context(), from, to, staffID)
	if err != nil {
		respondInternal(w, err, "gagal menghitung ringkasan KPI")
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"overview":       overview,
		"staff":          list,
		"can_view_all":   canViewAll,
		"scope_staff_id": staffID,
	})
}

// StaffKPIDetail menampilkan laporan KPI LENGKAP satu staf (atau semua staf):
// ringkasan + rincian tiket + rincian daily task. Dipakai halaman cetak
// /reports/kpi/print yang bentuknya seperti dokumen resmi, bukan dashboard.
//
// Filter: ?from= ?to= ?staff_id= — cakupan tetap mengikuti role yang login.
func (h *KPIHandler) StaffKPIDetail(w http.ResponseWriter, r *http.Request) {
	from, to := parseDateRange(r)
	staffID, canViewAll := resolveStaffScope(r)

	details, err := h.repo.GetStaffKPIDetail(r.Context(), from, to, staffID)
	if err != nil {
		respondInternal(w, err, "gagal menghitung rincian KPI staf")
		return
	}

	overview, err := h.repo.GetKPIOverview(r.Context(), from, to, staffID)
	if err != nil {
		respondInternal(w, err, "gagal menghitung ringkasan KPI")
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"overview":       overview,
		"details":        details,
		"can_view_all":   canViewAll,
		"scope_staff_id": staffID,
	})
}

// StaffKPIExport mengunduh KPI dalam bentuk CSV.
//
// Dua mode dalam satu endpoint:
//   - ?staff_id=<uuid>  → satu orang (laporan perorangan)
//   - tanpa staff_id    → semua staf (laporan tim)
//
// Sengaja satu endpoint supaya file yang diunduh leader dan file yang
// diunduh staf punya kolom yang sama persis — membandingkan dua laporan
// jadi tidak perlu mencocokkan format.
func (h *KPIHandler) StaffKPIExport(w http.ResponseWriter, r *http.Request) {
	from, to := parseDateRange(r)
	staffID, _ := resolveStaffScope(r)

	list, err := h.repo.GetStaffKPIReport(r.Context(), from, to, staffID)
	if err != nil {
		respondInternal(w, err, "gagal menghitung KPI staf")
		return
	}
	overview, err := h.repo.GetKPIOverview(r.Context(), from, to, staffID)
	if err != nil {
		respondInternal(w, err, "gagal menghitung ringkasan KPI")
		return
	}

	filename := "kpi-tim"
	if staffID != "" && len(list) > 0 {
		filename = "kpi-" + slugify(list[0].StaffName)
	}
	if from != nil && to != nil {
		filename += fmt.Sprintf("-%s_%s", from.Format("20060102"), to.Format("20060102"))
	} else if from != nil {
		filename += "-sejak" + from.Format("20060102")
	}
	filename += ".csv"

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)

	// BOM UTF-8: tanpa ini Excel membaca CSV sebagai ANSI dan karakter
	// non-ASCII (mis. tanda hubung panjang) tampil sebagai "Ã¢â‚¬â€œ".
	w.Write([]byte{0xEF, 0xBB, 0xBF})

	cw := csv.NewWriter(w)
	defer cw.Flush()

	periode := "Semua periode"
	if from != nil && to != nil {
		periode = from.Format("02 Jan 2006") + " - " + to.Format("02 Jan 2006")
	} else if from != nil {
		periode = "Sejak " + from.Format("02 Jan 2006")
	} else if to != nil {
		periode = "Sampai " + to.Format("02 Jan 2006")
	}

	// Baris ringkasan di atas tabel: saat file dibuka, pembaca langsung tahu
	// laporan ini mencakup periode apa tanpa harus menebak dari angka.
	cw.Write([]string{"Laporan KPI IT", periode})
	cw.Write([]string{})
	cw.Write([]string{"Ringkasan"})
	cw.Write([]string{"Total Tiket", strconv.Itoa(overview.TotalTickets)})
	cw.Write([]string{"Tiket Selesai", strconv.Itoa(overview.TicketsResolved)})
	cw.Write([]string{"Total Daily Task", strconv.Itoa(overview.TotalDailyTasks)})
	cw.Write([]string{"Total Item Pekerjaan", strconv.Itoa(overview.TotalWorkItems)})
	cw.Write([]string{"Rata-rata Penyelesaian Tiket (menit)", formatMinutes(overview.AvgTicketResolutionMinutes)})
	cw.Write([]string{"Rata-rata Durasi Daily Task (menit)", formatMinutes(overview.AvgDailyDurationMinutes)})
	cw.Write([]string{"Rata-rata Respon Daily Task (menit)", formatMinutes(overview.AvgDailyResponseMinutes)})
	cw.Write([]string{})

	if len(overview.PerUnit) > 0 {
		cw.Write([]string{"Daily Task per Unit"})
		cw.Write([]string{"Unit", "Jumlah"})
		for _, u := range overview.PerUnit {
			cw.Write([]string{u.UnitName, strconv.Itoa(u.Count)})
		}
		cw.Write([]string{})
	}

	cw.Write([]string{"KPI per Staf"})
	cw.Write([]string{
		"No", "Nama", "Role", "Departemen",
		"Tiket Selesai", "Daily Task", "Total Item",
		"Rata-rata Penyelesaian Tiket (menit)",
		"Rata-rata Durasi Daily Task (menit)",
		"Rata-rata Respon Daily Task (menit)",
		"SLA Compliance (%)", "Reopen",
	})
	for i, k := range list {
		cw.Write([]string{
			strconv.Itoa(i + 1),
			k.StaffName,
			roleLabel(k.Role),
			k.Department,
			strconv.Itoa(k.TicketsResolved),
			strconv.Itoa(k.DailyTasks),
			strconv.Itoa(k.TotalWorkItems),
			formatMinutes(k.AvgResolutionMinutes),
			formatMinutes(k.AvgDailyDurationMin),
			formatMinutes(k.AvgDailyResponseMin),
			fmt.Sprintf("%.1f", k.SLAComplianceRate),
			strconv.Itoa(k.ReopenCount),
		})
	}

	if len(list) == 0 {
		cw.Write([]string{"(tidak ada data pada periode ini)"})
	}
}

// formatMinutes menampilkan menit sebagai angka bulat 1 desimal. Nilai 0
// dibiarkan "0" agar kolom tidak penuh "0.0" yang terbaca seperti data hilang.
func formatMinutes(v float64) string {
	if v == 0 {
		return "0"
	}
	return fmt.Sprintf("%.1f", v)
}

func roleLabel(role string) string {
	switch role {
	case "staff_it":
		return "Staf IT"
	case "leader":
		return "Leader"
	case "admin":
		return "Admin"
	case "user":
		return "Pelapor"
	}
	return role
}

// slugify dipakai untuk nama file unduhan. Hanya huruf/angka/hubung yang
// dipertahankan supaya nama file aman di semua OS.
func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	var b strings.Builder
	prevDash := false
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			prevDash = false
		default:
			if !prevDash && b.Len() > 0 {
				b.WriteRune('-')
				prevDash = true
			}
		}
	}
	return strings.Trim(b.String(), "-")
}

var _ = time.Now
