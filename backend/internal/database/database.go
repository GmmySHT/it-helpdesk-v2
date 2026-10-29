package database

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

// NewPool membuat koneksi pool ke PostgreSQL menggunakan pgx.
// Pool dipakai (bukan koneksi tunggal) supaya aplikasi bisa menangani
// banyak request bersamaan tanpa membuat koneksi baru tiap kali.
func NewPool(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, fmt.Errorf("gagal membuat koneksi pool: %w", err)
	}

	// Pastikan koneksi benar-benar hidup saat startup, bukan baru ketahuan
	// error saat request pertama masuk.
	if err := pool.Ping(ctx); err != nil {
		pool.Close() // jangan biarkan pool menggantung kalau koneksi awal gagal
		return nil, fmt.Errorf("gagal ping database: %w", err)
	}

	return pool, nil
}
