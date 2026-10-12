package model

import "time"

type Module struct {
	ID          string `json:"id"`
	Code        string `json:"code"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	IsActive    bool   `json:"is_active"`
}

type AccessLevel string

const (
	AccessNone   AccessLevel = "none"
	AccessView   AccessLevel = "view"
	AccessEditor AccessLevel = "editor"
)

// RoleModulePermission adalah izin DEFAULT untuk satu role di satu modul.
// Ini yang berlaku kalau user tidak punya override pribadi (lihat UserModulePermission).
type RoleModulePermission struct {
	ID          string      `json:"id"`
	Role        UserRole    `json:"role"`
	ModuleID    string      `json:"module_id"`
	ModuleCode  string      `json:"module_code,omitempty"`
	ModuleName  string      `json:"module_name,omitempty"`
	AccessLevel AccessLevel `json:"access_level"`
	UpdatedBy   *string     `json:"updated_by,omitempty"`
	UpdatedAt   time.Time   `json:"updated_at"`
}

// EffectivePermission adalah hasil akhir perhitungan izin (setelah override
// per-user digabung dengan default per-role) untuk satu modul — inilah yang
// dipakai frontend untuk memutuskan menu mana yang ditampilkan.
type EffectivePermission struct {
	ModuleCode  string      `json:"module_code"`
	ModuleName  string      `json:"module_name"`
	IsActive    bool        `json:"is_active"`
	AccessLevel AccessLevel `json:"access_level"`
}

// UserModulePermission adalah override KHUSUS untuk satu user di satu modul —
// menimpa default dari RoleModulePermission kalau ada.
type UserModulePermission struct {
	ID          string      `json:"id"`
	UserID      string      `json:"user_id"`
	UserName    string      `json:"user_name,omitempty"`
	ModuleID    string      `json:"module_id"`
	ModuleCode  string      `json:"module_code,omitempty"`
	ModuleName  string      `json:"module_name,omitempty"`
	AccessLevel AccessLevel `json:"access_level"`
	GrantedBy   string      `json:"granted_by"`
	GrantedAt   time.Time   `json:"granted_at"`
	Note        string      `json:"note,omitempty"`
}
