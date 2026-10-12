package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	appmiddleware "ticketing-it/backend/internal/middleware"
	"ticketing-it/backend/internal/model"
	"ticketing-it/backend/internal/repository"
)

type RatingHandler struct {
	ratingRepo *repository.RatingRepository
	ticketRepo *repository.TicketRepository
}

func NewRatingHandler(ratingRepo *repository.RatingRepository, ticketRepo *repository.TicketRepository) *RatingHandler {
	return &RatingHandler{ratingRepo: ratingRepo, ticketRepo: ticketRepo}
}

type createRatingRequest struct {
	Score   int    `json:"score"`
	Comment string `json:"comment,omitempty"`
}

func (h *RatingHandler) Create(w http.ResponseWriter, r *http.Request) {
	ticketID := chi.URLParam(r, "id")
	userID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)

	var req createRatingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body request tidak valid")
		return
	}
	if req.Score < 1 || req.Score > 5 {
		respondError(w, http.StatusBadRequest, "score wajib antara 1-5")
		return
	}

	ticket, err := h.ticketRepo.FindByID(r.Context(), ticketID)
	if err != nil {
		if errors.Is(err, repository.ErrTicketNotFound) {
			respondError(w, http.StatusNotFound, "tiket tidak ditemukan")
			return
		}
		respondError(w, http.StatusInternalServerError, "gagal mengambil tiket")
		return
	}

	// Hanya pelapor asli (created_by) yang boleh menilai, dan hanya
	// setelah tiket benar-benar closed — supaya penilaian mencerminkan
	// hasil akhir, bukan progres yang masih berjalan.
	if ticket.CreatedBy != userID {
		respondError(w, http.StatusForbidden, "hanya pembuat tiket yang boleh memberi nilai")
		return
	}
	if ticket.Status != model.StatusClosed {
		respondError(w, http.StatusConflict, "tiket baru bisa dinilai setelah berstatus 'closed'")
		return
	}

	rating := &model.Rating{
		TicketID: ticketID,
		Score:    req.Score,
		Comment:  req.Comment,
	}
	if err := h.ratingRepo.Create(r.Context(), rating); err != nil {
		if errors.Is(err, repository.ErrRatingAlreadyExists) {
			respondError(w, http.StatusConflict, err.Error())
			return
		}
		respondError(w, http.StatusInternalServerError, "gagal menyimpan rating")
		return
	}

	respondJSON(w, http.StatusCreated, rating)
}

func (h *RatingHandler) GetByTicket(w http.ResponseWriter, r *http.Request) {
	ticketID := chi.URLParam(r, "id")

	rating, err := h.ratingRepo.FindByTicket(r.Context(), ticketID)
	if err != nil {
		if errors.Is(err, repository.ErrRatingNotFound) {
			respondError(w, http.StatusNotFound, err.Error())
			return
		}
		respondError(w, http.StatusInternalServerError, "gagal mengambil rating")
		return
	}

	respondJSON(w, http.StatusOK, rating)
}
