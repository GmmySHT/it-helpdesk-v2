package model

import "time"

// BorrowingStatus merepresentasikan status alur peminjaman aset.
type BorrowingStatus string

const (
	BorrowingPendingApproval BorrowingStatus = "pending_approval"
	BorrowingApproved        BorrowingStatus = "approved"
	BorrowingBorrowed        BorrowingStatus = "borrowed"
	BorrowingReturned        BorrowingStatus = "returned"
	BorrowingOverdue         BorrowingStatus = "overdue"
	BorrowingRejected        BorrowingStatus = "rejected"
)

// ReturnCondition merepresentasikan kondisi aset saat dikembalikan.
type ReturnCondition string

const (
	ReturnGood    ReturnCondition = "good"
	ReturnDamaged ReturnCondition = "damaged"
	ReturnLost    ReturnCondition = "lost"
)

// DisposalMethod merepresentasikan cara pemusnahan aset.
type DisposalMethod string

const (
	DisposalRecycle DisposalMethod = "recycle"
	DisposalDonate  DisposalMethod = "donate"
	DisposalDestroy DisposalMethod = "destroy"
	DisposalSell    DisposalMethod = "sell"
)

// AssetBorrowing merepresentasikan baris pada tabel asset_borrowings.
type AssetBorrowing struct {
	ID               string          `json:"id"`
	AssetID          string          `json:"asset_id"`
	AssetName        string          `json:"asset_name,omitempty"`
	AssetCode        string          `json:"asset_code,omitempty"`
	BorrowerID       string          `json:"borrower_id"`
	BorrowerName     string          `json:"borrower_name,omitempty"`
	Quantity         int             `json:"quantity"`
	BorrowDate       time.Time       `json:"borrow_date"`
	ReturnDeadline   time.Time       `json:"return_deadline"`
	ActualReturnDate *time.Time      `json:"actual_return_date,omitempty"`
	ReturnCondition  *ReturnCondition `json:"return_condition,omitempty"`
	ReturnNotes      string          `json:"return_notes,omitempty"`
	Purpose          string          `json:"purpose"`
	Status           BorrowingStatus `json:"status"`
	ApprovedBy       *string         `json:"approved_by,omitempty"`
	ApproverName     string          `json:"approver_name,omitempty"`
	ApprovedAt       *time.Time      `json:"approved_at,omitempty"`
	CreatedAt        time.Time       `json:"created_at"`
	UpdatedAt        time.Time       `json:"updated_at"`
}

// AssetDisposal merepresentasikan baris pada tabel asset_disposals.
type AssetDisposal struct {
	ID                string         `json:"id"`
	AssetID           string         `json:"asset_id"`
	AssetName         string         `json:"asset_name,omitempty"`
	AssetCode         string         `json:"asset_code,omitempty"`
	Reason            string         `json:"reason"`
	DisposalMethod    DisposalMethod `json:"disposal_method"`
	DisposedBy        string         `json:"disposed_by"`
	DisposerName      string         `json:"disposer_name,omitempty"`
	DisposedAt        time.Time      `json:"disposed_at"`
	CertificateNumber string         `json:"certificate_number,omitempty"`
	Notes             string         `json:"notes,omitempty"`
	CreatedAt         time.Time      `json:"created_at"`
}
