package handler

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	appmiddleware "ticketing-it/backend/internal/middleware"
	"ticketing-it/backend/internal/model"
	"ticketing-it/backend/internal/repository"
)

// SignoffHandler menangani bukti serah-terima (BAST) yang sudah ditandatangani
// pelapor: scan/foto dokumen diunggah ke tiket sebagai bukti tertulis bahwa
// pelapor menyatakan pekerjaan sudah sesuai.
type SignoffHandler struct {
	signoffRepo *repository.TicketSignoffRepository
	ticketRepo  *repository.TicketRepository
}

func NewSignoffHandler(
	signoffRepo *repository.TicketSignoffRepository,
	ticketRepo *repository.TicketRepository,
) *SignoffHandler {
	return &SignoffHandler{signoffRepo: signoffRepo, ticketRepo: ticketRepo}
}

// allowedDocTypes — dokumen serah-terima boleh berupa scan gambar ATAU PDF.
// Tipe tetap ditentukan dari ISI file (magic bytes), bukan dari nama file.
// (definisi ada di upload_security.go bersama saveValidatedDoc)

// ensureAccess memuat tiket dan memastikan user boleh melihatnya. Semua role
// yang punya akses ke tiket boleh MENGUNGGAH scan (staf yang memegang kertas,
// pelapor sendiri, atau leader); yang dibatasi hanya penghapusan.
func (h *SignoffHandler) ensureAccess(w http.ResponseWriter, r *http.Request, ticketID string) bool {
	userID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)
	role, _ := r.Context().Value(appmiddleware.ContextRole).(model.UserRole)

	ticket, err := h.ticketRepo.FindByID(r.Context(), ticketID)
	if err != nil {
		if errors.Is(err, repository.ErrTicketNotFound) {
			respondError(w, http.StatusNotFound, "tiket tidak ditemukan")
			return false
		}
		respondInternal(w, err, "gagal memeriksa tiket")
		return false
	}
	if !canAccessTicket(role, userID, ticket) {
		respondError(w, http.StatusNotFound, "tiket tidak ditemukan")
		return false
	}
	return true
}

// Create — POST /tickets/{id}/signoffs (multipart/form-data)
// Field: file (wajib), signed_by_name (wajib), signed_at (YYYY-MM-DD, opsional),
// note (opsional).
func (h *SignoffHandler) Create(w http.ResponseWriter, r *http.Request) {
	ticketID := chi.URLParam(r, "id")
	userID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)

	if !h.ensureAccess(w, r, ticketID) {
		return
	}

	if err := r.ParseMultipartForm(20 << 20); err != nil {
		respondError(w, http.StatusBadRequest, "gagal membaca form upload, pastikan pakai multipart/form-data")
		return
	}

	signedByName := strings.TrimSpace(r.FormValue("signed_by_name"))
	if signedByName == "" {
		respondError(w, http.StatusBadRequest, "nama penanda tangan wajib diisi")
		return
	}

	var signedAt *time.Time
	if raw := strings.TrimSpace(r.FormValue("signed_at")); raw != "" {
		parsed, err := time.Parse("2006-01-02", raw)
		if err != nil {
			respondError(w, http.StatusBadRequest, "format tanggal tanda tangan harus YYYY-MM-DD")
			return
		}
		signedAt = &parsed
	}

	file, fileHeader, err := r.FormFile("file")
	if err != nil {
		respondError(w, http.StatusBadRequest, "field 'file' wajib diisi (scan dokumen yang sudah ditandatangani)")
		return
	}
	defer file.Close()

	url, fileType, err := saveValidatedDoc(file)
	if err != nil {
		if errors.Is(err, ErrInvalidDoc) || errors.Is(err, ErrDocTooLarge) {
			respondError(w, http.StatusBadRequest, err.Error())
			return
		}
		respondInternal(w, err, "gagal menyimpan dokumen")
		return
	}

	signoff := &model.TicketSignoff{
		TicketID:     ticketID,
		FileURL:      url,
		FileName:     fileHeader.Filename,
		FileType:     fileType,
		FileSize:     fileHeader.Size,
		SignedByName: signedByName,
		SignedAt:     signedAt,
		UploadedBy:   userID,
	}
	if note := strings.TrimSpace(r.FormValue("note")); note != "" {
		signoff.Note = &note
	}

	if err := h.signoffRepo.Create(r.Context(), signoff); err != nil {
		respondInternal(w, err, "gagal menyimpan bukti serah-terima")
		return
	}

	saved, err := h.signoffRepo.LatestByTicket(r.Context(), ticketID)
	if err != nil {
		respondJSON(w, http.StatusCreated, signoff)
		return
	}
	respondJSON(w, http.StatusCreated, saved)
}

// List — GET /tickets/{id}/signoffs
func (h *SignoffHandler) List(w http.ResponseWriter, r *http.Request) {
	ticketID := chi.URLParam(r, "id")
	if !h.ensureAccess(w, r, ticketID) {
		return
	}

	list, err := h.signoffRepo.ListByTicket(r.Context(), ticketID)
	if err != nil {
		respondInternal(w, err, "gagal mengambil bukti serah-terima")
		return
	}
	respondJSON(w, http.StatusOK, list)
}

// Delete — DELETE /tickets/{id}/signoffs/{signoffId} — hanya leader/admin.
// Dokumen adalah bukti resmi, jadi pelapor/staf tidak boleh menghapusnya
// sendiri.
func (h *SignoffHandler) Delete(w http.ResponseWriter, r *http.Request) {
	role, _ := r.Context().Value(appmiddleware.ContextRole).(model.UserRole)
	if role != model.RoleLeader && role != model.RoleAdmin {
		respondError(w, http.StatusForbidden, "hanya leader/admin yang boleh menghapus bukti serah-terima")
		return
	}
	ticketID := chi.URLParam(r, "id")
	if !h.ensureAccess(w, r, ticketID) {
		return
	}

	id := chi.URLParam(r, "signoffId")
	if err := h.signoffRepo.Delete(r.Context(), id); err != nil {
		if errors.Is(err, repository.ErrSignoffNotFound) {
			respondError(w, http.StatusNotFound, "dokumen tidak ditemukan")
			return
		}
		respondInternal(w, err, "gagal menghapus dokumen")
		return
	}
	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
