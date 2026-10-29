package service

import (
	"context"
	"ticketing-it/backend/internal/model"
	"ticketing-it/backend/internal/repository"
	"ticketing-it/backend/internal/ws"
)

type AssetBorrowingService struct {
	repo         *repository.AssetBorrowingRepository
	userRepo     *repository.UserRepository
	notifService *NotificationService
	hub          *ws.Hub
}

func NewAssetBorrowingService(repo *repository.AssetBorrowingRepository, userRepo *repository.UserRepository, notifService *NotificationService, hub *ws.Hub) *AssetBorrowingService {
	return &AssetBorrowingService{repo: repo, userRepo: userRepo, notifService: notifService, hub: hub}
}

// Create membuat permintaan peminjaman aset.
func (s *AssetBorrowingService) Create(ctx context.Context, borrowing *model.AssetBorrowing) error {
	borrowing.Status = model.BorrowingPendingApproval
	if err := s.repo.Create(ctx, borrowing); err != nil {
		return err
	}

	// Notifikasi ke semua IT staff & leader bahwa ada permintaan peminjaman baru
	if s.notifService != nil && s.userRepo != nil {
		staff, _ := s.userRepo.ListByRoles(ctx, model.RoleStaffIT, model.RoleLeader)
		for _, u := range staff {
			s.notifService.Notify(ctx, u.ID, nil, "asset_borrowing_request",
				"Permintaan Peminjaman Aset Baru",
				"Ada permintaan peminjaman aset baru yang perlu disetujui.")
		}
	}

	return nil
}

// actorLabel menyusun nama pelaku untuk teks notifikasi, mis. "Rina (Leader)".
// Sebelumnya teks notifikasi menulis "admin" secara permanen, padahal yang
// menyetujui/menolak bisa leader atau staff IT.
func (s *AssetBorrowingService) actorLabel(ctx context.Context, userID string) string {
	const fallback = "petugas IT"
	if s.userRepo == nil || userID == "" {
		return fallback
	}
	u, err := s.userRepo.FindByID(ctx, userID)
	if err != nil || u == nil {
		return fallback
	}

	role := ""
	switch u.Role {
	case model.RoleLeader:
		role = "Leader"
	case model.RoleStaffIT:
		role = "Staff IT"
	case model.RoleAdmin:
		role = "Admin"
	}
	if role == "" {
		return u.Name
	}
	return u.Name + " (" + role + ")"
}

// Approve menyetujui peminjaman dan push notifikasi ke borrower.
func (s *AssetBorrowingService) Approve(ctx context.Context, id string, approvedBy string) error {
	borrowing, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return err
	}

	if err := s.repo.Approve(ctx, id, approvedBy); err != nil {
		return err
	}

	// Push notifikasi ke borrower bahwa peminjaman disetujui
	if s.notifService != nil && s.hub != nil {
		s.notifService.Notify(ctx, borrowing.BorrowerID, nil, "asset_borrowing_approved",
			"Peminjaman Aset Disetujui",
			"Peminjaman aset "+borrowing.AssetName+" telah disetujui oleh "+s.actorLabel(ctx, approvedBy)+".")
	}

	return nil
}

// Reject menolak peminjaman dan push notifikasi ke borrower.
func (s *AssetBorrowingService) Reject(ctx context.Context, id string, rejectedBy string) error {
	borrowing, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return err
	}

	if err := s.repo.Reject(ctx, id); err != nil {
		return err
	}

	if s.notifService != nil && s.hub != nil {
		s.notifService.Notify(ctx, borrowing.BorrowerID, nil, "asset_borrowing_rejected",
			"Peminjaman Aset Ditolak",
			"Peminjaman aset "+borrowing.AssetName+" telah ditolak oleh "+s.actorLabel(ctx, rejectedBy)+".")
	}

	return nil
}

// MarkBorrowed menandai permintaan diproses (asset diambil peminjam).
func (s *AssetBorrowingService) MarkBorrowed(ctx context.Context, id string) error {
	return s.repo.MarkBorrowed(ctx, id)
}

// Return mengembalikan aset dengan kondisi + notifikasi ke admin.
func (s *AssetBorrowingService) Return(ctx context.Context, id string, condition model.ReturnCondition, notes string) error {
	borrowing, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return err
	}

	if err := s.repo.Return(ctx, id, condition, notes); err != nil {
		return err
	}

	if s.notifService != nil && s.hub != nil {
		conditionText := "baik"
		if condition == model.ReturnDamaged {
			conditionText = "rusak"
		} else if condition == model.ReturnLost {
			conditionText = "hilang"
		}

		s.notifService.Notify(ctx, "", nil, "asset_returned",
			"Aset Dikembalikan",
			"Aset "+borrowing.AssetName+" telah dikembalikan dalam kondisi "+conditionText+".")
	}

	return nil
}

// List mengambil daftar peminjaman.
func (s *AssetBorrowingService) List(ctx context.Context, status string, borrowerID string, limit int, offset int) ([]model.AssetBorrowing, int64, error) {
	return s.repo.List(ctx, status, borrowerID, limit, offset)
}

// ListOverdue mengambil daftar peminjaman yang overdue.
func (s *AssetBorrowingService) ListOverdue(ctx context.Context) ([]model.AssetBorrowing, error) {
	return s.repo.ListOverdue(ctx)
}

// CountBorrowed menghitung aset yang sedang dipinjam.
func (s *AssetBorrowingService) CountBorrowed(ctx context.Context) (int64, error) {
	return s.repo.CountBorrowed(ctx)
}
