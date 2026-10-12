-- Migration: Change asset_borrowings date columns to timestamp
-- Allows tracking precise time (hour, minute, second) for borrowings

ALTER TABLE asset_borrowings 
    ALTER COLUMN borrow_date TYPE TIMESTAMP WITH TIME ZONE,
    ALTER COLUMN return_deadline TYPE TIMESTAMP WITH TIME ZONE,
    ALTER COLUMN actual_return_date TYPE TIMESTAMP WITH TIME ZONE;
