package model

import "time"

// ProjectStatus enum terpisah dari TicketStatus — project tidak pernah
// masuk status resolved/closed tiket regular.
type ProjectStatus string

const (
	ProjectDraft           ProjectStatus = "draft"
	ProjectWaitingApproval ProjectStatus = "menunggu_persetujuan"
	ProjectRunning         ProjectStatus = "berjalan"
	ProjectOnHold          ProjectStatus = "ditahan"
	ProjectDone            ProjectStatus = "selesai"
	ProjectClosed          ProjectStatus = "ditutup"
	ProjectCancelled       ProjectStatus = "dibatalkan"
)

func IsValidProjectStatus(s string) bool {
	switch ProjectStatus(s) {
	case ProjectDraft, ProjectWaitingApproval, ProjectRunning, ProjectOnHold, ProjectDone, ProjectClosed, ProjectCancelled:
		return true
	}
	return false
}

type MemberRole string

const (
	MemberRolePIC    MemberRole = "pic"
	MemberRoleMember MemberRole = "member"
)

// TicketMember adalah anggota tim project. Soft-remove memakai RemovedAt
// supaya riwayat keanggotaan tetap tercatat.
type TicketMember struct {
	ID        string     `json:"id"`
	TicketID  string     `json:"ticket_id"`
	UserID    string     `json:"user_id"`
	UserName  string     `json:"user_name,omitempty"`
	Role      MemberRole `json:"role"`
	AddedBy   *string    `json:"added_by,omitempty"`
	AddedAt   time.Time  `json:"added_at"`
	RemovedAt *time.Time `json:"removed_at,omitempty"`
}

// ProjectMilestone adalah fase/workstream di dalam project. Berisi task,
// bukan tiket anak, dan tidak masuk KPI individu.
type ProjectMilestone struct {
	ID          string     `json:"id"`
	TicketID    string     `json:"ticket_id"`
	Title       string     `json:"title"`
	Description string     `json:"description,omitempty"`
	StartDate   *time.Time `json:"start_date,omitempty"`
	DueDate     *time.Time `json:"due_date,omitempty"`
	OwnerID     *string    `json:"owner_id,omitempty"`
	Status      string     `json:"status"`
	Weight      int        `json:"weight"`
	SortOrder   int        `json:"sort_order"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
	CreatedBy   string     `json:"created_by"`
	CreatedAt   time.Time  `json:"created_at"`
	Progress    int        `json:"progress"` // 0..100, dihitung saat query
}

// ProjectTask adalah pekerjaan di dalam project — BUKAN tiket anak.
// Tidak punya kode tiket, SLA, atau rating.
type ProjectTask struct {
	ID            string     `json:"id"`
	TicketID      string     `json:"ticket_id"`
	MilestoneID   *string    `json:"milestone_id,omitempty"`
	Title         string     `json:"title"`
	Description   string     `json:"description,omitempty"`
	AssigneeID    *string    `json:"assignee_id,omitempty"`
	AssigneeName  *string    `json:"assignee_name,omitempty"`
	StartDate     *time.Time `json:"start_date,omitempty"`
	DueDate       *time.Time `json:"due_date,omitempty"`
	DueReminderAt *time.Time `json:"due_reminder_sent_at,omitempty"`
	Status        string     `json:"status"`
	Weight        int        `json:"weight"`
	SortOrder     int        `json:"sort_order"`
	CompletedAt   *time.Time `json:"completed_at,omitempty"`
	CreatedBy     string     `json:"created_by"`
	CreatedAt     time.Time  `json:"created_at"`
}

// ProjectProposal merepresentasikan dokumen proposal pada tiket project.
// Memakai tabel ticket_signoffs yang sama dengan analysis/bast, doc_type
// bernilai 'proposal' (kolom doc_type bertipe VARCHAR, bukan enum).
type ProjectProposal struct {
	ID           string     `json:"id"`
	TicketID     string     `json:"ticket_id"`
	DocNumber    string     `json:"doc_number,omitempty"`
	FileURL      string     `json:"file_url"`
	FileName     string     `json:"file_name"`
	FileType     string     `json:"file_type"`
	FileSize     int64      `json:"file_size"`
	SignedByName string     `json:"signed_by_name"`
	Status       string     `json:"status"` // diajukan | disetujui | ditolak
	Version      int        `json:"version"`
	Notes        string     `json:"notes,omitempty"`
	ApproverID   *string    `json:"approver_id,omitempty"`
	ApprovedAt   *time.Time `json:"approved_at,omitempty"`
	CreatedBy    string     `json:"created_by"`
	CreatedAt    time.Time  `json:"created_at"`
}
