package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"ticketing-it/backend/internal/repository"
	"ticketing-it/backend/internal/service"
)

type AuthHandler struct {
	userService *service.UserService
}

func NewAuthHandler(userService *service.UserService) *AuthHandler {
	return &AuthHandler{userService: userService}
}

type registerRequest struct {
	Name       string  `json:"name"`
	Email      string  `json:"email"`
	Username   *string `json:"username,omitempty"`
	Password   string  `json:"password"`
	Department *string `json:"department,omitempty"`
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body request tidak valid")
		return
	}

	if req.Name == "" || req.Email == "" || req.Password == "" {
		respondError(w, http.StatusBadRequest, "name, email, dan password wajib diisi")
		return
	}
	if len(req.Password) < 8 {
		respondError(w, http.StatusBadRequest, "password minimal 8 karakter")
		return
	}

	user, err := h.userService.Register(r.Context(), service.RegisterInput{
		Name:       req.Name,
		Email:      req.Email,
		Username:   req.Username,
		Password:   req.Password,
		Department: req.Department,
	})
	if err != nil {
		if errors.Is(err, repository.ErrEmailAlreadyExists) {
			respondError(w, http.StatusConflict, "email sudah terdaftar")
			return
		}
		if errors.Is(err, repository.ErrUsernameAlreadyExists) {
			respondError(w, http.StatusConflict, "username sudah dipakai")
			return
		}
		respondError(w, http.StatusInternalServerError, "gagal mendaftarkan user")
		return
	}

	respondJSON(w, http.StatusCreated, user)
}

// loginRequest.Identifier menerima EMAIL ATAU USERNAME — nama field
// sengaja diubah dari "email" jadi "identifier" supaya jelas kalau field
// ini fleksibel, bukan cuma email.
type loginRequest struct {
	Identifier string `json:"identifier"`
	Password   string `json:"password"`
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body request tidak valid")
		return
	}

	token, user, err := h.userService.Login(r.Context(), req.Identifier, req.Password)
	if err != nil {
		if errors.Is(err, service.ErrInvalidCredentials) {
			respondError(w, http.StatusUnauthorized, "email/username atau password salah")
			return
		}
		if errors.Is(err, service.ErrAccountDeactivated) {
			respondError(w, http.StatusForbidden, err.Error())
			return
		}
		respondError(w, http.StatusInternalServerError, "gagal login")
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"token": token,
		"user":  user,
	})
}

func respondJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(payload)
}

func respondError(w http.ResponseWriter, status int, message string) {
	respondJSON(w, status, map[string]string{"error": message})
}
