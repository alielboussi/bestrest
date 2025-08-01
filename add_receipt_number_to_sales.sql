-- Migration: Add receipt_number column to sales table
ALTER TABLE sales ADD COLUMN receipt_number text;
