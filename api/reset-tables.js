// /api/reset-tables.js
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Security: Only allow if correct secret is sent
  if (req.body.secret !== 'Roneth113') return res.status(403).json({ error: 'Forbidden' });

  // Use your Supabase service role key (never expose this to the frontend!)
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // List of TRUNCATE statements (remove any table that doesn't exist)
  const sql = `
    TRUNCATE TABLE batch_numbers RESTART IDENTITY CASCADE;
    TRUNCATE TABLE categories RESTART IDENTITY CASCADE;
    TRUNCATE TABLE combo_items RESTART IDENTITY CASCADE;
    TRUNCATE TABLE combos RESTART IDENTITY CASCADE;
    TRUNCATE TABLE currencies RESTART IDENTITY CASCADE;
    TRUNCATE TABLE customers RESTART IDENTITY CASCADE;
    TRUNCATE TABLE expenses RESTART IDENTITY CASCADE;
    TRUNCATE TABLE inventory RESTART IDENTITY CASCADE;
    TRUNCATE TABLE laybys RESTART IDENTITY CASCADE;
    TRUNCATE TABLE locations RESTART IDENTITY CASCADE;
    TRUNCATE TABLE product_images RESTART IDENTITY CASCADE;
    TRUNCATE TABLE product_locations RESTART IDENTITY CASCADE;
    TRUNCATE TABLE products RESTART IDENTITY CASCADE;
    TRUNCATE TABLE sales RESTART IDENTITY CASCADE;
    TRUNCATE TABLE sales_items RESTART IDENTITY CASCADE;
    TRUNCATE TABLE sales_payments RESTART IDENTITY CASCADE;
    TRUNCATE TABLE serial_numbers RESTART IDENTITY CASCADE;
    TRUNCATE TABLE stock_transfer_entries RESTART IDENTITY CASCADE;
    TRUNCATE TABLE stock_transfer_sessions RESTART IDENTITY CASCADE;
    TRUNCATE TABLE stock_transfers RESTART IDENTITY CASCADE;
    TRUNCATE TABLE stocktake_entries RESTART IDENTITY CASCADE;
    TRUNCATE TABLE stocktakes RESTART IDENTITY CASCADE;
    TRUNCATE TABLE unit_of_measure RESTART IDENTITY CASCADE;
  `;

  // You need a Postgres function to run raw SQL (see below)
  const { error } = await supabase.rpc('execute_sql', { sql });

  if (error) return res.status(500).json({ error: error.message });
  res.status(200).json({ success: true });
}