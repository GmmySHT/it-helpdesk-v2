package repository

import (
	"context"
	"errors"
	"strconv"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"ticketing-it/backend/internal/model"
)

var ErrDailyTaskNotFound = errors.New("daily task tidak ditemukan")

type DailyTaskRepository struct {
	db *pgxpool.Pool
}

func NewDailyTaskRepository(db *pgxpool.Pool) *DailyTaskRepository {
	return &DailyTaskRepository{db: db}
}

func (r *DailyTaskRepository) ListUnits(ctx context.Context) ([]model.Unit, error) {
	rows, err := r.db.Query(ctx, `SELECT id, name FROM units ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// Slice diinisialisasi kosong (bukan nil) supaya endpoint mengirim [] dan
	// bukan null — frontend yang memanggil .map() langsung akan pecah pada null.
	units := []model.Unit{}
	for rows.Next() {
		var u model.Unit
		if err := rows.Scan(&u.ID, &u.Name); err != nil {
			return nil, err
		}
		units = append(units, u)
	}
	return units, rows.Err()
}

// DailyTaskFilter menampung filter daftar daily task. Kosong berarti tidak
// memfilter kolom tersebut.
type DailyTaskFilter struct {
	From      string // YYYY-MM-DD, batas bawah task_date
	To        string // YYYY-MM-DD, batas atas task_date
	CreatedBy string // user_id pencatat (untuk laporan KPI per orang)
	UnitID    string
}

const dailyTaskSelect = `
	SELECT dt.id, dt.task_date::text, dt.reporter_name, dt.unit_id, u.name,
		dt.issue, COALESCE(dt.detail, ''), COALESCE(dt.solution, ''),
		dt.complain_at, dt.start_at, dt.end_at,
		dt.response_minutes, dt.duration_minutes,
		dt.created_by, creator.name, dt.created_at, dt.updated_at
	FROM daily_tasks dt
	LEFT JOIN units u ON u.id = dt.unit_id
	LEFT JOIN users creator ON creator.id = dt.created_by
`

func scanDailyTask(row pgx.Row) (*model.DailyTask, error) {
	var t model.DailyTask
	err := row.Scan(
		&t.ID, &t.TaskDate, &t.ReporterName, &t.UnitID, &t.UnitName,
		&t.Issue, &t.Detail, &t.Solution,
		&t.ComplainAt, &t.StartAt, &t.EndAt,
		&t.ResponseMinutes, &t.DurationMinutes,
		&t.CreatedBy, &t.CreatedByName, &t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrDailyTaskNotFound
		}
		return nil, err
	}
	return &t, nil
}

func (r *DailyTaskRepository) List(ctx context.Context, f DailyTaskFilter) ([]model.DailyTask, error) {
	// WHERE disusun bertahap supaya penomoran $1/$2 tidak perlu dihitung manual.
	where := " WHERE 1=1"
	args := []interface{}{}
	add := func(clause string, val interface{}) {
		args = append(args, val)
		where += " AND " + clause + "($" + strconv.Itoa(len(args)) + ")"
	}
	if f.From != "" {
		add("dt.task_date >= ", f.From)
	}
	if f.To != "" {
		add("dt.task_date <= ", f.To)
	}
	if f.CreatedBy != "" {
		add("dt.created_by = ", f.CreatedBy)
	}
	if f.UnitID != "" {
		add("dt.unit_id = ", f.UnitID)
	}

	rows, err := r.db.Query(ctx, dailyTaskSelect+where+" ORDER BY dt.task_date DESC, dt.complain_at DESC", args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tasks := []model.DailyTask{}
	for rows.Next() {
		var t model.DailyTask
		if err := rows.Scan(
			&t.ID, &t.TaskDate, &t.ReporterName, &t.UnitID, &t.UnitName,
			&t.Issue, &t.Detail, &t.Solution,
			&t.ComplainAt, &t.StartAt, &t.EndAt,
			&t.ResponseMinutes, &t.DurationMinutes,
			&t.CreatedBy, &t.CreatedByName, &t.CreatedAt, &t.UpdatedAt,
		); err != nil {
			return nil, err
		}
		tasks = append(tasks, t)
	}
	return tasks, rows.Err()
}

func (r *DailyTaskRepository) FindByID(ctx context.Context, id string) (*model.DailyTask, error) {
	return scanDailyTask(r.db.QueryRow(ctx, dailyTaskSelect+" WHERE dt.id = $1", id))
}

func (r *DailyTaskRepository) Create(ctx context.Context, t *model.DailyTask) error {
	// response_minutes/duration_minutes TIDAK ikut di-INSERT: keduanya kolom
	// GENERATED, Postgres menolak nilai eksplisit untuk kolom seperti itu.
	return r.db.QueryRow(ctx, `
		INSERT INTO daily_tasks (
			task_date, reporter_name, unit_id, issue, detail, solution,
			complain_at, start_at, end_at, created_by
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING id, created_at, updated_at
	`, t.TaskDate, t.ReporterName, t.UnitID, t.Issue, t.Detail, t.Solution,
		t.ComplainAt, t.StartAt, t.EndAt, t.CreatedBy,
	).Scan(&t.ID, &t.CreatedAt, &t.UpdatedAt)
}

func (r *DailyTaskRepository) Update(ctx context.Context, t *model.DailyTask) error {
	tag, err := r.db.Exec(ctx, `
		UPDATE daily_tasks
		SET task_date = $1, reporter_name = $2, unit_id = $3, issue = $4,
			detail = $5, solution = $6, complain_at = $7, start_at = $8, end_at = $9,
			updated_at = now()
		WHERE id = $10
	`, t.TaskDate, t.ReporterName, t.UnitID, t.Issue, t.Detail, t.Solution,
		t.ComplainAt, t.StartAt, t.EndAt, t.ID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrDailyTaskNotFound
	}
	return nil
}

func (r *DailyTaskRepository) Delete(ctx context.Context, id string) error {
	tag, err := r.db.Exec(ctx, `DELETE FROM daily_tasks WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrDailyTaskNotFound
	}
	return nil
}
