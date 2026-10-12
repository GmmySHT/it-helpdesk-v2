package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	appmiddleware "ticketing-it/backend/internal/middleware"
	"ticketing-it/backend/internal/service"
)

type NotificationHandler struct {
	notifService *service.NotificationService
}

func NewNotificationHandler(notifService *service.NotificationService) *NotificationHandler {
	return &NotificationHandler{notifService: notifService}
}

func (h *NotificationHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)

	list, err := h.notifService.ListForUser(r.Context(), userID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "gagal mengambil notifikasi")
		return
	}
	respondJSON(w, http.StatusOK, list)
}

func (h *NotificationHandler) MarkRead(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)

	if err := h.notifService.MarkRead(r.Context(), id, userID); err != nil {
		respondError(w, http.StatusInternalServerError, "gagal menandai notifikasi")
		return
	}
	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
