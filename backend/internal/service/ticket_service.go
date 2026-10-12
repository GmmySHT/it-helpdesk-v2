package service

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"ticketing-it/backend/internal/model"
	"ticketing-it/backend/internal/repository"
)

var ErrOnlyLeaderCanAssign = errors.New("hanya leader/admin yang boleh langsung menugaskan tiket ke staf tertentu")
var ErrOnlyLeaderCanSetDeadline = errors.New("hanya leader/admin yang boleh menentukan deadline tiket")
var ErrOnlyStaffCanClaim = errors.New("hanya staf IT yang boleh mengklaim tiket")
var ErrOnlyLeaderCanApprove = errors.New("hanya leader/admin yang boleh menyetujui atau menolak tiket")
var ErrTicketNotPendingApproval = errors.New("tiket ini tidak dalam status menunggu persetujuan")
var ErrRejectNeedsReason = errors.New("penolakan wajib diisi alasan")
var ErrNotAssignedStaff = errors.New("tiket ini ditugaskan ke staf lain, kamu tidak bisa mengklaimnya")
var ErrTicketNotClaimable = errors.New("tiket tidak dalam status yang bisa diklaim")
var ErrNotClaimingStaff = errors.New("hanya staf yang mengklaim tiket ini yang bisa resolve")
var ErrResolveNeedsAttachment = errors.New("resolve wajib menyertakan minimal 1 gambar bukti")
var ErrOnlyLeaderCanReview = errors.New("hanya leader/admin yang boleh melakukan review (close/reopen)")
var ErrReopenNeedsReason = errors.New("reopen wajib diisi alasan")
var ErrOnlyLeaderCanReassign = errors.New("hanya leader/admin yang boleh melakukan reassign paksa")
var ErrReassignNeedsReason = errors.New("reassign paksa wajib diisi alasan")
var ErrTicketNotClaimedYet = errors.New("tiket harus berstatus 'claimed' untuk bisa direassign")

type TicketService struct {
	db          *pgxpool.Pool
	ticketRepo  *repository.TicketRepository
	slaRepo     *repository.SLARuleRepository
	commentRepo *repository.CommentRepository
	userRepo    *repository.UserRepository
	notifier    *NotificationService
}

func NewTicketService(
	db *pgxpool.Pool,
	ticketRepo *repository.TicketRepository,
	slaRepo *repository.SLARuleRepository,
	commentRepo *repository.CommentRepository,
	userRepo *repository.UserRepository,
	notifier *NotificationService,
) *TicketService {
	return &TicketService{
		db:          db,
		ticketRepo:  ticketRepo,
		slaRepo:     slaRepo,
		commentRepo: commentRepo,
		userRepo:    userRepo,
		notifier:    notifier,
	}
}

// actorName mengambil nama user untuk disisipkan ke pesan notifikasi
// (misalnya "diklaim oleh Budi"). Kalau gagal diambil (jarang terjadi),
// fallback ke kata generik supaya pesan tetap masuk akal dan tidak
// menggagalkan aksi utama gara-gara notifikasi.
func (s *TicketService) actorName(ctx context.Context, userID string) string {
	user, err := s.userRepo.FindByID(ctx, userID)
	if err != nil {
		return "seseorang"
	}
	return user.Name
}

type CreateTicketInput struct {
	Title       string
	Description string
	CategoryID  string
	Priority    model.TicketPriority

	// CreatedBy diambil dari JWT (user yang sedang login), bukan dari body request,
	// supaya user tidak bisa membuat tiket atas nama orang lain.
	CreatedBy string

	// CreatedFor OPSIONAL — jika diisi, leader/admin dapat membuat tiket atas nama user lain.
	// Hanya leader/admin yang boleh menggunakan field ini.
	CreatedFor *string

	// AssignedTo bersifat opsional. Kalau diisi, requester HARUS berperan leader/admin
	// (sesuai flowchart: "Leader assign ke staf tertentu?").
	AssignedTo    *string
	RequesterRole model.UserRole

	// CustomDeadline OPSIONAL — kalau leader/admin mengisi tanggal deadline
	// manual, itu dipakai (menimpa perhitungan otomatis dari priority).
	// Kalau kosong, deadline tetap dihitung otomatis dari sla_rules seperti
	// sebelumnya. Staf/user tidak boleh mengisi ini (hanya leader/admin).
	CustomDeadline *time.Time
}

// Create menerapkan aturan dari flowchart, DITAMBAH aturan approval baru:
//   - Kalau pembuatnya role 'user' (pelapor biasa), tiket WAJIB melalui
//     approval leader dulu (status 'pending_approval') sebelum masuk ke
//     alur claim. Ini mencegah tiket asal-asalan langsung nongol di daftar
//     kerja staf tanpa disaring.
//   - Kalau pembuatnya staff_it/leader/admin (misalnya leader mencatat
//     pekerjaan atas nama tim), tiket langsung masuk alur normal seperti
//     sebelumnya: assigned (kalau ditunjuk staf tertentu) atau unassigned.
func (s *TicketService) Create(ctx context.Context, input CreateTicketInput) (*model.Ticket, error) {
	if input.Priority == "" {
		input.Priority = model.PriorityMedium
	}

	// Validasi: hanya leader/admin boleh buat tiket atas nama user lain
	if input.CreatedFor != nil {
		if input.RequesterRole != model.RoleLeader && input.RequesterRole != model.RoleAdmin {
			return nil, errors.New("hanya leader atau admin yang dapat membuat tiket atas nama user lain")
		}
	}

	ticket := &model.Ticket{
		Title:       input.Title,
		Description: input.Description,
		CategoryID:  input.CategoryID,
		Priority:    input.Priority,
		CreatedBy:   input.CreatedBy,
		CreatedFor:  input.CreatedFor,
		Status:      model.StatusUnassigned,
	}

	// Jika dibuat oleh leader/admin (atas nama user atau untuk tim), tidak perlu approval
	// Hanya tiket dari role 'user' biasa yang perlu approval
	requiresApproval := input.RequesterRole == model.RoleUser

	if requiresApproval {
		ticket.Status = model.StatusPendingApproval
	} else if input.AssignedTo != nil {
		if input.RequesterRole != model.RoleLeader && input.RequesterRole != model.RoleAdmin {
			return nil, ErrOnlyLeaderCanAssign
		}
		now := time.Now()
		ticket.Status = model.StatusAssigned
		ticket.AssignedTo = input.AssignedTo
		ticket.AssignedBy = &input.CreatedBy
		ticket.AssignedAt = &now
	}

	// SLA deadline dihitung SEJAK TIKET DIBUAT (bukan sejak diklaim seperti
	// sebelumnya) — ini "batas waktu keseluruhan" tiket harus selesai,
	// dipakai nanti oleh background job pengingat SLA untuk mendeteksi
	// tiket yang mendekati/lewat deadline padahal belum diproses siapa pun.
	//
	// Kalau leader/admin mengisi CustomDeadline secara manual, itu yang
	// dipakai (leader tahu persis kapan tiket ini HARUS selesai, misalnya
	// karena ada audit tanggal tertentu) — bukan sekadar tebakan dari
	// priority. Staf/user tidak boleh mengisi field ini.
	if input.CustomDeadline != nil {
		if input.RequesterRole != model.RoleLeader && input.RequesterRole != model.RoleAdmin {
			return nil, ErrOnlyLeaderCanSetDeadline
		}
		ticket.SLADeadline = input.CustomDeadline
	} else {
		rule, err := s.slaRepo.FindByCategoryAndPriority(ctx, ticket.CategoryID, ticket.Priority)
		if err == nil {
			deadline := time.Now().Add(time.Duration(rule.ResolutionTimeMinutes) * time.Minute)
			ticket.SLADeadline = &deadline
		}
	}

	if err := s.ticketRepo.Create(ctx, ticket); err != nil {
		return nil, err
	}

	if requiresApproval {
		// Staf belum boleh lihat tiket ini (masih menunggu persetujuan),
		// tapi leader/admin WAJIB tahu segera — supaya tidak menumpuk di
		// daftar tanpa disadari.
		reviewers, err := s.userRepo.ListByRoles(ctx, model.RoleLeader, model.RoleAdmin)
		if err == nil {
			for _, reviewer := range reviewers {
				s.notifier.Notify(ctx, reviewer.ID, &ticket.ID,
					"ticket_pending_approval",
					"Tiket baru menunggu persetujuan",
					"Tiket \""+ticket.Title+"\" dibuat oleh "+s.actorName(ctx, ticket.CreatedBy)+", menunggu persetujuanmu.",
				)
			}
		}
		return ticket, nil
	}

	if input.AssignedTo != nil {
		s.notifier.Notify(ctx, *input.AssignedTo, &ticket.ID,
			"ticket_assigned",
			"Tiket baru ditugaskan untukmu",
			"Tiket \""+ticket.Title+"\" ditugaskan langsung kepadamu oleh leader.",
		)
	} else {
		// Tiket dibiarkan terbuka (unassigned) — semua staff_it perlu tahu
		// ada tiket baru yang bisa diklaim siapa saja, bukan cuma menunggu
		// mereka kebetulan buka halaman daftar tiket.
		staffList, err := s.userRepo.ListByRole(ctx, model.RoleStaffIT)
		if err == nil {
			for _, staff := range staffList {
				s.notifier.Notify(ctx, staff.ID, &ticket.ID,
					"ticket_created",
					"Tiket baru tersedia",
					"Tiket \""+ticket.Title+"\" dibuat dan terbuka untuk diklaim.",
				)
			}
		}
	}

	return ticket, nil
}

func (s *TicketService) List(ctx context.Context, statusFilter, userID, role string) ([]model.Ticket, error) {
	// Leader/admin/staff: lihat semua tiket (termasuk unassigned untuk di-claim)
	// User biasa: hanya lihat tiket yg dibuat olehnya ATAU dibuat untuk dirinya
	if role == string(model.RoleLeader) || role == string(model.RoleAdmin) || role == string(model.RoleStaffIT) {
		return s.ticketRepo.List(ctx, statusFilter)
	}
	// User biasa: pakai ListForUser
	return s.ticketRepo.ListForUser(ctx, statusFilter, userID)
}

// ListAtRisk dipakai widget "Tiket Berisiko" di dashboard leader/admin —
// tiket yang mendekati/lewat deadline padahal masih berjalan.
func (s *TicketService) ListAtRisk(ctx context.Context, limit int) ([]repository.AtRiskTicket, error) {
	return s.ticketRepo.ListAtRisk(ctx, limit)
}

func (s *TicketService) GetByID(ctx context.Context, id string) (*model.Ticket, error) {
	return s.ticketRepo.FindByID(ctx, id)
}

// Claim menjalankan aturan dari flowchart:
//   - Kalau tiket berstatus 'assigned', HANYA staf yang ditunjuk (assigned_to)
//     yang boleh klaim → claim_type = 'assigned'.
//   - Kalau tiket berstatus 'unassigned', staf mana pun boleh klaim (self-claim)
//     → claim_type = 'self_claimed', dan assigned_to ikut terisi ke staf tsb.
//
// claimed_at adalah acuan awal SLA — dihitung di level database (now())
// lewat repository, bukan di sini, supaya waktunya presisi dan konsisten
// dengan waktu server database.
func (s *TicketService) Claim(ctx context.Context, ticketID, userID string, role model.UserRole) (*model.Ticket, error) {
	// Hanya staff_it yang boleh mengklaim tiket — sesuai flowchart ("Staf klik
	// Claim"). Sebelumnya validasi ini tidak ada sama sekali, jadi role apapun
	// (bahkan 'user'/pelapor) bisa klaim tiket, yang jelas bukan yang dimaksud.
	if role != model.RoleStaffIT {
		return nil, ErrOnlyStaffCanClaim
	}

	ticket, err := s.ticketRepo.FindByID(ctx, ticketID)
	if err != nil {
		return nil, err
	}

	var claimType model.ClaimType
	assignedTo := &userID

	switch ticket.Status {
	case model.StatusAssigned:
		if ticket.AssignedTo == nil || *ticket.AssignedTo != userID {
			return nil, ErrNotAssignedStaff
		}
		claimType = model.ClaimTypeAssigned
		assignedTo = ticket.AssignedTo // tetap staf yang sama, tidak berubah
	case model.StatusUnassigned:
		claimType = model.ClaimTypeSelfClaimed
	default:
		return nil, ErrTicketNotClaimable
	}

	// SLA deadline TIDAK dihitung ulang di sini lagi — sudah ditentukan sejak
	// tiket dibuat (lihat Create), supaya jadi "batas waktu keseluruhan"
	// yang konsisten, bukan mulai dari nol tiap kali diklaim.
	wasUnassigned := ticket.Status == model.StatusUnassigned

	if err := s.ticketRepo.Claim(ctx, ticketID, userID, claimType, assignedTo); err != nil {
		return nil, err
	}

	// Sesuai flowchart: "staf mana pun klaim (notif real-time ke staf lain)" —
	// ini HANYA relevan kalau tiketnya sebelumnya unassigned (rebutan terbuka).
	// Kalau tiketnya memang sudah ditugaskan ke staf ini secara khusus, staf
	// lain tidak perlu tahu (mereka memang tidak berhak claim tiket itu).
	claimerName := s.actorName(ctx, userID)

	if wasUnassigned {
		staffList, err := s.userRepo.ListByRole(ctx, model.RoleStaffIT)
		if err == nil {
			for _, staff := range staffList {
				if staff.ID == userID {
					continue // staf yang klaim tidak perlu notif ke dirinya sendiri
				}
				s.notifier.Notify(ctx, staff.ID, &ticket.ID,
					"ticket_claimed",
					"Tiket sudah diklaim staf lain",
					"Tiket \""+ticket.Title+"\" sudah diklaim oleh "+claimerName+", tidak perlu dikerjakan lagi.",
				)
			}
		}
	}

	// Pelapor juga perlu tahu tiketnya mulai dikerjakan — supaya tidak
	// menunggu tanpa kepastian. Notif ini dikirim terlepas dari status
	// sebelumnya (unassigned atau assigned), karena bagi pelapor yang
	// penting adalah "ada progres", bukan detail mekanisme claim-nya.
	if ticket.CreatedBy != userID {
		s.notifier.Notify(ctx, ticket.CreatedBy, &ticket.ID,
			"ticket_in_progress",
			"Tiketmu sedang dikerjakan",
			"Tiket \""+ticket.Title+"\" mulai dikerjakan oleh "+claimerName+".",
		)
	}

	// Leader/admin ikut diberi tahu setiap kali ada tiket yang mulai
	// dikerjakan — supaya leader punya visibilitas penuh atas siklus tiket
	// (buat, diklaim, resolve), bukan cuma tahu di tahap resolve saja.
	reviewers, err := s.userRepo.ListByRoles(ctx, model.RoleLeader, model.RoleAdmin)
	if err == nil {
		for _, reviewer := range reviewers {
			s.notifier.Notify(ctx, reviewer.ID, &ticket.ID,
				"ticket_claimed_info",
				"Tiket mulai dikerjakan",
				"Tiket \""+ticket.Title+"\" diklaim dan mulai dikerjakan oleh "+claimerName+".",
			)
		}
	}

	return s.ticketRepo.FindByID(ctx, ticketID)
}

type ResolveInput struct {
	TicketID      string
	UserID        string
	Message       string
	AttachmentURLs []string // path/URL file yang sudah disimpan handler sebelum sampai ke service ini
}

// Resolve menjalankan 3 perubahan sekaligus dalam SATU transaction database:
//  1. Update status tiket jadi 'resolved'
//  2. Simpan catatan resolve (wajib diisi) sebagai ticket_comment
//  3. Simpan lampiran gambar (wajib minimal 1) sebagai comment_attachments
//
// Kenapa harus transaction? Supaya tidak ada kondisi "setengah jadi" —
// misalnya status tiket sudah berubah tapi catatan resolve gagal tersimpan
// karena error di tengah jalan. Kalau salah satu langkah gagal, SEMUA
// perubahan dibatalkan (rollback), database kembali seperti sebelum resolve dipanggil.
func (s *TicketService) Resolve(ctx context.Context, input ResolveInput) (*model.Ticket, error) {
	if input.Message == "" {
		return nil, errors.New("keterangan resolve wajib diisi")
	}
	if len(input.AttachmentURLs) == 0 {
		return nil, ErrResolveNeedsAttachment
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	// Rollback otomatis kalau fungsi ini keluar sebelum tx.Commit() dipanggil.
	// Kalau Commit() sudah berhasil dijalankan, baris Rollback() ini tidak
	// berefek apa-apa (aman dipanggil dua kali).
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `
		UPDATE tickets
		SET status = 'resolved', last_resolved_at = now()
		WHERE id = $1 AND status = 'claimed' AND claimed_by = $2
	`, input.TicketID, input.UserID)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrNotClaimingStaff
	}

	var commentID string
	err = tx.QueryRow(ctx, `
		INSERT INTO ticket_comments (ticket_id, user_id, comment_type, message)
		VALUES ($1, $2, 'resolve_note', $3)
		RETURNING id
	`, input.TicketID, input.UserID, input.Message).Scan(&commentID)
	if err != nil {
		return nil, err
	}

	for _, url := range input.AttachmentURLs {
		_, err = tx.Exec(ctx, `
			INSERT INTO comment_attachments (comment_id, file_url, file_type)
			VALUES ($1, $2, 'image')
		`, commentID, url)
		if err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	updatedTicket, err := s.ticketRepo.FindByID(ctx, input.TicketID)
	if err != nil {
		return nil, err
	}

	resolverName := s.actorName(ctx, input.UserID)

	// Leader/admin perlu tahu ada tiket menunggu review — inilah yang
	// memicu langkah "Leader review hasil sesuai?" di flowchart.
	reviewers, err := s.userRepo.ListByRoles(ctx, model.RoleLeader, model.RoleAdmin)
	if err == nil {
		for _, reviewer := range reviewers {
			s.notifier.Notify(ctx, reviewer.ID, &updatedTicket.ID,
				"ticket_resolved",
				"Tiket menunggu review",
				"Tiket \""+updatedTicket.Title+"\" sudah diselesaikan oleh "+resolverName+", menunggu review kamu.",
			)
		}
	}

	// Pelapor juga diberi tahu progresnya — supaya tahu tiketnya sudah
	// dikerjakan, walau belum resmi ditutup (masih menunggu review leader).
	s.notifier.Notify(ctx, updatedTicket.CreatedBy, &updatedTicket.ID,
		"ticket_resolved_waiting_review",
		"Tiketmu sudah diselesaikan",
		"Tiket \""+updatedTicket.Title+"\" sudah diselesaikan oleh "+resolverName+", sedang menunggu review leader.",
	)

	return updatedTicket, nil
}

// Close menandai tiket selesai secara final. Sesuai flowchart, hanya leader/admin
// yang boleh close, dan hanya dari status 'resolved' (leader review dulu hasilnya).
func (s *TicketService) Close(ctx context.Context, ticketID, userID string, role model.UserRole) (*model.Ticket, error) {
	if role != model.RoleLeader && role != model.RoleAdmin {
		return nil, ErrOnlyLeaderCanReview
	}
	if err := s.ticketRepo.Close(ctx, ticketID, userID); err != nil {
		return nil, err
	}

	updatedTicket, err := s.ticketRepo.FindByID(ctx, ticketID)
	if err != nil {
		return nil, err
	}

	// Pelapor diberi tahu tiketnya sudah selesai, sekaligus jadi pengingat
	// untuk kasih rating kepuasan (fitur yang sudah kita bangun sebelumnya).
	s.notifier.Notify(ctx, updatedTicket.CreatedBy, &updatedTicket.ID,
		"ticket_closed",
		"Tiketmu sudah selesai",
		"Tiket \""+updatedTicket.Title+"\" sudah ditutup. Yuk beri penilaian kepuasan.",
	)

	return updatedTicket, nil
}

var ErrCannotEditClosedTicketDetails = errors.New("tiket yang sudah closed tidak bisa diedit lagi")

type UpdateTicketDetailsInput struct {
	TicketID    string
	UserID      string
	Role        model.UserRole
	Title       string
	Description string
	CategoryID  string
	Priority    model.TicketPriority
}

// UpdateDetails membiarkan leader/admin mengoreksi detail tiket (judul,
// deskripsi, kategori, prioritas) KAPAN SAJA selama tiket masih berjalan —
// bukan bagian dari flowchart asli, tapi kebutuhan nyata: kadang ada
// kesalahan input atau situasi berubah setelah tiket dibuat.
func (s *TicketService) UpdateDetails(ctx context.Context, input UpdateTicketDetailsInput) (*model.Ticket, error) {
	if input.Role != model.RoleLeader && input.Role != model.RoleAdmin {
		return nil, ErrOnlyLeaderCanAssign // reuse pesan "hanya leader/admin..." yang sudah ada
	}

	ticket, err := s.ticketRepo.FindByID(ctx, input.TicketID)
	if err != nil {
		return nil, err
	}
	if ticket.Status == model.StatusClosed {
		return nil, ErrCannotEditClosedTicketDetails
	}

	if err := s.ticketRepo.UpdateDetails(ctx, input.TicketID, input.Title, input.Description, input.CategoryID, input.Priority); err != nil {
		return nil, err
	}

	return s.ticketRepo.FindByID(ctx, input.TicketID)
}

type ReopenInput struct {
	TicketID    string
	ReopenedBy  string // leader yang klik reopen
	RequesterRole model.UserRole
	Reason      string
}

// Reopen menjalankan aturan dari flowchart: leader menganggap hasil belum sesuai,
// tiket dikembalikan ke staf yang sama (claimed_by tidak berubah) dengan SLA BARU
// dihitung dari waktu reopen ini, dan reopen_count bertambah 1.
//
// Update status tiket + insert log dijalankan dalam SATU transaction — supaya
// tidak mungkin ada reopen yang statusnya berubah tapi tidak tercatat di log,
// atau sebaliknya.
func (s *TicketService) Reopen(ctx context.Context, input ReopenInput) (*model.Ticket, error) {
	if input.RequesterRole != model.RoleLeader && input.RequesterRole != model.RoleAdmin {
		return nil, ErrOnlyLeaderCanReview
	}
	if input.Reason == "" {
		return nil, ErrReopenNeedsReason
	}

	ticket, err := s.ticketRepo.FindByID(ctx, input.TicketID)
	if err != nil {
		return nil, err
	}
	if ticket.Status != model.StatusResolved {
		return nil, repository.ErrTicketNotResolvable
	}
	if ticket.ClaimedBy == nil {
		return nil, errors.New("tiket ini belum pernah diklaim staf manapun, tidak bisa direopen")
	}

	// SLA baru dihitung ulang dari waktu reopen, sama seperti saat claim pertama kali.
	var slaDeadline *time.Time
	rule, err := s.slaRepo.FindByCategoryAndPriority(ctx, ticket.CategoryID, ticket.Priority)
	if err == nil {
		deadline := time.Now().Add(time.Duration(rule.ResolutionTimeMinutes) * time.Minute)
		slaDeadline = &deadline
	}

	newReopenCount := ticket.ReopenCount + 1

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `
		UPDATE tickets
		SET status = 'claimed',
			claimed_at = now(),
			sla_deadline = $1,
			reopen_count = $2,
			sla_reminder_sent_at = NULL,
			sla_overdue_notified_at = NULL
		WHERE id = $3 AND status = 'resolved'
	`, slaDeadline, newReopenCount, input.TicketID)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, repository.ErrTicketNotResolvable
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO ticket_reopen_logs (ticket_id, reopened_by, staff_id, reopen_reason, reopen_number)
		VALUES ($1, $2, $3, $4, $5)
	`, input.TicketID, input.ReopenedBy, *ticket.ClaimedBy, input.Reason, newReopenCount)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	s.notifier.Notify(ctx, *ticket.ClaimedBy, &ticket.ID,
		"ticket_reopened",
		"Tiket dibuka kembali",
		"Tiket \""+ticket.Title+"\" direopen oleh "+s.actorName(ctx, input.ReopenedBy)+". Alasan: "+input.Reason,
	)

	return s.ticketRepo.FindByID(ctx, input.TicketID)
}

type ReassignInput struct {
	TicketID      string
	NewStaffID    string
	ReassignedBy  string // leader yang klik reassign paksa
	RequesterRole model.UserRole
	Reason        string
}

// Reassign menjalankan aturan dari flowchart: leader memaksa pindah tugas
// (misalnya staf berhalangan) SAAT tiket masih 'claimed'. SLA di-reset dari
// waktu reassign ini juga, sama seperti reopen — supaya staf baru punya
// waktu penuh untuk mengerjakan, bukan sisa waktu dari staf sebelumnya.
func (s *TicketService) Reassign(ctx context.Context, input ReassignInput) (*model.Ticket, error) {
	if input.RequesterRole != model.RoleLeader && input.RequesterRole != model.RoleAdmin {
		return nil, ErrOnlyLeaderCanReassign
	}
	if input.Reason == "" {
		return nil, ErrReassignNeedsReason
	}

	ticket, err := s.ticketRepo.FindByID(ctx, input.TicketID)
	if err != nil {
		return nil, err
	}
	if ticket.Status != model.StatusClaimed {
		return nil, ErrTicketNotClaimedYet
	}
	if ticket.ClaimedBy == nil {
		return nil, errors.New("tiket ini belum punya staf yang mengklaim, tidak bisa direassign")
	}
	previousStaffID := *ticket.ClaimedBy

	// SLA baru dihitung ulang dari waktu reassign, staf baru dapat waktu penuh.
	slaResetAt := time.Now()
	var slaDeadline *time.Time
	rule, err := s.slaRepo.FindByCategoryAndPriority(ctx, ticket.CategoryID, ticket.Priority)
	if err == nil {
		deadline := slaResetAt.Add(time.Duration(rule.ResolutionTimeMinutes) * time.Minute)
		slaDeadline = &deadline
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `
		UPDATE tickets
		SET claimed_by = $1,
			assigned_to = $1,
			claimed_at = $2,
			sla_deadline = $3,
			claim_type = 'assigned',
			sla_reminder_sent_at = NULL,
			sla_overdue_notified_at = NULL
		WHERE id = $4 AND status = 'claimed'
	`, input.NewStaffID, slaResetAt, slaDeadline, input.TicketID)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrTicketNotClaimedYet
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO ticket_reassignment_logs (ticket_id, previous_staff_id, new_staff_id, reassigned_by, reason, sla_reset_at)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, input.TicketID, previousStaffID, input.NewStaffID, input.ReassignedBy, input.Reason, slaResetAt)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	s.notifier.Notify(ctx, input.NewStaffID, &input.TicketID,
		"ticket_reassigned",
		"Tiket dialihkan ke kamu",
		"Tiket \""+ticket.Title+"\" dialihkan oleh "+s.actorName(ctx, input.ReassignedBy)+" ke kamu. Alasan: "+input.Reason,
	)

	return s.ticketRepo.FindByID(ctx, input.TicketID)
}

type ApproveInput struct {
	TicketID   string
	ApproverID string
	Role       model.UserRole
	// AssignedTo opsional — leader bisa langsung tunjuk staf tertentu saat
	// menyetujui, atau biarkan kosong supaya tiket terbuka untuk siapa saja.
	AssignedTo *string
	// CustomDeadline opsional — leader bisa isi/timpa deadline saat approve,
	// misalnya baru pada tahap ini leader tahu kapan harus selesai.
	CustomDeadline *time.Time
}

// Approve dipanggil leader/admin untuk menyetujui tiket yang dibuat oleh
// pelapor biasa (role 'user'). Setelah disetujui, tiket masuk ke alur
// normal yang sama seperti tiket yang dibuat staf/leader langsung:
// assigned (kalau ditunjuk staf tertentu) atau unassigned.
func (s *TicketService) Approve(ctx context.Context, input ApproveInput) (*model.Ticket, error) {
	if input.Role != model.RoleLeader && input.Role != model.RoleAdmin {
		return nil, ErrOnlyLeaderCanApprove
	}

	ticket, err := s.ticketRepo.FindByID(ctx, input.TicketID)
	if err != nil {
		return nil, err
	}
	if ticket.Status != model.StatusPendingApproval {
		return nil, ErrTicketNotPendingApproval
	}

	newStatus := model.StatusUnassigned
	var assignedAt *time.Time
	if input.AssignedTo != nil {
		now := time.Now()
		newStatus = model.StatusAssigned
		assignedAt = &now
	}

	// Deadline hanya DITIMPA kalau leader mengisi CustomDeadline di langkah
	// approve ini. Kalau tidak diisi, deadline yang sudah dihitung otomatis
	// sejak tiket dibuat (lihat Create) tetap dipakai — pakai COALESCE
	// supaya $5 NULL berarti "biarkan seperti semula".
	tag, err := s.db.Exec(ctx, `
		UPDATE tickets
		SET status = $1, assigned_to = $2, assigned_by = $3, assigned_at = $4,
			sla_deadline = COALESCE($5, sla_deadline)
		WHERE id = $6 AND status = 'pending_approval'
	`, newStatus, input.AssignedTo, input.ApproverID, assignedAt, input.CustomDeadline, input.TicketID)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrTicketNotPendingApproval
	}

	// Notifikasi setelah disetujui — polanya sama seperti saat tiket
	// dibuat langsung oleh staf/leader (lihat Create).
	if input.AssignedTo != nil {
		s.notifier.Notify(ctx, *input.AssignedTo, &ticket.ID,
			"ticket_assigned",
			"Tiket baru ditugaskan untukmu",
			"Tiket \""+ticket.Title+"\" disetujui dan ditugaskan langsung kepadamu.",
		)
	} else {
		staffList, err := s.userRepo.ListByRole(ctx, model.RoleStaffIT)
		if err == nil {
			for _, staff := range staffList {
				s.notifier.Notify(ctx, staff.ID, &ticket.ID,
					"ticket_created",
					"Tiket baru tersedia",
					"Tiket \""+ticket.Title+"\" sudah disetujui dan terbuka untuk diklaim.",
				)
			}
		}
	}

	s.notifier.Notify(ctx, ticket.CreatedBy, &ticket.ID,
		"ticket_approved",
		"Tiketmu disetujui",
		"Tiket \""+ticket.Title+"\" disetujui oleh "+s.actorName(ctx, input.ApproverID)+" dan segera ditindaklanjuti.",
	)

	return s.ticketRepo.FindByID(ctx, input.TicketID)
}

type RejectInput struct {
	TicketID   string
	ApproverID string
	Role       model.UserRole
	Reason     string
}

// Reject menolak tiket dari pelapor biasa langsung ke status 'closed' —
// dianggap final, dengan alasan penolakan tercatat sebagai komentar supaya
// ada jejaknya, dan pelapor diberi tahu alasannya.
func (s *TicketService) Reject(ctx context.Context, input RejectInput) (*model.Ticket, error) {
	if input.Role != model.RoleLeader && input.Role != model.RoleAdmin {
		return nil, ErrOnlyLeaderCanApprove
	}
	if input.Reason == "" {
		return nil, ErrRejectNeedsReason
	}

	ticket, err := s.ticketRepo.FindByID(ctx, input.TicketID)
	if err != nil {
		return nil, err
	}
	if ticket.Status != model.StatusPendingApproval {
		return nil, ErrTicketNotPendingApproval
	}

	tx, err := s.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	tag, err := tx.Exec(ctx, `
		UPDATE tickets
		SET status = 'closed', closed_by = $1, closed_at = now()
		WHERE id = $2 AND status = 'pending_approval'
	`, input.ApproverID, input.TicketID)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrTicketNotPendingApproval
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO ticket_comments (ticket_id, user_id, comment_type, message)
		VALUES ($1, $2, 'general_comment', $3)
	`, input.TicketID, input.ApproverID, "Tiket ditolak. Alasan: "+input.Reason)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}

	s.notifier.Notify(ctx, ticket.CreatedBy, &ticket.ID,
		"ticket_rejected",
		"Tiketmu ditolak",
		"Tiket \""+ticket.Title+"\" ditolak oleh "+s.actorName(ctx, input.ApproverID)+". Alasan: "+input.Reason,
	)

	return s.ticketRepo.FindByID(ctx, input.TicketID)
}

// slaReminderWindow adalah seberapa jauh SEBELUM deadline reminder mulai
// dikirim. 30 menit dipilih supaya masih ada waktu bereaksi tapi tidak
// terlalu dini sehingga terasa spam untuk tiket berjangka pendek.
const slaReminderWindow = 30 * time.Minute

// CheckSLAReminders dipanggil BERKALA oleh background job di main.go (bukan
// dipicu user), mengecek semua tiket yang masih berjalan dan mendekati/lewat
// deadline KESELURUHAN (sla_deadline, dihitung sejak tiket dibuat — beda
// dari SLA kerja staf yang dipakai di dashboard KPI). Tujuannya supaya tidak
// ada tiket yang "terlewat" begitu saja tanpa ada yang sadar.
func (s *TicketService) CheckSLAReminders(ctx context.Context) error {
	tickets, err := s.ticketRepo.ListSLACandidates(ctx)
	if err != nil {
		return err
	}

	now := time.Now()
	leadersAndAdmins, _ := s.userRepo.ListByRoles(ctx, model.RoleLeader, model.RoleAdmin)

	for _, t := range tickets {
		isOverdue := now.After(*t.SLADeadline)
		isApproaching := !isOverdue && now.After(t.SLADeadline.Add(-slaReminderWindow))

		if isOverdue && t.SLAOverdueNotifiedAt == nil {
			s.notifySLARecipients(ctx, t, leadersAndAdmins,
				"ticket_sla_overdue",
				"Tiket lewat deadline",
				"Tiket \""+t.Title+"\" sudah LEWAT deadline dan masih berstatus \""+string(t.Status)+"\". Segera ditindaklanjuti.",
				true, // sertakan leader/admin sebagai eskalasi
			)
			_ = s.ticketRepo.MarkSLAOverdueNotified(ctx, t.ID)
		} else if isApproaching && t.SLAReminderSentAt == nil {
			s.notifySLARecipients(ctx, t, leadersAndAdmins,
				"ticket_sla_approaching",
				"Tiket mendekati deadline",
				"Tiket \""+t.Title+"\" mendekati deadline dan masih berstatus \""+string(t.Status)+"\".",
				false,
			)
			_ = s.ticketRepo.MarkSLAReminderSent(ctx, t.ID)
		}
	}

	return nil
}

// notifySLARecipients menentukan SIAPA yang perlu diingatkan, tergantung
// status tiket saat ini — sejalan dengan skenario yang kamu jelaskan:
// leader belum assign siapa pun, ATAU staf sudah ditugaskan tapi belum
// bergerak sama sekali.
func (s *TicketService) notifySLARecipients(ctx context.Context, t model.Ticket, leadersAndAdmins []model.User, notifType, title, message string, includeLeadersAlways bool) {
	switch t.Status {
	case model.StatusPendingApproval:
		// Belum di-approve siapa pun — leader/admin yang perlu diingatkan.
		for _, u := range leadersAndAdmins {
			s.notifier.Notify(ctx, u.ID, &t.ID, notifType, title, message)
		}
		return
	case model.StatusUnassigned:
		// Belum ada staf yang klaim sama sekali — ingatkan SEMUA staff_it.
		staffList, err := s.userRepo.ListByRole(ctx, model.RoleStaffIT)
		if err == nil {
			for _, staff := range staffList {
				s.notifier.Notify(ctx, staff.ID, &t.ID, notifType, title, message)
			}
		}
	case model.StatusAssigned:
		// Sudah ditugaskan ke staf tertentu tapi belum diklaim — ingatkan
		// staf itu spesifik.
		if t.AssignedTo != nil {
			s.notifier.Notify(ctx, *t.AssignedTo, &t.ID, notifType, title, message)
		}
	case model.StatusClaimed:
		// Sudah dikerjakan tapi belum juga resolve — ingatkan staf yang
		// mengerjakan.
		if t.ClaimedBy != nil {
			s.notifier.Notify(ctx, *t.ClaimedBy, &t.ID, notifType, title, message)
		}
	}

	// Untuk kasus SUDAH LEWAT deadline (bukan sekadar mendekati), leader/admin
	// SELALU ikut diberi tahu juga sebagai bentuk eskalasi manajerial —
	// terlepas dari status tiketnya, supaya ada yang bisa turun tangan.
	if includeLeadersAlways {
		for _, u := range leadersAndAdmins {
			s.notifier.Notify(ctx, u.ID, &t.ID, notifType, title, message)
		}
	}
}

var ErrCannotEditClosedTicket = errors.New("tiket yang sudah closed tidak bisa diubah deadline-nya")

// UpdateDeadline dipakai leader/admin untuk mengubah deadline tiket KAPAN
// SAJA selama tiket masih berjalan — bukan cuma saat create/approve.
// sla_reminder_sent_at & sla_overdue_notified_at ikut di-reset ke NULL
// supaya siklus reminder mulai dari awal untuk deadline yang baru,
// bukan memakai status reminder dari deadline lama.
func (s *TicketService) UpdateDeadline(ctx context.Context, ticketID, userID string, role model.UserRole, newDeadline time.Time) (*model.Ticket, error) {
	if role != model.RoleLeader && role != model.RoleAdmin {
		return nil, ErrOnlyLeaderCanSetDeadline
	}

	ticket, err := s.ticketRepo.FindByID(ctx, ticketID)
	if err != nil {
		return nil, err
	}
	if ticket.Status == model.StatusClosed {
		return nil, ErrCannotEditClosedTicket
	}

	_, err = s.db.Exec(ctx, `
		UPDATE tickets
		SET sla_deadline = $1, sla_reminder_sent_at = NULL, sla_overdue_notified_at = NULL
		WHERE id = $2
	`, newDeadline, ticketID)
	if err != nil {
		return nil, err
	}

	// Beri tahu siapa pun yang sedang "memegang" tiket ini kalau deadline-nya
	// berubah — supaya tidak kaget kalau tiba-tiba dapat reminder baru.
	var owner *string
	if ticket.ClaimedBy != nil {
		owner = ticket.ClaimedBy
	} else if ticket.AssignedTo != nil {
		owner = ticket.AssignedTo
	}
	if owner != nil {
		s.notifier.Notify(ctx, *owner, &ticket.ID,
			"ticket_deadline_changed",
			"Deadline tiket diubah",
			"Deadline tiket \""+ticket.Title+"\" diubah oleh "+s.actorName(ctx, userID)+" menjadi "+newDeadline.Format("02 Jan 2006 15:04"),
		)
	}

	return s.ticketRepo.FindByID(ctx, ticketID)
}
