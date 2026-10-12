package model

import "time"

// AssetCondition merepresentasikan kondisi fisik aset di database.
type AssetCondition string

const (
	AssetConditionAvailable       AssetCondition = "available"
	AssetConditionBorrowed        AssetCondition = "borrowed"
	AssetConditionNeedsRepair     AssetCondition = "needs_repair"
	AssetConditionBroken          AssetCondition = "broken"
	AssetConditionAwaitingDisposal AssetCondition = "awaiting_disposal"
	AssetConditionDisposed        AssetCondition = "disposed"
)

// AssetCategory merepresentasikan baris pada tabel asset_categories.
type AssetCategory struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// Asset merepresentasikan baris pada tabel assets.
type Asset struct {
	ID           string        `json:"id"`
	CategoryID   string        `json:"category_id"`
	CategoryName string        `json:"category_name,omitempty"`
	Code         string        `json:"code"`
	Name         string        `json:"name"`
	Brand        string        `json:"brand,omitempty"`
	Model        string        `json:"model,omitempty"`
	SerialNumber string        `json:"serial_number,omitempty"`
	Condition    AssetCondition `json:"condition"`
	Stock        int           `json:"stock"`
	AvailableStock int         `json:"available_stock,omitempty"`
	Location     string        `json:"location,omitempty"`
	Notes        string        `json:"notes,omitempty"`
	CreatedBy    string        `json:"created_by"`
	CreatedAt    time.Time     `json:"created_at"`
	UpdatedAt    time.Time     `json:"updated_at"`
}
