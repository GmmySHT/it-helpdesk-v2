-- Migration: Create asset_borrowings table
-- Tracks asset borrowing requests, approvals, returns, and overdue status

CREATE TYPE borrowing_status AS ENUM ('pending_approval', 'approved', 'borrowed', 'returned', 'overdue', 'rejected');
CREATE TYPE return_condition AS ENUM ('good', 'damaged', 'lost');

CREATE TABLE asset_borrowings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES assets(id),
    borrower_id UUID NOT NULL REFERENCES users(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    borrow_date DATE NOT NULL,
    return_deadline DATE NOT NULL,
    actual_return_date DATE,
    return_condition return_condition,
    return_notes TEXT,
    purpose TEXT NOT NULL,
    status borrowing_status NOT NULL DEFAULT 'pending_approval',
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT chk_borrow_date_before_return CHECK (borrow_date <= return_deadline),
    CONSTRAINT chk_quantity_positive CHECK (quantity > 0)
);

CREATE INDEX idx_borrowings_asset ON asset_borrowings(asset_id);
CREATE INDEX idx_borrowings_borrower ON asset_borrowings(borrower_id);
CREATE INDEX idx_borrowings_status ON asset_borrowings(status);
CREATE INDEX idx_borrowings_deadline ON asset_borrowings(return_deadline);
