package middleware

import (
	"sync"
	"time"
)

// LoginLimiter membatasi percobaan login yang gagal (anti brute-force).
// Disimpan di memori proses: cukup untuk satu server; kalau nanti dijalankan
// di beberapa server sekaligus, pindahkan ke Redis/database.
//
// Cara kerja per key: setelah `max` kegagalan dalam jendela `window`, key
// dikunci selama `lockout`. Login yang berhasil mereset hitungannya.
type LoginLimiter struct {
	mu      sync.Mutex
	max     int
	window  time.Duration
	lockout time.Duration
	entries map[string]*loginAttempt
}

type loginAttempt struct {
	count       int
	first       time.Time
	lockedUntil time.Time
}

func NewLoginLimiter(max int, window, lockout time.Duration) *LoginLimiter {
	return &LoginLimiter{
		max:     max,
		window:  window,
		lockout: lockout,
		entries: make(map[string]*loginAttempt),
	}
}

// Check mengembalikan (true, 0) kalau key boleh mencoba login, atau
// (false, sisaWaktu) kalau sedang terkunci.
func (l *LoginLimiter) Check(key string) (bool, time.Duration) {
	l.mu.Lock()
	defer l.mu.Unlock()

	e, ok := l.entries[key]
	if !ok {
		return true, 0
	}
	if now := time.Now(); now.Before(e.lockedUntil) {
		return false, e.lockedUntil.Sub(now)
	}
	return true, 0
}

// Fail mencatat satu kegagalan login untuk key. Mengembalikan locked=true
// kalau kegagalan INI yang memicu penguncian, dan remaining = sisa percobaan
// sebelum terkunci (0 saat baru terkunci).
func (l *LoginLimiter) Fail(key string) (locked bool, remaining int) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()
	l.purgeLocked(now)

	e, ok := l.entries[key]
	if !ok || now.Sub(e.first) > l.window {
		e = &loginAttempt{first: now}
		l.entries[key] = e
	}
	e.count++
	if e.count >= l.max {
		e.lockedUntil = now.Add(l.lockout)
		e.count = 0
		e.first = now
		return true, 0
	}
	return false, l.max - e.count
}

// Max dan Lockout memberi tahu pengaturan limiter (untuk pesan ke pengguna).
func (l *LoginLimiter) Max() int               { return l.max }
func (l *LoginLimiter) Lockout() time.Duration { return l.lockout }

// Reset menghapus catatan key (dipanggil saat login berhasil).
func (l *LoginLimiter) Reset(key string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.entries, key)
}

// purgeLocked membuang entri kedaluwarsa supaya map tidak membesar tanpa batas.
// Hanya dijalankan saat map sudah besar.
func (l *LoginLimiter) purgeLocked(now time.Time) {
	if len(l.entries) < 5000 {
		return
	}
	for k, e := range l.entries {
		if now.After(e.lockedUntil) && now.Sub(e.first) > l.window {
			delete(l.entries, k)
		}
	}
}
