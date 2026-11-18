package repository

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"ticketing-it/backend/internal/model"
)

var ErrAttachmentNotFound = errors.New("lampiran tidak ditemukan")

type DailyTaskAttachmentRepository struct {
	db *pgxpool.Pool
}

func NewDailyTaskAttachmentRepository(db *pgxpool.Pool) *DailyTaskAttachmentRepository {
	return &DailyTaskAttachmentRepository{db: db}
}

const attachmentSelect = `
	SELECT a.id, a.task_id, a.file_url, a.file_name, a.file_type, a.file_size, a.uploaded_by, a.created_at
	FROM daily_task_attachments a
`

func scanAttachment(row interface{ Scan(...interface{}) error }) (*model.DailyTaskAttachment, error) {
	var a model.DailyTaskAttachment
	err := row.Scan(&a.ID, &a.TaskID, &a.FileURL, &a.FileName, &a.FileType, &a.FileSize, &a.UploadedBy, &a.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (r *DailyTaskAttachmentRepository) ListByTask(ctx context.Context, taskID string) ([]model.DailyTaskAttachment, error) {
	rows, err := r.db.Query(ctx, attachmentSelect+` WHERE a.task_id = $1 ORDER BY a.created_at DESC`, taskID)
	if err != nil { return nil, err }
	defer rows.Close()
	list := []model.DailyTaskAttachment{}
	for rows.Next() {
		a, err := scanAttachment(rows)
		if err != nil { return nil, err }
		list = append(list, *a)
	}
	return list, rows.Err()
}

func (r *DailyTaskAttachmentRepository) Count(ctx context.Context, taskID string) (int, error) {
	var n int
	err := r.db.QueryRow(ctx, `SELECT count(*) FROM daily_task_attachments WHERE task_id = $1`, taskID).Scan(&n)
	return n, err
}

func (r *DailyTaskAttachmentRepository) Create(ctx context.Context, a *model.DailyTaskAttachment) error {
	return r.db.QueryRow(ctx, `
		INSERT INTO daily_task_attachments (task_id, file_url, file_name, file_type, file_size, uploaded_by)
		VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, created_at
	`, a.TaskID, a.FileURL, a.FileName, a.FileType, a.FileSize, a.UploadedBy).Scan(&a.ID, &a.CreatedAt)
}

func (r *DailyTaskAttachmentRepository) FindByID(ctx context.Context, id string) (*model.DailyTaskAttachment, error) {
	a, err := scanAttachment(r.db.QueryRow(ctx, attachmentSelect+` WHERE a.id = $1`, id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) { return nil, ErrAttachmentNotFound }
		return nil, err
	}
	return a, nil
}

func (r *DailyTaskAttachmentRepository) Delete(ctx context.Context, id string) error {
	tag, err := r.db.Exec(ctx, `DELETE FROM daily_task_attachments WHERE id = $1`, id)
	if err != nil { return err }
	if tag.RowsAffected() == 0 { return ErrAttachmentNotFound }
	return nil
}
