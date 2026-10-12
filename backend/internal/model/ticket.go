package model

import "time"

type TicketStatus string

const (
	StatusPendingApproval TicketStatus = "pending_approval"
	StatusUnassigned      TicketStatus = "unassigned"
	StatusAssigned        TicketStatus = "assigned"
	StatusClaimed         TicketStatus = "claimed"
	StatusResolved        TicketStatus = "resolved"
	StatusClosed          TicketStatus = "closed"
)

type TicketPriority string

const (
	PriorityLow    TicketPriority = "low"
	PriorityMedium TicketPriority = "medium"
	PriorityHigh   TicketPriority = "high"
	PriorityUrgent TicketPriority = "urgent"
)

type ClaimType string

const (
	ClaimTypeAssigned     ClaimType = "assigned"
	ClaimTypeSelfClaimed  ClaimType = "self_claimed"
)

// Ticket merepresentasikan baris pada tabel tickets.
// Field bertipe pointer (*string, *time.Time) menandakan kolom yang boleh NULL
// di database — misalnya AssignedTo baru terisi kalau leader meng-assign tiket.
type Ticket struct {
	ID          string         `json:"id"`
	Title       string         `json:"title"`
	Description string         `json:"description"`
	CategoryID  string         `json:"category_id"`
	Priority    TicketPriority `json:"priority"`
	Status      TicketStatus   `json:"status"`

	CreatedBy     string `json:"created_by"`
	CreatedByName string `json:"created_by_name,omitempty"`

	CreatedFor     *string `json:"created_for,omitempty"`
	CreatedForName *string `json:"created_for_name,omitempty"`

	AssignedTo     *string    `json:"assigned_to,omitempty"`
	AssignedToName *string    `json:"assigned_to_name,omitempty"`
	AssignedBy     *string    `json:"assigned_by,omitempty"`
	AssignedAt     *time.Time `json:"assigned_at,omitempty"`

	ClaimedBy     *string    `json:"claimed_by,omitempty"`
	ClaimedByName *string    `json:"claimed_by_name,omitempty"`
	ClaimedAt     *time.Time `json:"claimed_at,omitempty"`
	ClaimType     *ClaimType `json:"claim_type,omitempty"`

	SLADeadline    *time.Time `json:"sla_deadline,omitempty"`
	LastResolvedAt *time.Time `json:"last_resolved_at,omitempty"`
	ReopenCount    int        `json:"reopen_count"`

	SLAReminderSentAt   *time.Time `json:"sla_reminder_sent_at,omitempty"`
	SLAOverdueNotifiedAt *time.Time `json:"sla_overdue_notified_at,omitempty"`

	ClosedBy     *string    `json:"closed_by,omitempty"`
	ClosedByName *string    `json:"closed_by_name,omitempty"`
	ClosedAt     *time.Time `json:"closed_at,omitempty"`

	CreatedAt time.Time `json:"created_at"`
}
