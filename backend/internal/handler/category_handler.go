package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	appmiddleware "ticketing-it/backend/internal/middleware"
	"ticketing-it/backend/internal/model"
	"ticketing-it/backend/internal/repository"
)

type CategoryHandler struct {
	categoryRepo *repository.CategoryRepository
}

func NewCategoryHandler(categoryRepo *repository.CategoryRepository) *CategoryHandler {
	return &CategoryHandler{categoryRepo: categoryRepo}
}

// UpdateApprovalGate hanya untuk admin/leader. Mengubah default gate
// kategori; tiket individual masih bisa dioverride dari halaman tiket.
func (h *CategoryHandler) UpdateApprovalGate(w http.ResponseWriter, r *http.Request) {
	role, _ := r.Context().Value(appmiddleware.ContextRole).(model.UserRole)
	if role != model.RoleAdmin && role != model.RoleLeader {
		respondError(w, http.StatusForbidden, "tidak diizinkan mengubah pengaturan kategori")
		return
	}
	var input struct {
		Required bool `json:"required"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		respondError(w, http.StatusBadRequest, "body tidak valid")
		return
	}
	cat, err := h.categoryRepo.UpdateApprovalGate(r.Context(), chi.URLParam(r, "id"), input.Required)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			respondError(w, http.StatusNotFound, "kategori tidak ditemukan")
			return
		}
		respondInternal(w, err, "gagal menyimpan pengaturan kategori")
		return
	}
	respondJSON(w, http.StatusOK, cat)
}

func (h *CategoryHandler) List(w http.ResponseWriter, r *http.Request) {
	categories, err := h.categoryRepo.List(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "gagal mengambil daftar kategori")
		return
	}
	respondJSON(w, http.StatusOK, categories)
}
