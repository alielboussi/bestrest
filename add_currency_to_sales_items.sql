-- Migration: Add currency column to sales_items table
ALTER TABLE sales_items ADD COLUMN currency text;
