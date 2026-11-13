package repository

import (
	"context"
	"errors"
	"fmt"
	"strconv"
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
//
// Kode tiket (SIMRS-00019) dibuat di dalam transaksi yang sama dengan INSERT:
// penomoran memakai UPDATE ... RETURNING pada ticket_code_counters, yang
// bersifat atomik, jadi dua tiket yang dibuat bersamaan tidak akan pernah
// mendapat nomor yang sama.
func (r *TicketRepository) Create(ctx context.Context, t *model.Ticket) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var prefix string
	// Prefix diambil dari kategori. Kalau kategori tidak ditemukan, INSERT
	// di bawah akan gagal pada foreign key dan transaksi di-rollback.
	err = tx.QueryRow(ctx, `SELECT code FROM categories WHERE id = $1`, t.CategoryID).Scan(&prefix)
	if err != nil {
		return err
	}

	var lastNumber int
	err = tx.QueryRow(ctx, `
		INSERT INTO ticket_code_counters (prefix, last_number)
		VALUES ($1, 1)
		ON CONFLICT (prefix) DO UPDATE
			SET last_number = ticket_code_counters.last_number + 1
		RETURNING last_number
	`, prefix).Scan(&lastNumber)
	if err != nil {
		return err
	}

	t.TicketCode = fmt.Sprintf("%s-%05d", prefix, lastNumber)

	query := `
		INSERT INTO tickets (
			ticket_code, title, description, category_id, priority, status,
			created_by, created_for, assigned_to, assigned_by, assigned_at, sla_deadline
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		RETURNING id, reopen_count, created_at
	`
	err = tx.QueryRow(ctx, query,
		t.TicketCode, t.Title, t.Description, t.CategoryID, t.Priority, t.Status,
		t.CreatedBy, t.CreatedFor, t.AssignedTo, t.AssignedBy, t.AssignedAt, t.SLADeadline,
	).Scan(&t.ID, &t.ReopenCount, &t.CreatedAt)
	if err != nil {
		return err
	}

	return tx.Commit(ctx)
}

// ticketListSelect adalah SELECT + JOIN dasar untuk semua query daftar/detail
// tiket. Dipakai bersama supaya urutan kolom yang di-Scan selalu sinkron
// dengan queryTickets/FindByID.
const ticketListSelect = `
	SELECT t.id, COALESCE(t.ticket_code, ''), t.title, t.description, t.category_id, t.priority, t.status,
		t.created_by, creator.name,
		t.created_for, creator2.name,
		t.assigned_to, assignee.name, t.assigned_by, t.assigned_at,
		t.claimed_by, claimer.name, t.claimed_at, t.claim_type,
		t.sla_deadline, t.last_resolved_at, t.reopen_count,
		t.closed_by, closer.name, t.closed_at, t.created_at,
	EXISTS (SELECT 1 FROM ticket_signoffs s WHERE s.ticket_id = t.id) AS has_signoff
	FROM tickets t
	LEFT JOIN users creator ON creator.id = t.created_by
	LEFT JOIN users creator2 ON creator2.id = t.created_for
	LEFT JOIN users assignee ON assignee.id = t.assigned_to
	LEFT JOIN users claimer ON claimer.id = t.claimed_by
	LEFT JOIN users closer ON closer.id = t.closed_by
`

// List mengambil daftar tiket, opsional difilter berdasarkan status.
// Filter status kosong ("") berarti ambil semua tiket.
//
// LEFT JOIN (bukan JOIN biasa) dipakai karena claimed_by/closed_by boleh
// NULL (tiket yang belum diklaim/ditutup) — kalau pakai JOIN biasa, baris
// tiket yang belum diklaim akan HILANG dari hasil sama sekali.
func (r *TicketRepository) List(ctx context.Context, statusFilter string) ([]model.Ticket, error) {
	return r.ListFiltered(ctx, TicketFilter{Status: statusFilter})
}

// TicketFilter menampung semua filter daftar tiket. Kosong ("") berarti
// tidak memfilter kolom tersebut. ReporterID mencocokkan pelapor (created_by)
// ATAU pihak yang ditiketkan (created_for) — dari sudut pandang helpdesk,
// keduanya adalah "unit pelapor".
type TicketFilter struct {
	Status     string
	ReporterID string
	AssigneeID string
}

// buildFilterClause menyusun potongan WHERE + args secara berurutan, supaya
// penomoran $1/$2 dst tidak perlu dihitung manual di tiap query.
func (f TicketFilter) buildFilterClause(startIdx int) (string, []interface{}) {
	clause := ""
	args := []interface{}{}
	idx := startIdx

	if f.Status != "" {
		idx++
		clause += " AND t.status = $" + itoa(idx)
		args = append(args, f.Status)
	}
	if f.ReporterID != "" {
		idx++
		clause += " AND (t.created_by = $" + itoa(idx) + " OR t.created_for = $" + itoa(idx) + ")"
		args = append(args, f.ReporterID)
	}
	if f.AssigneeID != "" {
		idx++
		clause += " AND (t.claimed_by = $" + itoa(idx) + " OR t.assigned_to = $" + itoa(idx) + ")"
		args = append(args, f.AssigneeID)
	}
	return clause, args
}

func itoa(n int) string {
	return strconv.Itoa(n)
}

func (r *TicketRepository) ListFiltered(ctx context.Context, f TicketFilter) ([]model.Ticket, error) {
	query := ticketListSelect + " WHERE t.deleted_at IS NULL"
	clause, args := f.buildFilterClause(0)
	query += clause + " ORDER BY t.created_at DESC"
	return r.queryTickets(ctx, query, args...)
}

// queryTickets menjalankan query daftar tiket dan memindai hasilnya ke
// []model.Ticket — dipakai bersama oleh List/ListFiltered/ListForUser supaya
// urutan Scan tidak pernah berbeda antar query.
func (r *TicketRepository) queryTickets(ctx context.Context, query string, args ...interface{}) ([]model.Ticket, error) {
	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tickets []model.Ticket
	for rows.Next() {
		var t model.Ticket
		if err := rows.Scan(
			&t.ID, &t.TicketCode, &t.Title, &t.Description, &t.CategoryID, &t.Priority, &t.Status,
			&t.CreatedBy, &t.CreatedByName,
			&t.CreatedFor, &t.CreatedForName,
			&t.AssignedTo, &t.AssignedToName, &t.AssignedBy, &t.AssignedAt,
			&t.ClaimedBy, &t.ClaimedByName, &t.ClaimedAt, &t.ClaimType,
			&t.SLADeadline, &t.LastResolvedAt, &t.ReopenCount,
			&t.ClosedBy, &t.ClosedByName, &t.ClosedAt, &t.CreatedAt,
			&t.HasSignoff,
		); err != nil {
			return nil, err
		}
		tickets = append(tickets, t)
	}
	return tickets, rows.Err()
}

// ListForUser returns tickets created by OR for the user (untuk role user biasa).
// Filter status/pelapor/pengerja tetap dihormati: user biasa hanya melihat
// tiketnya sendiri, jadi filter pelapor efektif mengosongkan hasil bila ia
// memilih orang lain — itu perilaku yang benar, bukan bug.
func (r *TicketRepository) ListForUser(ctx context.Context, f TicketFilter, userID string) ([]model.Ticket, error) {
	query := ticketListSelect + `
		WHERE (t.created_by = $1 OR t.created_for = $1)
		AND t.deleted_at IS NULL
	`
	args := []interface{}{userID}
	clause, extra := f.buildFilterClause(1)
	query += clause + " ORDER BY t.created_at DESC"
	args = append(args, extra...)
	return r.queryTickets(ctx, query, args...)
}

func (r *TicketRepository) FindByID(ctx context.Context, id string) (*model.Ticket, error) {
	query := ticketListSelect + " WHERE t.id = $1"
	var t model.Ticket
	err := r.db.QueryRow(ctx, query, id).Scan(
		&t.ID, &t.TicketCode, &t.Title, &t.Description, &t.CategoryID, &t.Priority, &t.Status,
		&t.CreatedBy, &t.CreatedByName,
		&t.CreatedFor, &t.CreatedForName,
		&t.AssignedTo, &t.AssignedToName, &t.AssignedBy, &t.AssignedAt,
		&t.ClaimedBy, &t.ClaimedByName, &t.ClaimedAt, &t.ClaimType,
		&t.SLADeadline, &t.LastResolvedAt, &t.ReopenCount,
		&t.ClosedBy, &t.ClosedByName, &t.ClosedAt, &t.CreatedAt,
		&t.HasSignoff,
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

// SoftDelete menandai tiket sebagai dihapus oleh admin.
// Tiket tidak benar-benar dihapus dari DB — hanya ditandai deleted_at.
func (r *TicketRepository) SoftDelete(ctx context.Context, ticketID, deletedBy, reason string) error {
	tag, err := r.db.Exec(ctx,
		`UPDATE tickets SET deleted_at = now(), deleted_by = $2, deleted_reason = $3 WHERE id = $1 AND deleted_at IS NULL`,
		ticketID, deletedBy, reason,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("tiket tidak ditemukan atau sudah dihapus")
	}
	return nil
}

// ListDeleted mengambil semua tiket yang sudah di-soft-delete (log penghapusan).
func (r *TicketRepository) ListDeleted(ctx context.Context) ([]model.Ticket, error) {
	query := `
		SELECT t.id, t.title, t.description, t.category_id, t.priority, t.status,
			t.created_by, creator.name,
			t.created_for, creator2.name,
			t.assigned_to, assignee.name, t.assigned_by, t.assigned_at,
			t.claimed_by, claimer.name, t.claimed_at, t.claim_type,
			t.sla_deadline, t.last_resolved_at, t.reopen_count,
			t.closed_by, closer.name, t.closed_at,
			t.deleted_at, t.deleted_by, deleter.name, t.deleted_reason,
			t.created_at
		FROM tickets t
		LEFT JOIN users creator  ON creator.id  = t.created_by
		LEFT JOIN users creator2 ON creator2.id = t.created_for
		LEFT JOIN users assignee ON assignee.id = t.assigned_to
		LEFT JOIN users claimer  ON claimer.id  = t.claimed_by
		LEFT JOIN users closer   ON closer.id   = t.closed_by
		LEFT JOIN users deleter  ON deleter.id  = t.deleted_by
		WHERE t.deleted_at IS NOT NULL
		ORDER BY t.deleted_at DESC
	`
	rows, err := r.db.Query(ctx, query)
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
			&t.ClosedBy, &t.ClosedByName, &t.ClosedAt,
			&t.DeletedAt, &t.DeletedBy, &t.DeletedByName, &t.DeletedReason,
			&t.CreatedAt,
		); err != nil {
			return nil, err
		}
		tickets = append(tickets, t)
	}
	return tickets, rows.Err()
}
