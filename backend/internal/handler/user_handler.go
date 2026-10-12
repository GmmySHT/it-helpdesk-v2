package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	appmiddleware "ticketing-it/backend/internal/middleware"
	"ticketing-it/backend/internal/model"
	"ticketing-it/backend/internal/repository"
	"ticketing-it/backend/internal/service"
)

type UserHandler struct {
	userRepo    *repository.UserRepository
	userService *service.UserService
}

func NewUserHandler(userRepo *repository.UserRepository, userService *service.UserService) *UserHandler {
	return &UserHandler{userRepo: userRepo, userService: userService}
}

// ListStaff mengembalikan semua user dengan role 'staff_it'.
// Dipakai frontend untuk mengisi dropdown "pilih staf" saat leader
// melakukan assign langsung atau reassign paksa.
func (h *UserHandler) ListStaff(w http.ResponseWriter, r *http.Request) {
	staff, err := h.userRepo.ListByRole(r.Context(), model.RoleStaffIT)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "gagal mengambil daftar staf")
		return
	}
	respondJSON(w, http.StatusOK, staff)
}

// ListAll mengembalikan SEMUA user — dipakai halaman Manajemen User
// (leader/admin only, dijaga middleware di router).
func (h *UserHandler) ListAll(w http.ResponseWriter, r *http.Request) {
	users, err := h.userService.ListAll(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "gagal mengambil daftar user")
		return
	}
	respondJSON(w, http.StatusOK, users)
}

type createUserRequest struct {
	Name       string  `json:"name"`
	Email      string  `json:"email"`
	Username   *string `json:"username,omitempty"`
	Password   string  `json:"password"`
	Role       string  `json:"role"`
	Department *string `json:"department,omitempty"`
}

// Create dipakai leader/admin membuat user baru dengan role spesifik.
func (h *UserHandler) Create(w http.ResponseWriter, r *http.Request) {
	role, _ := r.Context().Value(appmiddleware.ContextRole).(model.UserRole)

	var req createUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body request tidak valid")
		return
	}
	if req.Name == "" || req.Email == "" || req.Password == "" || req.Role == "" {
		respondError(w, http.StatusBadRequest, "name, email, password, dan role wajib diisi")
		return
	}
	if len(req.Password) < 8 {
		respondError(w, http.StatusBadRequest, "password minimal 8 karakter")
		return
	}

	user, err := h.userService.CreateByAdmin(r.Context(), service.CreateUserInput{
		Name:          req.Name,
		Email:         req.Email,
		Username:      req.Username,
		Password:      req.Password,
		Role:          model.UserRole(req.Role),
		Department:    req.Department,
		RequesterRole: role,
	})
	if err != nil {
		switch {
		case errors.Is(err, service.ErrInsufficientRoleToAssign):
			respondError(w, http.StatusForbidden, err.Error())
		case errors.Is(err, service.ErrInvalidRole):
			respondError(w, http.StatusBadRequest, err.Error())
		case errors.Is(err, repository.ErrEmailAlreadyExists):
			respondError(w, http.StatusConflict, "email sudah terdaftar")
		case errors.Is(err, repository.ErrUsernameAlreadyExists):
			respondError(w, http.StatusConflict, "username sudah dipakai")
		default:
			respondError(w, http.StatusInternalServerError, "gagal membuat user")
		}
		return
	}

	respondJSON(w, http.StatusCreated, user)
}

type updateUserRequest struct {
	Name       string  `json:"name"`
	Email      string  `json:"email"`
	Username   *string `json:"username,omitempty"`
	Role       string  `json:"role"`
	Department *string `json:"department,omitempty"`
}

// Update dipakai leader/admin mengedit profil dan role user yang sudah ada.
// Sengaja TIDAK menerima password di sini — reset password bukan bagian
// dari fitur ini.
func (h *UserHandler) Update(w http.ResponseWriter, r *http.Request) {
	targetID := chi.URLParam(r, "id")
	requesterID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)
	requesterRole, _ := r.Context().Value(appmiddleware.ContextRole).(model.UserRole)

	var req updateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body request tidak valid")
		return
	}
	if req.Name == "" || req.Email == "" || req.Role == "" {
		respondError(w, http.StatusBadRequest, "name, email, dan role wajib diisi")
		return
	}

	user, err := h.userService.UpdateByAdmin(r.Context(), service.UpdateUserInput{
		TargetID:      targetID,
		Name:          req.Name,
		Email:         req.Email,
		Username:      req.Username,
		Department:    req.Department,
		Role:          model.UserRole(req.Role),
		RequesterID:   requesterID,
		RequesterRole: requesterRole,
	})
	if err != nil {
		switch {
		case errors.Is(err, repository.ErrUserNotFound):
			respondError(w, http.StatusNotFound, "user tidak ditemukan")
		case errors.Is(err, service.ErrInsufficientRoleToAssign),
			errors.Is(err, service.ErrInsufficientRoleToManage):
			respondError(w, http.StatusForbidden, err.Error())
		case errors.Is(err, service.ErrCannotManageSelf):
			respondError(w, http.StatusBadRequest, err.Error())
		case errors.Is(err, service.ErrInvalidRole):
			respondError(w, http.StatusBadRequest, err.Error())
		case errors.Is(err, repository.ErrEmailAlreadyExists):
			respondError(w, http.StatusConflict, "email sudah terdaftar")
		case errors.Is(err, repository.ErrUsernameAlreadyExists):
			respondError(w, http.StatusConflict, "username sudah dipakai")
		default:
			respondError(w, http.StatusInternalServerError, "gagal memperbarui user")
		}
		return
	}

	respondJSON(w, http.StatusOK, user)
}

type setActiveRequest struct {
	IsActive bool `json:"is_active"`
}

// SetActive mengaktifkan/menonaktifkan akun user (tanpa menghapus datanya).
func (h *UserHandler) SetActive(w http.ResponseWriter, r *http.Request) {
	targetID := chi.URLParam(r, "id")
	requesterID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)
	requesterRole, _ := r.Context().Value(appmiddleware.ContextRole).(model.UserRole)

	var req setActiveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body request tidak valid")
		return
	}

	if err := h.userService.SetActive(r.Context(), targetID, req.IsActive, requesterID, requesterRole); err != nil {
		switch {
		case errors.Is(err, repository.ErrUserNotFound):
			respondError(w, http.StatusNotFound, "user tidak ditemukan")
		case errors.Is(err, service.ErrInsufficientRoleToManage):
			respondError(w, http.StatusForbidden, err.Error())
		case errors.Is(err, service.ErrCannotManageSelf):
			respondError(w, http.StatusBadRequest, err.Error())
		default:
			respondError(w, http.StatusInternalServerError, "gagal mengubah status user")
		}
		return
	}

	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// Delete melakukan SOFT DELETE terhadap akun user — lihat komentar pada
// service.Delete dan migration 000020 untuk alasan kenapa bukan hard delete.
func (h *UserHandler) Delete(w http.ResponseWriter, r *http.Request) {
	targetID := chi.URLParam(r, "id")
	requesterID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)
	requesterRole, _ := r.Context().Value(appmiddleware.ContextRole).(model.UserRole)

	if err := h.userService.Delete(r.Context(), targetID, requesterID, requesterRole); err != nil {
		switch {
		case errors.Is(err, repository.ErrUserNotFound):
			respondError(w, http.StatusNotFound, "user tidak ditemukan")
		case errors.Is(err, service.ErrInsufficientRoleToManage):
			respondError(w, http.StatusForbidden, err.Error())
		case errors.Is(err, service.ErrCannotManageSelf):
			respondError(w, http.StatusBadRequest, err.Error())
		default:
			respondError(w, http.StatusInternalServerError, "gagal menghapus user")
		}
		return
	}

	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
