package main

import (
	"context"
	"log"
	"net/http"
	"time"

	"ticketing-it/backend/internal/config"
	"ticketing-it/backend/internal/database"
	"ticketing-it/backend/internal/router"
	"ticketing-it/backend/internal/ws"
)

func main() {
	cfg := config.Load()

	ctx := context.Background()
	pool, err := database.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("gagal konek database: %v", err)
	}
	defer pool.Close()

	simrsPool, err := database.NewPool(ctx, cfg.SIMRSDatabaseURL)
	if err != nil {
		log.Fatalf("gagal konek database SIMRS: %v", err)
	}
	defer simrsPool.Close()

	// Hub dibuat sekali di sini (bukan di dalam router.New) supaya instance-nya
	// tetap sama selama aplikasi berjalan — semua notifikasi real-time lewat
	// hub yang sama ini.
	hub := ws.NewHub()

	r, ticketService := router.New(pool, simrsPool, cfg.JWTSecret, hub)

	// Background job pengingat SLA — jalan di goroutine TERPISAH dari
	// server HTTP, dicek tiap 2 menit. Interval sengaja pendek untuk
	// keperluan development/demo; untuk production biasanya cukup tiap
	// 5-15 menit supaya tidak membebani database terus-menerus.
	go runSLAReminderScheduler(ctx, ticketService)

	log.Printf("server berjalan di http://localhost:%s", cfg.AppPort)
	if err := http.ListenAndServe(":"+cfg.AppPort, r); err != nil {
		log.Fatalf("server berhenti: %v", err)
	}
}

func runSLAReminderScheduler(ctx context.Context, ticketService interface {
	CheckSLAReminders(ctx context.Context) error
}) {
	ticker := time.NewTicker(2 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		if err := ticketService.CheckSLAReminders(ctx); err != nil {
			log.Printf("sla-reminder: gagal cek reminder: %v", err)
		}
	}
}
