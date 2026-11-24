package repository

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// DashboardRepository menghitung angka "perlu tindakan" untuk dashboard.
// Semua query di sini SENGAJA memakai klausa yang sama dengan daftar/aksi
// aslinya, supaya angka di kartu selalu cocok dengan isi halaman tujuan.
type DashboardRepository struct {
	db *pgxpool.Pool
}

func NewDashboardRepository(db *pgxpool.Pool) *DashboardRepository {
	return &DashboardRepository{db: db}
}

// CountPendingApprovalTickets = tiket regular yang menunggu persetujuan
// leader/admin. Predikat sama dengan tombol Setujui di halaman tiket.
func (r *DashboardRepository) CountPendingApprovalTickets(ctx context.Context) (int, error) {
	var n int
	err := r.db.QueryRow(ctx, `
		SELECT count(*)
		FROM tickets
		WHERE deleted_at IS NULL
		  AND ticket_type = 'regular'
		  AND status = 'pending_approval'
	`).Scan(&n)
	return n, err
}

// CountAtRiskTickets memakai klausa IDENTIK dengan TicketRepository.ListAtRisk
// (lihat ticketListAtRiskWhere) supaya angkanya sama dengan daftar di widget.
func (r *DashboardRepository) CountAtRiskTickets(ctx context.Context) (int, error) {
	var n int
	err := r.db.QueryRow(ctx, `SELECT count(*) FROM tickets t WHERE `+ticketListAtRiskWhere).Scan(&n)
	return n, err
}

// CountPendingProjectProposals = project yang proposalnya menunggu keputusan.
func (r *DashboardRepository) CountPendingProjectProposals(ctx context.Context) (int, error) {
	var n int
	err := r.db.QueryRow(ctx, `
		SELECT count(*)
		FROM tickets
		WHERE deleted_at IS NULL
		  AND ticket_type = 'project'
		  AND project_status = 'menunggu_persetujuan'
	`).Scan(&n)
	return n, err
}

// CountPendingBorrowings = peminjaman aset yang menunggu persetujuan.
func (r *DashboardRepository) CountPendingBorrowings(ctx context.Context) (int, error) {
	var n int
	err := r.db.QueryRow(ctx, `
		SELECT count(*) FROM asset_borrowings WHERE status = 'pending_approval'
	`).Scan(&n)
	return n, err
}

// CountOverdueBorrowings memakai klausa identik dengan
// AssetBorrowingRepository.ListOverdue.
func (r *DashboardRepository) CountOverdueBorrowings(ctx context.Context) (int, error) {
	var n int
	err := r.db.QueryRow(ctx, `
		SELECT count(*)
		FROM asset_borrowings
		WHERE status = 'borrowed' AND return_deadline < NOW()::DATE
	`).Scan(&n)
	return n, err
}
