package repository

import (
	"context"
	"errors"
	"fmt"
	"ticketing-it/backend/internal/model"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type AssetBorrowingRepository struct {
	db *pgxpool.Pool
}

func NewAssetBorrowingRepository(db *pgxpool.Pool) *AssetBorrowingRepository {
	return &AssetBorrowingRepository{db: db}
}

// Create membuat permintaan peminjaman aset baru.
func (r *AssetBorrowingRepository) Create(ctx context.Context, borrowing *model.AssetBorrowing) error {
	query := `
		INSERT INTO asset_borrowings 
		(asset_id, borrower_id, quantity, borrow_date, return_deadline, purpose, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, created_at, updated_at
	`

	err := r.db.QueryRow(ctx, query,
		borrowing.AssetID, borrowing.BorrowerID, borrowing.Quantity,
		borrowing.BorrowDate, borrowing.ReturnDeadline, borrowing.Purpose, borrowing.Status,
	).Scan(&borrowing.ID, &borrowing.CreatedAt, &borrowing.UpdatedAt)

	return err
}

// GetByID mengambil detail peminjaman by ID dengan nama asset & user.
func (r *AssetBorrowingRepository) GetByID(ctx context.Context, id string) (*model.AssetBorrowing, error) {
	query := `
		SELECT ab.id, ab.asset_id, COALESCE(a.code,''), COALESCE(a.name,''), ab.borrower_id, COALESCE(u.name,''),
		       ab.quantity, ab.borrow_date, ab.return_deadline, ab.actual_return_date,
		       ab.return_condition, COALESCE(ab.return_notes,''), COALESCE(ab.purpose,''), ab.status,
		       ab.approved_by, COALESCE(u2.name,''), ab.approved_at, ab.created_at, ab.updated_at
		FROM asset_borrowings ab
		LEFT JOIN assets a ON ab.asset_id = a.id
		LEFT JOIN users u ON ab.borrower_id = u.id
		LEFT JOIN users u2 ON ab.approved_by = u2.id
		WHERE ab.id = $1
	`

	b := &model.AssetBorrowing{}
	err := r.db.QueryRow(ctx, query, id).Scan(
		&b.ID, &b.AssetID, &b.AssetCode, &b.AssetName, &b.BorrowerID, &b.BorrowerName,
		&b.Quantity, &b.BorrowDate, &b.ReturnDeadline, &b.ActualReturnDate,
		&b.ReturnCondition, &b.ReturnNotes, &b.Purpose, &b.Status,
		&b.ApprovedBy, &b.ApproverName, &b.ApprovedAt, &b.CreatedAt, &b.UpdatedAt,
	)

	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, errors.New("borrowing not found")
		}
		return nil, err
	}

	return b, nil
}

// List mengambil daftar peminjaman dengan filter status.
func (r *AssetBorrowingRepository) List(ctx context.Context, status string, borrowerID string, limit int, offset int) ([]model.AssetBorrowing, int64, error) {
	query := `
		SELECT ab.id, ab.asset_id, COALESCE(a.code,''), COALESCE(a.name,''), ab.borrower_id, COALESCE(u.name,''),
		       ab.quantity, ab.borrow_date, ab.return_deadline, ab.actual_return_date,
		       ab.return_condition, COALESCE(ab.return_notes,''), COALESCE(ab.purpose,''), ab.status,
		       ab.approved_by, COALESCE(u2.name,''), ab.approved_at, ab.created_at, ab.updated_at
		FROM asset_borrowings ab
		LEFT JOIN assets a ON ab.asset_id = a.id
		LEFT JOIN users u ON ab.borrower_id = u.id
		LEFT JOIN users u2 ON ab.approved_by = u2.id
		WHERE 1=1
	`
	countQuery := "SELECT COUNT(*) FROM asset_borrowings WHERE 1=1"
	args := []interface{}{}
	argIdx := 1

	if status != "" {
		query += " AND ab.status = $" + fmt.Sprintf("%d", argIdx)
		countQuery += " AND status = $" + fmt.Sprintf("%d", argIdx)
		args = append(args, status)
		argIdx++
	}

	if borrowerID != "" {
		query += " AND ab.borrower_id = $" + fmt.Sprintf("%d", argIdx)
		countQuery += " AND borrower_id = $" + fmt.Sprintf("%d", argIdx)
		args = append(args, borrowerID)
		argIdx++
	}

	var total int64
	err := r.db.QueryRow(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	query += " ORDER BY " +
		"CASE " +
		"WHEN ab.status = 'borrowed' AND ab.return_deadline < NOW() THEN 1 " +
		"WHEN ab.status = 'borrowed' AND ab.return_deadline <= NOW() + INTERVAL '24 HOURS' THEN 2 " +
		"WHEN ab.status = 'pending_approval' THEN 3 " +
		"WHEN ab.status = 'approved' THEN 4 " +
		"ELSE 5 END ASC, " +
		"ab.created_at DESC " +
		"LIMIT $" + fmt.Sprintf("%d", argIdx) + " OFFSET $" + fmt.Sprintf("%d", argIdx+1)

	rows, err := r.db.Query(ctx, query, append(args, limit, offset)...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	borrowings := []model.AssetBorrowing{}
	for rows.Next() {
		b := model.AssetBorrowing{}
		err := rows.Scan(
			&b.ID, &b.AssetID, &b.AssetCode, &b.AssetName, &b.BorrowerID, &b.BorrowerName,
			&b.Quantity, &b.BorrowDate, &b.ReturnDeadline, &b.ActualReturnDate,
			&b.ReturnCondition, &b.ReturnNotes, &b.Purpose, &b.Status,
			&b.ApprovedBy, &b.ApproverName, &b.ApprovedAt, &b.CreatedAt, &b.UpdatedAt,
		)
		if err != nil {
			return nil, 0, err
		}
		borrowings = append(borrowings, b)
	}

	return borrowings, total, rows.Err()
}

// ListOverdue mengambil daftar peminjaman yang melewati deadline.
func (r *AssetBorrowingRepository) ListOverdue(ctx context.Context) ([]model.AssetBorrowing, error) {
	query := `
		SELECT ab.id, ab.asset_id, COALESCE(a.code,''), COALESCE(a.name,''), ab.borrower_id, COALESCE(u.name,''),
		       ab.quantity, ab.borrow_date, ab.return_deadline, ab.actual_return_date,
		       ab.return_condition, COALESCE(ab.return_notes,''), COALESCE(ab.purpose,''), ab.status,
		       ab.approved_by, COALESCE(u2.name,''), ab.approved_at, ab.created_at, ab.updated_at
		FROM asset_borrowings ab
		LEFT JOIN assets a ON ab.asset_id = a.id
		LEFT JOIN users u ON ab.borrower_id = u.id
		LEFT JOIN users u2 ON ab.approved_by = u2.id
		WHERE ab.status = 'borrowed' AND ab.return_deadline < NOW()::DATE
		ORDER BY ab.return_deadline ASC
	`

	rows, err := r.db.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	borrowings := []model.AssetBorrowing{}
	for rows.Next() {
		b := model.AssetBorrowing{}
		err := rows.Scan(
			&b.ID, &b.AssetID, &b.AssetCode, &b.AssetName, &b.BorrowerID, &b.BorrowerName,
			&b.Quantity, &b.BorrowDate, &b.ReturnDeadline, &b.ActualReturnDate,
			&b.ReturnCondition, &b.ReturnNotes, &b.Purpose, &b.Status,
			&b.ApprovedBy, &b.ApproverName, &b.ApprovedAt, &b.CreatedAt, &b.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		borrowings = append(borrowings, b)
	}

	return borrowings, rows.Err()
}

// Approve menyetujui permintaan peminjaman.
func (r *AssetBorrowingRepository) Approve(ctx context.Context, id string, approvedBy string) error {
	query := `
		UPDATE asset_borrowings
		SET status=$1, approved_by=$2, approved_at=$3, updated_at=$3
		WHERE id=$4
	`
	now := time.Now().UTC()
	_, err := r.db.Exec(ctx, query, model.BorrowingApproved, approvedBy, now, id)
	return err
}

// Reject menolak permintaan peminjaman.
func (r *AssetBorrowingRepository) Reject(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, "UPDATE asset_borrowings SET status=$1, updated_at=$2 WHERE id=$3", model.BorrowingRejected, time.Now().UTC(), id)
	return err
}

// MarkBorrowed menandai aset sedang dipinjam (status BORROWED).
func (r *AssetBorrowingRepository) MarkBorrowed(ctx context.Context, id string) error {
	_, err := r.db.Exec(ctx, "UPDATE asset_borrowings SET status=$1, updated_at=$2 WHERE id=$3", model.BorrowingBorrowed, time.Now().UTC(), id)
	return err
}

// Return mengembalikan aset dengan kondisi.
func (r *AssetBorrowingRepository) Return(ctx context.Context, id string, condition model.ReturnCondition, notes string) error {
	query := `
		UPDATE asset_borrowings
		SET status=$1, actual_return_date=$2, return_condition=$3, return_notes=$4, updated_at=$5
		WHERE id=$6
	`

	now := time.Now().UTC() // ← ubah dari time.Now()
	_, err := r.db.Exec(ctx, query, model.BorrowingReturned, now, condition, notes, now, id)
	return err
}

// CountBorrowed menghitung aset yang sedang dipinjam (status BORROWED).
func (r *AssetBorrowingRepository) CountBorrowed(ctx context.Context) (int64, error) {
	var count int64
	err := r.db.QueryRow(ctx, "SELECT COUNT(*) FROM asset_borrowings WHERE status=$1", model.BorrowingBorrowed).Scan(&count)
	return count, err
}
