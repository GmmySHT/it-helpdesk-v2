package router

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"

	"ticketing-it/backend/internal/handler"
	appmiddleware "ticketing-it/backend/internal/middleware"
	"ticketing-it/backend/internal/model"
	"ticketing-it/backend/internal/repository"
	"ticketing-it/backend/internal/service"
	"ticketing-it/backend/internal/ws"
)

// Options berisi pengaturan yang berasal dari konfigurasi/environment.
type Options struct {
	JWTSecret string
	// AllowedOrigins = origin frontend yang boleh memanggil API (CORS) dan
	// membuka WebSocket.
	AllowedOrigins []string
	// AllowPublicRegistration membuka POST /auth/register (default mati).
	AllowPublicRegistration bool
}

// New membangun router utama aplikasi beserta seluruh middleware dan route.
// hub diterima dari main.go supaya instance-nya sama dengan yang dipakai
// untuk push notifikasi real-time di seluruh service.
//
// TicketService dikembalikan juga (bukan cuma http.Handler) supaya main.go
// bisa memakainya untuk menjalankan background job (reminder SLA) di luar
// siklus request HTTP biasa.
func New(db *pgxpool.Pool, simrsDB *pgxpool.Pool, hub *ws.Hub, opts Options) (http.Handler, *service.TicketService) {
	r := chi.NewRouter()

	r.Use(chimiddleware.RequestID)
	// RealIP mempercayai header X-Forwarded-For/X-Real-IP. Aman HANYA kalau
	// backend dijalankan di belakang reverse proxy dan port backend tidak
	// bisa diakses langsung dari luar (lihat DEPLOY.md).
	r.Use(chimiddleware.RealIP)
	r.Use(appmiddleware.AccessLog) // pengganti chimiddleware.Logger: tidak mencatat ?token=
	r.Use(chimiddleware.Recoverer)
	r.Use(appmiddleware.SecurityHeaders)
	r.Use(appmiddleware.LimitBody(1<<20, 50<<20)) // JSON maks 1 MB, upload maks 50 MB

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   opts.AllowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	healthHandler := handler.NewHealthHandler(db)
	r.Get("/health", healthHandler.Check)

	userRepo := repository.NewUserRepository(db)
	authService := service.NewAuthService(opts.JWTSecret)
	userService := service.NewUserService(userRepo, authService)

	// SessionChecker: pastikan akun di balik token masih aktif & pakai role
	// terbaru (cache 15 detik). Anti brute-force login: 5 kegagalan per akun
	// atau 30 per IP dalam 15 menit -> dikunci 15 menit.
	sessionChecker := appmiddleware.NewSessionChecker(userRepo, 15*time.Second)
	idLimiter := appmiddleware.NewLoginLimiter(5, 15*time.Minute, 15*time.Minute)
	ipLimiter := appmiddleware.NewLoginLimiter(30, 15*time.Minute, 15*time.Minute)

	notifRepo := repository.NewNotificationRepository(db)
	notifService := service.NewNotificationService(notifRepo, hub)
	notifHandler := handler.NewNotificationHandler(notifService)

	// Saat akun terkunci: catat di log + notifikasi ke pemilik akun dan admin/leader.
	securityAlertService := service.NewSecurityAlertService(userRepo, notifService)
	authHandler := handler.NewAuthHandler(userService, idLimiter, ipLimiter, securityAlertService)

	wsHandler := handler.NewWSHandler(authService, hub, opts.AllowedOrigins, sessionChecker)

	ticketRepo := repository.NewTicketRepository(db)
	slaRuleRepo := repository.NewSLARuleRepository(db)
	commentRepo := repository.NewCommentRepository(db)
	ticketService := service.NewTicketService(db, ticketRepo, slaRuleRepo, commentRepo, userRepo, notifService)
	ticketHandler := handler.NewTicketHandler(ticketService)

	categoryRepo := repository.NewCategoryRepository(db)
	categoryHandler := handler.NewCategoryHandler(categoryRepo)

	userHandler := handler.NewUserHandler(userRepo, userService)

	statsRepo := repository.NewStatsRepository(db)
	statsHandler := handler.NewStatsHandler(statsRepo)

	// Monitoring module
	monitoringRepo := repository.NewMonitoringRepository(db, simrsDB)
	monitoringService := service.NewMonitoringService(monitoringRepo)
	monitoringHandler := handler.NewMonitoringHandler(monitoringService, monitoringRepo)

	dashboardConfigRepo := repository.NewDashboardConfigRepository(db)
	dashboardConfigService := service.NewDashboardConfigService(dashboardConfigRepo)
	dashboardConfigHandler := handler.NewDashboardConfigHandler(dashboardConfigService)

	moduleRepo := repository.NewModuleRepository(db)
	permissionRepo := repository.NewPermissionRepository(db)
	rbacHandler := handler.NewRBACHandler(moduleRepo, permissionRepo, hub)

	ratingRepo := repository.NewRatingRepository(db)
	ratingHandler := handler.NewRatingHandler(ratingRepo, ticketRepo)

	commentHandler := handler.NewCommentHandler(commentRepo, ticketRepo, userRepo, notifService)
	uploadHandler := handler.NewUploadHandler()

	// Asset management repositories & services
	assetRepo := repository.NewAssetRepository(db)
	assetBorrowingRepo := repository.NewAssetBorrowingRepository(db)
	assetDisposalRepo := repository.NewAssetDisposalRepository(db)

	assetService := service.NewAssetService(assetRepo)
	assetBorrowingService := service.NewAssetBorrowingService(assetBorrowingRepo, userRepo, notifService, hub)
	assetDisposalService := service.NewAssetDisposalService(assetDisposalRepo)

	assetHandler := handler.NewAssetHandler(assetService, assetBorrowingService, assetDisposalService)

	// Gambar yang diunggah (bukti resolve & gambar di teks kaya). Hanya file
	// gambar yang dilayani, tanpa daftar folder, dengan header anti-eksekusi
	// — lihat uploads.go.
	r.Handle("/uploads/*", uploadsHandler("./uploads"))

	// Endpoint WebSocket TIDAK dipasang di dalam grup appmiddleware.Auth,
	// karena otentikasinya sendiri dilakukan di dalam WSHandler.ServeWS
	// (lewat query param ?token=..., bukan header Authorization).
	r.Get("/ws", wsHandler.ServeWS)

	r.Route("/api/v1", func(r chi.Router) {
		// Registrasi publik MATI secara default (ALLOW_PUBLIC_REGISTRATION=false):
		// akun dibuat leader/admin lewat Manajemen User. Kalau tidak dipasang,
		// endpoint ini menjawab 404/405.
		if opts.AllowPublicRegistration {
			r.Post("/auth/register", authHandler.Register)
		}
		r.Post("/auth/login", authHandler.Login)

		// Route yang butuh login dipasang di dalam grup ini.
		r.Group(func(r chi.Router) {
			r.Use(appmiddleware.Auth(authService, sessionChecker))

			r.Post("/tickets", ticketHandler.Create)
			r.Get("/tickets", ticketHandler.List)
			r.Get("/tickets/{id}", ticketHandler.GetByID)
			r.Post("/tickets/{id}/claim", ticketHandler.Claim)
			r.Post("/tickets/{id}/resolve", ticketHandler.Resolve)
			r.Post("/tickets/{id}/close", ticketHandler.Close)
			r.Post("/tickets/{id}/reopen", ticketHandler.Reopen)
			r.Post("/tickets/{id}/reassign", ticketHandler.Reassign)
			r.Post("/tickets/{id}/approve", ticketHandler.Approve)
			r.Post("/tickets/{id}/reject", ticketHandler.Reject)
			r.Patch("/tickets/{id}/deadline", ticketHandler.UpdateDeadline)
			r.Patch("/tickets/{id}", ticketHandler.UpdateDetails)

			r.Get("/categories", categoryHandler.List)
			r.Get("/users/staff", userHandler.ListStaff)

			// Manajemen User — HANYA leader/admin. Ini sengaja pakai
			// RequireRole (bukan RequireModuleAccess seperti Laporan/Akses)
			// karena membuat akun baru adalah fungsi inti manajemen identitas,
			// bukan modul fitur yang wajar untuk diberi/dicabut fleksibel
			// lewat RBAC.
			r.Group(func(r chi.Router) {
				r.Use(appmiddleware.RequireRole(model.RoleLeader, model.RoleAdmin))
				r.Get("/admin/users", userHandler.ListAll)
				r.Post("/admin/users", userHandler.Create)
				r.Put("/admin/users/{id}", userHandler.Update)
				r.Patch("/admin/users/{id}/status", userHandler.SetActive)
				r.Delete("/admin/users/{id}", userHandler.Delete)
			})
			// Statistik tim & tiket berisiko: hanya staff IT, leader, admin.
			// Role 'user' (pelapor) tidak punya alasan melihat data tim.
			r.Group(func(r chi.Router) {
				r.Use(appmiddleware.RequireRole(model.RoleStaffIT, model.RoleLeader, model.RoleAdmin))
				r.Get("/tickets/at-risk", ticketHandler.AtRisk)
				r.Get("/stats/summary", statsHandler.Summary)
				r.Get("/stats/staff-performance", statsHandler.StaffPerformance)
				r.Get("/stats/trend", statsHandler.Trend)
			})
			r.Get("/stats/my-performance", statsHandler.MyPerformance)
			r.Get("/stats/my-creator-stats", statsHandler.MyCreatorStats)
			r.Get("/stats/my-status-breakdown", statsHandler.MyStatusBreakdown)
			r.Get("/stats/my-trend", statsHandler.MyTrend)
			r.Get("/stats/my-priority-breakdown", statsHandler.MyPriorityBreakdown)
			r.Group(func(r chi.Router) {
				r.Use(appmiddleware.RequireModuleAccess(permissionRepo, "monitoring", model.AccessView))
				r.Get("/monitoring", monitoringHandler.GetDashboard)
				r.Get("/dashboard/configs/monthly-revenue-target", dashboardConfigHandler.GetMonthlyRevenueTarget)
			})

			// Dashboard config update - hanya admin/leader (editor access)
			r.Group(func(r chi.Router) {
				r.Use(appmiddleware.RequireModuleAccess(permissionRepo, "monitoring", model.AccessEditor))
				r.Put("/dashboard/configs/monthly-revenue-target", dashboardConfigHandler.UpdateMonthlyRevenueTarget)
			})

			// Laporan & KPI dijaga modul RBAC "reports" — default staff_it/
			// leader/admin sudah dapat izin 'view' dari seed awal, role 'user'
			// 'none' (lihat migration role_module_permissions).
			r.Group(func(r chi.Router) {
				r.Use(appmiddleware.RequireModuleAccess(permissionRepo, "reports", model.AccessView))
				r.Get("/reports/kpi", statsHandler.KPIReport)
				r.Get("/reports/trend", statsHandler.TrendRange)
				r.Get("/reports/priority-breakdown", statsHandler.PriorityBreakdown)
				r.Get("/reports/category-breakdown", statsHandler.CategoryBreakdown)
				r.Get("/reports/staff-performance", statsHandler.StaffPerformanceRange)
				r.Get("/reports/asset-borrowing-stats", statsHandler.AssetBorrowingStats)
			})

			r.Post("/tickets/{id}/rating", ratingHandler.Create)
			r.Get("/tickets/{id}/rating", ratingHandler.GetByTicket)

			r.Get("/tickets/{id}/comments", commentHandler.ListByTicket)
			r.Post("/tickets/{id}/comments", commentHandler.Create)
			r.Post("/uploads/inline-image", uploadHandler.UploadInlineImage)

			r.Get("/notifications", notifHandler.List)
			r.Post("/notifications/{id}/read", notifHandler.MarkRead)

			// Endpoint ini bisa diakses SEMUA role yang login — dipakai
			// frontend (Sidebar) untuk tahu modul mana yang boleh dibuka.
			r.Get("/me/permissions", rbacHandler.MyPermissions)

			// Route Manajemen Akses sekarang dijaga oleh RequireModuleAccess,
			// BUKAN hardcoded RequireRole(admin) lagi — supaya perubahan di
			// matriks izin (misalnya admin kasih leader akses 'editor' ke
			// modul access_management) langsung berlaku tanpa deploy ulang.
			// Endpoint GET (lihat data) cukup izin 'view'; endpoint yang
			// mengubah data (PATCH/PUT/DELETE) wajib izin 'editor'.
			r.Group(func(r chi.Router) {
				r.Use(appmiddleware.RequireModuleAccess(permissionRepo, "access_management", model.AccessView))
				r.Get("/admin/modules", rbacHandler.ListModules)
				r.Get("/admin/permissions/roles", rbacHandler.ListRoleDefaults)
				r.Get("/admin/permissions/users", rbacHandler.ListUserOverrides)
			})

			r.Group(func(r chi.Router) {
				r.Use(appmiddleware.RequireModuleAccess(permissionRepo, "access_management", model.AccessEditor))
				r.Patch("/admin/modules/{id}", rbacHandler.SetModuleActive)
				r.Put("/admin/permissions/roles", rbacHandler.UpsertRoleDefault)
				r.Put("/admin/permissions/users", rbacHandler.UpsertUserOverride)
				r.Delete("/admin/permissions/users/{id}", rbacHandler.DeleteUserOverride)
			})

			// Asset Management routes — dijaga oleh modul RBAC "asset"
			// Default: staff_it/leader/admin dapat 'view', hanya leader/admin dapat 'editor'
			r.Group(func(r chi.Router) {
				r.Use(appmiddleware.RequireModuleAccess(permissionRepo, "asset", model.AccessView))

				// Asset CRUD (read-only)
				r.Get("/assets", assetHandler.ListAssets)
				r.Get("/assets/{id}", assetHandler.GetAsset)
				r.Get("/asset-categories", assetHandler.ListCategories)

				// Borrowing — user biasa boleh meminjam dan mengembalikan
				r.Get("/asset-borrowings", assetHandler.ListBorrowings)
				r.Get("/asset-borrowings/overdue", assetHandler.ListOverdue)
				r.Get("/asset-borrowings/borrowed-count", assetHandler.GetBorrowedCount)
				r.Post("/assets/{id}/borrow", assetHandler.BorrowAsset)
				r.Post("/asset-borrowings/{id}/return", assetHandler.ReturnBorrowing)

				// Disposals (read-only)
				r.Get("/asset-disposals", assetHandler.ListDisposals)
			})

			r.Group(func(r chi.Router) {
				r.Use(appmiddleware.RequireModuleAccess(permissionRepo, "asset", model.AccessEditor))

				// Asset CRUD (create/update/delete) — hanya editor
				r.Post("/assets", assetHandler.CreateAsset)
				r.Put("/assets/{id}", assetHandler.UpdateAsset)
				r.Delete("/assets/{id}", assetHandler.DeleteAsset)

				// Borrowing approve/reject — hanya editor (admin/leader)
				r.Post("/asset-borrowings/{id}/approve", assetHandler.ApproveBorrowing)
				r.Post("/asset-borrowings/{id}/reject", assetHandler.RejectBorrowing)
				r.Post("/asset-borrowings/{id}/handover", assetHandler.HandoverBorrowing)

				// Disposal — hanya editor
				r.Post("/assets/{id}/dispose", assetHandler.DisposeAsset)
			})
		})
	})

	return r, ticketService
}
