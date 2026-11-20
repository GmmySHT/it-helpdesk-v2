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
	repo          *repository.DailyTaskRepository
	attachmentRepo *repository.DailyTaskAttachmentRepository
}

func NewDailyTaskHandler(repo *repository.DailyTaskRepository, attachmentRepo *repository.DailyTaskAttachmentRepository) *DailyTaskHandler {
	return &DailyTaskHandler{repo: repo, attachmentRepo: attachmentRepo}
}

// fillAttachments mengisi lampiran untuk daftar task. Di sini dipanggil
// sekali per task — jumlah task per halaman dibatasi filter tanggal UI.
func (h *DailyTaskHandler) fillAttachments(r *http.Request, tasks []model.DailyTask) error {
	for i := range tasks {
		list, err := h.attachmentRepo.ListByTask(r.Context(), tasks[i].ID)
		if err != nil { return err }
		tasks[i].Attachments = list
	}
	return nil
}

// CRUD Unit (departemen) — hanya leader/admin lewat route yang membatasi role.
func (h *DailyTaskHandler) CreateUnit(w http.ResponseWriter, r *http.Request) {
	var body struct { Name string `json:"name"` }
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Name) == "" {
		respondError(w, http.StatusBadRequest, "Nama unit wajib diisi")
		return
	}
	u, err := h.repo.CreateUnit(r.Context(), strings.TrimSpace(body.Name))
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			respondError(w, http.StatusConflict, "Unit dengan nama itu sudah ada")
			return
		}
		respondInternal(w, err, "gagal menambah unit")
		return
	}
	respondJSON(w, http.StatusCreated, u)
}

func (h *DailyTaskHandler) UpdateUnit(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct { Name string `json:"name"` }
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Name) == "" {
		respondError(w, http.StatusBadRequest, "Nama unit wajib diisi")
		return
	}
	u, err := h.repo.UpdateUnit(r.Context(), id, strings.TrimSpace(body.Name))
	if err != nil {
		if strings.Contains(err.Error(), "tidak ditemukan") { respondError(w, http.StatusNotFound, "Unit tidak ditemukan"); return }
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			respondError(w, http.StatusConflict, "Unit dengan nama itu sudah ada"); return
		}
		respondInternal(w, err, "gagal mengubah unit"); return
	}
	respondJSON(w, http.StatusOK, u)
}

func (h *DailyTaskHandler) DeleteUnit(w http.ResponseWriter, r *http.Request) {
	err := h.repo.DeleteUnit(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		if strings.Contains(err.Error(), "tidak ditemukan") { respondError(w, http.StatusNotFound, "Unit tidak ditemukan"); return }
		if strings.Contains(err.Error(), "foreign key") {
			respondError(w, http.StatusConflict, "Unit masih dipakai daily task — ubah dulu task yang memakainya")
			return
		}
		respondInternal(w, err, "gagal menghapus unit"); return
	}
	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
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
	if model.IsTechnicalStaff(role) {
		filter.CreatedBy = userID
	}

	tasks, err := h.repo.List(r.Context(), filter)
	if err != nil {
		respondInternal(w, err, "gagal mengambil daily task")
		return
	}
	if err := h.fillAttachments(r, tasks); err != nil {
		respondInternal(w, err, "gagal mengambil lampiran daily task")
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
	attachments, err := h.attachmentRepo.ListByTask(r.Context(), id)
	if err != nil {
		respondInternal(w, err, "gagal mengambil lampiran")
		return
	}
	task.Attachments = attachments
	respondJSON(w, http.StatusOK, task)
}

// UploadAttachments — POST /daily-tasks/{id}/attachments (multipart/form-data)
// Field: files (bisa lebih dari satu). Maksimal 5 file per task, 5 MB/file.
// Hanya pemilik task yang boleh menambah lampiran.
func (h *DailyTaskHandler) UploadAttachments(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)
	task, err := h.repo.FindByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "daily task tidak ditemukan")
		return
	}
	if task.CreatedBy != userID {
		respondError(w, http.StatusForbidden, "hanya pemilik task yang boleh menambah lampiran")
		return
	}

	if err := r.ParseMultipartForm(30 << 20); err != nil {
		respondError(w, http.StatusBadRequest, "gagal membaca form upload")
		return
	}
	files := r.MultipartForm.File["files"]
	if len(files) == 0 {
		respondError(w, http.StatusBadRequest, "pilih minimal satu file")
		return
	}
	current, err := h.attachmentRepo.Count(r.Context(), id)
	if err != nil { respondInternal(w, err, "gagal menghitung lampiran"); return }
	if current+len(files) > 5 {
		respondError(w, http.StatusBadRequest, "maksimal 5 lampiran per daily task")
		return
	}

	saved := []model.DailyTaskAttachment{}
	for _, fh := range files {
		if fh.Size > 5<<20 {
			respondError(w, http.StatusBadRequest, "ukuran setiap file maksimal 5 MB")
			return
		}
		f, err := fh.Open()
		if err != nil { respondInternal(w, err, "gagal membaca file"); return }
		url, fileType, err := saveValidatedDoc(f)
		f.Close()
		if err != nil {
			if errors.Is(err, ErrInvalidDoc) || errors.Is(err, ErrDocTooLarge) {
				respondError(w, http.StatusBadRequest, err.Error())
				return
			}
			respondInternal(w, err, "gagal menyimpan lampiran")
			return
		}
		a := model.DailyTaskAttachment{
			TaskID: id, FileURL: url, FileName: fh.Filename,
			FileType: fileType, FileSize: fh.Size, UploadedBy: userID,
		}
		if err := h.attachmentRepo.Create(r.Context(), &a); err != nil {
			respondInternal(w, err, "gagal menyimpan lampiran")
			return
		}
		saved = append(saved, a)
	}
	respondJSON(w, http.StatusCreated, saved)
}

// DeleteAttachment — DELETE /daily-tasks/{id}/attachments/{attId}
// Hanya pemilik task yang boleh menghapus.
func (h *DailyTaskHandler) DeleteAttachment(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	attID := chi.URLParam(r, "attId")
	userID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)
	task, err := h.repo.FindByID(r.Context(), id)
	if err != nil { respondError(w, http.StatusNotFound, "daily task tidak ditemukan"); return }
	if task.CreatedBy != userID {
		respondError(w, http.StatusForbidden, "hanya pemilik task yang boleh menghapus lampiran")
		return
	}
	a, err := h.attachmentRepo.FindByID(r.Context(), attID)
	if err != nil || a.TaskID != id {
		respondError(w, http.StatusNotFound, "lampiran tidak ditemukan")
		return
	}
	if err := h.attachmentRepo.Delete(r.Context(), attID); err != nil {
		respondInternal(w, err, "gagal menghapus lampiran")
		return
	}
	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// dailyTaskInput adalah bentuk body request. Field waktu dikirim sebagai
// string ISO-8601 / datetime-local ("2026-11-12T14:30"), diparse di sini
// supaya frontend tidak perlu mengirim format RFC3339 lengkap.
type dailyTaskInput struct {
	TaskDate     string  `json:"task_date"`
	ReporterName string  `json:"reporter_name"`
	UnitID       *string `json:"unit_id"`
	CategoryID   *string `json:"category_id"`
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
	// Kendala sekarang berasal dari kategori tiket (category_id). Frontend
	// mengirim issue = nama kategori; untuk klien lama yang belum mengirim
	// issue, category_id yang valid tetap cukup (kolom issue NOT NULL).
	if strings.TrimSpace(in.Issue) == "" && (in.CategoryID == nil || strings.TrimSpace(*in.CategoryID) == "") {
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
	var categoryID *string
	if in.CategoryID != nil && strings.TrimSpace(*in.CategoryID) != "" {
		categoryID = in.CategoryID
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
		CategoryID:   categoryID,
		Issue:        func() string {
			if v := strings.TrimSpace(in.Issue); v != "" { return v }
			return "-" // diisi frontend dengan nama kategori; placeholder untuk API lama
		}(),
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
	if model.IsTechnicalStaff(role) && existing.CreatedBy != userID {
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

	if model.IsTechnicalStaff(role) && existing.CreatedBy != userID {
		respondError(w, http.StatusForbidden, "kamu hanya bisa menghapus daily task milik sendiri")
		return
	}

	if err := h.repo.Delete(r.Context(), id); err != nil {
		respondInternal(w, err, "gagal menghapus daily task")
		return
	}
	respondJSON(w, http.StatusOK, map[string]string{"message": "daily task dihapus"})
}
