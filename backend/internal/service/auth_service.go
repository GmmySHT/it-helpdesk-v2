package service

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"ticketing-it/backend/internal/model"
)

// Claims adalah data yang disimpan di dalam JWT.
// UserID dan Role dipakai middleware untuk otorisasi tanpa perlu query DB tiap request.
type Claims struct {
	UserID string         `json:"user_id"`
	Role   model.UserRole `json:"role"`
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

func (s *AuthService) GenerateToken(userID string, role model.UserRole) (string, error) {
	claims := Claims{
		UserID: userID,
		Role:   role,
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
