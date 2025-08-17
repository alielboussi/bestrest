// /api/migrate_incomplete_packages_item_name.js
import { createClient } from '@supabase/supabase-js';

// Adds item_name column to incomplete_packages if missing
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (req.body.secret !== 'Roneth113') return res.status(403).json({ error: 'Forbidden' });

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const sql = `
    DO $$
    BEGIN
      -- Ensure location_id column type matches locations.id (uuid or bigint)
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='locations' AND column_name='id' AND data_type='uuid'
      ) THEN
        -- locations.id is uuid
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='incomplete_packages' AND column_name='location_id' AND data_type <> 'uuid'
        ) THEN
          ALTER TABLE public.incomplete_packages ALTER COLUMN location_id TYPE uuid USING (location_id::uuid);
        END IF;
      ELSE
        -- locations.id is numeric
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='incomplete_packages' AND column_name='location_id' AND data_type <> 'bigint'
        ) THEN
          ALTER TABLE public.incomplete_packages ALTER COLUMN location_id TYPE bigint USING (location_id::bigint);
        END IF;
      END IF;

      -- Add item_name column if missing
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'incomplete_packages' AND column_name = 'item_name'
      ) THEN
        ALTER TABLE public.incomplete_packages ADD COLUMN item_name text;
      END IF;
      -- Ensure combo_id is nullable for free-typed entries
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'incomplete_packages' AND column_name = 'combo_id' AND is_nullable = 'NO'
      ) THEN
        ALTER TABLE public.incomplete_packages ALTER COLUMN combo_id DROP NOT NULL;
      END IF;
    END$$;
  `;

  const { error } = await supabase.rpc('execute_sql', { sql });
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true });
}
