package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"ticketing-it/backend/internal/model"
)

var ErrUserNotFound = errors.New("user tidak ditemukan")
var ErrEmailAlreadyExists = errors.New("email sudah terdaftar")
var ErrUsernameAlreadyExists = errors.New("username sudah dipakai")

// UserRepository menangani seluruh akses data ke tabel users.
// Dipisah dari service supaya query SQL tidak bercampur dengan logika bisnis
// (validasi, hashing password, dsb).
type UserRepository struct {
	db *pgxpool.Pool
}

func NewUserRepository(db *pgxpool.Pool) *UserRepository {
	return &UserRepository{db: db}
}

func (r *UserRepository) Create(ctx context.Context, u *model.User) error {
	query := `
		INSERT INTO users (name, email, username, password_hash, role, department)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, created_at
	`
	err := r.db.QueryRow(ctx, query, u.Name, u.Email, u.Username, u.PasswordHash, u.Role, u.Department).
		Scan(&u.ID, &u.CreatedAt)
	if err != nil {
		// Kode 23505 adalah unique_violation di PostgreSQL. Constraint name
		// dicek supaya bisa membedakan email yang bentrok vs username yang
		// bentrok, dan kasih pesan error yang sesuai ke masing-masing.
		if pgErrCode(err) == "23505" {
			if pgConstraintName(err) == "users_username_key" {
				return ErrUsernameAlreadyExists
			}
			return ErrEmailAlreadyExists
		}
		return err
	}
	return nil
}

func (r *UserRepository) FindByEmail(ctx context.Context, email string) (*model.User, error) {
	query := `
		SELECT id, name, email, username, password_hash, role, department, is_active, created_at
		FROM users
		WHERE email = $1 AND deleted_at IS NULL
	`
	var u model.User
	err := r.db.QueryRow(ctx, query, email).Scan(
		&u.ID, &u.Name, &u.Email, &u.Username, &u.PasswordHash, &u.Role, &u.Department, &u.IsActive, &u.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return &u, nil
}

// FindByIdentifier mencari user berdasarkan EMAIL ATAU USERNAME — inilah
// yang dipakai endpoint login sekarang, supaya user bebas masuk pakai
// salah satu dari keduanya tanpa perlu form terpisah.
func (r *UserRepository) FindByIdentifier(ctx context.Context, identifier string) (*model.User, error) {
	query := `
		SELECT id, name, email, username, password_hash, role, department, is_active, created_at
		FROM users
		WHERE (email = $1 OR username = $1) AND deleted_at IS NULL
	`
	var u model.User
	err := r.db.QueryRow(ctx, query, identifier).Scan(
		&u.ID, &u.Name, &u.Email, &u.Username, &u.PasswordHash, &u.Role, &u.Department, &u.IsActive, &u.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return &u, nil
}

// ListAll mengambil SEMUA user tanpa filter role — dipakai halaman
// Manajemen User untuk leader/admin, supaya bisa lihat seluruh akun
// yang ada di sistem, bukan cuma staf.
func (r *UserRepository) ListAll(ctx context.Context) ([]model.User, error) {
	// deleted_at IS NULL: user yang sudah "dihapus" (soft delete) tidak lagi
	// muncul di daftar Manajemen User sama sekali.
	query := `
		SELECT id, name, email, username, role, department, is_active, created_at
		FROM users
		WHERE deleted_at IS NULL
		ORDER BY name
	`
	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []model.User
	for rows.Next() {
		var u model.User
		if err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.Username, &u.Role, &u.Department, &u.IsActive, &u.CreatedAt); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

// FindByID mengambil satu user apa adanya, TERMASUK yang sudah di-soft-delete
// atau dinonaktifkan (tidak difilter deleted_at/is_active) — dipakai internal
// (misalnya actorName untuk notifikasi, atau service Update/SetActive/Delete
// yang justru butuh tahu status user SEBELUM diubah).
func (r *UserRepository) FindByID(ctx context.Context, id string) (*model.User, error) {
	query := `
		SELECT id, name, email, username, password_hash, role, department, is_active, deleted_at, created_at
		FROM users
		WHERE id = $1
	`
	var u model.User
	err := r.db.QueryRow(ctx, query, id).Scan(
		&u.ID, &u.Name, &u.Email, &u.Username, &u.PasswordHash, &u.Role, &u.Department, &u.IsActive, &u.DeletedAt, &u.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}
	return &u, nil
}

// ListByRole dipakai untuk mengisi dropdown "pilih staf" di frontend
// (misalnya saat leader melakukan reassign paksa atau assign langsung).
func (r *UserRepository) ListByRole(ctx context.Context, role model.UserRole) ([]model.User, error) {
	query := `
		SELECT id, name, email, role, department, created_at
		FROM users
		WHERE role = $1
		ORDER BY name
	`
	rows, err := r.db.Query(ctx, query, role)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []model.User
	for rows.Next() {
		var u model.User
		if err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.Role, &u.Department, &u.CreatedAt); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

// ListByRoles mengambil semua user dengan salah satu dari beberapa role
// sekaligus — dipakai misalnya untuk mencari semua "leader ATAU admin"
// yang perlu dikirimi notifikasi saat ada tiket resolved.
func (r *UserRepository) ListByRoles(ctx context.Context, roles ...model.UserRole) ([]model.User, error) {
	// pgx kesulitan meng-encode slice dari tipe custom (model.UserRole)
	// langsung ke array PostgreSQL — jadi dikonversi dulu ke []string biasa,
	// dan dibandingkan sebagai teks (role::text) di query supaya tidak perlu
	// pgx tahu persis OID enum user_role di database.
	roleStrings := make([]string, len(roles))
	for i, role := range roles {
		roleStrings[i] = string(role)
	}

	query := `
		SELECT id, name, email, role, department, created_at
		FROM users
		WHERE role::text = ANY($1)
		ORDER BY name
	`
	rows, err := r.db.Query(ctx, query, roleStrings)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []model.User
	for rows.Next() {
		var u model.User
		if err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.Role, &u.Department, &u.CreatedAt); err != nil {
			return nil, err
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

// UpdateFields menampung field yang boleh diubah lewat endpoint edit user.
// Role dipisah jadi pointer supaya bisa dibedakan antara "tidak diubah"
// (nil) vs validasi role yang dilakukan di layer service.
type UpdateFields struct {
	Name       string
	Email      string
	Username   *string
	Department *string
	Role       model.UserRole
}

// Update mengubah data profil + role user yang SUDAH ADA. Password
// SENGAJA tidak ditangani di sini — reset password baiknya jadi alur
// terpisah (belum diminta), supaya form edit biasa tidak tergoda mengubah
// password tanpa konfirmasi eksplisit.
func (r *UserRepository) Update(ctx context.Context, id string, f UpdateFields) (*model.User, error) {
	query := `
		UPDATE users
		SET name = $1, email = $2, username = $3, department = $4, role = $5
		WHERE id = $6 AND deleted_at IS NULL
		RETURNING id, name, email, username, role, department, is_active, created_at
	`
	var u model.User
	err := r.db.QueryRow(ctx, query, f.Name, f.Email, f.Username, f.Department, f.Role, id).Scan(
		&u.ID, &u.Name, &u.Email, &u.Username, &u.Role, &u.Department, &u.IsActive, &u.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		if pgErrCode(err) == "23505" {
			if pgConstraintName(err) == "users_username_key" {
				return nil, ErrUsernameAlreadyExists
			}
			return nil, ErrEmailAlreadyExists
		}
		return nil, err
	}
	return &u, nil
}

// SetActive mengaktifkan/menonaktifkan user (tanpa menghapus datanya).
// User nonaktif otomatis ditolak saat login lewat pengecekan is_active
// di UserService.Login.
func (r *UserRepository) SetActive(ctx context.Context, id string, isActive bool) error {
	query := `UPDATE users SET is_active = $1 WHERE id = $2 AND deleted_at IS NULL`
	tag, err := r.db.Exec(ctx, query, isActive, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrUserNotFound
	}
	return nil
}

// SoftDelete menandai user sebagai terhapus (deleted_at diisi) tanpa
// menghapus barisnya secara fisik dari tabel — lihat komentar pada
// migration 000020 untuk alasannya (FK dari tabel tickets).
func (r *UserRepository) SoftDelete(ctx context.Context, id string) error {
	query := `UPDATE users SET deleted_at = now(), is_active = false WHERE id = $1 AND deleted_at IS NULL`
	tag, err := r.db.Exec(ctx, query, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrUserNotFound
	}
	return nil
}

// pgErrCode mengekstrak kode error PostgreSQL (misalnya 23505 untuk unique_violation)
// dari error generik yang dikembalikan pgx.
func pgErrCode(err error) string {
	type pgError interface{ SQLState() string }
	var pgErr pgError
	if errors.As(err, &pgErr) {
		return pgErr.SQLState()
	}
	return ""
}

// pgConstraintName mengekstrak nama constraint yang dilanggar (misalnya
// "users_username_key") — dipakai untuk membedakan APA yang bentrok saat
// terjadi unique_violation (email vs username), supaya pesan error ke user
// tepat sasaran.
func pgConstraintName(err error) string {
	type pgError interface{ ConstraintName() string }
	var pgErr pgError
	if errors.As(err, &pgErr) {
		return pgErr.ConstraintName()
	}
	return ""
}
