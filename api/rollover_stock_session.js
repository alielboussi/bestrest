// Script to automate closing-to-opening stock session rollover in Supabase/Postgres
// Usage: node rollover_stock_session.js

const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

// Configure your Supabase credentials here
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = 'YOUR_SUPABASE_SERVICE_ROLE_KEY';
const LOCATION_ID = '3117b09d-aeec-4092-926a-fca80c6d3eb6'; // Change as needed

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function rolloverSession() {
  // 1. Get latest closing session for location
  const { data: closingSessions, error: closingError } = await supabase
    .from('closing_stock_sessions')
    .select('*')
    .eq('location_id', LOCATION_ID)
    .order('ended_at', { ascending: false })
    .limit(1);
  if (closingError || !closingSessions || closingSessions.length === 0) {
    console.error('No closing session found:', closingError);
    return;
  }
  const closingSession = closingSessions[0];

  // 2. Create new opening session
  const newOpeningSessionId = uuidv4();
  const { error: openingError } = await supabase
    .from('opening_stock_sessions')
    .insert([
      {
        id: newOpeningSessionId,
        location_id: LOCATION_ID,
        started_at: closingSession.ended_at,
        type: 'opening',
        // Add user_id, name, etc. if needed
      }
    ]);
  if (openingError) {
    console.error('Failed to create opening session:', openingError);
    return;
  }
  console.log('Created new opening session:', newOpeningSessionId);

  // 3. Copy closing stock entries to opening stock entries
  const { data: closingEntries, error: entriesError } = await supabase
    .from('closing_stock_entries')
    .select('product_id, qty')
    .eq('session_id', closingSession.id);
  if (entriesError) {
    console.error('Failed to fetch closing entries:', entriesError);
    return;
  }
  if (!closingEntries || closingEntries.length === 0) {
    console.warn('No closing entries found for session:', closingSession.id);
    return;
  }
  const openingEntries = closingEntries.map(e => ({
    session_id: newOpeningSessionId,
    product_id: e.product_id,
    qty: e.qty
  }));
  const { error: insertError } = await supabase
    .from('opening_stock_entries')
    .insert(openingEntries);
  if (insertError) {
    console.error('Failed to copy entries:', insertError);
    return;
  }
  console.log('Copied closing entries to new opening session.');
}

rolloverSession();
