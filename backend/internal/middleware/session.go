package middleware

import (
	"context"
	"errors"
	"sync"
	"time"

	"ticketing-it/backend/internal/model"
	"ticketing-it/backend/internal/repository"
)

// SessionStatus adalah hasil pemeriksaan akun di balik sebuah token.
type SessionStatus int

const (
	SessionOK      SessionStatus = iota // akun ada, aktif, belum dihapus
	SessionInvalid                      // akun dinonaktifkan / dihapus / tidak ada
	SessionError                        // gagal memeriksa (mis. database sibuk)
)

// SessionChecker memastikan akun pemilik token MASIH aktif dan memakai role
// TERBARU dari database — bukan role yang tertanam di token (JWT berlaku
// berjam-jam, sehingga user yang sudah dinonaktifkan atau diturunkan rolenya
// tetap lolos kalau hanya mengandalkan isi token).
//
// Pemeriksaan yang sama juga menolak token yang diterbitkan SEBELUM password
// terakhir diubah (claims pwd_at < users.password_changed_at). Itulah cara
// reset password oleh admin memutus sesi lama tanpa tabel sesi.
//
// Hasilnya di-cache singkat (ttl) supaya tidak ada query ke database di
// setiap request; perubahan status/role berlaku paling lambat setelah ttl.
type SessionChecker struct {
	repo  *repository.UserRepository
	ttl   time.Duration
	mu    sync.Mutex
	cache map[string]sessionEntry
}

type sessionEntry struct {
	role       model.UserRole
	ok         bool
	pwdChanged int64 // unix detik password_changed_at (0 kalau belum pernah diubah)
	expires    time.Time
}

func NewSessionChecker(repo *repository.UserRepository, ttl time.Duration) *SessionChecker {
	return &SessionChecker{repo: repo, ttl: ttl, cache: make(map[string]sessionEntry)}
}

// Check memvalidasi akun di balik token. pwdAt diambil dari claims token
// (0 untuk token lama yang diterbitkan sebelum fitur ini ada) — token lama
// tetap diterima selama password akun memang belum pernah diubah.
func (c *SessionChecker) Check(ctx context.Context, userID string, pwdAt int64) (model.UserRole, SessionStatus) {
	now := time.Now()

	c.mu.Lock()
	if e, ok := c.cache[userID]; ok && now.Before(e.expires) {
		c.mu.Unlock()
		switch {
		case !e.ok:
			return "", SessionInvalid
		case pwdAt < e.pwdChanged:
			// Password diubah setelah token ini diterbitkan.
			return "", SessionInvalid
		}
		return e.role, SessionOK
	}
	c.mu.Unlock()

	u, err := c.repo.FindByID(ctx, userID)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			c.store(userID, sessionEntry{ok: false, expires: now.Add(c.ttl)})
			return "", SessionInvalid
		}
		return "", SessionError
	}

	var pwdChanged int64
	if u.PasswordChangedAt != nil {
		pwdChanged = u.PasswordChangedAt.Unix()
	}

	ok := u.IsActive && u.DeletedAt == nil
	c.store(userID, sessionEntry{role: u.Role, ok: ok, pwdChanged: pwdChanged, expires: now.Add(c.ttl)})
	if !ok {
		return "", SessionInvalid
	}
	// Token yang terbit sebelum password terakhir diubah sudah tidak sah.
	if pwdAt < pwdChanged {
		return "", SessionInvalid
	}
	return u.Role, SessionOK
}

// Forget membuang cache satu user — dipanggil setelah password diubah atau
// akun disetel ulang, supaya aturan baru langsung berlaku tanpa menunggu ttl.
func (c *SessionChecker) Forget(userID string) {
	c.mu.Lock()
	delete(c.cache, userID)
	c.mu.Unlock()
}

func (c *SessionChecker) store(userID string, e sessionEntry) {
	c.mu.Lock()
	if len(c.cache) > 10000 { // batasi ukuran cache
		c.cache = make(map[string]sessionEntry)
	}
	c.cache[userID] = e
	c.mu.Unlock()
}
