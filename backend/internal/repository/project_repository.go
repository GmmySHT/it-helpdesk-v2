package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"ticketing-it/backend/internal/model"
)

var (
	ErrProjectNotFound     = errors.New("project tidak ditemukan")
	ErrMemberNotFound      = errors.New("anggota project tidak ditemukan")
	ErrTaskNotFound        = errors.New("tugas project tidak ditemukan")
	ErrPICAlreadyExists    = errors.New("project sudah memiliki PIC aktif")
	ErrAssigneeNotMember   = errors.New("assignee harus merupakan anggota aktif project")
	ErrProposalNotApproved = errors.New("proposal belum disetujui")
	ErrProposalApproved    = errors.New("proposal yang sudah disetujui tidak bisa diedit; buat versi baru")
)

// ProjectRepository menangani tabel khusus project. Tidak ada logika bisnis di sini —
// semua keputusan (siapa boleh apa, gate proposal) ada di service layer.
type ProjectRepository struct {
	db *pgxpool.Pool
}

func NewProjectRepository(db *pgxpool.Pool) *ProjectRepository {
	return &ProjectRepository{db: db}
}

// Begin memulai transaksi untuk operasi project (mis. soft delete kaskade).
func (r *ProjectRepository) Begin(ctx context.Context) (pgx.Tx, error) {
	return r.db.Begin(ctx)
}

func (r *ProjectRepository) GetProject(ctx context.Context, ticketID string) (*model.Ticket, error) {
	query := `
		SELECT t.id, COALESCE(t.ticket_code, ''), t.title, t.description, t.category_id,
		       t.priority, t.status, t.ticket_type,
		       COALESCE(t.project_status, ''), t.start_date, t.target_date,
		       t.created_by, t.assigned_to, t.created_at
		FROM tickets t
		WHERE t.id = $1 AND t.ticket_type = 'project' AND t.deleted_at IS NULL
	`
	var t model.Ticket
	var status string
	var startDate, targetDate *time.Time
	var assignedTo *string
	err := r.db.QueryRow(ctx, query, ticketID).Scan(
		&t.ID, &t.TicketCode, &t.Title, &t.Description, &t.CategoryID,
		&t.Priority, &t.Status, &t.TicketType,
		&status, &startDate, &targetDate, &t.CreatedBy, &assignedTo, &t.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrProjectNotFound
		}
		return nil, err
	}
	t.ProjectStatus = &status
	t.StartDate = startDate
	t.TargetDate = targetDate
	t.AssignedTo = assignedTo
	return &t, nil
}

// SetType menandai tiket sebagai project dan mengisi status awalnya ('draft').
// Dipanggil di dalam transaksi yang sama dengan Create tiket.
// ListProjects mengembalikan SEMUA project (ticket_type='project') untuk
// halaman daftar project mandiri. Tidak memakai daftar tiket regular.
func (r *ProjectRepository) ListProjects(ctx context.Context, statusFilter string) ([]model.Ticket, error) {
	query := `
		SELECT t.id, COALESCE(t.ticket_code, ''), t.title, t.description, t.category_id,
		       t.priority, t.status, t.ticket_type,
		       COALESCE(t.project_status, ''), t.start_date, t.target_date,
		       t.created_by, t.assigned_to, t.created_at
		FROM tickets t
		WHERE t.ticket_type = 'project' AND t.deleted_at IS NULL
	`
	args := []interface{}{}
	if statusFilter != "" {
		query += " AND COALESCE(t.project_status, '') = $1"
		args = append(args, statusFilter)
	}
	query += " ORDER BY t.created_at DESC"

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []model.Ticket
	for rows.Next() {
		var t model.Ticket
		var status string
		var start, target *time.Time
		var assigned *string
		if err := rows.Scan(&t.ID, &t.TicketCode, &t.Title, &t.Description, &t.CategoryID,
			&t.Priority, &t.Status, &t.TicketType, &status, &start, &target,
			&t.CreatedBy, &assigned, &t.CreatedAt); err != nil {
			return nil, err
		}
		t.ProjectStatus = &status
		t.StartDate, t.TargetDate, t.AssignedTo = start, target, assigned
		list = append(list, t)
	}
	return list, rows.Err()
}

// ProjectSummary adalah ringkasan satu project untuk kartu daftar.
type ProjectSummary struct {
	Ticket           model.Ticket `json:"ticket"`
	PICName          string       `json:"pic_name"`
	MemberCount      int          `json:"member_count"`
	MilestoneCount   int          `json:"milestone_count"`
	MilestoneDone    int          `json:"milestone_done"`
	TaskCount        int          `json:"task_count"`
	TaskDone         int          `json:"task_done"`
	Progress         int          `json:"progress"`
	ProposalVersion  int          `json:"proposal_version"`
	ProposalUploader string       `json:"proposal_uploader"`
	LateTasks        int          `json:"late_tasks"`
}

// ListProjectSummaries mengembalikan daftar project + ringkasan untuk kartu.
// Satu query agregat, bukan N+1, supaya daftar tetap ringan.
func (r *ProjectRepository) ListProjectSummaries(ctx context.Context, statusFilter string) ([]ProjectSummary, error) {
	query := `
		SELECT t.id, COALESCE(t.ticket_code, ''), t.title, t.description, t.category_id,
		       t.priority, t.status, t.ticket_type, COALESCE(t.project_status, ''),
		       t.start_date, t.target_date, t.created_by, t.assigned_to, t.created_at,
		       COALESCE(pic.name, ''),
		       (SELECT count(*) FROM ticket_members m WHERE m.ticket_id=t.id AND m.removed_at IS NULL),
		       (SELECT count(*) FROM project_milestones ms WHERE ms.ticket_id=t.id AND ms.deleted_at IS NULL),
		       (SELECT count(*) FROM project_milestones ms WHERE ms.ticket_id=t.id AND ms.deleted_at IS NULL AND ms.status='selesai'),
		       (SELECT count(*) FROM project_tasks pt WHERE pt.ticket_id=t.id AND pt.deleted_at IS NULL),
		       (SELECT count(*) FROM project_tasks pt WHERE pt.ticket_id=t.id AND pt.deleted_at IS NULL AND pt.status='done'),
		       COALESCE((SELECT ts.version FROM ticket_signoffs ts WHERE ts.ticket_id=t.id AND COALESCE(ts.doc_type,'')='proposal' ORDER BY ts.version DESC LIMIT 1),0),
		       COALESCE((SELECT ts.signed_by_name FROM ticket_signoffs ts WHERE ts.ticket_id=t.id AND COALESCE(ts.doc_type,'')='proposal' ORDER BY ts.version DESC LIMIT 1),''),
		       (SELECT count(*) FROM project_tasks pt WHERE pt.ticket_id=t.id AND pt.deleted_at IS NULL AND pt.status<>'done' AND pt.due_date < CURRENT_DATE)
		FROM tickets t
		LEFT JOIN ticket_members pm ON pm.ticket_id=t.id AND pm.role='pic' AND pm.removed_at IS NULL
		LEFT JOIN users pic ON pic.id=pm.user_id
		WHERE t.ticket_type='project' AND t.deleted_at IS NULL
	`
	args := []interface{}{}
	if statusFilter != "" {
		query += " AND COALESCE(t.project_status, '') = $1"
		args = append(args, statusFilter)
	}
	query += " ORDER BY t.created_at DESC"
	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ProjectSummary
	for rows.Next() {
		var it ProjectSummary
		var status string
		var start, target *time.Time
		var assigned *string
		if err := rows.Scan(&it.Ticket.ID, &it.Ticket.TicketCode, &it.Ticket.Title, &it.Ticket.Description,
			&it.Ticket.CategoryID, &it.Ticket.Priority, &it.Ticket.Status, &it.Ticket.TicketType, &status,
			&start, &target, &it.Ticket.CreatedBy, &assigned, &it.Ticket.CreatedAt,
			&it.PICName, &it.MemberCount, &it.MilestoneCount, &it.MilestoneDone,
			&it.TaskCount, &it.TaskDone, &it.ProposalVersion, &it.ProposalUploader,
			&it.LateTasks); err != nil {
			return nil, err
		}
		it.Ticket.ProjectStatus = &status
		it.Ticket.StartDate, it.Ticket.TargetDate, it.Ticket.AssignedTo = start, target, assigned
		switch {
		case it.TaskCount > 0:
			it.Progress = it.TaskDone * 100 / it.TaskCount
		case it.MilestoneCount > 0:
			it.Progress = it.MilestoneDone * 100 / it.MilestoneCount
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

// DashboardProject berisi statistik KHUSUS project — tidak mengubah angka
// dashboard tiket regular.
type DashboardProject struct {
	Total      int `json:"total"`
	Draft      int `json:"draft"`
	Menunggu   int `json:"menunggu"`
	Berjalan   int `json:"berjalan"`
	Ditahan    int `json:"ditahan"`
	Selesai    int `json:"selesai"`
	TotalTasks int `json:"total_tasks"`
	DoneTasks  int `json:"done_tasks"`
	// LateTasks = tugas project belum selesai yang sudah lewat due_date.
	// Soft-deleted diabaikan, konsisten dengan query project lain.
	LateTasks int `json:"late_tasks"`
}

func (r *ProjectRepository) Dashboard(ctx context.Context) (DashboardProject, error) {
	var d DashboardProject
	err := r.db.QueryRow(ctx, `
		SELECT
			count(*),
			count(*) FILTER (WHERE COALESCE(project_status,'') = 'draft'),
			count(*) FILTER (WHERE COALESCE(project_status,'') = 'menunggu_persetujuan'),
			count(*) FILTER (WHERE COALESCE(project_status,'') = 'berjalan'),
			count(*) FILTER (WHERE COALESCE(project_status,'') = 'ditahan'),
			count(*) FILTER (WHERE COALESCE(project_status,'') = 'selesai')
		FROM tickets
		WHERE ticket_type = 'project' AND deleted_at IS NULL
	`).Scan(&d.Total, &d.Draft, &d.Menunggu, &d.Berjalan, &d.Ditahan, &d.Selesai)
	if err != nil {
		return d, err
	}
	err = r.db.QueryRow(ctx, `
		SELECT count(*), count(*) FILTER (WHERE t.status = 'done')
		FROM project_tasks t
		JOIN tickets p ON p.id = t.ticket_id
		WHERE p.ticket_type = 'project' AND p.deleted_at IS NULL AND t.deleted_at IS NULL
	`).Scan(&d.TotalTasks, &d.DoneTasks)
	if err != nil {
		return d, err
	}
	err = r.db.QueryRow(ctx, `
		SELECT count(*)
		FROM project_tasks t
		JOIN tickets p ON p.id = t.ticket_id
		WHERE p.ticket_type = 'project' AND p.deleted_at IS NULL AND t.deleted_at IS NULL
		  AND t.status <> 'done' AND t.due_date IS NOT NULL
		  AND t.due_date < (now() AT TIME ZONE 'Asia/Jakarta')::date
	`).Scan(&d.LateTasks)
	return d, err
}

// UpdateProject mengubah field deskriptif project. Tidak menyentuh status;
// transisi status lewat SetStatus yang punya gate proposal.
func (r *ProjectRepository) UpdateProject(ctx context.Context, ticketID, title, description, priority string, start, target *time.Time) error {
	tag, err := r.db.Exec(ctx, `
		UPDATE tickets
		SET title = $2, description = $3, priority = $4, start_date = $5, target_date = $6
		WHERE id = $1 AND ticket_type = 'project' AND deleted_at IS NULL
	`, ticketID, title, description, priority, start, target)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrProjectNotFound
	}
	return nil
}

// DeleteProject melakukan soft delete project beserta data turunannya.
// Data tiket regular tidak tersentuh.
func (r *ProjectRepository) DeleteProject(ctx context.Context, tx pgx.Tx, ticketID string) error {
	if _, err := tx.Exec(ctx, `UPDATE project_tasks SET deleted_at = now() WHERE ticket_id = $1 AND deleted_at IS NULL`, ticketID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE project_milestones SET deleted_at = now() WHERE ticket_id = $1 AND deleted_at IS NULL`, ticketID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE ticket_members SET removed_at = now() WHERE ticket_id = $1 AND removed_at IS NULL`, ticketID); err != nil {
		return err
	}
	tag, err := tx.Exec(ctx, `UPDATE tickets SET deleted_at = now() WHERE id = $1 AND ticket_type = 'project' AND deleted_at IS NULL`, ticketID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrProjectNotFound
	}
	return nil
}

func (r *ProjectRepository) SetType(ctx context.Context, tx pgx.Tx, ticketID string, start, target *time.Time) error {
	_, err := tx.Exec(ctx, `
		UPDATE tickets
		SET ticket_type = 'project',
		    project_status = 'draft',
		    start_date = $2,
		    target_date = $3
		WHERE id = $1
	`, ticketID, start, target)
	return err
}

// SetProjectStatus mengubah project_status. Tidak menyentuh ticket_status.
func (r *ProjectRepository) SetProjectStatus(ctx context.Context, ticketID, status string) error {
	tag, err := r.db.Exec(ctx, `
		UPDATE tickets SET project_status = $2
		WHERE id = $1 AND ticket_type = 'project'
	`, ticketID, status)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrProjectNotFound
	}
	return nil
}

// ListMembers mengembalikan anggota aktif (belum di-remove).
func (r *ProjectRepository) ListMembers(ctx context.Context, ticketID string) ([]model.TicketMember, error) {
	rows, err := r.db.Query(ctx, `
		SELECT m.id, m.ticket_id, m.user_id, u.name, m.role, m.added_by, m.added_at
		FROM ticket_members m
		LEFT JOIN users u ON u.id = m.user_id
		WHERE m.ticket_id = $1 AND m.removed_at IS NULL
		ORDER BY (m.role = 'pic') DESC, m.added_at ASC
	`, ticketID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var members []model.TicketMember
	for rows.Next() {
		var m model.TicketMember
		if err := rows.Scan(&m.ID, &m.TicketID, &m.UserID, &m.UserName, &m.Role, &m.AddedBy, &m.AddedAt); err != nil {
			return nil, err
		}
		members = append(members, m)
	}
	return members, rows.Err()
}

// GetPIC mengembalikan PIC aktif. pgx.ErrNoRows bila belum ada.
func (r *ProjectRepository) GetPIC(ctx context.Context, ticketID string) (*model.TicketMember, error) {
	var m model.TicketMember
	err := r.db.QueryRow(ctx, `
		SELECT m.id, m.ticket_id, m.user_id, m.role, m.added_at
		FROM ticket_members m
		WHERE m.ticket_id = $1 AND m.role = 'pic' AND m.removed_at IS NULL
	`, ticketID).Scan(&m.ID, &m.TicketID, &m.UserID, &m.Role, &m.AddedAt)
	if err != nil {
		return nil, err
	}
	return &m, nil
}

// GetMember mengembalikan keanggotaan aktif (belum removed_at).
func (r *ProjectRepository) GetMember(ctx context.Context, ticketID, userID string) (*model.TicketMember, error) {
	var m model.TicketMember
	var addedBy *string
	err := r.db.QueryRow(ctx, `
		SELECT id, ticket_id, user_id, role, added_by, added_at
		FROM ticket_members
		WHERE ticket_id = $1 AND user_id = $2 AND removed_at IS NULL
	`, ticketID, userID).Scan(&m.ID, &m.TicketID, &m.UserID, &m.Role, &addedBy, &m.AddedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	m.AddedBy = addedBy
	return &m, nil
}

func (r *ProjectRepository) IsActiveMember(ctx context.Context, ticketID, userID string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM ticket_members
			WHERE ticket_id = $1 AND user_id = $2 AND removed_at IS NULL
		)
	`, ticketID, userID).Scan(&exists)
	return exists, err
}

// AddMember menambah anggota/PIC. Unique parsial menjamin satu PIC aktif.
func (r *ProjectRepository) AddMember(ctx context.Context, ticketID, userID string, role model.MemberRole, addedBy string) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO ticket_members (ticket_id, user_id, role, added_by)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (ticket_id, user_id) DO UPDATE
			SET role = EXCLUDED.role,
			    added_by = EXCLUDED.added_by,
			    added_at = now(),
			    removed_at = NULL
	`, ticketID, userID, string(role), addedBy)
	if err != nil {
		if isUniqueViolation(err) && role == model.MemberRolePIC {
			return ErrPICAlreadyExists
		}
		return err
	}
	return nil
}

// RemoveMember melakukan soft-remove pada keanggotaan.
func (r *ProjectRepository) RemoveMember(ctx context.Context, ticketID, userID string) error {
	tag, err := r.db.Exec(ctx, `
		UPDATE ticket_members SET removed_at = now()
		WHERE ticket_id = $1 AND user_id = $2 AND removed_at IS NULL
	`, ticketID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrMemberNotFound
	}
	return nil
}

// ListTasks mengembalikan semua tugas project urut sesuai sort_order.
func (r *ProjectRepository) ListTasks(ctx context.Context, ticketID string) ([]model.ProjectTask, error) {
	rows, err := r.db.Query(ctx, `
		SELECT k.id, k.ticket_id, k.milestone_id, k.title, COALESCE(k.description, ''),
		       k.assignee_id, u.name, k.start_date, k.due_date, k.status, k.weight, k.sort_order,
		       k.completed_at, k.created_by, k.created_at
		FROM project_tasks k
		LEFT JOIN users u ON u.id = k.assignee_id AND u.deleted_at IS NULL
		WHERE k.ticket_id = $1 AND k.deleted_at IS NULL
		ORDER BY k.sort_order ASC, k.created_at ASC
	`, ticketID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tasks []model.ProjectTask
	for rows.Next() {
		var t model.ProjectTask
		if err := rows.Scan(
			&t.ID, &t.TicketID, &t.MilestoneID, &t.Title, &t.Description,
			&t.AssigneeID, &t.AssigneeName, &t.StartDate, &t.DueDate, &t.Status,
			&t.Weight, &t.SortOrder, &t.CompletedAt, &t.CreatedBy, &t.CreatedAt,
		); err != nil {
			return nil, err
		}
		tasks = append(tasks, t)
	}
	return tasks, rows.Err()
}

// GetTask mengambil satu tugas beserta ticket_id untuk validasi kepemilikan.
func (r *ProjectRepository) GetTask(ctx context.Context, taskID string) (*model.ProjectTask, error) {
	var t model.ProjectTask
	err := r.db.QueryRow(ctx, `
		SELECT id, ticket_id, milestone_id, title, COALESCE(description, ''), assignee_id,
		       start_date, due_date, status, weight, sort_order, completed_at, created_by
		FROM project_tasks WHERE id = $1 AND deleted_at IS NULL
	`, taskID).Scan(
		&t.ID, &t.TicketID, &t.MilestoneID, &t.Title, &t.Description, &t.AssigneeID,
		&t.StartDate, &t.DueDate, &t.Status, &t.Weight, &t.SortOrder, &t.CompletedAt, &t.CreatedBy,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrTaskNotFound
		}
		return nil, err
	}
	return &t, nil
}

// CreateTask menyimpan tugas baru.
func (r *ProjectRepository) CreateTask(ctx context.Context, t *model.ProjectTask) error {
	return r.db.QueryRow(ctx, `
		INSERT INTO project_tasks
			(ticket_id, milestone_id, title, description, assignee_id, start_date, due_date, status, weight, sort_order, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, 'todo', $8, $9, $10)
		RETURNING id, created_at
	`, t.TicketID, t.MilestoneID, t.Title, t.Description, t.AssigneeID, t.StartDate, t.DueDate, t.Weight, t.SortOrder, t.CreatedBy).
		Scan(&t.ID, &t.CreatedAt)
}

// UpdateTaskStatus mengubah status tugas + completed_at bila 'done'.
func (r *ProjectRepository) UpdateTaskStatus(ctx context.Context, taskID, status string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE project_tasks
		SET status = $2,
		    completed_at = CASE WHEN $2 = 'done' THEN now() ELSE NULL END,
		    updated_at = now()
		WHERE id = $1 AND deleted_at IS NULL
	`, taskID, status)
	return err
}

// UpdateTask mengubah seluruh field tugas yang bisa diedit PIC.
func (r *ProjectRepository) UpdateTask(ctx context.Context, t *model.ProjectTask) error {
	_, err := r.db.Exec(ctx, `
		UPDATE project_tasks
		SET title = $2, description = $3, assignee_id = $4, start_date = $5, due_date = $6,
		    weight = $7, sort_order = $8, milestone_id = $9, updated_at = now(),
		    due_reminder_sent_at = CASE WHEN $6 IS DISTINCT FROM due_date THEN NULL ELSE due_reminder_sent_at END
		WHERE id = $1 AND deleted_at IS NULL
	`, t.ID, t.Title, t.Description, t.AssigneeID, t.StartDate, t.DueDate, t.Weight, t.SortOrder, t.MilestoneID)
	return err
}

// DeleteTask menghapus tugas project.
func (r *ProjectRepository) DeleteTask(ctx context.Context, taskID string) error {
	tag, err := r.db.Exec(ctx, `UPDATE project_tasks SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`, taskID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrTaskNotFound
	}
	return nil
}

// Progress menghitung progres project tanpa menyimpannya.
// Tanpa milestone: bobot task done / total bobot (rumus lama).
// Dengan milestone: rata-rata tertimbang progress tiap milestone; task tanpa
// milestone menjadi satu grup implisit berbobot 1.
func (r *ProjectRepository) Progress(ctx context.Context, ticketID string) (done, total, percent int, err error) {
	err = r.db.QueryRow(ctx, `
		WITH task_group AS (
			SELECT
				k.milestone_id,
				SUM(k.weight) AS w_total,
				SUM(k.weight) FILTER (WHERE k.status = 'done') AS w_done
			FROM project_tasks k
			WHERE k.ticket_id = $1 AND k.deleted_at IS NULL
			GROUP BY k.milestone_id
		),
		groups AS (
			SELECT
				COALESCE(m.weight, 1) AS grp_weight,
				CASE
					WHEN COALESCE(tg.w_total, 0) = 0 THEN
						CASE WHEN m.status = 'selesai' THEN 100 ELSE 0 END
					ELSE (100 * COALESCE(tg.w_done, 0) / tg.w_total)::int
				END AS grp_progress
			FROM task_group tg
			LEFT JOIN project_milestones m
				ON m.id = tg.milestone_id AND m.deleted_at IS NULL
			WHERE tg.milestone_id IS NOT NULL OR m.id IS NOT NULL
		)
		SELECT
			COALESCE(SUM(grp_weight * grp_progress)::bigint, 0)::int,
			COALESCE(SUM(grp_weight)::bigint, 0)::int,
			COALESCE(
				(SUM(grp_weight * grp_progress) / NULLIF(SUM(grp_weight), 0))::int,
				0
			)
		FROM groups
	`, ticketID).Scan(&done, &total, &percent)
	return
}

// CountUnfinishedTasks menghitung task belum done yang masih aktif.
// Dipakai service saat mengeluarkan anggota.
func (r *ProjectRepository) CountUnfinishedTasks(ctx context.Context, ticketID, userID string) (int, error) {
	var n int
	err := r.db.QueryRow(ctx, `
		SELECT count(*)::int FROM project_tasks
		WHERE ticket_id = $1 AND assignee_id = $2
		  AND status <> 'done' AND deleted_at IS NULL
	`, ticketID, userID).Scan(&n)
	return n, err
}

// CountUnfinishedMilestones dipakai gate status project 'selesai'.
func (r *ProjectRepository) CountUnfinishedMilestones(ctx context.Context, ticketID string) (int, error) {
	var n int
	err := r.db.QueryRow(ctx, `
		SELECT count(*)::int FROM project_milestones
		WHERE ticket_id = $1 AND status <> 'selesai' AND deleted_at IS NULL
	`, ticketID).Scan(&n)
	return n, err
}

// ListMilestones mengembalikan milestone beserta progresnya (dihitung, bukan
// disimpan). Task soft-deleted tidak ikut.
func (r *ProjectRepository) ListMilestones(ctx context.Context, ticketID string) ([]model.ProjectMilestone, error) {
	rows, err := r.db.Query(ctx, `
		SELECT m.id, m.ticket_id, m.title, COALESCE(m.description, ''),
		       m.start_date, m.due_date, m.owner_id, m.status, m.weight, m.sort_order,
		       m.completed_at, m.created_by, m.created_at,
		       COALESCE((
		           SELECT (100 * SUM(k.weight) FILTER (WHERE k.status = 'done') / NULLIF(SUM(k.weight), 0))::int
		           FROM project_tasks k
		           WHERE k.milestone_id = m.id AND k.deleted_at IS NULL
		       ), CASE WHEN m.status = 'selesai' THEN 100 ELSE 0 END)
		FROM project_milestones m
		WHERE m.ticket_id = $1 AND m.deleted_at IS NULL
		ORDER BY m.sort_order ASC, m.created_at ASC
	`, ticketID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []model.ProjectMilestone
	for rows.Next() {
		var m model.ProjectMilestone
		if err := rows.Scan(
			&m.ID, &m.TicketID, &m.Title, &m.Description,
			&m.StartDate, &m.DueDate, &m.OwnerID, &m.Status, &m.Weight, &m.SortOrder,
			&m.CompletedAt, &m.CreatedBy, &m.CreatedAt, &m.Progress,
		); err != nil {
			return nil, err
		}
		list = append(list, m)
	}
	return list, rows.Err()
}

func (r *ProjectRepository) GetMilestone(ctx context.Context, id string) (*model.ProjectMilestone, error) {
	var m model.ProjectMilestone
	err := r.db.QueryRow(ctx, `
		SELECT id, ticket_id, title, COALESCE(description, ''), start_date,
		       due_date, owner_id, status, weight, sort_order, completed_at, created_by, created_at
		FROM project_milestones WHERE id = $1 AND deleted_at IS NULL
	`, id).Scan(
		&m.ID, &m.TicketID, &m.Title, &m.Description, &m.StartDate,
		&m.DueDate, &m.OwnerID, &m.Status, &m.Weight, &m.SortOrder, &m.CompletedAt, &m.CreatedBy, &m.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrTaskNotFound
		}
		return nil, err
	}
	return &m, nil
}

func (r *ProjectRepository) CreateMilestone(ctx context.Context, m *model.ProjectMilestone) error {
	return r.db.QueryRow(ctx, `
		INSERT INTO project_milestones
			(ticket_id, title, description, start_date, due_date, owner_id, status, weight, sort_order, created_by)
		VALUES ($1, $2, $3, $4, $5, $6, 'belum_mulai', $7, $8, $9)
		RETURNING id, created_at
	`, m.TicketID, m.Title, m.Description, m.StartDate, m.DueDate, m.OwnerID, m.Weight, m.SortOrder, m.CreatedBy).
		Scan(&m.ID, &m.CreatedAt)
}

func (r *ProjectRepository) UpdateMilestone(ctx context.Context, m *model.ProjectMilestone) error {
	_, err := r.db.Exec(ctx, `
		UPDATE project_milestones
		SET title = $2, description = $3, start_date = $4, due_date = $5,
		    owner_id = $6, weight = $7, sort_order = $8, updated_at = now()
		WHERE id = $1 AND deleted_at IS NULL
	`, m.ID, m.Title, m.Description, m.StartDate, m.DueDate, m.OwnerID, m.Weight, m.SortOrder)
	return err
}

func (r *ProjectRepository) SetMilestoneStatus(ctx context.Context, id, status string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE project_milestones
		SET status = $2,
		    completed_at = CASE WHEN $2 = 'selesai' THEN now() ELSE NULL END,
		    updated_at = now()
		WHERE id = $1 AND deleted_at IS NULL
	`, id, status)
	return err
}

func (r *ProjectRepository) DeleteMilestone(ctx context.Context, id string) error {
	tag, err := r.db.Exec(ctx, `UPDATE project_milestones SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrTaskNotFound
	}
	return nil
}

// ReorderMilestones menyetel urutan dari slice ID yang diberikan.
func (r *ProjectRepository) ReorderMilestones(ctx context.Context, ticketID string, ids []string) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	for i, id := range ids {
		_, err = tx.Exec(ctx, `
			UPDATE project_milestones SET sort_order = $1, updated_at = now()
			WHERE id = $2 AND ticket_id = $3 AND deleted_at IS NULL
		`, i, id, ticketID)
		if err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// FinishDoneTasksAndMilestones dipanggil setelah status task berubah 'done':
// milestone dengan semua task done otomatis 'selesai'. Milestone tanpa task
// tidak disentuh (boleh diselesaikan manual).
func (r *ProjectRepository) SyncMilestoneStatuses(ctx context.Context, ticketID string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE project_milestones m
		SET status = 'selesai', completed_at = COALESCE(m.completed_at, now()), updated_at = now()
		WHERE m.ticket_id = $1 AND m.deleted_at IS NULL AND m.status <> 'selesai'
		  AND EXISTS (SELECT 1 FROM project_tasks k WHERE k.milestone_id = m.id AND k.deleted_at IS NULL)
		  AND NOT EXISTS (
		      SELECT 1 FROM project_tasks k
		      WHERE k.milestone_id = m.id AND k.deleted_at IS NULL AND k.status <> 'done'
		  )
	`, ticketID)
	return err
}

// CreateProposal menyimpan versi proposal baru (doc_type 'proposal' pada
// tabel ticket_signoffs yang sudah ada — kolom doc_type VARCHAR, bukan enum).
func (r *ProjectRepository) CreateProposal(ctx context.Context, p *model.ProjectProposal) error {
	// Nomor dokumen PROP-2026-0001 dibuat di DB supaya unik walau banyak
	// pengajuan bersamaan (pola yang sama dengan PA-/BAST- yang sudah ada).
	return r.db.QueryRow(ctx, `
		INSERT INTO ticket_signoffs
			(ticket_id, doc_type, doc_number, file_url, file_name, file_type,
			 file_size, signed_by_name, note, status, uploaded_by)
		VALUES ($1, 'proposal', next_document_number('PROP'), $2, $3, $4,
		        $5, $6, $7, 'diajukan', $8)
		RETURNING id, doc_number, created_at
	`, p.TicketID, p.FileURL, p.FileName, p.FileType,
		p.FileSize, p.SignedByName, p.Notes, p.CreatedBy).
		Scan(&p.ID, &p.DocNumber, &p.CreatedAt)
}

// GetProposal mengembalikan proposal terbaru apa pun statusnya (diajukan/
// disetujui/ditolak). Dipakai service saat mengecek status pengajuan.
func (r *ProjectRepository) GetProposal(ctx context.Context, ticketID string) (*model.ProjectProposal, error) {
	var p model.ProjectProposal
	var approverID *string
	var uploadedBy string
	err := r.db.QueryRow(ctx, `
		SELECT id, ticket_id, COALESCE(doc_number, ''), file_url, file_name,
		       COALESCE(file_type, ''), COALESCE(file_size, 0), COALESCE(version, 1),
		       COALESCE(note, ''), COALESCE(status, ''), approver_id::text,
		       approved_at, uploaded_by, created_at
		FROM ticket_signoffs
		WHERE ticket_id = $1 AND doc_type = 'proposal'
		ORDER BY created_at DESC LIMIT 1
	`, ticketID).Scan(
		&p.ID, &p.TicketID, &p.DocNumber, &p.FileURL, &p.FileName,
		&p.FileType, &p.FileSize, &p.Version, &p.Notes, &p.Status,
		&approverID, &p.ApprovedAt, &uploadedBy, &p.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	p.ApproverID = approverID
	p.CreatedBy = uploadedBy
	return &p, nil
}

// GetApprovedProposal mengembalikan proposal bersetatus 'disetujui' terbaru.
// Dipakai gate transisi ke 'berjalan'.
func (r *ProjectRepository) GetApprovedProposal(ctx context.Context, ticketID string) (*model.ProjectProposal, error) {
	var p model.ProjectProposal
	var approverID *string
	var uploadedBy string
	err := r.db.QueryRow(ctx, `
		SELECT id, ticket_id, COALESCE(doc_number, ''), file_url, file_name,
		       COALESCE(status, ''), approver_id::text, approved_at, uploaded_by, created_at
		FROM ticket_signoffs
		WHERE ticket_id = $1 AND doc_type = 'proposal' AND status = 'disetujui'
		ORDER BY created_at DESC LIMIT 1
	`, ticketID).Scan(
		&p.ID, &p.TicketID, &p.DocNumber, &p.FileURL, &p.FileName,
		&p.Status, &approverID, &p.ApprovedAt, &uploadedBy, &p.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrProposalNotApproved
		}
		return nil, err
	}
	p.ApproverID = approverID
	p.CreatedBy = uploadedBy
	return &p, nil
}

// DecideProposal menyetujui/menolak proposal. Menolak semua proposal lain
// untuk tiket yang sama (hanya satu versi aktif yang disetujui).
func (r *ProjectRepository) DecideProposal(ctx context.Context, proposalID, decision string, approverID string) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var ticketID string
	err = tx.QueryRow(ctx, `
		UPDATE ticket_signoffs
		SET status = $2, approver_id = $3, approved_at = now()
		WHERE id = $1 AND doc_type = 'proposal' AND status = 'diajukan'
		RETURNING ticket_id
	`, proposalID, decision, approverID).Scan(&ticketID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrProposalNotFound
		}
		return err
	}

	if decision == "disetujui" {
		_, err = tx.Exec(ctx, `
			UPDATE ticket_signoffs
			SET status = 'ditolak'
			WHERE ticket_id = $1 AND doc_type = 'proposal' AND id <> $2 AND status = 'diajukan'
		`, ticketID, proposalID)
		if err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

var ErrProposalNotFound = errors.New("proposal tidak ditemukan atau sudah diputuskan")

// GetProposalByID mengambil satu versi proposal berdasarkan id.
func (r *ProjectRepository) GetProposalByID(ctx context.Context, proposalID string) (*model.ProjectProposal, error) {
	var p model.ProjectProposal
	var approverID, uploadedBy *string
	err := r.db.QueryRow(ctx, `
		SELECT id, ticket_id, COALESCE(doc_number, ''), file_url, file_name,
		       COALESCE(file_type, ''), COALESCE(file_size, 0), COALESCE(signed_by_name, ''),
		       COALESCE(status, ''), COALESCE(version, 1), COALESCE(note, ''),
		       approver_id::text, approved_at, uploaded_by, created_at
		FROM ticket_signoffs
		WHERE id = $1 AND doc_type = 'proposal'
	`, proposalID).Scan(
		&p.ID, &p.TicketID, &p.DocNumber, &p.FileURL, &p.FileName,
		&p.FileType, &p.FileSize, &p.SignedByName, &p.Status, &p.Version,
		&p.Notes, &approverID, &p.ApprovedAt, &uploadedBy, &p.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	p.ApproverID = approverID
	if uploadedBy != nil {
		p.CreatedBy = *uploadedBy
	}
	return &p, nil
}

// ListProposals mengembalikan SEMUA versi proposal satu project, terbaru duluan.
func (r *ProjectRepository) ListProposals(ctx context.Context, ticketID string) ([]model.ProjectProposal, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, ticket_id, COALESCE(doc_number, ''), file_url, file_name,
		       COALESCE(file_type, ''), COALESCE(file_size, 0), COALESCE(signed_by_name, ''),
		       COALESCE(status, ''), COALESCE(version, 1), COALESCE(note, ''),
		       approver_id::text, approved_at, uploaded_by, created_at
		FROM ticket_signoffs
		WHERE ticket_id = $1 AND doc_type = 'proposal'
		ORDER BY created_at DESC
	`, ticketID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []model.ProjectProposal
	for rows.Next() {
		var p model.ProjectProposal
		var approverID, uploadedBy *string
		if err := rows.Scan(
			&p.ID, &p.TicketID, &p.DocNumber, &p.FileURL, &p.FileName,
			&p.FileType, &p.FileSize, &p.SignedByName, &p.Status, &p.Version,
			&p.Notes, &approverID, &p.ApprovedAt, &uploadedBy, &p.CreatedAt,
		); err != nil {
			return nil, err
		}
		p.ApproverID = approverID
		if uploadedBy != nil {
			p.CreatedBy = *uploadedBy
		}
		list = append(list, p)
	}
	return list, rows.Err()
}

// SaveProposalDecision menyimpan alasan penolakan ke note versi proposal.
func (r *ProjectRepository) SaveProposalDecision(ctx context.Context, proposalID, notes string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE ticket_signoffs SET note = $2 WHERE id = $1 AND doc_type = 'proposal'
	`, proposalID, notes)
	return err
}

// CreateProposalVersion menyimpan versi baru dengan nomor versi berikutnya.
func (r *ProjectRepository) CreateProposalVersion(ctx context.Context, p *model.ProjectProposal) error {
	return r.db.QueryRow(ctx, `
		INSERT INTO ticket_signoffs
			(ticket_id, doc_type, doc_number, file_url, file_name, file_type,
			 file_size, signed_by_name, note, status, version, uploaded_by)
		VALUES ($1, 'proposal', next_document_number('PROP'), $2, $3, $4,
		        $5, $6, $7, 'diajukan', $8, $9)
		RETURNING id, doc_number, created_at
	`, p.TicketID, p.FileURL, p.FileName, p.FileType,
		p.FileSize, p.SignedByName, p.Notes, p.Version, p.CreatedBy).
		Scan(&p.ID, &p.DocNumber, &p.CreatedAt)
}

// isUniqueViolation — kode SQLSTATE 23505 (unique_violation) pgx.
func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

// DueProjectTask dipakai job pengingat tenggat khusus project.
type DueProjectTask struct {
	TaskID     string
	TicketID   string
	Title      string
	Assignee   string
	DueDate    time.Time
	RemindedAt *time.Time
	Overdue    bool
}

// ListDueProjectTasks mengambil task berjalan dengan tenggat H-1 atau terlewat.
// Hanya project berjalan; task done/terhapus dilewati. Tidak menyentuh
// CheckSLAReminders ataupun tiket regular.
func (r *ProjectRepository) ListDueProjectTasks(ctx context.Context, now time.Time) ([]DueProjectTask, error) {
	rows, err := r.db.Query(ctx, `
		SELECT k.id, k.ticket_id, k.title, COALESCE(u.name, ''), k.due_date::timestamptz,
		       k.due_reminder_sent_at, (k.due_date < CURRENT_DATE)
		FROM project_tasks k
		JOIN tickets t ON t.id = k.ticket_id
		LEFT JOIN users u ON u.id = k.assignee_id AND u.deleted_at IS NULL
		WHERE k.deleted_at IS NULL AND k.status <> 'done' AND k.due_date IS NOT NULL
		  AND t.project_status = 'berjalan'
		  AND ((k.due_date = CURRENT_DATE + 1 AND k.due_reminder_sent_at IS NULL)
		       OR (k.due_date < CURRENT_DATE AND (k.due_reminder_sent_at IS NULL
		           OR k.due_reminder_sent_at < k.due_date::timestamptz)))
		ORDER BY k.due_date ASC
	`, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []DueProjectTask
	for rows.Next() {
		var d DueProjectTask
		if err := rows.Scan(&d.TaskID, &d.TicketID, &d.Title, &d.Assignee,
			&d.DueDate, &d.RemindedAt, &d.Overdue); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// MarkTaskReminderSent menandai pengingat sudah dikirim (sekali per tenggat).
func (r *ProjectRepository) MarkTaskReminderSent(ctx context.Context, taskID string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE project_tasks SET due_reminder_sent_at = now() WHERE id = $1 AND deleted_at IS NULL
	`, taskID)
	return err
}

// CountActivePIC menghitung PIC aktif pada project.
func (r *ProjectRepository) CountActivePIC(ctx context.Context, ticketID string) (int, error) {
	var n int
	err := r.db.QueryRow(ctx, `
		SELECT count(*) FROM ticket_members
		WHERE ticket_id = $1 AND role = 'pic' AND removed_at IS NULL
	`, ticketID).Scan(&n)
	return n, err
}

// RecordProjectHistory mencatat perubahan tanggal ke riwayat tiket.
func (r *ProjectRepository) RecordProjectHistory(ctx context.Context, ticketID, actorID, field, from, to string) error {
	_, err := r.db.Exec(ctx, `
		INSERT INTO project_histories (ticket_id, actor_id, action, note, created_at)
		VALUES ($1, $2, 'project_date_changed', $3, now())
	`, ticketID, actorID, fmt.Sprintf("%s: %s -> %s", field, from, to))
	return err
}

// CountTasksInMilestone menghitung tugas aktif pada sebuah milestone.
func (r *ProjectRepository) CountTasksInMilestone(ctx context.Context, milestoneID string) (int, error) {
	var n int
	err := r.db.QueryRow(ctx, `
		SELECT count(*) FROM project_tasks WHERE milestone_id = $1 AND deleted_at IS NULL
	`, milestoneID).Scan(&n)
	return n, err
}
