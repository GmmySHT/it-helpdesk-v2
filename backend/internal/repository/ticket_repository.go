package repository

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"ticketing-it/backend/internal/model"
)

var ErrTicketNotFound = errors.New("tiket tidak ditemukan")
var ErrTicketAlreadyClaimed = errors.New("tiket sudah diklaim staf lain atau tidak dalam status yang bisa diklaim")
var ErrTicketNotResolvable = errors.New("tiket tidak dalam status 'claimed' atau kamu bukan staf yang mengklaim tiket ini")

type TicketRepository struct {
	db *pgxpool.Pool
}

func NewTicketRepository(db *pgxpool.Pool) *TicketRepository {
	return &TicketRepository{db: db}
}

// Create menyimpan tiket baru. Status dan assigned_* sudah ditentukan
// oleh service SEBELUM sampai di sini (repository tidak berisi logika bisnis,
// hanya mengeksekusi query).
func (r *TicketRepository) Create(ctx context.Context, t *model.Ticket) error {
	query := `
		INSERT INTO tickets (
			title, description, category_id, priority, status,
			created_by, created_for, assigned_to, assigned_by, assigned_at, sla_deadline
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		RETURNING id, reopen_count, created_at
	`
	err := r.db.QueryRow(ctx, query,
		t.Title, t.Description, t.CategoryID, t.Priority, t.Status,
		t.CreatedBy, t.CreatedFor, t.AssignedTo, t.AssignedBy, t.AssignedAt, t.SLADeadline,
	).Scan(&t.ID, &t.ReopenCount, &t.CreatedAt)
	return err
}

// List mengambil daftar tiket, opsional difilter berdasarkan status.
// Filter status kosong ("") berarti ambil semua tiket.
//
// LEFT JOIN (bukan JOIN biasa) dipakai karena claimed_by/closed_by boleh
// NULL (tiket yang belum diklaim/ditutup) — kalau pakai JOIN biasa, baris
// tiket yang belum diklaim akan HILANG dari hasil sama sekali.
func (r *TicketRepository) List(ctx context.Context, statusFilter string) ([]model.Ticket, error) {
	query := `
		SELECT t.id, t.title, t.description, t.category_id, t.priority, t.status,
			t.created_by, creator.name,
			t.created_for, creator2.name,
			t.assigned_to, assignee.name, t.assigned_by, t.assigned_at,
			t.claimed_by, claimer.name, t.claimed_at, t.claim_type,
			t.sla_deadline, t.last_resolved_at, t.reopen_count,
			t.closed_by, closer.name, t.closed_at, t.created_at
		FROM tickets t
		LEFT JOIN users creator ON creator.id = t.created_by
		LEFT JOIN users creator2 ON creator2.id = t.created_for
		LEFT JOIN users assignee ON assignee.id = t.assigned_to
		LEFT JOIN users claimer ON claimer.id = t.claimed_by
		LEFT JOIN users closer ON closer.id = t.closed_by
	`
	args := []interface{}{}
	if statusFilter != "" {
		query += " WHERE t.status = $1"
		args = append(args, statusFilter)
	}
	query += " ORDER BY t.created_at DESC"

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tickets []model.Ticket
	for rows.Next() {
		var t model.Ticket
		if err := rows.Scan(
			&t.ID, &t.Title, &t.Description, &t.CategoryID, &t.Priority, &t.Status,
			&t.CreatedBy, &t.CreatedByName,
			&t.CreatedFor, &t.CreatedForName,
			&t.AssignedTo, &t.AssignedToName, &t.AssignedBy, &t.AssignedAt,
			&t.ClaimedBy, &t.ClaimedByName, &t.ClaimedAt, &t.ClaimType,
			&t.SLADeadline, &t.LastResolvedAt, &t.ReopenCount,
			&t.ClosedBy, &t.ClosedByName, &t.ClosedAt, &t.CreatedAt,
		); err != nil {
			return nil, err
		}
		tickets = append(tickets, t)
	}
	return tickets, rows.Err()
}

// ListForUser returns tickets created by OR for the user (untuk role user biasa).
func (r *TicketRepository) ListForUser(ctx context.Context, statusFilter, userID string) ([]model.Ticket, error) {
	query := `
		SELECT t.id, t.title, t.description, t.category_id, t.priority, t.status,
			t.created_by, creator.name,
			t.created_for, creator2.name,
			t.assigned_to, assignee.name, t.assigned_by, t.assigned_at,
			t.claimed_by, claimer.name, t.claimed_at, t.claim_type,
			t.sla_deadline, t.last_resolved_at, t.reopen_count,
			t.closed_by, closer.name, t.closed_at, t.created_at
		FROM tickets t
		LEFT JOIN users creator ON creator.id = t.created_by
		LEFT JOIN users creator2 ON creator2.id = t.created_for
		LEFT JOIN users assignee ON assignee.id = t.assigned_to
		LEFT JOIN users claimer ON claimer.id = t.claimed_by
		LEFT JOIN users closer ON closer.id = t.closed_by
		WHERE (t.created_by = $1 OR t.created_for = $1)
	`
	args := []interface{}{userID}
	if statusFilter != "" {
		query += " AND t.status = $2"
		args = append(args, statusFilter)
	}
	query += " ORDER BY t.created_at DESC"

	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tickets []model.Ticket
	for rows.Next() {
		var t model.Ticket
		if err := rows.Scan(
			&t.ID, &t.Title, &t.Description, &t.CategoryID, &t.Priority, &t.Status,
			&t.CreatedBy, &t.CreatedByName,
			&t.CreatedFor, &t.CreatedForName,
			&t.AssignedTo, &t.AssignedToName, &t.AssignedBy, &t.AssignedAt,
			&t.ClaimedBy, &t.ClaimedByName, &t.ClaimedAt, &t.ClaimType,
			&t.SLADeadline, &t.LastResolvedAt, &t.ReopenCount,
			&t.ClosedBy, &t.ClosedByName, &t.ClosedAt, &t.CreatedAt,
		); err != nil {
			return nil, err
		}
		tickets = append(tickets, t)
	}
	return tickets, rows.Err()
}

func (r *TicketRepository) FindByID(ctx context.Context, id string) (*model.Ticket, error) {
	query := `
		SELECT t.id, t.title, t.description, t.category_id, t.priority, t.status,
			t.created_by, creator.name,
			t.created_for, creator2.name,
			t.assigned_to, assignee.name, t.assigned_by, t.assigned_at,
			t.claimed_by, claimer.name, t.claimed_at, t.claim_type,
			t.sla_deadline, t.last_resolved_at, t.reopen_count,
			t.closed_by, closer.name, t.closed_at, t.created_at
		FROM tickets t
		LEFT JOIN users creator ON creator.id = t.created_by
		LEFT JOIN users creator2 ON creator2.id = t.created_for
		LEFT JOIN users assignee ON assignee.id = t.assigned_to
		LEFT JOIN users claimer ON claimer.id = t.claimed_by
		LEFT JOIN users closer ON closer.id = t.closed_by
		WHERE t.id = $1
	`
	var t model.Ticket
	err := r.db.QueryRow(ctx, query, id).Scan(
		&t.ID, &t.Title, &t.Description, &t.CategoryID, &t.Priority, &t.Status,
		&t.CreatedBy, &t.CreatedByName,
		&t.CreatedFor, &t.CreatedForName,
		&t.AssignedTo, &t.AssignedToName, &t.AssignedBy, &t.AssignedAt,
		&t.ClaimedBy, &t.ClaimedByName, &t.ClaimedAt, &t.ClaimType,
		&t.SLADeadline, &t.LastResolvedAt, &t.ReopenCount,
		&t.ClosedBy, &t.ClosedByName, &t.ClosedAt, &t.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrTicketNotFound
		}
		return nil, err
	}
	return &t, nil
}

// Claim menandai tiket sebagai diklaim oleh seorang staf.
//
// Kondisi WHERE di query ini adalah kunci untuk mencegah race condition:
// UPDATE hanya berhasil kalau status tiket MASIH 'unassigned'/'assigned' DAN
// (untuk kasus assigned) staf yang klaim memang staf yang ditunjuk.
// Kalau dua staf klik claim di waktu yang nyaris bersamaan, hanya SATU
// request yang akan mengubah baris (RowsAffected = 1); yang kedua akan
// mendapati RowsAffected = 0 dan kita kembalikan ErrTicketAlreadyClaimed.
// Ini jauh lebih aman dibanding SELECT dulu baru UPDATE terpisah, karena
// antara SELECT dan UPDATE ada celah waktu yang bisa diselip request lain.
// Claim TIDAK LAGI menyentuh kolom sla_deadline — deadline sudah ditentukan
// sejak tiket dibuat (lihat TicketService.Create), jadi claim tidak boleh
// menggeser/reset deadline itu. Kalau di-reset tiap claim, deadline jadi
// tidak berarti sebagai "batas waktu keseluruhan tiket" seperti yang
// diinginkan untuk sistem reminder SLA.
func (r *TicketRepository) Claim(ctx context.Context, ticketID, claimedBy string, claimType model.ClaimType, assignedTo *string) error {
	query := `
		UPDATE tickets
		SET status = 'claimed',
			claimed_by = $1,
			claimed_at = now(),
			claim_type = $2,
			assigned_to = $3
		WHERE id = $4
			AND status IN ('unassigned', 'assigned')
			AND (assigned_to IS NULL OR assigned_to = $1)
	`
	tag, err := r.db.Exec(ctx, query, claimedBy, claimType, assignedTo, ticketID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrTicketAlreadyClaimed
	}
	return nil
}

// Resolve menandai tiket sebagai selesai dikerjakan staf, menunggu review leader.
// WHERE status='claimed' AND claimed_by=$2 memastikan hanya staf yang SEDANG
// mengerjakan tiket ini yang bisa resolve — bukan staf lain, bukan juga
// tiket yang belum diklaim atau sudah lewat tahap resolve.
func (r *TicketRepository) Resolve(ctx context.Context, ticketID, claimedBy string) error {
	query := `
		UPDATE tickets
		SET status = 'resolved',
			last_resolved_at = now()
		WHERE id = $1
			AND status = 'claimed'
			AND claimed_by = $2
	`
	tag, err := r.db.Exec(ctx, query, ticketID, claimedBy)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrTicketNotResolvable
	}
	return nil
}

// UpdateDetails mengubah title/description/category/priority tiket —
// dipakai leader untuk mengoreksi tiket kalau ada perubahan/kesalahan
// setelah dibuat. Bisa dilakukan KAPAN SAJA selama tiket belum closed
// (validasi status & role dilakukan di service, bukan di sini).
func (r *TicketRepository) UpdateDetails(ctx context.Context, ticketID, title, description, categoryID string, priority model.TicketPriority) error {
	_, err := r.db.Exec(ctx, `
		UPDATE tickets
		SET title = $1, description = $2, category_id = $3, priority = $4
		WHERE id = $5
	`, title, description, categoryID, priority, ticketID)
	return err
}

// Close menandai tiket sebagai selesai FINAL. Sesuai flowchart, hanya bisa
// AtRiskTicket adalah ringkasan tiket yang mendekati/lewat deadline —
// dipakai widget "Tiket Berisiko" di dashboard leader/admin.
type AtRiskTicket struct {
	ID          string     `json:"id"`
	Title       string     `json:"title"`
	Status      string     `json:"status"`
	SLADeadline *time.Time `json:"sla_deadline"`
	IsOverdue   bool       `json:"is_overdue"`
}

// ListAtRisk mengambil tiket yang masih berjalan (belum resolved/closed)
// dan punya deadline, diurutkan dari yang PALING mendesak (deadline
// terdekat/sudah lewat duluan) — supaya yang paling butuh perhatian
// muncul di paling atas.
func (r *TicketRepository) ListAtRisk(ctx context.Context, limit int) ([]AtRiskTicket, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, title, status, sla_deadline
		FROM tickets
		WHERE status NOT IN ('resolved', 'closed') AND sla_deadline IS NOT NULL
		ORDER BY sla_deadline ASC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	now := time.Now()
	var list []AtRiskTicket
	for rows.Next() {
		var t AtRiskTicket
		if err := rows.Scan(&t.ID, &t.Title, &t.Status, &t.SLADeadline); err != nil {
			return nil, err
		}
		if t.SLADeadline != nil {
			t.IsOverdue = now.After(*t.SLADeadline)
		}
		list = append(list, t)
	}
	return list, rows.Err()
}

// dilakukan dari status 'resolved' (setelah leader review dan menganggap sesuai) —
// role leader/admin sudah divalidasi di service, di sini tinggal jaga status-nya.
func (r *TicketRepository) Close(ctx context.Context, ticketID, closedBy string) error {
	query := `
		UPDATE tickets
		SET status = 'closed',
			closed_by = $1,
			closed_at = now()
		WHERE id = $2 AND status = 'resolved'
	`
	tag, err := r.db.Exec(ctx, query, closedBy, ticketID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrTicketNotResolvable
	}
	return nil
}

// ListSLACandidates mengambil semua tiket yang MASIH berjalan (belum
// resolved/closed) dan sudah punya sla_deadline — inilah kandidat yang
// dicek berkala oleh background job pengingat SLA.
func (r *TicketRepository) ListSLACandidates(ctx context.Context) ([]model.Ticket, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id, title, status, category_id, priority, created_by,
			assigned_to, claimed_by, sla_deadline, sla_reminder_sent_at, sla_overdue_notified_at
		FROM tickets
		WHERE status NOT IN ('resolved', 'closed') AND sla_deadline IS NOT NULL
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tickets []model.Ticket
	for rows.Next() {
		var t model.Ticket
		if err := rows.Scan(
			&t.ID, &t.Title, &t.Status, &t.CategoryID, &t.Priority, &t.CreatedBy,
			&t.AssignedTo, &t.ClaimedBy, &t.SLADeadline, &t.SLAReminderSentAt, &t.SLAOverdueNotifiedAt,
		); err != nil {
			return nil, err
		}
		tickets = append(tickets, t)
	}
	return tickets, rows.Err()
}

func (r *TicketRepository) MarkSLAReminderSent(ctx context.Context, ticketID string) error {
	_, err := r.db.Exec(ctx, `UPDATE tickets SET sla_reminder_sent_at = now() WHERE id = $1`, ticketID)
	return err
}

func (r *TicketRepository) MarkSLAOverdueNotified(ctx context.Context, ticketID string) error {
	_, err := r.db.Exec(ctx, `UPDATE tickets SET sla_overdue_notified_at = now() WHERE id = $1`, ticketID)
	return err
}
