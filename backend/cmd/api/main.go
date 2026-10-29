package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"ticketing-it/backend/internal/config"
	"ticketing-it/backend/internal/database"
	"ticketing-it/backend/internal/router"
	"ticketing-it/backend/internal/ws"
)

func main() {
	cfg := config.Load()

	// Di production, konfigurasi berbahaya (mis. JWT_SECRET masih default)
	// membuat aplikasi menolak start. Di development hanya peringatan.
	if err := cfg.Validate(); err != nil {
		log.Fatalf("konfigurasi tidak aman untuk production: %v", err)
	}

	// ctx batal saat proses menerima Ctrl+C / SIGTERM (mis. service di-stop),
	// memicu shutdown yang rapi di bawah.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := database.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("gagal konek database: %v", err)
	}
	defer pool.Close()

	// Database SIMRS bersifat OPSIONAL: hanya dipakai modul Monitoring.
	// Kosong atau tidak terjangkau -> aplikasi tetap jalan (tiket, aset, dll.
	// normal) dan halaman Monitoring menampilkan pemberitahuan. Timeout
	// 5 detik supaya startup tidak menggantung menunggu timeout TCP bawaan.
	simrsPool := (*pgxpool.Pool)(nil)
	if cfg.SIMRSDatabaseURL == "" {
		log.Printf("SIMRS_DATABASE_URL kosong, modul Monitoring dinonaktifkan")
	} else {
		simrsCtx, cancelSIMRS := context.WithTimeout(ctx, 5*time.Second)
		p, err := database.NewPool(simrsCtx, cfg.SIMRSDatabaseURL)
		cancelSIMRS()
		if err != nil {
			log.Printf("PERINGATAN: database SIMRS tidak terjangkau, modul Monitoring dinonaktifkan: %v", err)
		} else {
			simrsPool = p
			defer simrsPool.Close()
		}
	}

	// Hub dibuat sekali di sini (bukan di dalam router.New) supaya instance-nya
	// tetap sama selama aplikasi berjalan — semua notifikasi real-time lewat
	// hub yang sama ini.
	hub := ws.NewHub()

	r, ticketService := router.New(pool, simrsPool, hub, router.Options{
		JWTSecret:               cfg.JWTSecret,
		AllowedOrigins:          cfg.AllowedOrigins,
		AllowPublicRegistration: cfg.AllowPublicRegistration,
	})

	// Background job pengingat SLA — jalan di goroutine TERPISAH dari server
	// HTTP dan berhenti rapi saat ctx dibatalkan.
	go runSLAReminderScheduler(ctx, time.Duration(cfg.SLACheckMinutes)*time.Minute, ticketService)

	// Server dengan timeout: tanpa ini, koneksi yang sengaja dibuat lambat
	// (slowloris) bisa menghabiskan semua koneksi server. Koneksi WebSocket
	// tidak terpengaruh karena setelah upgrade deadline-nya dibersihkan.
	srv := &http.Server{
		Addr:              cfg.AppHost + ":" + cfg.AppPort,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       60 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}

	errCh := make(chan error, 1)
	go func() { errCh <- srv.ListenAndServe() }()
	log.Printf("server berjalan di %s:%s (APP_ENV=%s)", cfg.AppHost, cfg.AppPort, cfg.AppEnv)

	select {
	case err := <-errCh:
		if !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server berhenti: %v", err)
		}
	case <-ctx.Done():
		log.Printf("sinyal berhenti diterima, mematikan server...")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if err := srv.Shutdown(shutdownCtx); err != nil {
			log.Printf("shutdown tidak tuntas: %v", err)
		}
	}
}

func runSLAReminderScheduler(ctx context.Context, interval time.Duration, ticketService interface {
	CheckSLAReminders(ctx context.Context) error
}) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := ticketService.CheckSLAReminders(ctx); err != nil {
				log.Printf("sla-reminder: gagal cek reminder: %v", err)
			}
		}
	}
}
