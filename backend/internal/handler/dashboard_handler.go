package handler

import (
	"log"
	"net/http"

	appmiddleware "ticketing-it/backend/internal/middleware"
	"ticketing-it/backend/internal/model"
	"ticketing-it/backend/internal/repository"
)

// DashboardHandler melayani ringkasan "perlu tindakan" untuk dashboard.
type DashboardHandler struct {
	permRepo *repository.PermissionRepository
	dashRepo *repository.DashboardRepository
}

func NewDashboardHandler(permRepo *repository.PermissionRepository, dashRepo *repository.DashboardRepository) *DashboardHandler {
	return &DashboardHandler{permRepo: permRepo, dashRepo: dashRepo}
}

// ActionItem adalah satu baris "perlu tindakan". href harus mengarah ke
// halaman yang benar-benar menampilkan daftar tersebut.
type ActionItem struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Count int    `json:"count"`
	Href  string `json:"href"`
}

// ActionItems mengembalikan hitungan sesuai hak akses pemanggil.
//
// Izin tiap item memakai PREDIKAT YANG SAMA dengan aksi aslinya:
//   - tiket menunggu persetujuan & berisiko -> leader/admin (sama dengan
//     TicketService.Approve yang menolak non-supervisor, dan route
//     /tickets/at-risk yang dijaga RequireRole staf+leader/admin)
//   - proposal project -> modul RBAC 'project' level view (sama dengan
//     route POST /projects/{id}/proposal/decision yang dijaga RequireRole
//     leader/admin; di sini ditambah syarat harus bisa MELIHAT project)
//   - peminjaman menunggu & terlambat -> modul RBAC 'asset' level editor
//     (sama dengan route approve/reject peminjaman)
//
// Item bernilai 0 atau yang tidak berhak dilihat pemanggil tidak
// disertakan. Satu item gagal dihitung dicatat ke log dan dilewati —
// tidak menggagalkan seluruh respons.
func (h *DashboardHandler) ActionItems(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID, _ := ctx.Value(appmiddleware.ContextUserID).(string)
	role, _ := ctx.Value(appmiddleware.ContextRole).(model.UserRole)

	isSupervisor := model.IsSupervisor(role)
	isStaff := model.IsTechnicalStaff(role) || isSupervisor

	projectLevel, err := h.permRepo.GetEffectiveLevel(ctx, userID, role, "project")
	if err != nil {
		log.Printf("dashboard action-items: gagal cek izin project untuk %s: %v", userID, err)
		projectLevel = model.AccessNone
	}
	assetLevel, err := h.permRepo.GetEffectiveLevel(ctx, userID, role, "asset")
	if err != nil {
		log.Printf("dashboard action-items: gagal cek izin asset untuk %s: %v", userID, err)
		assetLevel = model.AccessNone
	}

	items := []ActionItem{}

	add := func(key, label, href string, countFn func() (int, error)) {
		n, err := countFn()
		if err != nil {
			log.Printf("dashboard action-items: gagal menghitung %s: %v", key, err)
			return
		}
		if n <= 0 {
			return
		}
		items = append(items, ActionItem{Key: key, Label: label, Count: n, Href: href})
	}

	if isSupervisor {
		add("tickets_pending_approval", "Tiket menunggu persetujuan",
			"/tickets?status=pending_approval", func() (int, error) { return h.dashRepo.CountPendingApprovalTickets(ctx) })
	}
	if isStaff {
		add("tickets_at_risk", "Tiket berisiko / lewat SLA",
			"/tickets?at_risk=1", func() (int, error) { return h.dashRepo.CountAtRiskTickets(ctx) })
	}
	// Proposal project: sama dengan aksi keputusan (RequireRole leader/admin
	// di route proposal/decision) DAN pemanggil harus bisa melihat modul project.
	if isSupervisor && projectLevel != model.AccessNone {
		add("project_proposals", "Proposal project menunggu keputusan",
			"/project?status=menunggu_persetujuan", func() (int, error) { return h.dashRepo.CountPendingProjectProposals(ctx) })
	}
	if assetLevel == model.AccessEditor {
		add("borrowings_pending", "Peminjaman aset menunggu persetujuan",
			"/asset/borrowings?status=pending_approval", func() (int, error) { return h.dashRepo.CountPendingBorrowings(ctx) })
	}
	if assetLevel != model.AccessNone {
		add("borrowings_overdue", "Peminjaman aset terlambat",
			"/asset/borrowings?status=overdue", func() (int, error) { return h.dashRepo.CountOverdueBorrowings(ctx) })
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{"items": items})
}
