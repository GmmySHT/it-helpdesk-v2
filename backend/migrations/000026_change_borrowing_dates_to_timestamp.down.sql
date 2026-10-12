-- Migration: Revert asset_borrowings timestamp columns to date

ALTER TABLE asset_borrowings 
    ALTER COLUMN borrow_date TYPE DATE,
    ALTER COLUMN return_deadline TYPE DATE,
    ALTER COLUMN actual_return_date TYPE DATE;
