/*
 * IT Helpdesk & Asset Management System
 * Copyright (c) 2026 Firaz Faruq <firaz.faruq@gmail.com>
 */

package handler

import (
	"errors"
	"net/http"
	"os"
	"path"
	"strings"

	"github.com/go-chi/chi/v5"

	appmiddleware "ticketing-it/backend/internal/middleware"
	"ticketing-it/backend/internal/model"
	"ticketing-it/backend/internal/service"
)

// projectFileHandler menyajikan file proposal/project lewat endpoint yang
// TERAUTORISASI. Beda dengan /uploads/* yang publik: file proposal bisa
// berisi data sensitif, jadi hanya pembuat, PIC, anggota aktif, leader, dan
// admin yang boleh mengambilnya.
type projectFileHandler struct {
	projects *service.ProjectService
	dir      string
}

func NewProjectFileHandler(projects *service.ProjectService, dir string) http.Handler {
	return &projectFileHandler{projects: projects, dir: dir}
}

func (h *projectFileHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)
	role, _ := r.Context().Value(appmiddleware.ContextRole).(model.UserRole)

	projectID := chi.URLParam(r, "pid")
	// Query proposal_id opsional: daftar riwayat versi need membuka versi lama.
	proposalID := r.URL.Query().Get("proposal_id")
	var file *model.ProjectProposal
	var err error
	if proposalID != "" {
		file, err = h.projects.GetProposalFile(r.Context(), proposalID)
		if err == nil && file != nil && file.TicketID != projectID {
			respondError(w, http.StatusForbidden, "proposal bukan milik project ini")
			return
		}
	} else {
		file, err = h.projects.GetLatestProposalFileByProject(r.Context(), projectID)
	}
	if err != nil {
		if errors.Is(err, service.ErrProjectFileNotFound) {
			respondError(w, http.StatusNotFound, err.Error())
		} else {
			respondError(w, http.StatusInternalServerError, "gagal membaca data proposal")
		}
		return
	}
	allowed, err := h.projects.CanViewProjectFile(r.Context(), file.TicketID, userID, role)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "gagal memeriksa akses")
		return
	}
	if !allowed {
		respondError(w, http.StatusForbidden, " Anda tidak memiliki akses pada proposal project ini")
		return
	}

	// file_url dari DB selalu "/uploads/<uuid>.<ext>" hasil saveValidatedDoc.
	// Kita ambil basename saja agar tidak ada path traversal dari data lama.
	name := path.Base(strings.TrimPrefix(file.FileURL, "/uploads/"))
	if name == "." || name == "/" || strings.Contains(name, "\\") || strings.Contains(name, "..") {
		respondError(w, http.StatusBadRequest, "nama file tidak valid")
		return
	}
	ext := strings.ToLower(path.Ext(name))
	if ext != ".pdf" && ext != ".jpg" && ext != ".jpeg" && ext != ".png" && ext != ".webp" {
		respondError(w, http.StatusBadRequest, "tipe file tidak didukung")
		return
	}
	full := path.Join(h.dir, name)
	data, err := os.ReadFile(full)
	if err != nil {
		respondError(w, http.StatusNotFound, "file proposal tidak ditemukan di penyimpanan")
		return
	}

	hdr := w.Header()
	hdr.Set("X-Content-Type-Options", "nosniff")
	hdr.Set("Cache-Control", "private, no-store")
	if ext == ".pdf" {
		hdr.Set("Content-Type", "application/pdf")
		hdr.Set("Content-Disposition", "inline")
	} else {
		mime := map[string]string{
			".jpg": "image/jpeg", ".jpeg": "image/jpeg",
			".png": "image/png", ".webp": "image/webp",
		}[ext]
		hdr.Set("Content-Type", mime)
		hdr.Set("Content-Disposition", "inline")
	}
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}
