package service

import (
	"context"
	"errors"

	"golang.org/x/crypto/bcrypt"

	"ticketing-it/backend/internal/model"
	"ticketing-it/backend/internal/repository"
)

var ErrInvalidCredentials = errors.New("email/username atau password salah")
var ErrAccountDeactivated = errors.New("akun ini telah dinonaktifkan, hubungi admin")
var ErrInsufficientRoleToAssign = errors.New("hanya admin yang boleh membuat akun dengan role leader/admin")
var ErrInvalidRole = errors.New("role tidak valid")

// ErrInsufficientRoleToManage dipakai Update/SetActive/Delete: leader
// cuma boleh mengelola akun dengan role user/staff_it — akun leader/admin
// HANYA boleh dikelola (diedit, dinonaktifkan, dihapus) oleh admin. Aturan
// ini konsisten dengan ErrInsufficientRoleToAssign di CreateByAdmin, supaya
// leader tidak bisa memutar-balik hierarki lewat endpoint lain.
var ErrInsufficientRoleToManage = errors.New("kamu tidak punya hak untuk mengelola akun dengan role ini")

// ErrCannotManageSelf mencegah leader/admin menonaktifkan atau menghapus
// akunnya sendiri lewat halaman ini — supaya tidak ada yang tidak sengaja
// mengunci dirinya sendiri keluar dari sistem.
var ErrCannotManageSelf = errors.New("tidak bisa menonaktifkan atau menghapus akun sendiri")

// UserService berisi logika bisnis seputar user: registrasi dan login.
// Validasi dan aturan (misal: role default, hashing) ditaruh di sini,
// bukan di handler maupun repository.
type UserService struct {
	userRepo *repository.UserRepository
	auth     *AuthService
}

func NewUserService(userRepo *repository.UserRepository, auth *AuthService) *UserService {
	return &UserService{userRepo: userRepo, auth: auth}
}

type RegisterInput struct {
	Name       string
	Email      string
	Username   *string // opsional — kalau diisi, bisa dipakai buat login juga
	Password   string
	Department *string
}

func (s *UserService) Register(ctx context.Context, input RegisterInput) (*model.User, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	user := &model.User{
		Name:         input.Name,
		Email:        input.Email,
		Username:     input.Username,
		PasswordHash: string(hash),
		// Role default 'user' — perubahan ke staff_it/leader/admin dilakukan
		// oleh admin secara terpisah, tidak lewat endpoint registrasi publik.
		Role:       model.RoleUser,
		Department: input.Department,
	}

	if err := s.userRepo.Create(ctx, user); err != nil {
		return nil, err
	}
	return user, nil
}

type CreateUserInput struct {
	Name          string
	Email         string
	Username      *string
	Password      string
	Role          model.UserRole
	Department    *string
	RequesterRole model.UserRole // role yang SEDANG login, buat validasi hak
}

// CreateByAdmin dipakai leader/admin membuat akun BARU dengan role
// SPESIFIK — beda dari Register (endpoint publik) yang selalu memaksa
// role 'user'. Aturannya: leader cuma boleh bikin staf_it/user, HANYA
// admin yang boleh bikin akun leader/admin baru — supaya leader tidak
// bisa menaikkan diri sendiri/orang lain setara dengannya tanpa
// persetujuan admin.
func (s *UserService) CreateByAdmin(ctx context.Context, input CreateUserInput) (*model.User, error) {
	switch input.Role {
	case model.RoleUser, model.RoleStaffIT, model.RoleLeader, model.RoleAdmin:
		// valid
	default:
		return nil, ErrInvalidRole
	}

	if (input.Role == model.RoleLeader || input.Role == model.RoleAdmin) && input.RequesterRole != model.RoleAdmin {
		return nil, ErrInsufficientRoleToAssign
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	user := &model.User{
		Name:         input.Name,
		Email:        input.Email,
		Username:     input.Username,
		PasswordHash: string(hash),
		Role:         input.Role,
		Department:   input.Department,
	}

	if err := s.userRepo.Create(ctx, user); err != nil {
		return nil, err
	}
	return user, nil
}

func (s *UserService) ListAll(ctx context.Context) ([]model.User, error) {
	return s.userRepo.ListAll(ctx)
}

// canAssignRole mengecek apakah requester boleh memberikan roleToAssign
// ke SIAPA PUN (dipakai saat create maupun saat update mengganti role) —
// aturan intinya cuma admin yang boleh menetapkan role leader/admin.
func canAssignRole(requesterRole, roleToAssign model.UserRole) bool {
	if roleToAssign == model.RoleLeader || roleToAssign == model.RoleAdmin {
		return requesterRole == model.RoleAdmin
	}
	return true
}

// canManageTarget mengecek apakah requester boleh MENGELOLA (edit, nonaktifkan,
// hapus) akun yang SUDAH ADA dengan role currentTargetRole — leader tidak
// boleh mengutak-atik akun leader/admin lain, cuma admin yang boleh.
func canManageTarget(requesterRole, currentTargetRole model.UserRole) bool {
	if currentTargetRole == model.RoleLeader || currentTargetRole == model.RoleAdmin {
		return requesterRole == model.RoleAdmin
	}
	return true
}

type UpdateUserInput struct {
	TargetID      string
	Name          string
	Email         string
	Username      *string
	Department    *string
	Role          model.UserRole
	RequesterID   string
	RequesterRole model.UserRole
}

// UpdateByAdmin mengubah profil dan role user yang sudah ada. Memakai
// aturan hierarki yang SAMA dengan CreateByAdmin: leader hanya boleh
// mengedit (dan menetapkan role untuk) akun user/staff_it; role
// leader/admin hanya bisa disentuh oleh admin.
func (s *UserService) UpdateByAdmin(ctx context.Context, input UpdateUserInput) (*model.User, error) {
	switch input.Role {
	case model.RoleUser, model.RoleStaffIT, model.RoleLeader, model.RoleAdmin:
		// valid
	default:
		return nil, ErrInvalidRole
	}

	target, err := s.userRepo.FindByID(ctx, input.TargetID)
	if err != nil {
		return nil, err
	}
	if target.DeletedAt != nil {
		return nil, repository.ErrUserNotFound
	}

	// Cek berdasarkan role target YANG SEKARANG (sebelum diubah) supaya
	// leader tidak bisa "menurunkan" role akun admin dulu baru mengeditnya
	// bebas — validasinya harus terhadap kondisi saat ini.
	if !canManageTarget(input.RequesterRole, target.Role) {
		return nil, ErrInsufficientRoleToManage
	}
	// Role BARU yang ingin di-set juga wajib divalidasi (mencegah leader
	// menaikkan user biasa langsung jadi admin, misalnya).
	if !canAssignRole(input.RequesterRole, input.Role) {
		return nil, ErrInsufficientRoleToAssign
	}

	// Leader/admin tidak boleh mengganti ROLE dirinya sendiri lewat sini —
	// mencegah kejadian tidak sengaja menurunkan hak akses sendiri sampai
	// tidak bisa mengelola user lagi. Perubahan nama/email/dst pada diri
	// sendiri tetap diperbolehkan.
	if input.TargetID == input.RequesterID && input.Role != target.Role {
		return nil, ErrCannotManageSelf
	}

	updated, err := s.userRepo.Update(ctx, input.TargetID, repository.UpdateFields{
		Name:       input.Name,
		Email:      input.Email,
		Username:   input.Username,
		Department: input.Department,
		Role:       input.Role,
	})
	if err != nil {
		return nil, err
	}
	return updated, nil
}

// SetActive mengaktifkan/menonaktifkan akun user.
func (s *UserService) SetActive(ctx context.Context, targetID string, isActive bool, requesterID string, requesterRole model.UserRole) error {
	if targetID == requesterID {
		return ErrCannotManageSelf
	}

	target, err := s.userRepo.FindByID(ctx, targetID)
	if err != nil {
		return err
	}
	if target.DeletedAt != nil {
		return repository.ErrUserNotFound
	}
	if !canManageTarget(requesterRole, target.Role) {
		return ErrInsufficientRoleToManage
	}

	return s.userRepo.SetActive(ctx, targetID, isActive)
}

// Delete melakukan SOFT DELETE terhadap akun user (lihat komentar di
// repository.SoftDelete dan migration 000020 untuk alasannya).
func (s *UserService) Delete(ctx context.Context, targetID, requesterID string, requesterRole model.UserRole) error {
	if targetID == requesterID {
		return ErrCannotManageSelf
	}

	target, err := s.userRepo.FindByID(ctx, targetID)
	if err != nil {
		return err
	}
	if target.DeletedAt != nil {
		return repository.ErrUserNotFound
	}
	if !canManageTarget(requesterRole, target.Role) {
		return ErrInsufficientRoleToManage
	}

	return s.userRepo.SoftDelete(ctx, targetID)
}

// Login menerima "identifier" yang bisa berupa EMAIL ATAU USERNAME —
// pencariannya sudah digabung jadi satu lewat FindByIdentifier di
// repository, jadi di sini tidak perlu tahu mana yang sedang dipakai user.
func (s *UserService) Login(ctx context.Context, identifier, password string) (string, *model.User, error) {
	user, err := s.userRepo.FindByIdentifier(ctx, identifier)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			return "", nil, ErrInvalidCredentials
		}
		return "", nil, err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return "", nil, ErrInvalidCredentials
	}

	// Dicek SETELAH password cocok (bukan sebelumnya) supaya orang yang
	// menebak-nebak identifier/password tidak bisa membedakan "password
	// salah" dari "akun nonaktif" hanya lewat pesan error yang berbeda.
	if !user.IsActive {
		return "", nil, ErrAccountDeactivated
	}

	token, err := s.auth.GenerateToken(user.ID, user.Role)
	if err != nil {
		return "", nil, err
	}

	return token, user, nil
}
