package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	appmiddleware "ticketing-it/backend/internal/middleware"
	"ticketing-it/backend/internal/model"
	"ticketing-it/backend/internal/repository"
	"ticketing-it/backend/internal/service"
)

type TicketHandler struct {
	ticketService *service.TicketService
}

func NewTicketHandler(ticketService *service.TicketService) *TicketHandler {
	return &TicketHandler{ticketService: ticketService}
}

type createTicketRequest struct {
	Title       string  `json:"title"`
	Description string  `json:"description"`
	CategoryID  string  `json:"category_id"`
	Priority    string  `json:"priority,omitempty"`
	AssignedTo  *string `json:"assigned_to,omitempty"`
	CreatedFor  *string `json:"created_for,omitempty"`
	// Deadline dikirim sebagai string RFC3339 (format ISO datetime standar
	// yang otomatis dihasilkan oleh <input type="datetime-local"> di frontend
	// setelah dikonversi ke UTC). Opsional — kosong berarti pakai hitungan
	// otomatis dari priority seperti sebelumnya.
	Deadline *string `json:"deadline,omitempty"`
}

func (h *TicketHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createTicketRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body request tidak valid")
		return
	}

	if req.Title == "" || req.Description == "" || req.CategoryID == "" {
		respondError(w, http.StatusBadRequest, "title, description, dan category_id wajib diisi")
		return
	}

	// user_id dan role diambil dari context, disisipkan oleh middleware Auth
	// setelah memvalidasi JWT — bukan dari body request.
	userID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)
	role, _ := r.Context().Value(appmiddleware.ContextRole).(model.UserRole)

	var customDeadline *time.Time
	if req.Deadline != nil && *req.Deadline != "" {
		parsed, err := time.Parse(time.RFC3339, *req.Deadline)
		if err != nil {
			respondError(w, http.StatusBadRequest, "format deadline tidak valid, gunakan format ISO datetime")
			return
		}
		customDeadline = &parsed
	}

	ticket, err := h.ticketService.Create(r.Context(), service.CreateTicketInput{
		Title:          req.Title,
		Description:    req.Description,
		CategoryID:     req.CategoryID,
		Priority:       model.TicketPriority(req.Priority),
		CreatedBy:      userID,
		CreatedFor:     req.CreatedFor,
		AssignedTo:     req.AssignedTo,
		RequesterRole:  role,
		CustomDeadline: customDeadline,
	})
	if err != nil {
		if errors.Is(err, service.ErrOnlyLeaderCanAssign) {
			respondError(w, http.StatusForbidden, err.Error())
			return
		}
		if errors.Is(err, service.ErrOnlyLeaderCanSetDeadline) {
			respondError(w, http.StatusForbidden, err.Error())
			return
		}
		respondError(w, http.StatusInternalServerError, "gagal membuat tiket")
		return
	}

	respondJSON(w, http.StatusCreated, ticket)
}

func (h *TicketHandler) List(w http.ResponseWriter, r *http.Request) {
	statusFilter := r.URL.Query().Get("status")
	userID := r.Context().Value(appmiddleware.ContextUserID).(string)
	role, _ := r.Context().Value(appmiddleware.ContextRole).(model.UserRole)

	tickets, err := h.ticketService.List(r.Context(), statusFilter, userID, string(role))
	if err != nil {
		respondError(w, http.StatusInternalServerError, "gagal mengambil daftar tiket")
		return
	}

	respondJSON(w, http.StatusOK, tickets)
}

func (h *TicketHandler) AtRisk(w http.ResponseWriter, r *http.Request) {
	list, err := h.ticketService.ListAtRisk(r.Context(), 10)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "gagal mengambil tiket berisiko")
		return
	}
	respondJSON(w, http.StatusOK, list)
}

func (h *TicketHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	ticket, err := h.ticketService.GetByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrTicketNotFound) {
			respondError(w, http.StatusNotFound, "tiket tidak ditemukan")
			return
		}
		respondError(w, http.StatusInternalServerError, "gagal mengambil detail tiket")
		return
	}

	respondJSON(w, http.StatusOK, ticket)
}

func (h *TicketHandler) Claim(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)
	role, _ := r.Context().Value(appmiddleware.ContextRole).(model.UserRole)

	ticket, err := h.ticketService.Claim(r.Context(), id, userID, role)
	if err != nil {
		switch {
		case errors.Is(err, repository.ErrTicketNotFound):
			respondError(w, http.StatusNotFound, "tiket tidak ditemukan")
		case errors.Is(err, service.ErrOnlyStaffCanClaim):
			respondError(w, http.StatusForbidden, err.Error())
		case errors.Is(err, service.ErrNotAssignedStaff):
			respondError(w, http.StatusForbidden, err.Error())
		case errors.Is(err, service.ErrTicketNotClaimable):
			respondError(w, http.StatusConflict, err.Error())
		case errors.Is(err, repository.ErrTicketAlreadyClaimed):
			respondError(w, http.StatusConflict, err.Error())
		default:
		}
		return
	}

	respondJSON(w, http.StatusOK, ticket)
}

// uploadDir adalah folder tempat gambar bukti resolve disimpan di disk lokal.
// Untuk project skala kecil/menengah ini cukup; kalau nanti perlu scale
// (multi-server) baru dipindah ke object storage (S3/MinIO/dst).
const uploadDir = "./uploads"

func (h *TicketHandler) Resolve(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)

	// 20 << 20 = batas maksimal 20MB dibaca ke memori sebelum sisanya
	// ditulis ke file sementara — mencegah upload super besar membebani RAM server.
	if err := r.ParseMultipartForm(20 << 20); err != nil {
		respondError(w, http.StatusBadRequest, "gagal membaca form upload, pastikan pakai multipart/form-data")
		return
	}

	message := r.FormValue("message")
	files := r.MultipartForm.File["files"]

	if len(files) == 0 {
		respondError(w, http.StatusBadRequest, service.ErrResolveNeedsAttachment.Error())
		return
	}

	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		respondError(w, http.StatusInternalServerError, "gagal menyiapkan folder upload")
		return
	}

	var savedURLs []string
	for _, fileHeader := range files {
		url, err := saveUploadedFile(fileHeader)
		if err != nil {
			respondError(w, http.StatusInternalServerError, "gagal menyimpan file: "+err.Error())
			return
		}
		savedURLs = append(savedURLs, url)
	}

	ticket, err := h.ticketService.Resolve(r.Context(), service.ResolveInput{
		TicketID:       id,
		UserID:         userID,
		Message:        message,
		AttachmentURLs: savedURLs,
	})
	if err != nil {
		switch {
		case errors.Is(err, service.ErrNotClaimingStaff):
			respondError(w, http.StatusForbidden, err.Error())
		case errors.Is(err, service.ErrResolveNeedsAttachment):
			respondError(w, http.StatusBadRequest, err.Error())
		default:
			respondError(w, http.StatusInternalServerError, "gagal resolve tiket: "+err.Error())
		}
		return
	}

	respondJSON(w, http.StatusOK, ticket)
}

// saveUploadedFile menyimpan satu file ke disk dengan nama unik (UUID + ekstensi asli)
// supaya tidak ada file yang saling menimpa kalau ada dua staf upload file bernama sama.
func saveUploadedFile(fileHeader *multipart.FileHeader) (string, error) {
	src, err := fileHeader.Open()
	if err != nil {
		return "", err
	}
	defer src.Close()

	ext := filepath.Ext(fileHeader.Filename)
	newFileName := fmt.Sprintf("%s%s", uuid.New().String(), ext)
	destPath := filepath.Join(uploadDir, newFileName)

	dst, err := os.Create(destPath)
	if err != nil {
		return "", err
	}
	defer dst.Close()

	if _, err := io.Copy(dst, src); err != nil {
		return "", err
	}

	// URL relatif ini dipakai frontend sebagai <img src="http://localhost:8080/uploads/xxx.jpg" />
	// setelah di-serve lewat static file handler di router.
	return "/uploads/" + newFileName, nil
}

func (h *TicketHandler) Close(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)
	role, _ := r.Context().Value(appmiddleware.ContextRole).(model.UserRole)

	ticket, err := h.ticketService.Close(r.Context(), id, userID, role)
	if err != nil {
		switch {
		case errors.Is(err, repository.ErrTicketNotFound):
			respondError(w, http.StatusNotFound, "tiket tidak ditemukan")
		case errors.Is(err, service.ErrOnlyLeaderCanReview):
			respondError(w, http.StatusForbidden, err.Error())
		case errors.Is(err, repository.ErrTicketNotResolvable):
			respondError(w, http.StatusConflict, "tiket hanya bisa di-close dari status 'resolved'")
		default:
			respondError(w, http.StatusInternalServerError, "gagal close tiket")
		}
		return
	}

	respondJSON(w, http.StatusOK, ticket)
}

type reopenRequest struct {
	Reason string `json:"reason"`
}

func (h *TicketHandler) Reopen(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)
	role, _ := r.Context().Value(appmiddleware.ContextRole).(model.UserRole)

	var req reopenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body request tidak valid")
		return
	}

	ticket, err := h.ticketService.Reopen(r.Context(), service.ReopenInput{
		TicketID:      id,
		ReopenedBy:    userID,
		RequesterRole: role,
		Reason:        req.Reason,
	})
	if err != nil {
		switch {
		case errors.Is(err, repository.ErrTicketNotFound):
			respondError(w, http.StatusNotFound, "tiket tidak ditemukan")
		case errors.Is(err, service.ErrOnlyLeaderCanReview):
			respondError(w, http.StatusForbidden, err.Error())
		case errors.Is(err, service.ErrReopenNeedsReason):
			respondError(w, http.StatusBadRequest, err.Error())
		case errors.Is(err, repository.ErrTicketNotResolvable):
			respondError(w, http.StatusConflict, "tiket hanya bisa direopen dari status 'resolved'")
		default:
			respondError(w, http.StatusInternalServerError, "gagal reopen tiket: "+err.Error())
		}
		return
	}

	respondJSON(w, http.StatusOK, ticket)
}

type reassignRequest struct {
	NewStaffID string `json:"new_staff_id"`
	Reason     string `json:"reason"`
}

func (h *TicketHandler) Reassign(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)
	role, _ := r.Context().Value(appmiddleware.ContextRole).(model.UserRole)

	var req reassignRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body request tidak valid")
		return
	}
	if req.NewStaffID == "" {
		respondError(w, http.StatusBadRequest, "new_staff_id wajib diisi")
		return
	}

	ticket, err := h.ticketService.Reassign(r.Context(), service.ReassignInput{
		TicketID:      id,
		NewStaffID:    req.NewStaffID,
		ReassignedBy:  userID,
		RequesterRole: role,
		Reason:        req.Reason,
	})
	if err != nil {
		switch {
		case errors.Is(err, repository.ErrTicketNotFound):
			respondError(w, http.StatusNotFound, "tiket tidak ditemukan")
		case errors.Is(err, service.ErrOnlyLeaderCanReassign):
			respondError(w, http.StatusForbidden, err.Error())
		case errors.Is(err, service.ErrReassignNeedsReason):
			respondError(w, http.StatusBadRequest, err.Error())
		case errors.Is(err, service.ErrTicketNotClaimedYet):
			respondError(w, http.StatusConflict, err.Error())
		default:
			respondError(w, http.StatusInternalServerError, "gagal reassign tiket: "+err.Error())
		}
		return
	}

	respondJSON(w, http.StatusOK, ticket)
}

type approveRequest struct {
	AssignedTo *string `json:"assigned_to,omitempty"`
	Deadline   *string `json:"deadline,omitempty"`
}

func (h *TicketHandler) Approve(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)
	role, _ := r.Context().Value(appmiddleware.ContextRole).(model.UserRole)

	var req approveRequest
	// Body boleh kosong (approve tanpa assign staf tertentu), jadi error
	// decode di sini tidak langsung dianggap fatal kalau body memang kosong.
	_ = json.NewDecoder(r.Body).Decode(&req)

	var customDeadline *time.Time
	if req.Deadline != nil && *req.Deadline != "" {
		parsed, err := time.Parse(time.RFC3339, *req.Deadline)
		if err != nil {
			respondError(w, http.StatusBadRequest, "format deadline tidak valid")
			return
		}
		customDeadline = &parsed
	}

	ticket, err := h.ticketService.Approve(r.Context(), service.ApproveInput{
		TicketID:       id,
		ApproverID:     userID,
		Role:           role,
		AssignedTo:     req.AssignedTo,
		CustomDeadline: customDeadline,
	})
	if err != nil {
		switch {
		case errors.Is(err, repository.ErrTicketNotFound):
			respondError(w, http.StatusNotFound, "tiket tidak ditemukan")
		case errors.Is(err, service.ErrOnlyLeaderCanApprove):
			respondError(w, http.StatusForbidden, err.Error())
		case errors.Is(err, service.ErrTicketNotPendingApproval):
			respondError(w, http.StatusConflict, err.Error())
		default:
			respondError(w, http.StatusInternalServerError, "gagal menyetujui tiket: "+err.Error())
		}
		return
	}

	respondJSON(w, http.StatusOK, ticket)
}

type rejectRequest struct {
	Reason string `json:"reason"`
}

func (h *TicketHandler) Reject(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)
	role, _ := r.Context().Value(appmiddleware.ContextRole).(model.UserRole)

	var req rejectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body request tidak valid")
		return
	}

	ticket, err := h.ticketService.Reject(r.Context(), service.RejectInput{
		TicketID:   id,
		ApproverID: userID,
		Role:       role,
		Reason:     req.Reason,
	})
	if err != nil {
		switch {
		case errors.Is(err, repository.ErrTicketNotFound):
			respondError(w, http.StatusNotFound, "tiket tidak ditemukan")
		case errors.Is(err, service.ErrOnlyLeaderCanApprove):
			respondError(w, http.StatusForbidden, err.Error())
		case errors.Is(err, service.ErrRejectNeedsReason):
			respondError(w, http.StatusBadRequest, err.Error())
		case errors.Is(err, service.ErrTicketNotPendingApproval):
			respondError(w, http.StatusConflict, err.Error())
		default:
			respondError(w, http.StatusInternalServerError, "gagal menolak tiket: "+err.Error())
		}
		return
	}

	respondJSON(w, http.StatusOK, ticket)
}

type updateDeadlineRequest struct {
	Deadline string `json:"deadline"`
}

func (h *TicketHandler) UpdateDeadline(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)
	role, _ := r.Context().Value(appmiddleware.ContextRole).(model.UserRole)

	var req updateDeadlineRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body request tidak valid")
		return
	}

	deadline, err := time.Parse(time.RFC3339, req.Deadline)
	if err != nil {
		respondError(w, http.StatusBadRequest, "format deadline tidak valid, gunakan format ISO datetime")
		return
	}

	ticket, err := h.ticketService.UpdateDeadline(r.Context(), id, userID, role, deadline)
	if err != nil {
		switch {
		case errors.Is(err, repository.ErrTicketNotFound):
			respondError(w, http.StatusNotFound, "tiket tidak ditemukan")
		case errors.Is(err, service.ErrOnlyLeaderCanSetDeadline):
			respondError(w, http.StatusForbidden, err.Error())
		case errors.Is(err, service.ErrCannotEditClosedTicket):
			respondError(w, http.StatusConflict, err.Error())
		default:
			respondError(w, http.StatusInternalServerError, "gagal mengubah deadline")
		}
		return
	}

	respondJSON(w, http.StatusOK, ticket)
}

type updateDetailsRequest struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	CategoryID  string `json:"category_id"`
	Priority    string `json:"priority"`
}

func (h *TicketHandler) UpdateDetails(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)
	role, _ := r.Context().Value(appmiddleware.ContextRole).(model.UserRole)

	var req updateDetailsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body request tidak valid")
		return
	}
	if req.Title == "" || req.Description == "" || req.CategoryID == "" {
		respondError(w, http.StatusBadRequest, "title, description, dan category_id wajib diisi")
		return
	}

	ticket, err := h.ticketService.UpdateDetails(r.Context(), service.UpdateTicketDetailsInput{
		TicketID:    id,
		UserID:      userID,
		Role:        role,
		Title:       req.Title,
		Description: req.Description,
		CategoryID:  req.CategoryID,
		Priority:    model.TicketPriority(req.Priority),
	})
	if err != nil {
		switch {
		case errors.Is(err, repository.ErrTicketNotFound):
			respondError(w, http.StatusNotFound, "tiket tidak ditemukan")
		case errors.Is(err, service.ErrOnlyLeaderCanAssign):
			respondError(w, http.StatusForbidden, "hanya leader/admin yang boleh mengedit tiket")
		case errors.Is(err, service.ErrCannotEditClosedTicketDetails):
			respondError(w, http.StatusConflict, err.Error())
		default:
			respondError(w, http.StatusInternalServerError, "gagal mengedit tiket")
		}
		return
	}

	respondJSON(w, http.StatusOK, ticket)
}
