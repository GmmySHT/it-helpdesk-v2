package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	appmiddleware "ticketing-it/backend/internal/middleware"
	"ticketing-it/backend/internal/model"
	"ticketing-it/backend/internal/repository"
	"ticketing-it/backend/internal/ws"
)

type RBACHandler struct {
	moduleRepo     *repository.ModuleRepository
	permissionRepo *repository.PermissionRepository
	// hub dipakai untuk memberi tahu client yang sedang online bahwa izin
	// berubah, supaya menu di frontend langsung diperbarui tanpa refresh.
	hub *ws.Hub
}

func NewRBACHandler(
	moduleRepo *repository.ModuleRepository,
	permissionRepo *repository.PermissionRepository,
	hub *ws.Hub,
) *RBACHandler {
	return &RBACHandler{moduleRepo: moduleRepo, permissionRepo: permissionRepo, hub: hub}
}

func (h *RBACHandler) ListModules(w http.ResponseWriter, r *http.Request) {
	modules, err := h.moduleRepo.List(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "gagal mengambil daftar modul")
		return
	}
	respondJSON(w, http.StatusOK, modules)
}

// MyPermissions mengembalikan izin efektif user yang SEDANG LOGIN untuk
// semua modul — endpoint ini SENGAJA tidak dibatasi admin saja (beda dari
// handler lain di file ini), karena setiap user butuh tahu modul mana
// yang boleh dia buka untuk menampilkan menu yang sesuai.
func (h *RBACHandler) MyPermissions(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)
	role, _ := r.Context().Value(appmiddleware.ContextRole).(model.UserRole)

	list, err := h.permissionRepo.GetEffectiveAll(r.Context(), userID, role)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "gagal mengambil izin akses")
		return
	}
	respondJSON(w, http.StatusOK, list)
}

type setModuleActiveRequest struct {
	IsActive bool `json:"is_active"`
}

func (h *RBACHandler) SetModuleActive(w http.ResponseWriter, r *http.Request) {
	moduleID := chi.URLParam(r, "id")

	var req setModuleActiveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body request tidak valid")
		return
	}

	if err := h.moduleRepo.SetActive(r.Context(), moduleID, req.IsActive); err != nil {
		respondError(w, http.StatusInternalServerError, "gagal mengubah status modul")
		return
	}

	// Mengaktifkan/menonaktifkan modul memengaruhi semua user.
	h.hub.NotifyPermissionsChanged()

	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *RBACHandler) ListRoleDefaults(w http.ResponseWriter, r *http.Request) {
	list, err := h.permissionRepo.ListRoleDefaults(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "gagal mengambil izin default")
		return
	}
	respondJSON(w, http.StatusOK, list)
}

type upsertRoleDefaultRequest struct {
	Role        model.UserRole    `json:"role"`
	ModuleID    string            `json:"module_id"`
	AccessLevel model.AccessLevel `json:"access_level"`
}

func (h *RBACHandler) UpsertRoleDefault(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)

	var req upsertRoleDefaultRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body request tidak valid")
		return
	}

	if err := h.permissionRepo.UpsertRoleDefault(r.Context(), req.Role, req.ModuleID, req.AccessLevel, userID); err != nil {
		respondError(w, http.StatusInternalServerError, "gagal menyimpan izin")
		return
	}

	// Izin default berlaku untuk semua user dengan role tersebut, jadi
	// dikirim ke semua client online; masing-masing fetch ulang izinnya
	// sendiri (yang bukan role itu hanya mendapat hasil yang sama).
	h.hub.NotifyPermissionsChanged()

	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *RBACHandler) ListUserOverrides(w http.ResponseWriter, r *http.Request) {
	list, err := h.permissionRepo.ListUserOverrides(r.Context())
	if err != nil {
		respondError(w, http.StatusInternalServerError, "gagal mengambil daftar override")
		return
	}
	respondJSON(w, http.StatusOK, list)
}

type upsertUserOverrideRequest struct {
	UserID      string            `json:"user_id"`
	ModuleID    string            `json:"module_id"`
	AccessLevel model.AccessLevel `json:"access_level"`
	Note        string            `json:"note,omitempty"`
}

func (h *RBACHandler) UpsertUserOverride(w http.ResponseWriter, r *http.Request) {
	adminID, _ := r.Context().Value(appmiddleware.ContextUserID).(string)

	var req upsertUserOverrideRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "body request tidak valid")
		return
	}
	if req.UserID == "" || req.ModuleID == "" {
		respondError(w, http.StatusBadRequest, "user_id dan module_id wajib diisi")
		return
	}

	if err := h.permissionRepo.UpsertUserOverride(r.Context(), req.UserID, req.ModuleID, req.AccessLevel, adminID, req.Note); err != nil {
		respondError(w, http.StatusInternalServerError, "gagal menyimpan override")
		return
	}

	// Override per-user: cukup beri tahu user yang bersangkutan.
	h.hub.NotifyUserPermissionsChanged(req.UserID)

	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *RBACHandler) DeleteUserOverride(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.permissionRepo.DeleteUserOverride(r.Context(), id); err != nil {
		respondError(w, http.StatusInternalServerError, "gagal menghapus override")
		return
	}

	// Yang diterima di sini adalah id override, bukan id user, sehingga
	// user yang terdampak tidak diketahui tanpa query tambahan. Broadcast
	// aman karena payload-nya tidak berisi data apa pun.
	h.hub.NotifyPermissionsChanged()

	respondJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
