package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"ticketing-it/backend/internal/model"
)

var ErrSignoffNotFound = errors.New("dokumen serah-terima tidak ditemukan")

type TicketSignoffRepository struct {
	db *pgxpool.Pool
}

func NewTicketSignoffRepository(db *pgxpool.Pool) *TicketSignoffRepository {
	return &TicketSignoffRepository{db: db}
}

const signoffSelect = `
	SELECT s.id, s.ticket_id, s.doc_type, s.doc_number,
		s.file_url, s.file_name, s.file_type, s.file_size,
		s.signed_by_name, s.signed_at, s.note,
		s.uploaded_by, u.name, s.created_at
	FROM ticket_signoffs s
	LEFT JOIN users u ON u.id = s.uploaded_by
`

func scanSignoff(row pgx.Row) (*model.TicketSignoff, error) {
	var s model.TicketSignoff
	err := row.Scan(
		&s.ID, &s.TicketID, &s.DocType, &s.DocNumber,
		&s.FileURL, &s.FileName, &s.FileType, &s.FileSize,
		&s.SignedByName, &s.SignedAt, &s.Note,
		&s.UploadedBy, &s.UploadedByName, &s.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrSignoffNotFound
		}
		return nil, err
	}
	return &s, nil
}

func (r *TicketSignoffRepository) Create(ctx context.Context, s *model.TicketSignoff) error {
	query := `
		INSERT INTO ticket_signoffs
			(ticket_id, doc_type, doc_number, file_url, file_name, file_type, file_size, signed_by_name, signed_at, note, uploaded_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING id, created_at
	`
	docType := s.DocType
	if docType == "" { docType = "bast" }
	return r.db.QueryRow(ctx, query,
		s.TicketID, docType, s.DocNumber, s.FileURL, s.FileName, s.FileType, s.FileSize,
		s.SignedByName, s.SignedAt, s.Note, s.UploadedBy,
	).Scan(&s.ID, &s.CreatedAt)
}

// ListByTicket mengembalikan semua dokumen milik satu tiket, terbaru dulu.
func (r *TicketSignoffRepository) ListByTicket(ctx context.Context, ticketID string) ([]model.TicketSignoff, error) {
	rows, err := r.db.Query(ctx, signoffSelect+` WHERE s.ticket_id = $1 ORDER BY s.created_at DESC`, ticketID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []model.TicketSignoff{}
	for rows.Next() {
		var s model.TicketSignoff
		if err := rows.Scan(
			&s.ID, &s.TicketID, &s.DocType, &s.DocNumber,
			&s.FileURL, &s.FileName, &s.FileType, &s.FileSize,
			&s.SignedByName, &s.SignedAt, &s.Note,
			&s.UploadedBy, &s.UploadedByName, &s.CreatedAt,
		); err != nil {
			return nil, err
		}
		list = append(list, s)
	}
	return list, rows.Err()
}

// LatestByTicket dipakai daftar tiket untuk menandai tiket mana yang sudah
// punya bukti serah-terima (badge "BAST ✓") tanpa perlu ambil semua dokumen.
func (r *TicketSignoffRepository) LatestByTicket(ctx context.Context, ticketID string) (*model.TicketSignoff, error) {
	return scanSignoff(r.db.QueryRow(ctx, signoffSelect+` WHERE s.ticket_id = $1 ORDER BY s.created_at DESC LIMIT 1`, ticketID))
}

// ListByType mengambil dokumen satu jenis (analysis / bast) untuk satu tiket.
func (r *TicketSignoffRepository) ListByType(ctx context.Context, ticketID, docType string) ([]model.TicketSignoff, error) {
	rows, err := r.db.Query(ctx, signoffSelect+` WHERE s.ticket_id = $1 AND s.doc_type = $2 ORDER BY s.created_at DESC`, ticketID, docType)
	if err != nil { return nil, err }
	defer rows.Close()
	list := []model.TicketSignoff{}
	for rows.Next() {
		var s model.TicketSignoff
		if err := rows.Scan(
			&s.ID, &s.TicketID, &s.DocType, &s.DocNumber,
			&s.FileURL, &s.FileName, &s.FileType, &s.FileSize,
			&s.SignedByName, &s.SignedAt, &s.Note,
			&s.UploadedBy, &s.UploadedByName, &s.CreatedAt,
		); err != nil { return nil, err }
		list = append(list, s)
	}
	return list, rows.Err()
}

// HasApprovedAnalysis mengembalikan true bila tiket punya scan persetujuan
// analisa terbaru (doc_type='analysis'). Dipakai gate sebelum klaim.
func (r *TicketSignoffRepository) HasApprovedAnalysis(ctx context.Context, ticketID string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM ticket_signoffs WHERE ticket_id = $1 AND doc_type = 'analysis')`, ticketID,
	).Scan(&exists)
	return exists, err
}

// ReserveDocNumber menghasilkan nomor dokumen yang stabil untuk (tiket, jenis, tahun).
// Dipanggil saat halaman cetak dibuka; upload berikutnya memakai nomor yang sama.
func (r *TicketSignoffRepository) ReserveDocNumber(ctx context.Context, ticketID, docType string) (string, error) {
	var num string
	err := r.db.QueryRow(ctx, `
		WITH ins AS (
			INSERT INTO ticket_document_numbers (ticket_id, doc_type, year_part, doc_number)
			VALUES ($1::uuid, $2::text, to_char(now(), 'YYYY'),
			        next_document_number(CASE WHEN $2 = 'analysis' THEN 'PA' ELSE 'BAST' END))
			ON CONFLICT (ticket_id, doc_type, year_part) DO NOTHING
			RETURNING doc_number
		)
		SELECT doc_number FROM ins
		UNION ALL
		SELECT doc_number FROM ticket_document_numbers
		WHERE ticket_id = $1::uuid AND doc_type = $2 AND year_part = to_char(now(), 'YYYY')
		LIMIT 1`, ticketID, docType).Scan(&num)
	return num, err
}

// NextDocNumber membuat nomor dokumen unik per jenis per tahun, aman untuk
// pemanggilan bersamaan (INSERT ... ON CONFLICT ... RETURNING bersifat atomik).
func (r *TicketSignoffRepository) NextDocNumber(ctx context.Context, prefix string) (string, error) {
	var num string
	err := r.db.QueryRow(ctx, `SELECT next_document_number($1)`, prefix).Scan(&num)
	return num, err
}

func (r *TicketSignoffRepository) FindByID(ctx context.Context, id string) (*model.TicketSignoff, error) {
	return scanSignoff(r.db.QueryRow(ctx, signoffSelect+` WHERE s.id = $1`, id))
}

func (r *TicketSignoffRepository) Delete(ctx context.Context, id string) error {
	tag, err := r.db.Exec(ctx, `DELETE FROM ticket_signoffs WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrSignoffNotFound
	}
	return nil
}
