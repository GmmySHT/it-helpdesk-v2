package service

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"ticketing-it/backend/internal/model"
)

// Claims adalah data yang disimpan di dalam JWT.
// UserID dan Role dipakai middleware untuk otorisasi tanpa perlu query DB tiap request.
//
// PwdAt = waktu password terakhir diubah saat token diterbitkan (unix detik).
// Middleware membandingkannya dengan users.password_changed_at: token yang
// diterbitkan SEBELUM password diubah otomatis ditolak, sehingga reset
// password oleh admin benar-benar memutus sesi lama (JWT stateless tidak
// bisa dicabut dengan cara lain).
type Claims struct {
	UserID string         `json:"user_id"`
	Role   model.UserRole `json:"role"`
	PwdAt  int64          `json:"pwd_at,omitempty"`
	jwt.RegisteredClaims
}

// AuthService menangani logika autentikasi: hashing password, generate & validasi JWT.
type AuthService struct {
	jwtSecret []byte
	tokenTTL  time.Duration
}

func NewAuthService(jwtSecret string) *AuthService {
	return &AuthService{
		jwtSecret: []byte(jwtSecret),
		tokenTTL:  24 * time.Hour, // token berlaku 24 jam, cukup untuk satu hari kerja
	}
}

// GenerateToken menerbitkan JWT. passwordChangedAt ikut ditanam sebagai
// claim pwd_at supaya token bisa dicabut saat password diubah (lihat Claims).
func (s *AuthService) GenerateToken(userID string, role model.UserRole, passwordChangedAt *time.Time) (string, error) {
	var pwdAt int64
	if passwordChangedAt != nil {
		pwdAt = passwordChangedAt.Unix()
	}
	claims := Claims{
		UserID: userID,
		Role:   role,
		PwdAt:  pwdAt,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(s.tokenTTL)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(s.jwtSecret)
}

func (s *AuthService) ParseToken(tokenString string) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (interface{}, error) {
		return s.jwtSecret, nil
	}, jwt.WithValidMethods([]string{"HS256"}))
	if err != nil {
		return nil, err
	}
	// Token tanpa masa berlaku tidak pernah dibuat aplikasi ini — tolak.
	if !token.Valid || claims.UserID == "" || claims.ExpiresAt == nil {
		return nil, errors.New("token tidak valid")
	}
	return claims, nil
}
