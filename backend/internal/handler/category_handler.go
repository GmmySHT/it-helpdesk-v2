package handler

import (
	"net/http"

	"ticketing-it/backend/internal/repository"
)

type CategoryHandler struct {
	categoryRepo *repository.CategoryRepository
}

func NewCategoryHandler(categoryRepo *repository.CategoryRepository) *CategoryHandler {
	return &CategoryHandler{categoryRepo: categoryRepo}
}

func (h *CategoryHandler) List(w http.ResponseWriter, r *http.Request) {
	categories, err := h.categoryRepo.List(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "gagal mengambil daftar kategori")
		return
	}
	respondJSON(w, http.StatusOK, categories)
}
