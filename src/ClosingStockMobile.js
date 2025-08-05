import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import supabase from './supabase';
import './ClosingStock.css';

function ClosingStockMobile() {
  const [password, setPassword] = useState('');
  const [passwordOk, setPasswordOk] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [products, setProducts] = useState([]);
  const [units, setUnits] = useState([]);
  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState({});
  const [conductor, setConductor] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resuming, setResuming] = useState(false);

  // Password check
  const checkPassword = async () => {
    setPasswordError('');
    const { data, error } = await supabase
      .from('mobile_closing_stock_access')
      .select('password')
      .order('id', { ascending: false })
      .limit(1)
      .single();
    if (error || !data) {
      setPasswordError('Could not verify password.');
      return;
    }
    if (password === data.password) {
      setPasswordOk(true);
    } else {
      setPasswordError('Incorrect password.');
    }
  };

  // Fetch units
  useEffect(() => {
    if (!passwordOk) return;
    supabase.from('unit_of_measure').select('*').then(({ data }) => {
      setUnits(data || []);
    });
  }, [passwordOk]);

  // Fetch locations
  useEffect(() => {
    if (!passwordOk) return;
    supabase.from('locations').select('*').then(({ data }) => {
      setLocations(data || []);
    });
  }, [passwordOk]);

  // Fetch products for selected location
  useEffect(() => {
    if (!selectedLocation || !passwordOk) return;
    supabase
      .from('product_locations')
      .select('product_id, products(id, name, sku, unit_of_measure_id)')
      .eq('location_id', selectedLocation)
      .then(({ data }) => {
        setProducts((data || []).map(row => row.products));
      });
    setSearch('');
  }, [selectedLocation, passwordOk]);

  // Resume open session if exists for this conductor/location
  useEffect(() => {
    const tryResume = async () => {
      if (!selectedLocation || !conductor || !passwordOk) return;
      setResuming(true);
      // Find open session for this conductor/location
      const { data: session, error: sessionError } = await supabase
        .from('closing_stock_sessions')
        .select('*')
        .eq('location_id', selectedLocation)
        .eq('user_id', conductor)
        .eq('status', 'open')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (sessionError) {
        setError('Error checking for open session.');
        setResuming(false);
        return;
      }
      if (session) {
        setSessionId(session.id);
        // Load previous entries
        const { data: prevEntries } = await supabase
          .from('closing_stock_entries')
          .select('product_id, qty')
          .eq('session_id', session.id);
        if (prevEntries) {
          const entryMap = {};
          prevEntries.forEach(e => { entryMap[e.product_id] = e.qty; });
          setEntries(entryMap);
        }
      } else {
        setSessionId(null);
        setEntries({});
      }
      setResuming(false);
    };
    tryResume();
    // eslint-disable-next-line
  }, [selectedLocation, conductor, passwordOk]);

  // Build confirmation table rows
  const confirmRows = products
    .filter(p => entries[p.id] && Number(entries[p.id]) > 0)
    .map(p => ({
      name: p.name,
      sku: p.sku,
      unit: units.find(u => u.id === p.unit_of_measure_id)?.name || '-',
      qty: entries[p.id]
    }));

  // Only show products matching the search term
  const filteredProducts = search.trim().length > 0
    ? products.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase().includes(search.toLowerCase()))
      )
    : [];

  if (!passwordOk) {
    return (
      <div className="closing-stock-container">
        <div className="closing-stock-form">
          <h2 className="closing-stock-title">Mobile Closing Stock</h2>
          <input
            type="password"
            placeholder="Enter access password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={{ width: '100%', padding: 12, fontSize: '1.1em', borderRadius: 7, marginBottom: 12 }}
          />
          <button
            className="save-btn"
            style={{ width: '100%' }}
            onClick={checkPassword}
          >
            Access
          </button>
          {passwordError && <div style={{ color: '#ff4d4d', marginTop: 10 }}>{passwordError}</div>}
        </div>
      </div>
    );
  }

  return (
    <div className="closing-stock-container">
      <div className="closing-stock-form">
        <h2 className="closing-stock-title">Mobile Closing Stock</h2>
        <label>
          Location:
          <select value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)}>
            <option value="">Select Location</option>
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>{loc.name}</option>
            ))}
          </select>
        </label>
        <label style={{ marginTop: 12, display: 'block' }}>
          Stocktake Conductor Name:
          <input
            type="text"
            value={conductor}
            onChange={e => setConductor(e.target.value)}
            placeholder="Enter your name"
            style={{ width: '100%', padding: 8, borderRadius: 5, marginTop: 4 }}
            disabled={!selectedLocation}
          />
        </label>
        <input
          className="product-search-input"
          type="text"
          placeholder="Search products by name or SKU..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          disabled={!selectedLocation}
        />
        <div className="product-list">
          {filteredProducts.length === 0 && (
            <div style={{ color: '#aaa', padding: '1.2rem', textAlign: 'center' }}>
              {selectedLocation ? 'No products found.' : 'Select a location to begin.'}
            </div>
          )}
          {filteredProducts.map(prod => (
            <div className="product-row" key={prod.id}>
              <div className="product-name">
                <b>{prod.name}</b> <span style={{ color: '#00bfff', fontSize: '0.95em' }}>({prod.sku})</span>
                <div style={{ fontSize: '0.95em', color: '#aaa' }}>Unit: {units.find(u => u.id === prod.unit_of_measure_id)?.name || '-'}</div>
              </div>
              <input
                className="qty-input"
                type="number"
                min="0"
                value={entries[prod.id] || ''}
                onChange={e => {
                  const val = e.target.value;
                  setEntries(prev => ({ ...prev, [prod.id]: val === '' ? '' : Math.max(0, Number(val)) }));
                }}
                placeholder="Qty"
                style={{ width: 80, marginLeft: 12 }}
                disabled={!selectedLocation || !conductor}
              />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          <button
            className="save-btn"
            style={{ flex: 1 }}
            disabled={saving || !selectedLocation || !conductor}
            onClick={async () => {
              setSaving(true);
              setError('');
              setSuccess('');
              try {
                let sid = sessionId;
                if (!sid) {
                  // Create new session
                  const { data: newSession, error: sessionError } = await supabase.from('closing_stock_sessions').insert({
                    id: uuidv4(),
                    user_id: conductor,
                    location_id: selectedLocation,
                    started_at: new Date().toISOString(),
                    status: 'open',
                  }).select().single();
                  if (sessionError) throw sessionError;
                  sid = newSession.id;
                  setSessionId(sid);
                }
                // Upsert all entries for this session
                const rows = Object.entries(entries)
                  .filter(([pid, qty]) => qty && Number(qty) > 0)
                  .map(([pid, qty]) => ({
                    id: uuidv4(),
                    session_id: sid,
                    product_id: pid,
                    qty: Number(qty),
                    stocktake_conductor: conductor
                  }));
                // Remove previous entries for this session
                await supabase.from('closing_stock_entries').delete().eq('session_id', sid);
                if (rows.length > 0) {
                  const { error: insertError } = await supabase.from('closing_stock_entries').insert(rows);
                  if (insertError) throw insertError;
                }
                setSuccess('Progress saved. You can resume later.');
              } catch (err) {
                setError(err.message || 'Failed to save progress.');
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Saving...' : 'Pause'}
          </button>
          <button
            className="save-btn"
            style={{ flex: 1 }}
            disabled={saving || !selectedLocation || !conductor || Object.values(entries).every(qty => !qty || Number(qty) <= 0)}
            onClick={async () => {
              setSaving(true);
              setError('');
              setSuccess('');
              try {
                let sid = sessionId;
                if (!sid) {
                  // Create new session
                  const { data: newSession, error: sessionError } = await supabase.from('closing_stock_sessions').insert({
                    id: uuidv4(),
                    user_id: conductor,
                    location_id: selectedLocation,
                    started_at: new Date().toISOString(),
                    status: 'open',
                  }).select().single();
                  if (sessionError) throw sessionError;
                  sid = newSession.id;
                  setSessionId(sid);
                }
                // Upsert all entries for this session
                const rows = Object.entries(entries)
                  .filter(([pid, qty]) => qty && Number(qty) > 0)
                  .map(([pid, qty]) => ({
                    id: uuidv4(),
                    session_id: sid,
                    product_id: pid,
                    qty: Number(qty),
                    stocktake_conductor: conductor
                  }));
                // Remove previous entries for this session
                await supabase.from('closing_stock_entries').delete().eq('session_id', sid);
                if (rows.length > 0) {
                  const { error: insertError } = await supabase.from('closing_stock_entries').insert(rows);
                  if (insertError) throw insertError;
                }
                // Mark session as closed
                await supabase.from('closing_stock_sessions').update({ status: 'closed', ended_at: new Date().toISOString() }).eq('id', sid);
                // Check if any open sessions remain for this location/period
                const { data: openSessions } = await supabase
                  .from('closing_stock_sessions')
                  .select('id')
                  .eq('location_id', selectedLocation)
                  .eq('status', 'open');
                if (openSessions && openSessions.length > 0) {
                  setSuccess('Your session is submitted, but other sessions are still open. Period will close when all are submitted.');
                } else {
                  setSuccess('All sessions submitted. Period will now close and new opening stock will be set.');
                  // Here you would trigger backend logic to aggregate and close period, set new opening stock, etc.
                }
                setEntries({});
                setConductor('');
                setSessionId(null);
              } catch (err) {
                setError(err.message || 'Failed to submit closing stock.');
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? 'Saving...' : 'Submit Closing Stock'}
          </button>
        </div>
        {error && <div style={{ color: '#ff4d4d', marginTop: 10 }}>{error}</div>}
        {success && <div style={{ color: 'green', marginTop: 10 }}>{success}</div>}
      </div>
    </div>
  );
}

export default ClosingStockMobile;
