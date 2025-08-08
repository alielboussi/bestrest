// Automate fixing session periods for stocktake in Supabase/Postgres
// Usage: node fix_session_periods.js

const { createClient } = require('@supabase/supabase-js');

// Configure your Supabase credentials here
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = 'YOUR_SUPABASE_SERVICE_ROLE_KEY';
const LOCATION_ID = '3117b09d-aeec-4092-926a-fca80c6d3eb6'; // Change as needed

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fixSessionPeriods() {
  // 1. Fetch all sessions for location, ordered by started_at
  const { data: openingSessions } = await supabase
    .from('opening_stock_sessions')
    .select('*')
    .eq('location_id', LOCATION_ID)
    .order('started_at', { ascending: true });
  const { data: closingSessions } = await supabase
    .from('closing_stock_sessions')
    .select('*')
    .eq('location_id', LOCATION_ID)
    .order('started_at', { ascending: true });

  // 2. Pair opening and closing sessions by order
  // Assumes each opening is followed by a closing
  for (let i = 0; i < openingSessions.length; i++) {
    const opening = openingSessions[i];
    const closing = closingSessions[i];
    if (!opening || !closing) continue;
    // Set opening period: started_at = opening.started_at, ended_at = closing.started_at
    const { error: openErr } = await supabase
      .from('opening_stock_sessions')
      .update({ ended_at: closing.started_at })
      .eq('id', opening.id);
    if (openErr) console.error('Failed to update opening session:', opening.id, openErr);
    // Set closing period: started_at = closing.started_at, ended_at = closing.ended_at (or next closing if needed)
    // Optionally, you can set closing.started_at = opening.ended_at for strict continuity
  }
  console.log('Session periods updated.');
}

fixSessionPeriods();
