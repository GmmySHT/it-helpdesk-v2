package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	appmiddleware "ticketing-it/backend/internal/middleware"
	"ticketing-it/backend/internal/model"
	"ticketing-it/backend/internal/repository"
)

// DailyTaskHandler menangani CRUD daily task + daftar unit untuk dropdown.
//
// Hak akses: yang boleh MENCATAT hanya staf IT, leader, admin. Role 'user'
// (pelapor) hanya boleh MELIHAT — daily task adalah catatan pekerjaan tim,
// bukan laporan publik, dan namanya memuat keluhan unit lain.
type DailyTaskHandler struct {
	repo *repository.DailyTaskRepository
}

func NewDailyTaskHandler(repo *repository.DailyTaskRepository) *DailyTaskHandler {
	return &DailyTaskHandler{repo: repo}
}

func (h *DailyTaskHandler) ListUnits(w http.ResponseWriter, r *http.Request) {
	units, err := h.repo.ListUnits(r.Context())
	if err != nil {
		respondInternal(w, err, "gagal mengambil daftar unit")
		return
	}
	respondJSON(w, http.StatusOK, units)
}

func (h *DailyTaskHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)
	role, _ := r.Context().Value(appmiddleware.ContextRole).(model.UserRole)

	filter := repository.DailyTaskFilter{
		From:      r.URL.Query().Get("from"),
		To:        r.URL.Query().Get("to"),
		CreatedBy: r.URL.Query().Get("created_by"),
		UnitID:    r.URL.Query().Get("unit_id"),
	}

	// Staf hanya boleh melihat catatannya sendiri; leader/admin boleh melihat
	// milik siapa pun. Ini mencegah staf mengintip beban kerja rekan setim,
	// sama seperti aturan pada statistik tiket.
	if role == model.RoleStaffIT {
		filter.CreatedBy = userID
	}

	tasks, err := h.repo.List(r.Context(), filter)
	if err != nil {
		respondInternal(w, err, "gagal mengambil daily task")
		return
	}
	respondJSON(w, http.StatusOK, tasks)
}

func (h *DailyTaskHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	task, err := h.repo.FindByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrDailyTaskNotFound) {
			respondError(w, http.StatusNotFound, "daily task tidak ditemukan")
			return
		}
		respondInternal(w, err, "gagal mengambil daily task")
		return
	}
	respondJSON(w, http.StatusOK, task)
}

// dailyTaskInput adalah bentuk body request. Field waktu dikirim sebagai
// string ISO-8601 / datetime-local ("2026-11-12T14:30"), diparse di sini
// supaya frontend tidak perlu mengirim format RFC3339 lengkap.
type dailyTaskInput struct {
	TaskDate     string  `json:"task_date"`
	ReporterName string  `json:"reporter_name"`
	UnitID       *string `json:"unit_id"`
	Issue        string  `json:"issue"`
	Detail       string  `json:"detail"`
	Solution     string  `json:"solution"`
	ComplainAt   string  `json:"complain_at"`
	StartAt      string  `json:"start_at"`
	EndAt        string  `json:"end_at"`
}

// parseLocalTime menerima "2006-01-02T15:04" (datetime-local), RFC3339, atau
// "2006-01-02T15:04:05". String kosong berarti nil (opsional).
func parseLocalTime(v string) (*time.Time, error) {
	if strings.TrimSpace(v) == "" {
		return nil, nil
	}
	layouts := []string{
		time.RFC3339,
		"2006-01-02T15:04",
		"2006-01-02T15:04:05",
		"2006-01-02 15:04",
		"2006-01-02 15:04:05",
	}
	for _, layout := range layouts {
		if t, err := time.ParseInLocation(layout, v, time.Local); err == nil {
			return &t, nil
		}
	}
	return nil, errors.New("format waktu tidak dikenali: " + v)
}

// bind memvalidasi input dan mengisi model. Mengembalikan pesan kesalahan
// berbahasa Indonesia supaya bisa langsung ditampilkan di form.
func (in dailyTaskInput) bind() (*model.DailyTask, string) {
	if strings.TrimSpace(in.TaskDate) == "" {
		return nil, "Tanggal wajib diisi"
	}
	if strings.TrimSpace(in.ReporterName) == "" {
		return nil, "Pelapor wajib diisi"
	}
	if strings.TrimSpace(in.Issue) == "" {
		return nil, "Kendala wajib diisi"
	}
	if strings.TrimSpace(in.ComplainAt) == "" {
		return nil, "Waktu komplain wajib diisi"
	}

	// unit_id kosong dari <select> dikirim sebagai "" — perlakukan sebagai NULL,
	// bukan UUID kosong yang akan ditolak Postgres.
	var unitID *string
	if in.UnitID != nil && strings.TrimSpace(*in.UnitID) != "" {
		unitID = in.UnitID
	}

	complainAt, err := parseLocalTime(in.ComplainAt)
	if err != nil {
		return nil, "Waktu komplain tidak valid"
	}
	startAt, err := parseLocalTime(in.StartAt)
	if err != nil {
		return nil, "Waktu mulai tidak valid"
	}
	endAt, err := parseLocalTime(in.EndAt)
	if err != nil {
		return nil, "Waktu selesai tidak valid"
	}

	// Divalidasi juga di sini supaya user dapat pesan yang jelas, bukan error
	// constraint database. Constraint tetap ada sebagai jaring pengaman.
	if startAt != nil && startAt.Before(*complainAt) {
		return nil, "Waktu mulai tidak boleh lebih awal dari waktu komplain"
	}
	if startAt != nil && endAt != nil && endAt.Before(*startAt) {
		return nil, "Waktu selesai tidak boleh lebih awal dari waktu mulai"
	}
	if endAt != nil && startAt == nil {
		return nil, "Isi waktu mulai sebelum waktu selesai"
	}

	return &model.DailyTask{
		TaskDate:     in.TaskDate,
		ReporterName: strings.TrimSpace(in.ReporterName),
		UnitID:       unitID,
		Issue:        strings.TrimSpace(in.Issue),
		Detail:       in.Detail,
		Solution:     in.Solution,
		ComplainAt:   *complainAt,
		StartAt:      startAt,
		EndAt:        endAt,
	}, ""
}

func (h *DailyTaskHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)

	var in dailyTaskInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		respondError(w, http.StatusBadRequest, "format request tidak valid")
		return
	}

	task, msg := in.bind()
	if msg != "" {
		respondError(w, http.StatusBadRequest, msg)
		return
	}
	task.CreatedBy = userID

	if err := h.repo.Create(r.Context(), task); err != nil {
		respondInternal(w, err, "gagal menyimpan daily task")
		return
	}

	// Ambil ulang lewat FindByID supaya response memuat unit_name,
	// created_by_name, dan durasi hasil hitungan database.
	saved, err := h.repo.FindByID(r.Context(), task.ID)
	if err != nil {
		respondInternal(w, err, "daily task tersimpan tapi gagal dibaca ulang")
		return
	}
	respondJSON(w, http.StatusCreated, saved)
}

func (h *DailyTaskHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)
	role, _ := r.Context().Value(appmiddleware.ContextRole).(model.UserRole)

	existing, err := h.repo.FindByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrDailyTaskNotFound) {
			respondError(w, http.StatusNotFound, "daily task tidak ditemukan")
			return
		}
		respondInternal(w, err, "gagal mengambil daily task")
		return
	}

	// Staf hanya boleh mengubah catatannya sendiri; leader/admin boleh semua.
	if role == model.RoleStaffIT && existing.CreatedBy != userID {
		respondError(w, http.StatusForbidden, "kamu hanya bisa mengubah daily task milik sendiri")
		return
	}

	var in dailyTaskInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		respondError(w, http.StatusBadRequest, "format request tidak valid")
		return
	}

	task, msg := in.bind()
	if msg != "" {
		respondError(w, http.StatusBadRequest, msg)
		return
	}
	task.ID = id

	if err := h.repo.Update(r.Context(), task); err != nil {
		respondInternal(w, err, "gagal menyimpan perubahan")
		return
	}

	saved, err := h.repo.FindByID(r.Context(), id)
	if err != nil {
		respondInternal(w, err, "perubahan tersimpan tapi gagal dibaca ulang")
		return
	}
	respondJSON(w, http.StatusOK, saved)
}

func (h *DailyTaskHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)
	role, _ := r.Context().Value(appmiddleware.ContextRole).(model.UserRole)

	existing, err := h.repo.FindByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrDailyTaskNotFound) {
			respondError(w, http.StatusNotFound, "daily task tidak ditemukan")
			return
		}
		respondInternal(w, err, "gagal mengambil daily task")
		return
	}

	if role == model.RoleStaffIT && existing.CreatedBy != userID {
		respondError(w, http.StatusForbidden, "kamu hanya bisa menghapus daily task milik sendiri")
		return
	}

	if err := h.repo.Delete(r.Context(), id); err != nil {
		respondInternal(w, err, "gagal menghapus daily task")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"message": "daily task dihapus"})
}
