package handler

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"

	appmiddleware "ticketing-it/backend/internal/middleware"
	"ticketing-it/backend/internal/model"
	"ticketing-it/backend/internal/repository"
	"ticketing-it/backend/internal/service"
)

type CommentHandler struct {
	commentRepo  *repository.CommentRepository
	ticketRepo   *repository.TicketRepository
	userRepo     *repository.UserRepository
	notifService *service.NotificationService
}

func NewCommentHandler(
	commentRepo *repository.CommentRepository,
	ticketRepo *repository.TicketRepository,
	userRepo *repository.UserRepository,
	notifService *service.NotificationService,
) *CommentHandler {
	return &CommentHandler{
		commentRepo:  commentRepo,
		ticketRepo:   ticketRepo,
		userRepo:     userRepo,
		notifService: notifService,
	}
}

// ensureTicketAccess memuat tiket dan memastikan user boleh mengaksesnya.
// Mengembalikan false (dan sudah menulis response) kalau tidak boleh. 404
// dipakai (bukan 403) agar keberadaan tiket orang lain tidak terungkap.
func (h *CommentHandler) ensureTicketAccess(w http.ResponseWriter, r *http.Request, ticketID string) bool {
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

// notifyParticipants memberi tahu pihak lain di tiket (pelapor, penerima
// tiket, penanggung jawab, yang mengerjakan) bahwa ada komentar baru.
// Lewat Notify, pesan ikut didorong via WebSocket — itu yang membuat
// halaman detail tiket di browser mereka bisa memuat ulang komentar
// otomatis tanpa refresh. Sifatnya best-effort: gagal tidak membatalkan
// komentar yang sudah tersimpan.
func (h *CommentHandler) notifyParticipants(r *http.Request, ticketID, authorID string) {
	if h.notifService == nil || h.ticketRepo == nil {
		return
	}

	ticket, err := h.ticketRepo.FindByID(r.Context(), ticketID)
	if err != nil || ticket == nil {
		log.Printf("comment notify: gagal membaca tiket %s: %v", ticketID, err)
		return
	}

	authorName := "Seseorang"
	if h.userRepo != nil {
		if u, err := h.userRepo.FindByID(r.Context(), authorID); err == nil && u != nil {
			authorName = u.Name
		}
	}

	candidates := []string{ticket.CreatedBy}
	for _, p := range []*string{ticket.CreatedFor, ticket.AssignedTo, ticket.ClaimedBy} {
		if p != nil {
			candidates = append(candidates, *p)
		}
	}

	seen := map[string]bool{authorID: true} // penulis sendiri tidak perlu diberi tahu
	for _, id := range candidates {
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		tid := ticketID
		h.notifService.Notify(r.Context(), id, &tid, "ticket_comment",
			"Komentar Baru",
			authorName+" menulis komentar di tiket \""+ticket.Title+"\".")
	}
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
	if !h.ensureTicketAccess(w, r, ticketID) {
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

	h.notifyParticipants(r, ticketID, userID)

	respondJSON(w, http.StatusCreated, comment)
}

func (h *CommentHandler) ListByTicket(w http.ResponseWriter, r *http.Request) {
	ticketID := chi.URLParam(r, "id")
	if !h.ensureTicketAccess(w, r, ticketID) {
		return
	}

	comments, err := h.commentRepo.ListByTicket(r.Context(), ticketID)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "gagal mengambil riwayat komentar")
		return
	}
	respondJSON(w, http.StatusOK, comments)
}
