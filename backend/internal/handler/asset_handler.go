package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"time"
	"ticketing-it/backend/internal/middleware"
	"ticketing-it/backend/internal/model"
	"ticketing-it/backend/internal/repository"
	"ticketing-it/backend/internal/service"

	"github.com/go-chi/chi/v5"
)

type AssetHandler struct {
	assetService    *service.AssetService
	borrowingService *service.AssetBorrowingService
	disposalService  *service.AssetDisposalService
}

func NewAssetHandler(assetService *service.AssetService, borrowingService *service.AssetBorrowingService, disposalService *service.AssetDisposalService) *AssetHandler {
	return &AssetHandler{
		assetService:    assetService,
		borrowingService: borrowingService,
		disposalService:  disposalService,
	}
}

// --- Asset CRUD ---

func (h *AssetHandler) CreateAsset(w http.ResponseWriter, r *http.Request) {
	var req struct {
		CategoryID   string `json:"category_id"`
		Code         string `json:"code"`
		Name         string `json:"name"`
		Brand        string `json:"brand"`
		Model        string `json:"model"`
		SerialNumber string `json:"serial_number"`
		Condition    string `json:"condition"`
		Stock        int    `json:"stock"`
		Location     string `json:"location"`
		Notes        string `json:"notes"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body request tidak valid")
		return
	}

	userID := r.Context().Value(middleware.ContextUserID).(string)

	asset := &model.Asset{
		CategoryID:   req.CategoryID,
		Code:         req.Code,
		Name:         req.Name,
		Brand:        req.Brand,
		Model:        req.Model,
		SerialNumber: req.SerialNumber,
		Condition:    model.AssetCondition(req.Condition),
		Stock:        req.Stock,
		Location:     req.Location,
		Notes:        req.Notes,
		CreatedBy:    userID,
	}

	if err := h.assetService.Create(r.Context(), asset); err != nil {
		respondInternal(w, err, "gagal memproses permintaan aset")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(asset)
}

func (h *AssetHandler) GetAsset(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	asset, err := h.assetService.GetByID(r.Context(), id)
	if err != nil {
		respondError(w, http.StatusNotFound, "aset tidak ditemukan")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(asset)
}

func (h *AssetHandler) ListAssets(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	categoryID := q.Get("category_id")
	condition := q.Get("condition")
	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))
	if limit == 0 {
		limit = 20
	}

	assets, total, err := h.assetService.List(r.Context(), categoryID, condition, limit, offset)
	if err != nil {
		respondInternal(w, err, "gagal memproses permintaan aset")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":  assets,
		"total": total,
	})
}

func (h *AssetHandler) UpdateAsset(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req struct {
		CategoryID   string `json:"category_id"`
		Code         string `json:"code"`
		Name         string `json:"name"`
		Brand        string `json:"brand"`
		Model        string `json:"model"`
		SerialNumber string `json:"serial_number"`
		Condition    string `json:"condition"`
		Stock        int    `json:"stock"`
		Location     string `json:"location"`
		Notes        string `json:"notes"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body request tidak valid")
		return
	}

	asset := &model.Asset{
		CategoryID:   req.CategoryID,
		Code:         req.Code,
		Name:         req.Name,
		Brand:        req.Brand,
		Model:        req.Model,
		SerialNumber: req.SerialNumber,
		Condition:    model.AssetCondition(req.Condition),
		Stock:        req.Stock,
		Location:     req.Location,
		Notes:        req.Notes,
	}

	if err := h.assetService.Update(r.Context(), id, asset); err != nil {
		respondAssetError(w, err, "gagal menyimpan perubahan aset")
		return
	}

	asset.ID = id
	respondJSON(w, http.StatusOK, asset)
}

func (h *AssetHandler) DeleteAsset(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.assetService.Delete(r.Context(), id); err != nil {
		respondAssetError(w, err, "gagal menghapus aset")
		return
	}
	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// respondAssetError memetakan error edit/hapus aset ke kode HTTP + pesan
// yang bisa langsung ditampilkan frontend (format {"error": "..."}).
func respondAssetError(w http.ResponseWriter, err error, fallback string) {
	var validationErr *service.AssetValidationError
	switch {
	case errors.As(err, &validationErr):
		respondError(w, http.StatusBadRequest, validationErr.Message)
	case errors.Is(err, repository.ErrAssetNotFound):
		respondError(w, http.StatusNotFound, "aset tidak ditemukan")
	case errors.Is(err, repository.ErrAssetDuplicate):
		respondError(w, http.StatusConflict, "kode aset atau serial number sudah dipakai aset lain")
	case errors.Is(err, repository.ErrAssetInUse):
		respondError(w, http.StatusConflict,
			"aset tidak bisa dihapus karena sudah punya riwayat peminjaman atau pembuangan; ubah kondisinya saja (mis. Tunggu Pembuangan)")
	default:
		respondError(w, http.StatusInternalServerError, fallback)
	}
}

// --- Categories ---

func (h *AssetHandler) ListCategories(w http.ResponseWriter, r *http.Request) {
	categories, err := h.assetService.ListCategories(r.Context())
	if err != nil {
		respondInternal(w, err, "gagal memproses permintaan aset")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(categories)
}

func (h *AssetHandler) CreateCategory(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body request tidak valid")
		return
	}

	// Untuk sementara langsung insert via repository
	// TODO: move to service
	// TODO: implement CreateCategory in AssetService
	// For now return placeholder
	respondError(w, http.StatusNotImplemented, "fitur ini belum tersedia")
	return
}

// --- Borrowings ---

func (h *AssetHandler) BorrowAsset(w http.ResponseWriter, r *http.Request) {
	assetID := chi.URLParam(r, "id")

	var req struct {
		Quantity       int    `json:"quantity"`
		BorrowDate     string `json:"borrow_date"`
		ReturnDeadline string `json:"return_deadline"`
		Purpose        string `json:"purpose"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body request tidak valid")
		return
	}

	if req.Purpose == "" {
		respondError(w, http.StatusBadRequest, "Tujuan peminjaman wajib diisi.")
		return
	}
	if req.Quantity < 1 {
		respondError(w, http.StatusBadRequest, "Jumlah minimal 1 unit.")
		return
	}

	// Validasi stok tersedia vs jumlah yang diminta
	// (cegah user pinjam melebihi available_stock).
	// Pesan memakai respondError ({"error": "..."}) supaya frontend bisa
	// menampilkannya apa adanya — http.Error (teks biasa) tidak terbaca
	// frontend dan berujung "Request gagal dengan status 422".
	available, err := h.assetService.GetAvailableStock(r.Context(), assetID)
	if err != nil {
		if errors.Is(err, repository.ErrAssetNotFound) {
			respondError(w, http.StatusNotFound, "Aset tidak ditemukan.")
			return
		}
		respondError(w, http.StatusInternalServerError, "Gagal mengecek stok aset.")
		return
	}
	if available <= 0 {
		respondError(w, http.StatusUnprocessableEntity,
			"Aset ini sedang dipinjam semua atau masih menunggu persetujuan peminjaman lain, jadi belum bisa dipinjam.")
		return
	}
	if req.Quantity > available {
		respondError(w, http.StatusUnprocessableEntity,
			fmt.Sprintf("Stok tidak cukup: tersedia %d unit, diminta %d unit.", available, req.Quantity))
		return
	}

	userID := r.Context().Value(middleware.ContextUserID).(string)

	borrowDate, errB := parseDate(req.BorrowDate)
	returnDeadline, errD := parseDate(req.ReturnDeadline)
	if errB != nil || errD != nil {
		respondError(w, http.StatusBadRequest, "Format tanggal tidak valid.")
		return
	}

	borrowing := &model.AssetBorrowing{
		AssetID:        assetID,
		BorrowerID:     userID,
		Quantity:       req.Quantity,
		BorrowDate:     borrowDate,
		ReturnDeadline: returnDeadline,
		Purpose:        req.Purpose,
	}

	if err := h.borrowingService.Create(r.Context(), borrowing); err != nil {
		// 422 (Unprocessable Entity) = permintaan valid tapi ditolak
		// karena aturan bisnis (mis. stok tidak cukup / status tidak
		// memungkinkan). Pakai 422 (bukan 500) supaya frontend bisa
		// membedakan "input salah" dari "server error".
		respondInternal(w, err, "gagal mengajukan peminjaman")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(borrowing)
}

func (h *AssetHandler) ListBorrowings(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	status := q.Get("status")
	borrowerID := q.Get("borrower_id")
	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))
	if limit == 0 {
		limit = 20
	}

	borrowings, total, err := h.borrowingService.List(r.Context(), status, borrowerID, limit, offset)
	if err != nil {
		respondInternal(w, err, "gagal memproses permintaan aset")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":  borrowings,
		"total": total,
	})
}

func (h *AssetHandler) ApproveBorrowing(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := r.Context().Value(middleware.ContextUserID).(string)

	if err := h.borrowingService.Approve(r.Context(), id, userID); err != nil {
		respondInternal(w, err, "gagal memproses permintaan aset")
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "approved"})
}

func (h *AssetHandler) RejectBorrowing(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := r.Context().Value(middleware.ContextUserID).(string)

	if err := h.borrowingService.Reject(r.Context(), id, userID); err != nil {
		respondInternal(w, err, "gagal memproses permintaan aset")
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "rejected"})
}

func (h *AssetHandler) ReturnBorrowing(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req struct {
		ReturnCondition string `json:"return_condition"`
		ReturnNotes     string `json:"return_notes"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body request tidak valid")
		return
	}

	if err := h.borrowingService.Return(r.Context(), id, model.ReturnCondition(req.ReturnCondition), req.ReturnNotes); err != nil {
		respondInternal(w, err, "gagal memproses permintaan aset")
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "returned"})
}

// HandoverBorrowing konfirmasi serah-terima barang dari Tim IT ke peminjam.
// Ubah status APPROVED -> BORROWED.
func (h *AssetHandler) HandoverBorrowing(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	if err := h.borrowingService.MarkBorrowed(r.Context(), id); err != nil {
		respondInternal(w, err, "gagal memproses permintaan aset")
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{"status": "borrowed"})
}

func (h *AssetHandler) ListOverdue(w http.ResponseWriter, r *http.Request) {
	borrowings, err := h.borrowingService.ListOverdue(r.Context())
	if err != nil {
		respondInternal(w, err, "gagal memproses permintaan aset")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(borrowings)
}

func (h *AssetHandler) GetBorrowedCount(w http.ResponseWriter, r *http.Request) {
	count, err := h.borrowingService.CountBorrowed(r.Context())
	if err != nil {
		respondInternal(w, err, "gagal memproses permintaan aset")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]int64{"count": count})
}

// --- Disposals ---

func (h *AssetHandler) DisposeAsset(w http.ResponseWriter, r *http.Request) {
	assetID := chi.URLParam(r, "id")

	var req struct {
		Reason            string `json:"reason"`
		DisposalMethod    string `json:"disposal_method"`
		CertificateNumber string `json:"certificate_number"`
		Notes             string `json:"notes"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body request tidak valid")
		return
	}

	userID := r.Context().Value(middleware.ContextUserID).(string)

	disposal := &model.AssetDisposal{
		AssetID:          assetID,
		Reason:           req.Reason,
		DisposalMethod:   model.DisposalMethod(req.DisposalMethod),
		DisposedBy:       userID,
		CertificateNumber: req.CertificateNumber,
		Notes:            req.Notes,
	}

	if err := h.disposalService.Create(r.Context(), disposal); err != nil {
		respondInternal(w, err, "gagal memproses permintaan aset")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(disposal)
}

func (h *AssetHandler) ListDisposals(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))
	if limit == 0 {
		limit = 20
	}

	disposals, total, err := h.disposalService.List(r.Context(), limit, offset)
	if err != nil {
		respondInternal(w, err, "gagal memproses permintaan aset")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"data":  disposals,
		"total": total,
	})
}

// parseDate helper untuk parse ISO 8601 / RFC3339 (mis. "2026-09-25T07:00:00Z")
// sekaligus tetap menerima format tanggal lama "2026-01-15".
func parseDate(s string) (time.Time, error) {
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t, nil
	}
	return time.Parse("2006-01-02", s)
}
