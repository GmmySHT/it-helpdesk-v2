package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	appmiddleware "ticketing-it/backend/internal/middleware"
	"ticketing-it/backend/internal/model"
	"ticketing-it/backend/internal/repository"
)

type CommentHandler struct {
	commentRepo *repository.CommentRepository
}

func NewCommentHandler(commentRepo *repository.CommentRepository) *CommentHandler {
	return &CommentHandler{commentRepo: commentRepo}
}

type createCommentRequest struct {
	Message     string `json:"message"`
	CommentType string `json:"comment_type,omitempty"`
}

func (h *CommentHandler) Create(w http.ResponseWriter, r *http.Request) {
	ticketID := chi.URLParam(r, "id")
	userID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)

	var req createCommentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body request tidak valid")
		return
	}

	if req.Message == "" {
		respondError(w, http.StatusBadRequest, "message wajib diisi")
		return
	}

	commentType := model.CommentTypeGeneralComment
	if req.CommentType != "" {
		commentType = model.CommentType(req.CommentType)
	}

	comment := &model.TicketComment{
		TicketID:    ticketID,
		UserID:      userID,
		CommentType: commentType,
		Message:     req.Message,
	}

	if err := h.commentRepo.Create(r.Context(), comment); err != nil {
		respondError(w, http.StatusInternalServerError, "gagal menyimpan komentar")
		return
	}

	respondJSON(w, http.StatusCreated, comment)
}

func (h *CommentHandler) ListByTicket(w http.ResponseWriter, r *http.Request) {
	ticketID := chi.URLParam(r, "id")

	comments, err := h.commentRepo.ListByTicket(r.Context(), ticketID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "gagal mengambil riwayat komentar")
		return
	}
	respondJSON(w, http.StatusOK, comments)
}
