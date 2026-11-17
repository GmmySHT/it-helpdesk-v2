package model

import "time"

// UserRole merepresentasikan peran pengguna sesuai ENUM user_role di database.
type UserRole string

const (
	RoleUser    UserRole = "user"
	RoleStaffIT UserRole = "staff_it"
	RoleLeader  UserRole = "leader"
	RoleAdmin   UserRole = "admin"
)

// User merepresentasikan baris pada tabel users.
// PasswordHash sengaja tidak diberi tag json agar tidak pernah
// ikut ter-serialize dan bocor ke response API.
type User struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Email        string    `json:"email"`
	Username     *string   `json:"username,omitempty"`
	PasswordHash string    `json:"-"`
	Role         UserRole  `json:"role"`
	Department   *string   `json:"department,omitempty"`
	// IsActive menentukan boleh tidaknya user login. Dipakai fitur
	// "Nonaktifkan User" — beda dengan DeletedAt (soft delete), user
	// nonaktif masih tampil di daftar dan bisa diaktifkan kembali kapan saja.
	IsActive bool `json:"is_active"`
	// PasswordChangedAt adalah waktu password terakhir diubah. Dipakai
	// middleware untuk menolak token yang diterbitkan SEBELUM perubahan itu,
	// sehingga reset password oleh admin langsung memutus sesi lama.
	PasswordChangedAt *time.Time `json:"-"`
	// MustChangePassword true kalau password direset orang lain (admin/leader);
	// pemilik akun wajib menggantinya sendiri sebelum memakai aplikasi.
	MustChangePassword bool `json:"must_change_password"`
	// DeletedAt sengaja TIDAK diberi tag json (mengikuti pola PasswordHash)
	// karena ini detail internal soft-delete, bukan sesuatu yang perlu
	// dikonsumsi frontend — user yang sudah dihapus tidak lagi dikembalikan
	// oleh query manapun di repository.
	DeletedAt *time.Time `json:"-"`
	CreatedAt time.Time  `json:"created_at"`
}
